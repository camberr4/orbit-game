'use strict';
// Fully procedural audio: a small step sequencer that layers in with the combo,
// plus scale-quantised sound effects so everything stays in key.
OD.audio = (() => {
  let ctx = null, master, musicBus, sfxBus, musicLP, noiseBuf;
  let timer = 0, nextTime = 0, step = 0, startT = 0, playing = false;
  // real tracks (assets/music, analysed by tools/analyze-music.py) replace the built-in synth when present
  let seq = null;          // phrase sequencer state for real tracks
  let tracks = null, buffers = {}, trackSrc = [], stemGain = {}, trackLP = null, cur = null, trackMode = false, analyser = null, fbuf = null, bassLv = 0;
  let world = null, menuMode = true, zen = false;
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
    master.connect(comp); comp.connect(ctx.destination);
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
        o.type = 'sawtooth'; o.frequency.value = fr; o.detune.value = det;
        f.type = 'lowpass'; f.frequency.setValueAtTime(500, t);
        f.frequency.linearRampToValueAtTime(1400, t + dur * 0.5);
        f.frequency.linearRampToValueAtTime(500, t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + dur * 0.35);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(f); f.connect(g); g.connect(musicBus);
        o.start(t); o.stop(t + dur + 0.05);
      }
    }
  }

  // --------------------------------------------------------- sequencer
  function scheduleStep(s, t) {
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
      tone(mtof(scaleNote(deg) - 24), sd * 2.4, 'sawtooth', bassVol, t, 0, musicBus, 0.004, 420);
    }
    // kick
    if (!menuMode && !zen && layer[0] > 0.05) {
      const four = layer[1] > 0.3;
      if (k % 8 === 0 || (four && k % 4 === 0)) {
        tone(150, 0.13, 'sine', 0.55 * Math.min(1, layer[0]), t, 42, musicBus, 0.002);
      }
    }
    // hats / clap
    if (!menuMode && !zen && layer[1] > 0.05) {
      if (k % 4 === 2) noise(0.05, 0.16 * layer[1], t, 'highpass', 7500, 0, musicBus);
      if (layer[2] > 0.3 && k % 2 === 1) noise(0.025, 0.07 * layer[1], t, 'highpass', 9000, 0, musicBus);
    }
    if (!menuMode && !zen && layer[3] > 0.05 && (k === 4 || k === 12)) {
      noise(0.14, 0.2 * layer[3], t, 'bandpass', 1800, 900, musicBus);
    }
    // arp
    const arpOn = menuMode || zen ? (k % 4 === 0) : (layer[2] > 0.05 && k % 2 === 0);
    if (arpOn) {
      const pat = [0, 2, 4, 7, 4, 2, 5, 3];
      const i = pat[(k >> 1) % pat.length];
      const base = deg + i + (menuMode || zen ? 7 : 7);
      const v = menuMode || zen ? 0.07 : 0.085 * layer[2];
      tone(mtof(scaleNote(base)), sd * 2, menuMode || zen ? 'sine' : 'triangle', v, t, 0, musicBus, 0.003, 4000);
    }
    // lead
    if (!menuMode && !zen && layer[3] > 0.05 && k % 4 === 3) {
      const i = deg + [4, 6, 7, 9][(k >> 2) % 4] + 7;
      tone(mtof(scaleNote(i)), sd * 3, 'square', 0.05 * layer[3], t, 0, musicBus, 0.004, 2600);
    }
  }
  // ---- phrase sequencer: the song is cut into 8-bar phrases and re-ordered live to match the intensity,
  // so a three minute song becomes an endless, non-repeating arrangement. Joins land on the downbeat with a short
  // equal-power crossfade that starts one beat early (using the song's own lead-in).
  const XFADE_IN = new Float32Array(32).map((_, i) => Math.sin(i / 31 * Math.PI / 2));
  const XFADE_OUT = new Float32Array(32).map((_, i) => Math.cos(i / 31 * Math.PI / 2));
  function pickPhrase() {
    const tm = cur, ph = tm.phrases, want = [0.35, 0.55, 0.78, 0.97][Math.max(0, Math.min(3, Math.round(target)))];
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
  function schedulePhrase(T) {
    const tm = cur, bar = 4 * 60 / tm.bpm, len = tm.phraseBars * bar, xf = Math.min(0.2, 60 / tm.bpm * 0.9);
    const first = seq.n === 0;
    const idx = first ? 0 : pickPhrase();
    const ph = tm.phrases[idx], bufStart = first ? 0 : ph[0] - xf, when = first ? seq.t0 : T - xf;
    const dur = first ? tm.offset + len + 0.02 : len + xf + 0.02;
    for (const [name, buf] of Object.entries(buffers[seq.key])) {
      if (name === 'ready' || name === 'loading') continue;
      if (bufStart < 0 || bufStart + dur > buf.duration + 0.5) continue;
      const src = ctx.createBufferSource(); src.buffer = buf;
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
    seq.played.push({ T, len, e: ph[1], idx });
    if (seq.played.length > 12) seq.played.shift();
    seq.recent.push(idx); if (seq.recent.length > Math.max(1, Math.min(3, tm.phrases.length - 3))) seq.recent.shift();
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
    },
    // decode a track (and its stems) ahead of time so the run can start in sync
    async preload(key) {
      const tm = tracks && tracks[key];
      if (!tm || buffers[key] || !init()) return;
      buffers[key] = { loading: true };
      try {
        const list = tm.stems ? Object.entries(tm.stems) : [['full', tm.file]], out = {};
        for (const [name, f] of list) { const r = await fetch('audio/' + f); out[name] = await ctx.decodeAudioData(await r.arrayBuffer()); }
        out.ready = true; buffers[key] = out;
      } catch (e) { delete buffers[key]; }
    },
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
    _seq: () => seq && { n: seq.n, played: seq.played.map(p => [+p.T.toFixed(3), +p.len.toFixed(3), p.e, p.idx]) },
    startMusic(w, opts = {}) {
      if (!init()) return;
      this.stopMusic();
      menuMode = !!opts.menu; zen = !!opts.zen;
      const key = menuMode ? 'menu' : String(w.id), tm = tracks && tracks[key], bf = buffers[key];
      world = w; trackMode = false; cur = null;
      startT = ctx.currentTime + 0.12;
      if (tm && bf && bf.ready) {         // real track: loop whole bars, stems fade in with the combo
        trackMode = true; cur = tm;
        world = Object.assign({}, w, { root: tm.root, scale: tm.scale });
        trackLP = ctx.createBiquadFilter(); trackLP.type = 'lowpass'; trackLP.frequency.value = 19000; trackLP.connect(musicBus);
        stemGain = {}; trackSrc = [];
        for (const [name, buf] of Object.entries(bf)) {
          if (name === 'ready' || name === 'loading') continue;
          const g = ctx.createGain(); g.gain.value = name === 'bass' || name === 'full' ? 1 : 0;
          g.connect(trackLP); stemGain[name] = g;
          if (!(tm.phrases && tm.phrases.length >= 3)) {   // no phrase data: plain whole-bar loop
            const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.loopStart = tm.loopStart; src.loopEnd = tm.loopEnd;
            src.connect(g); src.start(startT, 0); trackSrc.push(src);
          }
        }
        target = 0;
        seq = null;
        if (tm.phrases && tm.phrases.length >= 3) {
          seq = { key, t0: startT, next: startT + tm.offset, n: 0, last: 0, recent: [], played: [] };
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
      tone(mtof(scaleNote(idx) + 12), dur, type, vol, 0, slide || 0, sfxBus, 0.003, 6000);
    },
    sfx(name, a = 0) {
      if (!ready() || !world) return;
      const t = ctx.currentTime;
      switch (name) {
        case 'flip': this.note(2 + (a ? 2 : 0), 0.09, 'triangle', 0.22); break;
        case 'charge': tone(220, 0.5, 'sine', 0.12, t, 660); break;
        case 'jump': tone(300, 0.2, 'triangle', 0.25, t, 900); break;
        case 'slingshot':
          tone(500, 0.3, 'sawtooth', 0.14, t, 1800, null, 0.003, 5000);
          this.note(9, 0.3, 'sine', 0.2); break;
        case 'graze': this.note(4 + Math.min(10, a * 1), 0.18, 'sine', 0.28); break;
        case 'dust': this.note(a, 0.16, 'sine', 0.24); this.note(a + 2, 0.12, 'sine', 0.1); break;
        case 'power': for (let i = 0; i < 4; i++) tone(mtof(scaleNote(i * 2 + 7) + 12), 0.2, 'triangle', 0.18, t + i * 0.055); break;
        case 'shield': noise(0.4, 0.4, t, 'bandpass', 2400, 300); tone(400, 0.35, 'square', 0.12, t, 90); break;
        case 'warn': tone(880, 0.07, 'square', 0.05, t); break;
        case 'overdrive': for (let i = 0; i < 6; i++) tone(mtof(scaleNote(i + 4) + 12), 0.4, 'sawtooth', 0.1, t + i * 0.045, 0, null, 0.003, 3000); break;
        case 'boss': tone(55, 1.2, 'sawtooth', 0.4, t, 40, null, 0.01, 300); noise(0.8, 0.25, t, 'lowpass', 800, 100); break;
        case 'death':
          noise(0.9, 0.7, t, 'lowpass', 4000, 80);
          tone(300, 0.8, 'sawtooth', 0.3, t, 40, null, 0.003, 1800);
          tone(90, 0.7, 'sine', 0.6, t, 30); break;
        case 'click': tone(740, 0.05, 'triangle', 0.14, t); break;
        case 'back': tone(520, 0.06, 'triangle', 0.12, t); break;
        case 'unlock': for (let i = 0; i < 5; i++) tone(mtof(scaleNote(i * 2 + 5) + 12), 0.5, 'triangle', 0.2, t + i * 0.08); break;
        case 'buy': for (let i = 0; i < 3; i++) tone(mtof(scaleNote(i * 2 + 7) + 12), 0.3, 'sine', 0.22, t + i * 0.07); break;
        case 'record': for (let i = 0; i < 7; i++) tone(mtof(scaleNote(i + 5) + 12), 0.35, 'triangle', 0.16, t + i * 0.06); break;
      }
    },
  };
})();
