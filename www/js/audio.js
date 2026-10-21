'use strict';
// Fully procedural audio: a small step sequencer that layers in with the combo,
// plus scale-quantised sound effects so everything stays in key.
OD.audio = (() => {
  let ctx = null, master, musicBus, sfxBus, synthBus, synthRev, sfxRev, revIn, dlyIn, dlyOut, sfxDly, musicLP, noiseBuf;
  let timer = 0, nextTime = 0, step = 0, startT = 0, playing = false;
  // real tracks (assets/music, analysed by tools/analyze-music.py) replace the built-in synth when present
  let seq = null;          // phrase sequencer state for real tracks
  let fxFiles = {}, fxBuf = {}, fxPlaying = {};
  let tracks = null, buffers = {}, trackSrc = [], stemGain = {}, trackLP = null, cur = null, trackMode = false, analyser = null, fbuf = null, bassLv = 0;
  let world = null, menuMode = true, zen = false;
  const SYNTH_MUSIC = false;
  const lastPick = {};
  const layer = [1, 0, 0, 0];    // smoothed gain of kick/hat/arp/lead layers
  let target = 0;                // 0..3 requested intensity
  const PROG = [0, 5, 3, 4];     // chord roots as scale degrees

  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function scaleNote(idx) {
    idx = Math.floor(idx) || 0;
    const s = world.scale, n = s.length;
    const oct = Math.floor(idx / n);
    return world.root + s[((idx % n) + n) % n] + 12 * oct;
  }

  function init() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    musicLP = ctx.createBiquadFilter();
    musicLP.type = 'lowpass'; musicLP.frequency.value = 18000;
    musicBus = ctx.createGain(); sfxBus = ctx.createGain();
    musicBus.connect(musicLP); musicLP.connect(master);
    analyser = ctx.createAnalyser(); analyser.fftSize = 512; analyser.smoothingTimeConstant = 0.5; musicLP.connect(analyser); fbuf = new Uint8Array(analyser.frequencyBinCount);
    sfxBus.connect(master);
    // shared space: a soft stereo hall and a darkened ping-pong echo that the voices send into
    revIn = ctx.createGain();
    const revHP = ctx.createBiquadFilter(); revHP.type = 'highpass'; revHP.frequency.value = 220;
    const conv = ctx.createConvolver(); conv.buffer = makeIR(2.6, 2.4);
    const revOut = ctx.createGain(); revOut.gain.value = 0.55;
    revIn.connect(revHP); revHP.connect(conv); conv.connect(revOut); revOut.connect(master);
    dlyIn = ctx.createGain();
    const dl = ctx.createDelay(1), dr = ctx.createDelay(1), fb = ctx.createGain(), dlp = ctx.createBiquadFilter(), mg = ctx.createChannelMerger(2);
    dl.delayTime.value = 0.21; dr.delayTime.value = 0.32; fb.gain.value = 0.32; dlp.type = 'lowpass'; dlp.frequency.value = 2600;
    dlyIn.connect(dlp); dlp.connect(dl); dl.connect(dr); dr.connect(fb); fb.connect(dl);
    dl.connect(mg, 0, 0); dr.connect(mg, 0, 1);
    dlyOut = ctx.createGain(); dlyOut.gain.value = 0.5; mg.connect(dlyOut); dlyOut.connect(master);
    synthBus = ctx.createGain(); synthBus.connect(musicBus);
    synthRev = ctx.createGain(); synthBus.connect(synthRev); synthRev.connect(revIn);
    sfxRev = ctx.createGain(); sfxRev.connect(revIn);
    sfxDly = ctx.createGain(); sfxDly.connect(dlyIn);
    const lim = ctx.createDynamicsCompressor();     // final safety limiter so stacked effects never clip
    lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.08;
    master.connect(comp); comp.connect(lim); lim.connect(ctx.destination);
    applyVolumes();
    const len = ctx.sampleRate * 1;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  function applyVolumes() {
    if (!ctx) return;
    const s = OD.save.settings;
    musicBus.gain.value = 0.55 * s.music;
    sfxBus.gain.value = 0.9 * s.sfx;
    synthRev.gain.value = 0.3;                 // follows musicBus level through the reverb return
    sfxRev.gain.value = 0.9 * s.sfx;
    sfxDly.gain.value = 0.9 * s.sfx;
    revIn.gain.value = 1;
  }
  // synthetic hall impulse: decaying noise whose highs die faster than its lows
  function makeIR(sec, curve) {
    const sr = ctx.sampleRate, n = Math.floor(sr * sec), b = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n, a = 0.08 + 0.7 * Math.pow(1 - t, 2);
        lp += ((Math.random() * 2 - 1) - lp) * a;
        d[i] = lp * Math.pow(1 - t, curve) * Math.min(1, i / (sr * 0.02)) * 1.6;
      }
    }
    return b;
  }
  function unlock() {
    init();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }
  const ready = () => !!ctx && ctx.state === 'running';

  // --------------------------------------------------------- voices
  function tone(freq, dur, type, vol, when, slideTo, bus, attack = 0.005, lpFreq = 0) {
    const t = when || ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = g;
    o.connect(g);
    if (lpFreq) {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lpFreq;
      g.connect(f); out = f;
    }
    out.connect(bus || sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, when, fType, fFreq, fFreq2, bus) {
    const t = when || ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = fType; f.frequency.setValueAtTime(fFreq, t);
    if (fFreq2) f.frequency.exponentialRampToValueAtTime(fFreq2, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus || sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  function pad(freqs, t, dur, vol) {
    for (const fr of freqs) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        o.type = det < 0 ? 'triangle' : 'sawtooth'; o.frequency.value = fr; o.detune.value = det;
        f.type = 'lowpass'; f.frequency.setValueAtTime(380, t);
        f.frequency.linearRampToValueAtTime(1050, t + dur * 0.5);
        f.frequency.linearRampToValueAtTime(380, t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + dur * 0.35);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(f); f.connect(g); g.connect(synthBus);
        o.start(t); o.stop(t + dur + 0.05);
      }
    }
  }


  // routes a voice to the dry sfx bus (or another bus) with optional pan, reverb and echo sends
  function route(node, o) {
    let n = node;
    if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; n.connect(p); n = p; }
    n.connect(o.bus || sfxBus);
    if (o.rev) { const g = ctx.createGain(); g.gain.value = o.rev; n.connect(g); g.connect(o.bus === synthBus ? revIn : sfxRev); }
    if (o.dly) { const g = ctx.createGain(); g.gain.value = o.dly; n.connect(g); g.connect(o.bus === synthBus ? dlyIn : sfxDly); }
  }
  // glassy struck-bell: a few inharmonic partials with their own decay, soft attack, no hard edges
  const BELL = [[1, 1, 1], [2.0, 0.16, 0.5], [2.76, 0.05, 0.3]];
  function bell(freq, dur, vol, when, o = {}) {
    const t = when || ctx.currentTime, master_ = ctx.createGain();
    master_.gain.value = 1;
    for (const [r, a, d] of BELL) {
      if (freq * r > 12000) continue;
      const os = ctx.createOscillator(), g = ctx.createGain();
      os.type = 'sine'; os.frequency.value = freq * r;
      const dd = Math.max(0.05, dur * d);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol * a, t + (o.att || 0.012));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dd);
      os.connect(g); g.connect(master_); os.start(t); os.stop(t + dd + 0.05);
    }
    route(master_, o);
  }
  // warm voice: sine + a slightly detuned triangle, optional glide/vibrato, lowpassed
  function soft(freq, dur, vol, when, o = {}) {
    const t = when || ctx.currentTime, g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = o.lp || 3200; f.Q.value = 0.4;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + (o.att || 0.012));
    if (o.hold) g.gain.setValueAtTime(vol, t + dur * o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [type, det, k] of [['sine', 0, 1], ['triangle', 5, 0.4]]) {
      const os = ctx.createOscillator(), og = ctx.createGain();
      os.type = type; os.detune.value = det; os.frequency.setValueAtTime(freq, t); og.gain.value = k;
      if (o.slide) os.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
      if (o.vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5.2; lg.gain.value = freq * 0.006; l.connect(lg); lg.connect(os.frequency); l.start(t); l.stop(t + dur + 0.05); }
      os.connect(og); og.connect(f); os.start(t); os.stop(t + dur + 0.05);
    }
    f.connect(g); route(g, o);
  }
  // breath of air for whooshes: band-passed noise that sweeps and swells
  function air(dur, vol, when, f1, f2, o = {}) {
    const t = when || ctx.currentTime, s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = o.q || 0.9;
    f.frequency.setValueAtTime(f1, t); f.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * (o.peak || 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); route(g, o);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  // --------------------------------------------------------- sequencer
  function scheduleStep(s, t) {
    if (!SYNTH_MUSIC) return;      // songs come from real tracks; the built-in synth stays silent (the beat clock still runs)
    const sd = 60 / world.bpm / 4;
    const bar = Math.floor(s / 16) % 4, k = s % 16;
    const deg = PROG[bar];
    const chordIdx = [deg, deg + 2, deg + 4];
    if (k === 0) {
      const fr = chordIdx.map(i => mtof(scaleNote(i) - 12));
      pad(fr, t, sd * 16, menuMode ? 0.035 : 0.022);
    }
    // bass
    if (!menuMode && !zen && (k === 0 || k === 3 || k === 6 || k === 8 || k === 11 || k === 14)) {
      const bassVol = 0.2 * (0.5 + 0.5 * Math.min(1, layer[0] + 0.3));
      tone(mtof(scaleNote(deg) - 24), sd * 2.4, 'triangle', bassVol * 1.1, t, 0, musicBus, 0.006, 360);
      tone(mtof(scaleNote(deg) - 36), sd * 2.4, 'sine', bassVol * 0.7, t, 0, musicBus, 0.006);
    }
    // kick
    if (!menuMode && !zen && layer[0] > 0.05) {
      const four = layer[1] > 0.3;
      if (k % 8 === 0 || (four && k % 4 === 0)) {
        tone(140, 0.17, 'sine', 0.55 * Math.min(1, layer[0]), t, 40, musicBus, 0.002);
        noise(0.012, 0.1 * Math.min(1, layer[0]), t, 'lowpass', 3500, 0, musicBus);
      }
    }
    // hats / clap
    if (!menuMode && !zen && layer[1] > 0.05) {
      if (k % 4 === 2) noise(0.06, 0.1 * layer[1], t, 'highpass', 7000, 0, synthBus);
      if (layer[2] > 0.3 && k % 2 === 1) noise(0.03, 0.045 * layer[1], t, 'highpass', 8500, 0, synthBus);
    }
    if (!menuMode && !zen && layer[3] > 0.05 && (k === 4 || k === 12)) {
      noise(0.2, 0.16 * layer[3], t, 'bandpass', 1500, 800, synthBus);
    }
    // arp
    const arpOn = menuMode || zen ? (k % 4 === 0) : (layer[2] > 0.05 && k % 2 === 0);
    if (arpOn) {
      const pat = [0, 2, 4, 7, 4, 2, 5, 3];
      const i = pat[(k >> 1) % pat.length];
      const base = deg + i + 3;
      const v = menuMode || zen ? 0.07 : 0.085 * layer[2];
      bell(mtof(scaleNote(base)), sd * (menuMode || zen ? 6 : 3.5), v * 1.3, t, { bus: synthBus, pan: ((k >> 1) % 4 - 1.5) * 0.28, dly: 0.35 });
    }
    // lead
    if (!menuMode && !zen && layer[3] > 0.05 && k % 4 === 3) {
      const i = deg + [4, 6, 7, 9][(k >> 2) % 4] + 3;
      soft(mtof(scaleNote(i)), sd * 3.4, 0.07 * layer[3], t, { bus: synthBus, att: 0.02, lp: 2400, vib: true, dly: 0.3 });
    }
  }
  // ---- phrase sequencer: the song is cut into 8-bar phrases and re-ordered live to match the intensity,
  // so a three minute song becomes an endless, non-repeating arrangement. Joins land on the downbeat with a short
  // equal-power crossfade that starts one beat early (using the song's own lead-in).
  const XFADE_IN = new Float32Array(32).map((_, i) => Math.sin(i / 31 * Math.PI / 2));
  const XFADE_OUT = new Float32Array(32).map((_, i) => Math.cos(i / 31 * Math.PI / 2));
  function pickPhrase() {
    const tm = cur, ph = seq.pool, want = [0.35, 0.55, 0.78, 0.97][Math.max(0, Math.min(3, Math.round(target)))];
    let best = null, tot = 0; const cands = [];
    ph.forEach((p, i) => {
      if (p[2] === 'intro' || p[2] === 'outro' || seq.recent.includes(i)) return;
      let w = 0.05 + Math.exp(-Math.pow((p[1] - want) / 0.16, 2));
      if (i === seq.last + 1) w *= 1.6;           // the song's natural next phrase flows best
      cands.push([i, w]); tot += w;
    });
    if (!cands.length) { seq.recent = []; return ph.findIndex(p => p[2] !== 'intro' && p[2] !== 'outro'); }
    let r = Math.random() * tot;
    for (const [i, w] of cands) { r -= w; if (r <= 0) { best = i; break; } }
    return best == null ? cands[0][0] : best;
  }
  function buildPool(tm) {   // every phrase of every take, tagged with the take it belongs to
    const out = [];
    (tm.variants || [tm]).forEach((v, vi) => (v.phrases || []).forEach((p, i) => out.push([p[0], p[1], p[2], vi, v.bpm, i])));
    return out;
  }
  function schedulePhrase(T) {
    const tm = cur, bar = 4 * 60 / tm.bpm, len = tm.phraseBars * bar, xf = Math.min(0.2, 60 / tm.bpm * 0.9);
    const first = seq.n === 0;
    const idx = first ? 0 : pickPhrase();
    const ph = seq.pool[idx], rate = first ? 1 : ph[4] / tm.bpm;      // take with a slightly different tempo is re-timed to the grid
    const bufStart = first ? 0 : ph[0] - xf * rate, when = first ? seq.t0 : T - xf;
    const dur = (first ? tm.offset + len + 0.02 : len + xf + 0.02) * rate;
    const set = buffers[seq.key].v[first ? 0 : ph[3]];
    for (const [name, buf] of Object.entries(set)) {
      if (bufStart < 0 || bufStart + dur > buf.duration + 0.5) continue;
      const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
      const pg = ctx.createGain();
      if (first) pg.gain.setValueAtTime(1, when);
      else {
        pg.gain.setValueAtTime(0, when);
        pg.gain.setValueCurveAtTime(XFADE_IN, when, xf);
        pg.gain.setValueAtTime(1, T);
      }
      pg.gain.setValueAtTime(1, T + len - xf);
      pg.gain.setValueCurveAtTime(XFADE_OUT, T + len - xf, xf);
      src.connect(pg); pg.connect(stemGain[name] || trackLP);
      src.start(when, bufStart, dur); trackSrc.push(src);
      src.onended = () => { trackSrc = trackSrc.filter(x => x !== src); try { pg.disconnect(); } catch (e) { /* gone */ } };
    }
    seq.played.push({ T, len, e: ph[1], idx, v: ph[3] });
    if (seq.played.length > 12) seq.played.shift();
    seq.recent.push(idx); if (seq.recent.length > Math.max(1, Math.min(3, seq.pool.length - 3))) seq.recent.shift();
    seq.last = idx; seq.n++; seq.next = T + len;
  }
  function stemTargets() {
    const t = ctx.currentTime;
    if (stemGain.full) { trackLP.frequency.setTargetAtTime(menuMode || zen ? 3200 : OD.lerp(2800, 19000, Math.min(1, target / 3)), t, 0.35); return; }
    const on = (name, v) => { if (stemGain[name]) stemGain[name].gain.setTargetAtTime(v, t, 0.3); };
    const calm = menuMode || zen;
    on('bass', 1); on('drums', calm ? 0.0 : target >= 1 ? 1 : 0.0); on('synth', calm ? 0.8 : target >= 2 ? 1 : 0.0); on('other', calm ? 0.8 : target >= 2 ? 1 : 0.35);
  }
  function tick() {
    if (!ctx || !playing) return;
    if (trackMode) {
      stemTargets();
      if (seq && ctx.currentTime + 4 * 60 / cur.bpm * 1.1 >= seq.next) schedulePhrase(seq.next);   // decide one bar ahead
      return;
    }
    // ease layers toward the requested intensity
    for (let i = 0; i < 4; i++) {
      const want = menuMode || zen ? 0 : target >= i ? 1 : 0;
      layer[i] += (want - layer[i]) * 0.08;
    }
    layer[0] = menuMode || zen ? 0 : 1;
    while (nextTime < ctx.currentTime + 0.14) {
      scheduleStep(step, nextTime);
      nextTime += 60 / world.bpm / 4;
      step++;
    }
  }

  return {
    init, unlock, ready, applyVolumes,
    async loadTracks() {
      try { const r = await fetch('audio/tracks.json'); tracks = r.ok ? await r.json() : {}; } catch (e) { tracks = {}; }
      fxFiles = (tracks && tracks.fx) || {};
    },
    // decode a track (and its stems) ahead of time so the run can start in sync
    async preload(key) {
      const tm = tracks && tracks[key];
      if (!tm || buffers[key] || !init()) return;
      buffers[key] = { loading: true };
      try {
        const vs = tm.variants || [tm], out = { v: [] };
        for (const v of vs) {
          const list = v.stems ? Object.entries(v.stems) : [['full', v.file]], bufs = {};
          for (const [name, f] of list) { const r = await fetch('audio/' + f); bufs[name] = await ctx.decodeAudioData(await r.arrayBuffer()); }
          out.v.push(bufs);
        }
        out.ready = true; buffers[key] = out;
      } catch (e) { delete buffers[key]; }
    },
    // ambient layers and stings for events: assets/music/fx/<name>.wav  (blackhole, supernova, boss, hop, gameover, record ...)
    async preloadFx() {
      if (!init()) return;
      for (const [name, f] of Object.entries(fxFiles)) {
        if (fxBuf[name]) continue;
        try { const r = await fetch('audio/' + f); fxBuf[name] = await ctx.decodeAudioData(await r.arrayBuffer()); } catch (e) { /* optional */ }
      }
    },
    fx(name, o = {}) {
      if (!ready() || !fxBuf[name]) return null;
      this.fxStop(name, 0.05);
      const src = ctx.createBufferSource(); src.buffer = fxBuf[name]; src.loop = !!o.loop;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.linearRampToValueAtTime(o.gain == null ? 0.8 : o.gain, ctx.currentTime + (o.fade || 0.05));
      src.connect(g); g.connect(sfxBus); src.start();
      fxPlaying[name] = { src, g };
      src.onended = () => { if (fxPlaying[name] && fxPlaying[name].src === src) delete fxPlaying[name]; };
      return src;
    },
    fxStop(name, fade = 1.2) {
      const f = fxPlaying[name]; if (!f) return;
      try { f.g.gain.cancelScheduledValues(ctx.currentTime); f.g.gain.setValueAtTime(f.g.gain.value, ctx.currentTime); f.g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + fade); f.src.stop(ctx.currentTime + fade + 0.05); } catch (e) { /* ended */ }
      delete fxPlaying[name];
    },
    hasFx: n => !!fxBuf[n],
    hasTrack: () => trackMode,
    bpm: w => (trackMode && cur ? cur.bpm : w.bpm),
    // bass energy 0..1 from the live output: drives the visual pulse in both track and synth mode
    level() {
      if (!analyser || !ready()) return 0;
      analyser.getByteFrequencyData(fbuf);
      const v = (fbuf[1] + fbuf[2] + fbuf[3]) / (3 * 255);
      bassLv += (v - bassLv) * 0.5;
      return Math.max(0, Math.min(1, (bassLv - 0.35) * 2.2));
    },
    energyAt(t) {
      if (!seq || !seq.played.length) return 0.5;
      const ctxT = startT + (cur ? cur.offset : 0) + t;
      for (let i = seq.played.length - 1; i >= 0; i--) if (ctxT >= seq.played[i].T) return seq.played[i].e;
      return 0.5;
    },
    _seq: () => seq && { n: seq.n, played: seq.played.map(p => [+p.T.toFixed(3), +p.len.toFixed(3), p.e, p.idx, p.v]) },
    startMusic(w, opts = {}) {
      if (!init()) return;
      this.stopMusic();
      menuMode = !!opts.menu; zen = !!opts.zen;
      const key = menuMode ? 'menu' : zen && tracks && tracks.zen ? 'zen' : String(w.id), tm = tracks && tracks[key], bf = buffers[key];
      world = w; trackMode = false; cur = null;
      startT = ctx.currentTime + 0.12;
      if (tm && bf && bf.ready) {         // real track: loop whole bars, stems fade in with the combo
        trackMode = true; cur = tm;
        world = Object.assign({}, w, { root: tm.root, scale: tm.scale });
        trackLP = ctx.createBiquadFilter(); trackLP.type = 'lowpass'; trackLP.frequency.value = 19000; trackLP.connect(musicBus);
        stemGain = {}; trackSrc = [];
        const names = new Set(); bf.v.forEach(b => Object.keys(b).forEach(n => names.add(n)));
        for (const name of names) {
          const buf = bf.v[0][name];
          const g = ctx.createGain(); g.gain.value = name === 'bass' || name === 'full' ? 1 : 0;
          g.connect(trackLP); stemGain[name] = g;
          if (buf && !(tm.phrases && tm.phrases.length >= 3)) {   // no phrase data: plain whole-bar loop
            const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.loopStart = tm.loopStart; src.loopEnd = tm.loopEnd;
            src.connect(g); src.start(startT, 0); trackSrc.push(src);
          }
        }
        target = 0;
        seq = null;
        if (tm.phrases && tm.phrases.length >= 3) {
          seq = { key, t0: startT, next: startT + tm.offset, n: 0, last: 0, recent: [], played: [], pool: buildPool(tm) };
          schedulePhrase(seq.next);
        }
      } else {
        step = 0; nextTime = startT;
        layer[0] = menuMode || zen ? 0 : 1; layer[1] = layer[2] = layer[3] = 0; target = 0;
      }
      playing = true;
      clearInterval(timer);
      timer = setInterval(tick, 25);
      this.setMuffle(0);
    },
    stopMusic() {
      playing = false; clearInterval(timer);
      for (const s of trackSrc) { try { s.stop(); s.disconnect(); } catch (e) { /* already stopped */ } }
      trackSrc = []; stemGain = {}; trackMode = false; seq = null;
    },
    setIntensity(v) { target = v; },
    setMuffle(a) {
      if (!ctx) return;
      musicLP.frequency.setTargetAtTime(OD.lerp(18000, 700, a), ctx.currentTime, 0.08);
    },
    // seconds since the run's first beat (null if the audio clock isn't usable)
    // seconds since the first downbeat, corrected for the device's output latency so visuals land with what you hear
    time() { return ready() ? ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0) - startT - (trackMode && cur ? cur.offset : 0) : null; },
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); },
    // ------------------------------------------------ one-shot effects
    note(idx, dur, type, vol, slide) {
      if (!ready() || !world) return;
      bell(mtof(scaleNote(idx)), dur * 2.2, vol, 0, { rev: 0.35 });
    },
    // repetitive sounds draw from a small pentatonic set at random, never the same note twice in a row, with a hair of detune
    sfx(name, a = 0) {
      if (!ready() || !world) return;
      const pickN = (set, key) => { let n; do { n = set[(Math.random() * set.length) | 0]; } while (n === lastPick[key] && set.length > 1); lastPick[key] = n; return n; };
      const t = ctx.currentTime, F = i => mtof(scaleNote(i)), P = [0, 2, 4, 7, 9, 11, 14, 16];
      switch (name) {
        case 'flip':
          bell(F(pickN(a ? [4, 7, 9, 11] : [0, 2, 4, 7], 'flip')) * (1 + (Math.random() - 0.5) * 0.006), 0.4, 0.15, t, { rev: 0.3, pan: (a ? 0.2 : -0.2) + (Math.random() - 0.5) * 0.15 }); break;
        case 'charge':
          soft(190, 0.7, 0.07, t, { slide: 520, lp: 1400, att: 0.15, rev: 0.4, vib: true });
          air(0.7, 0.03, t, 400, 1800, { peak: 0.9, rev: 0.3 }); break;
        case 'jump':
          air(0.28, 0.06, t, 300, 1400, { peak: 0.35, pan: 0.1, rev: 0.25 });
          { const f0 = 240 + Math.random() * 90;
          soft(f0, 0.22, 0.14, t, { slide: f0 * (2.5 + Math.random() * 0.6), lp: 2000, rev: 0.3 }); }
          bell(F(pickN([4, 7, 9, 11, 14], 'jump')), 0.5, 0.1, t + 0.1, { rev: 0.45, dly: 0.25 }); break;
        case 'slingshot':
          air(0.4, 0.08, t, 250, 1800, { peak: 0.3, rev: 0.4 });
          soft(240, 0.35, 0.12, t, { slide: 1100, lp: 3000, rev: 0.3 });
          { const r = pickN([7, 9, 11], 'sling');
          bell(F(r), 0.9, 0.14, t + 0.05, { rev: 0.5, dly: 0.35 });
          bell(F(r + 5), 0.9, 0.08, t + 0.09, { rev: 0.5, dly: 0.35, pan: 0.3 }); } break;
        case 'graze': {
          const i = 4 + Math.min(9, a | 0) + pickN([0, 0, 2, -2], 'graze'), pan = (Math.random() - 0.5) * 0.6;
          bell(F(i), 0.55, 0.15, t, { rev: 0.4, pan, dly: 0.2 });
          bell(F(i + 4), 0.4, 0.05, t + 0.02, { rev: 0.5, pan: -pan }); break;
        }
        case 'dust':
          bell(F(a + pickN([0, 0, 2], 'dust')), 0.4, 0.12, t, { rev: 0.35, pan: (Math.random() - 0.5) * 0.4 });
          bell(F(a + 2), 0.3, 0.06, t + 0.05, { rev: 0.4 }); break;
        case 'power':
          for (let i = 0; i < 5; i++) bell(F(P[i] + 3), 0.8, 0.12, t + i * 0.055, { rev: 0.45, dly: 0.3, pan: (i - 2) * 0.2 });
          soft(F(0) / 2, 0.6, 0.09, t, { lp: 900, att: 0.03, rev: 0.4 }); break;
        case 'shield':
          soft(150, 0.4, 0.2, t, { slide: 60, lp: 600, rev: 0.3 });
          air(0.45, 0.12, t, 1400, 300, { peak: 0.2, rev: 0.5 });
          bell(F(4), 0.9, 0.1, t + 0.03, { rev: 0.5 }); break;
        case 'warn':
          bell(F(7), 0.3, 0.06, t, { rev: 0.4 }); break;
        case 'overdrive':
          air(1.1, 0.08, t, 200, 2200, { peak: 0.85, rev: 0.5 });
          soft(F(0) / 2, 1.1, 0.12, t, { slide: F(0), lp: 1400, att: 0.4, rev: 0.4 });
          for (let i = 0; i < 8; i++) bell(F(P[i] + 2), 1.1, 0.1, t + 0.15 + i * 0.07, { rev: 0.55, dly: 0.3, pan: Math.sin(i) * 0.4 }); break;
        case 'boss':
          soft(70, 1.6, 0.36, t, { slide: 36, lp: 400, att: 0.02, rev: 0.4 });
          soft(F(0) / 4, 1.8, 0.13, t, { lp: 500, att: 0.35, rev: 0.6 });
          soft(F(0) / 4 * 1.5, 1.8, 0.1, t + 0.1, { lp: 500, att: 0.4, rev: 0.6 });
          air(1.4, 0.12, t, 700, 120, { peak: 0.1, q: 0.5, rev: 0.5 }); break;
        case 'death':
          soft(130, 0.9, 0.5, t, { slide: 34, lp: 500, att: 0.004 });
          air(1.1, 0.26, t, 1600, 90, { peak: 0.05, q: 0.6, rev: 0.7 });
          for (let i = 0; i < 4; i++) bell(F(7 - i * 2 - (i > 1 ? 1 : 0)) / 2, 1.6, 0.11, t + 0.04 + i * 0.12, { rev: 0.7, dly: 0.3, pan: (i - 1.5) * 0.25 }); break;
        case 'click':
          bell(mtof(pickN([72, 74, 76, 79], 'click')), 0.14, 0.07, t, { rev: 0.15 }); break;
        case 'back':
          bell(mtof(pickN([64, 67, 69], 'back')), 0.14, 0.06, t, { rev: 0.15 }); break;
        case 'unlock':
          for (let i = 0; i < 6; i++) bell(F(P[i] + 1), 1.2, 0.13, t + i * 0.085, { rev: 0.6, dly: 0.3, pan: (i - 2.5) * 0.16 });
          soft(F(0) / 2, 1.0, 0.1, t, { lp: 1100, att: 0.05, rev: 0.5 }); break;
        case 'buy':
          bell(F(7), 0.7, 0.14, t, { rev: 0.4 });
          bell(F(11), 1.0, 0.14, t + 0.08, { rev: 0.5, dly: 0.25 });
          bell(F(14), 1.2, 0.1, t + 0.16, { rev: 0.55 }); break;
        case 'record':
          for (let i = 0; i < 8; i++) bell(F(P[i] + 2), 1.3, 0.12, t + i * 0.07, { rev: 0.6, dly: 0.35, pan: Math.cos(i) * 0.4 });
          [0, 4, 7].forEach(d => soft(F(d + 7), 1.6, 0.07, t + 0.56, { lp: 2200, att: 0.05, rev: 0.6 })); break;
      }
    },
  };
})();
