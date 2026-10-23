'use strict';
// Generative score + effects, all synthesised live. One continuous piece that never restarts: sectors change its key, mode and
// colour, planets and events bend it, and the combo opens layers up and down, always on a bar boundary with voice-led chords.
OD.audio = (() => {
  let ctx = null, master, musicBus, sfxBus, synthBus, synthRev, mRevIn, sfxRev, revIn, dlyIn, dlyOut, sfxDly, mDlyIn, padBus, musicLP, noiseBuf;
  let analyser = null, fbuf = null, bassLv = 0, mDelayL, mDelayR;
  const lastPick = {}, lastAt = {}, recent = [];
  let keyNow = null;               // { root, scale } of the music right now: effects are quantised to it
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const sm = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const rnd = () => Math.random();
  const pick = a => a[(rnd() * a.length) | 0];
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function scaleNote(idx) {
    idx = Math.floor(idx) || 0;
    const s = keyNow.scale, n = s.length;
    return keyNow.root + s[((idx % n) + n) % n] + 12 * Math.floor(idx / n);
  }

  function init() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
    musicLP = ctx.createBiquadFilter();
    musicLP.type = 'lowpass'; musicLP.frequency.value = 18000;
    musicBus = ctx.createGain(); sfxBus = ctx.createGain();
    musicBus.connect(musicLP); musicLP.connect(master);
    analyser = ctx.createAnalyser(); analyser.fftSize = 512; analyser.smoothingTimeConstant = 0.5; musicLP.connect(analyser); fbuf = new Uint8Array(analyser.frequencyBinCount);
    sfxBus.connect(master);
    // effects space: a soft stereo hall and a darkened ping-pong echo that the voices send into
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
    sfxRev = ctx.createGain(); sfxRev.connect(revIn);
    sfxDly = ctx.createGain(); sfxDly.connect(dlyIn);
    // music space: a longer, lusher hall and a tempo-synced echo (dotted eighth left, eighth right)
    synthBus = ctx.createGain(); synthBus.connect(musicBus);
    padBus = ctx.createGain(); padBus.connect(synthBus);
    synthRev = ctx.createGain(); mRevIn = ctx.createGain();
    const mHP = ctx.createBiquadFilter(); mHP.type = 'highpass'; mHP.frequency.value = 180;
    const mConv = ctx.createConvolver(); mConv.buffer = makeIR(4.6, 2.0);
    const mOut = ctx.createGain(); mOut.gain.value = 0.9;
    synthBus.connect(synthRev); synthRev.connect(mRevIn); mRevIn.connect(mHP); mHP.connect(mConv); mConv.connect(mOut); mOut.connect(musicLP);
    mDlyIn = ctx.createGain();
    mDelayL = ctx.createDelay(2); mDelayR = ctx.createDelay(2);
    const mfb = ctx.createGain(), mlp = ctx.createBiquadFilter(), mmg = ctx.createChannelMerger(2), mdo = ctx.createGain();
    mfb.gain.value = 0.38; mlp.type = 'lowpass'; mlp.frequency.value = 2400; mdo.gain.value = 0.55;
    mDlyIn.connect(mlp); mlp.connect(mDelayL); mDelayL.connect(mDelayR); mDelayR.connect(mfb); mfb.connect(mDelayL);
    mDelayL.connect(mmg, 0, 0); mDelayR.connect(mmg, 0, 1); mmg.connect(mdo); mdo.connect(musicBus);
    const lim = ctx.createDynamicsCompressor();     // final safety limiter so stacked effects never clip
    lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.08;
    master.connect(comp); comp.connect(lim); lim.connect(ctx.destination);
    applyVolumes();
    const len = ctx.sampleRate * 1;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    buildDrone();
    return ctx;
  }
  function applyVolumes() {
    if (!ctx) return;
    const s = OD.save.settings;
    musicBus.gain.value = MUSIC_GAIN * s.music;
    sfxBus.gain.value = 1.25 * s.sfx;
    synthRev.gain.value = 0.4;
    mRevIn.gain.value = MUSIC_GAIN * s.music;      // the music's reverb return follows the music volume
    sfxRev.gain.value = 1.25 * s.sfx;
    sfxDly.gain.value = 1.25 * s.sfx;
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
  const MUSIC_GAIN = 0.9;   // the loudest the music slider can make it

  // --------------------------------------------------------- voices
  // routes a voice to the dry sfx bus (or another bus) with optional pan, reverb and echo sends
  function route(node, o) {
    let n = node;
    if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; n.connect(p); n = p; }
    n.connect(o.bus || sfxBus);
    if (o.rev) { const g = ctx.createGain(); g.gain.value = o.rev; n.connect(g); g.connect(o.bus === synthBus ? mRevIn : sfxRev); }
    if (o.dly) { const g = ctx.createGain(); g.gain.value = o.dly; n.connect(g); g.connect(o.bus === synthBus ? mDlyIn : sfxDly); }
  }
  // glassy struck-bell: a few inharmonic partials with their own decay, soft attack, no hard edges
  const BELL = [[1, 1, 1], [2.0, 0.16, 0.5], [2.76, 0.05, 0.3]];
  let sfxLevel = 1;     // thins out effects while many are playing (see sfx())
  function bell(freq, dur, vol, when, o = {}) {
    if (o.bus !== synthBus) vol *= sfxLevel;
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
  // the workhorse effect voice: one clean, short sine pip with a whisper of octave, soft attack, fast decay
  function blip(freq, dur, vol, when, o = {}) {
    const t = when || ctx.currentTime, g = ctx.createGain();
    vol *= sfxLevel;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.007); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [m, k] of [[1, 1], [2, 0.12]]) {
      const os = ctx.createOscillator(), og = ctx.createGain();
      os.type = 'sine'; os.frequency.value = freq * m; og.gain.value = k; os.connect(og); og.connect(g); os.start(t); os.stop(t + dur + 0.04);
    }
    route(g, o);
  }
  // warm voice: sine + a slightly detuned triangle, optional glide/vibrato, lowpassed
  function soft(freq, dur, vol, when, o = {}) {
    if (o.bus !== synthBus) vol *= sfxLevel;
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
    if (o.bus !== synthBus) vol *= sfxLevel;
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


  // =========================================================== the score
  // Each sector is a palette: a key, a set of four-chord progressions and a character (how bright, busy, bassy, spacious).
  // Chords are written as [semitones above the key, quality]. Every chord change is voice-led (each note moves as little as
  // possible) and the old chord rings out under the new one, so changing key or mode never has a seam.
  const Q = { maj: [0, 4, 7], maj7: [0, 4, 7, 11], maj9: [0, 4, 7, 11, 14], add9: [0, 4, 7, 14], sus2: [0, 2, 7, 14], m7: [0, 3, 7, 10], m9: [0, 3, 7, 10, 14], mAdd9: [0, 3, 7, 14] };
  const PENT_MAJ = [0, 2, 4, 7, 9], PENT_MIN = [0, 3, 5, 7, 10];
  // inst: which instruments play in this sector. pad / arp / lead / perc / bass pick voices from the families below.
  const PAL = [
    { name: 'Aurora', root: 2, pent: PENT_MAJ, bright: 0.5, dens: 0.55, bass: 0.7, perc: 0.4, space: 1, inst: { pad: 'choir', arp: 'marimba', lead: 'flute', perc: 'soft', bass: 'sine', spark: 'bell' },
      progs: [[[0, 'maj9'], [7, 'sus2'], [9, 'm9'], [5, 'maj7']], [[5, 'maj7'], [0, 'maj9'], [7, 'add9'], [9, 'm7']], [[0, 'add9'], [4, 'm7'], [5, 'maj7'], [7, 'sus2']], [[9, 'm9'], [5, 'maj7'], [0, 'add9'], [7, 'sus2']]] },
    { name: 'Dust', root: 4, pent: PENT_MIN, bright: 0.4, dens: 0.6, bass: 0.85, perc: 0.55, space: 0.75, inst: { pad: 'dusty', arp: 'kalimba', lead: 'flute', perc: 'frame', bass: 'pluck', spark: 'none' },
      progs: [[[0, 'm9'], [5, 'add9'], [10, 'maj'], [7, 'm7']], [[0, 'm7'], [7, 'm7'], [5, 'add9'], [10, 'add9']], [[3, 'maj7'], [0, 'm9'], [5, 'add9'], [10, 'maj']]] },
    { name: 'Ember', root: 0, pent: PENT_MIN, bright: 0.3, dens: 0.6, bass: 1, perc: 0.75, space: 0.8, inst: { pad: 'string', arp: 'saw', lead: 'cello', perc: 'taiko', bass: 'saw', spark: 'none' },
      progs: [[[0, 'm7'], [8, 'maj7'], [3, 'maj7'], [10, 'sus2']], [[0, 'm9'], [5, 'm7'], [8, 'maj7'], [7, 'm7']], [[0, 'm7'], [1, 'maj7'], [8, 'maj7'], [10, 'add9']]] },
    { name: 'Glacier', root: 9, pent: PENT_MAJ, bright: 0.7, dens: 0.4, bass: 0.35, perc: 0.3, space: 1.3, inst: { pad: 'glass', arp: 'crystal', lead: 'crystal', perc: 'ice', bass: 'sub', spark: 'ice' },
      progs: [[[0, 'maj7'], [7, 'add9'], [4, 'm7'], [2, 'sus2']], [[0, 'add9'], [9, 'm7'], [5, 'maj7'], [7, 'sus2']], [[5, 'maj7'], [0, 'maj9'], [2, 'sus2'], [9, 'm9']]] },
    { name: 'Pulsar', root: 2, pent: PENT_MAJ, bright: 0.65, dens: 0.85, bass: 0.9, perc: 0.9, space: 0.6, inst: { pad: 'string', arp: 'pulse', lead: 'cello', perc: 'drive', bass: 'saw', spark: 'none' },
      progs: [[[0, 'add9'], [10, 'add9'], [5, 'maj7'], [0, 'add9']], [[0, 'sus2'], [10, 'add9'], [5, 'maj9'], [7, 'm7']], [[5, 'maj7'], [10, 'add9'], [0, 'add9'], [7, 'm7']]] },
    { name: 'Void', root: 11, pent: PENT_MIN, bright: 0.22, dens: 0.45, bass: 1, perc: 0.5, space: 1.4, inst: { pad: 'dark', arp: 'bowl', lead: 'whale', perc: 'heart', bass: 'sub', spark: 'bowl' },
      progs: [[[0, 'm9'], [8, 'maj7'], [3, 'add9'], [10, 'add9']], [[0, 'm7'], [5, 'm7'], [8, 'maj7'], [7, 'm7']], [[0, 'mAdd9'], [3, 'maj7'], [8, 'maj7'], [10, 'sus2']]] },
  ];
  // planets bend the sector's music: a transposition plus a few knobs
  const ERA = {
    genesis: { tr: 0, bright: 0, dens: 0, perc: 0, bass: 0 },
    tidal: { tr: 2, bright: 0.12, dens: 0.12, perc: 0, bass: 0 },
    molten: { tr: -2, bright: -0.1, dens: 0.05, perc: 0.25, bass: 0.2 },
    frozen: { tr: 5, bright: 0.3, dens: -0.12, perc: -0.2, bass: -0.2 },
    storm: { tr: 7, bright: 0.1, dens: 0.25, perc: 0.3, bass: 0.1 },
    eclipse: { tr: -5, bright: -0.3, dens: -0.1, perc: -0.1, bass: 0.3 },
    verdant: { tr: 4, bright: 0.1, dens: 0.1, perc: -0.1, bass: -0.1 },
    prism: { tr: 9, bright: 0.25, dens: 0.05, perc: -0.1, bass: -0.2 },
    toxic: { tr: -1, bright: -0.15, dens: 0.1, perc: 0.1, bass: 0.2 },
  };
  const M = {
    on: false, timer: 0, t: 0, step: 0, bpm: 108, bpmT: 108, pending: false, anchored: false, startT: 0, epoch: 0, soft: false,
    mode: 'menu', pal: 0, palT: 0, era: 'genesis', eraT: 'genesis', e: 0.5, eT: 0.5, tension: 0, tensionT: 0, boost: 0, intensity: 0,
    chords: [], ci: 0, prog: -1, voicing: null, cur: null, motif: [], pool: [], melLast: 72, trans: 0, drone: null,
  };
  const barSec = () => 240 / M.bpm;

  function buildDrone() {
    // a low bed that only opens up under tension (black holes, bosses)
    const g = ctx.createGain(); g.gain.value = 0;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 200;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = 'sine'; o2.type = 'sawtooth'; o1.frequency.value = o2.frequency.value = 55; o2.detune.value = 9;
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    o1.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(synthBus);
    o1.start(); o2.start();
    M.drone = { g, o1, o2 };
  }

  const eff = () => clamp(M.e + M.boost + M.tension * 0.6, 0, 3.2);
  function layers() {
    const E = eff(), P = PAL[M.pal], X = ERA[M.era] || ERA.genesis;
    return {
      E, bright: clamp(P.bright + X.bright + 0.05 * E, 0.05, 1),
      dens: clamp(0.14 + 0.9 * sm(E, 0.15, 2.7) * clamp(P.dens + X.dens, 0.2, 1) + 0.1 * sm(E, 2.2, 3.2), 0, 1),
      bass: sm(E, 0.4, 1.0) * clamp(P.bass + X.bass, 0.2, 1.2),
      kick: sm(E, 0.95, 1.5) * clamp(P.perc + X.perc, 0.2, 1.2),
      hat: sm(E, 1.45, 2.1) * clamp(P.perc + X.perc, 0.3, 1.2),
      clap: sm(E, 1.9, 2.5) * clamp(P.perc + X.perc, 0.3, 1.2),
      mel: sm(E, 1.1, 1.9), riser: sm(E, 2.3, 3.0), space: P.space,
    };
  }

  function newProgression(t) {
    if (M.palT !== M.pal || M.eraT !== M.era || M.prog < 0) { M.pal = M.palT; M.era = M.eraT; M.prog = -1; }
    const P = PAL[M.pal], X = ERA[M.era] || ERA.genesis;
    let k; do { k = (rnd() * P.progs.length) | 0; } while (k === M.prog && P.progs.length > 1);
    M.prog = k; M.ci = 0;
    M.trans = X.tr;
    const key = P.root + X.tr;
    M.chords = P.progs[k].map(([off, q]) => ({ pc: (((key + off) % 12) + 12) % 12, ints: Q[q] }));
    keyNow = { root: 48 + (((key % 12) + 12) % 12), scale: P.pent };
    makeMotif();
    if (M.drone) { const f = mtof(24 + ((key % 12) + 12) % 12); M.drone.o1.frequency.setTargetAtTime(f, t, 0.5); M.drone.o2.frequency.setTargetAtTime(f, t, 0.5); }
  }
  // voice-leading: put every chord tone in the octave closest to where the previous chord's voices were
  function voiceChord(c, prev) {
    const center = prev ? prev.reduce((a, b) => a + b, 0) / prev.length : 63;
    let pcs = [...new Set(c.ints.map(i => (c.pc + i) % 12))];
    if (pcs.length > 4) pcs = pcs.filter(pc => pc !== (c.pc + c.ints[2]) % 12);       // 5-note chords drop the fifth
    const out = pcs.map(pc => { let b = null; for (let n = 52; n <= 76; n++) if (n % 12 === pc && (b === null || Math.abs(n - center) < Math.abs(b - center))) b = n; return b; });
    return out.sort((a, b) => a - b);
  }
  function makeMotif() {
    // a sixteen-step figure; every step has a "threshold", so rising energy adds notes one by one instead of switching a pattern on
    const w = [0.0, 0.8, 0.45, 0.85, 0.15, 0.8, 0.5, 0.85, 0.05, 0.8, 0.45, 0.85, 0.2, 0.8, 0.5, 0.9];
    let idx = 4;
    M.motif = w.map((th, k) => {
      if (rnd() < 0.18 + (k % 2 ? 0.25 : 0)) return null;
      idx = clamp(idx + pick([-2, -1, -1, 1, 1, 2, 3, -3]), 0, 9);
      return { idx, th: clamp(th * 0.7 + rnd() * 0.3, 0, 0.98) };
    });
  }

  // ---- voices of the score
  const inst = () => PAL[M.pal].inst;
  function padNote(f, t, dur, vol, cut, pan, kind) {
    const g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 0.3;
    const sw = kind === 'string' ? 1.2 : kind === 'dark' ? 0.6 : 1;
    lp.frequency.setValueAtTime(cut * 0.55 * sw, t); lp.frequency.linearRampToValueAtTime(cut * sw, t + dur * 0.55); lp.frequency.linearRampToValueAtTime(cut * 0.7 * sw, t + dur + 1.8);
    const att = kind === 'string' ? 1.1 : kind === 'glass' ? 2.0 : 1.5;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + att);
    g.gain.setValueAtTime(vol, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 2.4);
    const recipe = {
      warm: [['triangle', -5, 1], ['sawtooth', 6, 0.16], ['sine', 0, 0.7]],
      choir: [['sine', -7, 1], ['sine', 7, 1], ['triangle', 0, 0.35]],
      dusty: [['triangle', -9, 1], ['triangle', 9, 0.8], ['sine', 0, 0.5]],
      string: [['sawtooth', -8, 0.5], ['sawtooth', 8, 0.5], ['triangle', 0, 0.5]],
      glass: [['sine', 0, 1], ['sine', 1200, 0.18], ['sine', 1902, 0.08]],     // detune in cents: a soft octave and a fifth above shimmer on top
      dark: [['sawtooth', -12, 0.35], ['sawtooth', 12, 0.35], ['sine', 0, 0.8]],
    }[kind] || [['triangle', -5, 1], ['sine', 0, 0.7]];
    for (const [type, det, k] of recipe) {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = type; o.frequency.value = f; o.detune.value = det; og.gain.value = k;
      o.connect(og); og.connect(lp); o.start(t); o.stop(t + dur + 2.6);
    }
    if (kind === 'choir') {          // a pair of vowel-like formant peaks turns the stack into an "ooh"
      const fm = ctx.createBiquadFilter(); fm.type = 'peaking'; fm.frequency.value = 700; fm.gain.value = 7; fm.Q.value = 2;
      lp.connect(fm); fm.connect(g);
    } else lp.connect(g);
    if (kind === 'dusty' || kind === 'dark') {   // a breath of hiss/air under the chord
      const ns = ctx.createBufferSource(); ns.buffer = noiseBuf; ns.loop = true;
      const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = kind === 'dusty' ? 900 : 300; nf.Q.value = 1.2;
      const ng = ctx.createGain(); ng.gain.value = 0.05; ns.connect(nf); nf.connect(ng); ng.connect(g); ns.start(t); ns.stop(t + dur + 2.6);
    }
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(padBus); } else g.connect(padBus);
  }
  function bassNote(f, t, dur, vol, kind) {
    const g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = kind === 'saw' ? 520 : 320;
    if (kind === 'saw') lp.frequency.setValueAtTime(900, t), lp.frequency.exponentialRampToValueAtTime(260, t + Math.min(dur, 0.4));
    const d = kind === 'pluck' ? Math.min(dur, 0.7) : dur;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + (kind === 'sub' ? 0.08 : 0.025)); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    const recipe = kind === 'saw' ? [['sawtooth', 1, 0.45], ['sine', 1, 0.9]] : kind === 'pluck' ? [['triangle', 1, 1], ['sine', 0.5, 0.6]] : kind === 'sub' ? [['sine', 1, 1], ['sine', 0.5, 0.5]] : [['sine', 1, 1], ['triangle', 2, 0.18]];
    for (const [type, mul, k] of recipe) {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = type; o.frequency.value = f * mul; og.gain.value = k; o.connect(og); og.connect(lp); o.start(t); o.stop(t + d + 0.05);
    }
    lp.connect(g); g.connect(musicBus);
  }
  // ---- the arp family: one function per instrument character, all lower and rounder than a plain FM bell
  function partials(f, t, list, pan, o) {   // list: [ratio, gain, decaySeconds, type?]
    const out = ctx.createGain();
    for (const [r, k, d, type] of list) {
      if (f * r > 9000) continue;
      const os = ctx.createOscillator(), g = ctx.createGain();
      os.type = type || 'sine'; os.frequency.value = f * r;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(k, t + (o.att || 0.006)); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      os.connect(g); g.connect(out); os.start(t); os.stop(t + d + 0.05);
    }
    if (o.lp) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.lp; out.connect(lp); route(lp, { bus: synthBus, pan, rev: o.rev == null ? 0.5 : o.rev, dly: o.dly == null ? 0.45 : o.dly }); }
    else route(out, { bus: synthBus, pan, rev: o.rev == null ? 0.5 : o.rev, dly: o.dly == null ? 0.45 : o.dly });
  }
  function sawPluck(f, dur, vol, t, pan, cutHi, cutLo, o) {
    const os = ctx.createOscillator(), os2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    os.type = 'sawtooth'; os2.type = o.pulse ? 'square' : 'sawtooth'; os.frequency.value = f; os2.frequency.value = f; os2.detune.value = 8;
    lp.type = 'lowpass'; lp.Q.value = o.q || 3;
    lp.frequency.setValueAtTime(cutHi, t); lp.frequency.exponentialRampToValueAtTime(cutLo, t + dur * 0.6);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    os.connect(lp); os2.connect(lp); lp.connect(g); os.start(t); os2.start(t); os.stop(t + dur + 0.05); os2.stop(t + dur + 0.05);
    route(g, { bus: synthBus, pan, rev: o.rev == null ? 0.25 : o.rev, dly: o.dly == null ? 0.4 : o.dly });
  }
  function arpNote(kind, f, vol, t, pan, L) {
    const sp = L.space;
    switch (kind) {
      case 'marimba': partials(f, t, [[1, vol * 1.3, 0.55 + 0.3 * sp], [4, vol * 0.35, 0.12], [10, vol * 0.1, 0.05]], pan, { lp: 3200, rev: 0.45 }); break;
      case 'kalimba': partials(f, t, [[1, vol * 1.2, 0.7], [5.4, vol * 0.3, 0.09], [2, vol * 0.2, 0.3, 'triangle']], pan, { lp: 2800, rev: 0.35, dly: 0.5 }); break;
      case 'crystal': partials(f, t, [[1, vol * 0.9, 1.3 + sp], [2.01, vol * 0.4, 0.8], [3.02, vol * 0.22, 0.55], [4.2, vol * 0.1, 0.3]], pan, { lp: 5200, rev: 0.75, dly: 0.5, att: 0.004 }); break;
      case 'bowl': partials(f * 0.5, t, [[1, vol * 1.4, 3.6], [2.4, vol * 0.5, 2.8], [4.1, vol * 0.25, 1.8], [5.9, vol * 0.1, 1.0]], pan, { lp: 2400, rev: 0.8, dly: 0.2, att: 0.02 }); break;
      case 'saw': sawPluck(f, 0.5 + 0.3 * sp, vol * 0.9, t, pan, 1500, 260, { q: 4, rev: 0.2, dly: 0.35 }); break;
      case 'pulse': sawPluck(f, 0.22, vol * 0.8, t, pan, 2600, 420, { pulse: true, q: 6, rev: 0.15, dly: 0.5 }); break;
      default: pluck(f, 0.7 + 0.9 * sp, vol, t, pan, L.bright);
    }
  }
  // glassy FM pluck (kept as the generic fallback)
  function pluck(f, dur, vol, t, pan, bright) {
    const c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    c.type = 'sine'; m.type = 'sine'; c.frequency.value = f; m.frequency.value = f * 2;
    mg.gain.setValueAtTime(f * (0.4 + 1.2 * bright), t); mg.gain.exponentialRampToValueAtTime(f * 0.02, t + dur * 0.4);
    m.connect(mg); mg.connect(c.frequency);
    lp.type = 'lowpass'; lp.frequency.value = 1600 + 3600 * bright;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    c.connect(lp); lp.connect(g);
    c.start(t); m.start(t); c.stop(t + dur + 0.05); m.stop(t + dur + 0.05);
    route(g, { bus: synthBus, pan, rev: 0.5, dly: 0.55 });
  }
  // ---- melody voices
  function leadNote(kind, f, dur, vol, t, L) {
    const common = { bus: synthBus };
    if (kind === 'flute') {        // soft sine with a breath of air on the attack
      soft(f, dur, vol * 1.1, t, { ...common, att: 0.09, lp: 1700, vib: true, rev: 0.55, dly: 0.35 });
      air(Math.min(dur, 0.6), vol * 0.25, t, f * 1.5, f * 1.5, { ...common, q: 3, peak: 0.2, rev: 0.4 });
    } else if (kind === 'cello') { // bowed, dark, a little reedy
      const os = ctx.createOscillator(), os2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), vb = ctx.createOscillator(), vg = ctx.createGain();
      os.type = 'sawtooth'; os2.type = 'sawtooth'; os.frequency.value = f; os2.frequency.value = f; os2.detune.value = 9;
      vb.frequency.value = 5.1; vg.gain.value = f * 0.007; vb.connect(vg); vg.connect(os.frequency); vg.connect(os2.frequency);
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(1300, t + dur * 0.4); lp.Q.value = 1.2;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol * 0.7, t + 0.22); g.gain.setValueAtTime(vol * 0.7, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.4);
      os.connect(lp); os2.connect(lp); lp.connect(g); os.start(t); os2.start(t); vb.start(t); os.stop(t + dur + 0.5); os2.stop(t + dur + 0.5); vb.stop(t + dur + 0.5);
      route(g, { ...common, rev: 0.45, dly: 0.25 });
    } else if (kind === 'whale') { // a long, sliding, eerie call
      soft(f * 0.5, dur + 1.4, vol * 1.2, t, { ...common, att: 0.5, lp: 900, vib: true, slide: f * (rnd() < 0.5 ? 0.75 : 0.5), rev: 0.8, dly: 0.5 });
    } else {                       // crystal: a quiet struck chime instead of a sustained line
      partials(f, t, [[1, vol * 0.8, dur + 0.8], [2.01, vol * 0.3, 0.9], [3.0, vol * 0.15, 0.5]], 0, { lp: 4200, rev: 0.8, dly: 0.5, att: 0.01 });
    }
  }
  // ---- percussion
  function thump(t, v, f0, f1, d, lpHz) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d * 0.45);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5 * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + d + 0.03);
    if (lpHz) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lpHz; const ng = ctx.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(0.16 * v, t + 0.003); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.07); s.connect(f); f.connect(ng); route(ng, { bus: synthBus, rev: 0.3 }); s.start(t, rnd() * 0.5); s.stop(t + 0.1); }
    if (v > 0.3) { padBus.gain.setValueAtTime(1 - 0.2 * v, t); padBus.gain.setTargetAtTime(1, t + 0.02, 0.11); }   // gentle pump
  }
  const kick = (t, v) => thump(t, v, 125, 42, 0.3, 3500);
  function hat(t, v, open, hp) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = hp || 5200; f.Q.value = 0.9;
    const g = ctx.createGain(), d = open ? 0.16 : 0.045;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.035 * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f); f.connect(g); route(g, { bus: synthBus, pan: (rnd() - 0.5) * 0.5, rev: 0.2 });
    s.start(t, rnd() * 0.5); s.stop(t + d + 0.03);
  }
  function shaker(t, v) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 5200; f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.07 * v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    s.connect(f); f.connect(g); route(g, { bus: synthBus, pan: (rnd() - 0.5) * 0.6, rev: 0.25 });
    s.start(t, rnd() * 0.5); s.stop(t + 0.12);
  }
  function wood(t, v, f) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.06);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.14 * v, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g); route(g, { bus: synthBus, pan: (rnd() - 0.5) * 0.5, rev: 0.3 }); o.start(t); o.stop(t + 0.1);
  }
  function crackle(t, v) {   // ice crackle: a short high filtered tick
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400 + rnd() * 2400; f.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.1 * v, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f); f.connect(g); route(g, { bus: synthBus, pan: (rnd() - 0.5) * 1.2, rev: 0.7, dly: 0.4 });
    s.start(t, rnd() * 0.5); s.stop(t + 0.08);
  }
  function clap(t, v) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.1 * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    s.connect(f); f.connect(g); route(g, { bus: synthBus, rev: 0.7 });
    s.start(t, rnd() * 0.5); s.stop(t + 0.25);
  }

  function chordStart(t, L) {
    if (M.ci >= M.chords.length || M.palT !== M.pal || M.eraT !== M.era) newProgression(t);
    const c = M.chords[M.ci++], I = inst();
    const v = voiceChord(c, M.voicing); M.voicing = v;
    const dur = barSec() * 2;
    const cut = 380 + 2500 * Math.pow(L.bright, 1.4);
    const vol = 0.034 * (0.8 + 0.12 * L.E) * (I.pad === 'choir' ? 1.15 : I.pad === 'glass' ? 0.9 : 1);
    v.forEach((n, i) => padNote(mtof(n), t + i * 0.035, dur, vol, cut * (1 + i * 0.05), (i - (v.length - 1) / 2) * 0.35, I.pad));
    // arp pool: chord tones, kept in the warm middle register (glacier sits a little higher, void lower)
    const lo = I.arp === 'crystal' ? 62 : I.arp === 'bowl' ? 64 : 55;
    const pcs = new Set(v.map(n => n % 12)); c.ints.forEach(i => pcs.add((c.pc + i) % 12));
    M.pool = []; for (let n = lo; n <= lo + 26; n++) if (pcs.has(n % 12)) M.pool.push(n);
    let b = null; for (let n = 31; n <= 46; n++) if (n % 12 === c.pc && (b === null || Math.abs(n - 38) < Math.abs(b - 38))) b = n;
    M.cur = { c, bass: b };
    if (L.bass > 0.03) bassNote(mtof(b), t, barSec() * 1.9, 0.2 * L.bass, I.bass === 'pluck' || I.bass === 'saw' ? 'sub' : I.bass);
    // a sparse melody phrase over the two bars, if the energy allows
    if (rnd() < L.mel * 0.8) {
      const sd = barSec() / 16, pen = PAL[M.pal].pent, rootPc = keyNow.root % 12;
      const rhy = pick([[0, 6, 8, 16, 22, 24], [0, 8, 12, 16, 24], [2, 6, 8, 14, 16, 28], [0, 4, 8, 20, 24]]);
      const cpcs = new Set(M.pool.map(n => n % 12)), clash = n => [1, 11].some(d => cpcs.has((n + d) % 12) && !cpcs.has(n % 12));
      const high = I.lead === 'crystal' ? 12 : 0;
      let cur = M.pool.reduce((a, n) => Math.abs(n + 12 - M.melLast) < Math.abs(a - M.melLast) ? n + 12 : a, M.pool[0] + 12);
      rhy.forEach((st, i) => {
        if (i > 0) {
          const dir = pick([-2, -1, -1, 1, 1, 2]); let n = cur;
          for (let k = 0; k < Math.abs(dir); k++) { let g = 0; do { n += Math.sign(dir); } while (++g < 14 && (!pen.includes((((n - rootPc) % 12) + 12) % 12) || clash(n))); }
          cur = clamp(n, 62, 82);
        }
        const next = rhy[i + 1] === undefined ? 32 : rhy[i + 1];
        leadNote(I.lead, mtof(cur + (I.lead === 'cello' || I.lead === 'whale' ? -12 : high ? 0 : 0)), Math.min((next - st) * sd * 0.95, 2.4) + 0.5, 0.05 * L.mel, t + st * sd, L);
        M.melLast = cur;
      });
    }
  }

  function stepAt(t) {
    const k = M.step % 16, L = layers(), sd = barSec() / 16, I = inst();
    if (k === 0) {
      const bar = M.step >> 4;
      if (M.pending) { M.startT = t; M.anchored = true; M.pending = false; M.soft = false; M.epoch++; M.bpm = M.bpmT; }
      if (bar % 2 === 0) chordStart(t, L);
      if (bar % 4 === 0 && bar > 0) { M.motif.forEach(m => { if (m && rnd() < 0.3) m.idx = clamp(m.idx + pick([-2, -1, 1, 2]), 0, 9); }); }
      if (bar % 8 === 7 && L.riser > 0.15) air(barSec() * 1.05, 0.05 * L.riser, t, 300, I.pad === 'glass' ? 4500 : 5000, { peak: 0.92, rev: 0.6, bus: synthBus });
    }
    if (!M.cur) return;
    // arp
    const m = M.motif[k];
    if (m && m.th < L.dens && M.pool.length) {
      const n = M.pool[Math.min(m.idx, M.pool.length - 1)];
      const acc = k % 4 === 0 ? 1 : k % 2 === 0 ? 0.8 : 0.62;
      arpNote(I.arp, mtof(n), (0.035 + 0.015 * L.bright) * acc, t, ((m.idx % 5) - 2) * 0.28, L);
    }
    // sparkles: rare accents that keep even the calmest screens alive
    if (I.spark !== 'none' && k % 2 === 1 && rnd() < 0.04 + 0.02 * L.E && M.pool.length) {
      const n = pick(M.pool);
      if (I.spark === 'ice') partials(mtof(n + 12), t, [[1, 0.02, 1.6], [2.01, 0.01, 0.7]], (rnd() - 0.5) * 1.5, { lp: 5000, rev: 0.85, dly: 0.5 });
      else if (I.spark === 'bowl') partials(mtof(n - 12), t, [[1, 0.04, 4.2], [2.4, 0.02, 3], [4.1, 0.01, 2]], (rnd() - 0.5) * 1.2, { lp: 1800, rev: 0.9, dly: 0.2, att: 0.03 });
      else bell(mtof(n), 2.4, 0.014, t, { bus: synthBus, pan: (rnd() - 0.5) * 1.4, rev: 0.8, dly: 0.5 });
    }
    // bass pulse
    const bk = I.bass;
    if (L.bass > 0.05 && L.E > 1.3) {
      if (bk === 'saw') { if (k % 2 === 0 && L.E > 1.5) bassNote(mtof(M.cur.bass), t, sd * 1.6, 0.09 * L.bass, 'saw'); }
      else if (bk === 'pluck') { if (k === 10 || k === 3 || (L.E > 2.2 && k === 14)) bassNote(mtof(M.cur.bass), t, sd * 3, 0.13 * L.bass, 'pluck'); }
      else if (bk !== 'sub' && (k === 10 || (L.E > 2.2 && k === 14))) bassNote(mtof(M.cur.bass), t, sd * 3, 0.13 * L.bass, bk);
    }
    // percussion, by character
    const P = I.perc;
    if (P === 'soft' || P === 'drive') {
      if (L.kick > 0.03) {
        if (k === 0 || k === 8 || ((L.E > 2.0 || P === 'drive') && (k === 4 || k === 12))) kick(t, L.kick * (k % 8 === 0 ? 1 : 0.7));
        else if (L.E > 2.5 && k === 14) kick(t, L.kick * 0.45);
      }
      if (L.hat > 0.03) {
        if (k % 4 === 2) hat(t, L.hat, k === 14);
        else if (P === 'drive' && k % 2 === 1) hat(t, L.hat * 0.5, false);
      }
      if (L.clap > 0.03 && (k === 4 || k === 12)) clap(t, L.clap);
    } else if (P === 'frame') {                 // dusty frame drum, wood and shaker
      if (L.kick > 0.03) { if (k === 0 || k === 8) thump(t, L.kick * 0.9, 95, 58, 0.34, 900); else if (L.E > 1.9 && k === 11) thump(t, L.kick * 0.5, 130, 80, 0.2, 900); }
      if (L.hat > 0.03 && k % 2 === 0 && k % 4 !== 0) shaker(t, L.hat);
      if (L.clap > 0.03 && (k === 6 || k === 14)) wood(t, L.clap, 1300);
    } else if (P === 'taiko') {                 // deep drums that mean business, with a roll at the end of every other bar
      if (L.kick > 0.03) {
        if (k === 0) thump(t, L.kick * 1.1, 100, 44, 0.5, 700);
        else if (k === 8 || (L.E > 1.9 && k === 10)) thump(t, L.kick * 0.8, 84, 40, 0.4, 700);
        if (L.E > 2.2 && (M.step >> 4) % 2 === 1 && k >= 12) thump(t, L.kick * (0.35 + 0.1 * (k - 12)), 130 - 10 * (k - 12), 70, 0.18, 900);
      }
      if (L.hat > 0.03 && (k === 4 || k === 12)) wood(t, L.hat * 1.2, 760);
      if (L.clap > 0.03 && k === 8) clap(t, L.clap * 0.8);
    } else if (P === 'ice') {                   // almost no drums: crackling ticks and a soft pulse
      if (L.kick > 0.03 && k === 0 && L.E > 1.6) thump(t, L.kick * 0.5, 90, 50, 0.4, 0);
      if (rnd() < 0.05 + 0.05 * L.hat && k % 2 === 1) crackle(t, 0.6 + 0.6 * L.E / 3);
      if (L.hat > 0.03 && k % 4 === 2) hat(t, L.hat * 0.5, false, 9000);
    } else if (P === 'heart') {                 // a slow heartbeat
      if (L.kick > 0.03 && (k === 0 || k === 3)) thump(t, L.kick * (k === 0 ? 1 : 0.65), 72, 34, 0.45, 0);
      if (L.hat > 0.03 && k % 8 === 4) hat(t, L.hat * 0.7, true, 3500);
      if (L.clap > 0.03 && k === 12) clap(t, L.clap * 0.6);
    }
  }

  function tick() {
    if (!M.on || !ctx) return;
    const now = ctx.currentTime;
    M.e += (M.eT - M.e) * (1 - Math.exp(-0.025 / (M.eT > M.e ? 1.4 : 2.4)));
    M.tension += (M.tensionT - M.tension) * (1 - Math.exp(-0.025 / 1.4));
    M.boost *= Math.exp(-0.025 / 4.5);
    if (M.drone) M.drone.g.gain.setTargetAtTime(0.09 * M.tension, now, 0.4);
    const bt = 60 / M.bpm;
    mDelayL.delayTime.setTargetAtTime(bt * 0.75, now, 0.3); mDelayR.delayTime.setTargetAtTime(bt * 0.5, now, 0.3);
    stemsTick(now);
    if (keyNow) AMB.tick(now);
    if (M.t < now - 0.25) M.t = now + 0.05;        // woke up after a long stall: carry on from here
    while (!stemsLive() && !(ST.trans) && M.t < now + 0.2) {
      stepAt(M.t);
      M.step++;
      if (!M.pending && Math.abs(M.bpmT - M.bpm) > 0.01) M.bpm += clamp(M.bpmT - M.bpm, -0.12, 0.12);   // tempo glides between sectors, a few BPM per bar
      M.t += barSec() / 16;
    }
  }


  // --------------------------------------------------------- recorded stems
  // A sector can ship its music as stems: separately rendered layers that share one tempo, key and loop length.
  // All layers loop in lockstep from one start time and only their volumes move, always starting on a bar line and
  // easing over a few seconds, so the music thickens and thins without ever cutting a phrase. A sector can have several
  // songs ("scenes", all at the same tempo): every couple of loops the music strips down to its quiet layers for two bars,
  // the next song slips in underneath on a bar line, and its drums and bass drop in on the downbeat. Only the songs in play
  // are kept in memory.
  const EMBER_LEVELS = (i, tn, mode) => {
    const run = mode === 'run', zen = mode === 'zen';
    const L = { drums: 0, bass: run ? 0.85 : zen ? 0.4 : 0.6, keys: 0.8, synth: run ? 0.55 : 0.5, colour: 0.7 };
    if (run) { L.drums = i >= 2 ? 1 : i >= 1 ? 0.85 : 0.7; L.synth = i >= 1 ? 0.85 : 0.55; L.colour = i >= 2 ? 1 : 0.7; L.keys = i >= 3 ? 1 : 0.8; L.bass = i >= 2 ? 1 : 0.85; }
    L.keys *= 1 - 0.4 * tn; L.drums = Math.min(1, L.drums + 0.2 * tn * (run ? 1 : 0)); L.bass = Math.min(1, L.bass + 0.2 * tn);
    return L;
  };
  const DUST_LEVELS = (i, tn, mode) => {   // drums and bass carry the groove, the synth and keys float over it
    const run = mode === 'run', zen = mode === 'zen';
    const L = { drums: 0, bass: run ? 0.85 : zen ? 0.4 : 0.6, keys: 0.9, synth: run ? 0.6 : 0.55, colour: 0.8 };
    if (run) { L.drums = i >= 2 ? 1 : i >= 1 ? 0.85 : 0.7; L.synth = i >= 1 ? 0.85 : 0.6; L.colour = i >= 2 ? 1 : 0.8; L.keys = i >= 3 ? 1 : 0.9; L.bass = i >= 2 ? 1 : 0.85; }
    L.keys *= 1 - 0.4 * tn; L.drums = Math.min(1, L.drums + 0.2 * tn * (run ? 1 : 0)); L.bass = Math.min(1, L.bass + 0.2 * tn);
    return L;
  };
  const AURORA_LEVELS = (i, tn, mode) => {   // the gentlest biome: the drums stay soft and the synth carries the run
    const run = mode === 'run', zen = mode === 'zen';
    const L = { drums: 0, bass: run ? 0.8 : zen ? 0.35 : 0.55, keys: 0.85, synth: run ? 0.7 : 0.65, colour: 0.8 };
    if (run) { L.drums = i >= 2 ? 0.95 : i >= 1 ? 0.8 : 0.6; L.synth = i >= 1 ? 0.85 : 0.7; L.bass = i >= 2 ? 0.95 : 0.8; }
    L.keys *= 1 - 0.35 * tn; L.drums = Math.min(1, L.drums + 0.2 * tn * (run ? 1 : 0)); L.bass = Math.min(1, L.bass + 0.2 * tn);
    return L;
  };
  const THIN = { drums: 0, bass: 0, keys: 1, synth: 1, colour: 1 };   // the layers that stay while one song hands over to the next
  const STEMS = {
    0: {   // Aurora Reach: two Suno songs (tools/music/aurora_stems.py), both 119 BPM, A minor
      bpm: 119,
      scenes: [
        { dir: 'audio/aurora/', names: ['drums', 'bass', 'keys', 'synth', 'colour'], key: { root: 57, scale: [0, 3, 5, 7, 10] }, bus: 1.0, loop: 32.272, levels: AURORA_LEVELS, thin: THIN },
        { dir: 'audio/aurora_b/', names: ['drums', 'bass', 'keys', 'synth', 'colour'], key: { root: 57, scale: [0, 3, 5, 7, 10] }, bus: 1.0, loop: 32.272, levels: AURORA_LEVELS, thin: THIN },
      ],
    },
    1: {   // Dust Belt: two Suno songs (tools/music/dust_stems.py), both set to 112 BPM, F minor
      bpm: 112,
      scenes: [
        { dir: 'audio/dust/', names: ['drums', 'bass', 'keys', 'synth', 'colour'], key: { root: 53, scale: [0, 3, 5, 7, 10] }, bus: 1.0, loop: 34.286, levels: DUST_LEVELS, thin: THIN },
        { dir: 'audio/dust_b/', names: ['drums', 'bass', 'keys', 'synth', 'colour'], key: { root: 53, scale: [0, 3, 5, 7, 10] }, bus: 1.0, loop: 34.286, levels: DUST_LEVELS, thin: THIN },
      ],
    },
    2: {   // Ember Rift: two Suno songs (tools/music/ember_stems.py), both 118 BPM
      bpm: 118,
      scenes: [
        { dir: 'audio/ember/', names: ['drums', 'bass', 'keys', 'synth', 'colour'], key: { root: 55, scale: [0, 3, 5, 7, 10] }, bus: 1.0, loop: 40.678, levels: EMBER_LEVELS, thin: THIN },
        { dir: 'audio/ember_b/', names: ['drums', 'bass', 'keys', 'synth', 'colour'], key: { root: 50, scale: [0, 3, 5, 7, 10] }, bus: 1.0, loop: 32.542, levels: EMBER_LEVELS, thin: THIN },
      ],
    },
  };
  const ST = { world: -1, cur: null, nxt: null, trans: null, idx: 0, want: null };
  const barLen = () => 240 / STEMS[ST.world].bpm;
  function fetchScene(def) {
    return Promise.all(def.names.map(n => fetch(def.dir + n + '.ogg').then(r => { if (!r.ok) throw new Error(n); return r.arrayBuffer(); }).then(b => new Promise((ok, no) => ctx.decodeAudioData(b, ok, no)))))
      .then(list => { const bufs = {}; def.names.forEach((n, i) => { bufs[n] = list[i]; }); return bufs; });
  }
  function newScene(def, idx) {
    const sc = { def, idx, bufs: null, failed: false, nodes: null, bus: null, t0: 0, last: {} };
    fetchScene(def).then(b => { sc.bufs = b; }).catch(() => { sc.failed = true; });
    return sc;
  }
  function startScene(sc, at) {
    sc.bus = ctx.createGain(); sc.bus.gain.value = sc.def.bus; sc.bus.connect(musicBus);
    sc.nodes = {}; sc.t0 = at;
    for (const n of sc.def.names) {
      const src = ctx.createBufferSource(); src.buffer = sc.bufs[n]; src.loop = true;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(g); g.connect(sc.bus); src.start(at);
      sc.nodes[n] = { src, g }; sc.last[n] = 0;
    }
  }
  function stopScene(sc) {
    if (!sc) return;
    if (sc.nodes) for (const n in sc.nodes) { try { sc.nodes[n].src.stop(); sc.nodes[n].src.disconnect(); sc.nodes[n].g.disconnect(); } catch (e) { /* already stopped */ } }
    if (sc.bus) { try { sc.bus.disconnect(); } catch (e) { /* ignore */ } }
    sc.nodes = null; sc.bufs = null; sc.bus = null;
  }
  const stemsLive = () => !!(ST.cur && ST.cur.nodes && (ST.world === M.palT || ST.xw) && !ST.cur.fading);
  function nextBar(t) { const sc = ST.cur, b = barLen(); return sc.t0 + Math.ceil((t - sc.t0) / b) * b; }
  function easeGain(p, now, at, want, tau) {
    if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(now); else p.cancelScheduledValues(now);
    p.setTargetAtTime(want, at, tau);
  }
  function applyLevels(sc, now, live, quant) {
    const L = live ? sc.def.levels(M.intensity | 0, M.tension, M.mode) : null;
    for (const n of sc.def.names) {
      const want = live ? L[n] : 0;
      if (Math.abs(want - sc.last[n]) < 0.015) continue;
      const was = sc.last[n]; sc.last[n] = want;
      easeGain(sc.nodes[n].g.gain, now, live && quant ? Math.max(now + 0.02, nextBar(now + 0.05)) : now + 0.02, want, live ? (want > was ? 0.9 : 1.2) : 1.4);
    }
  }
  // hand over from the current song to the next one, on a bar line two bars from now
  // cross: a different biome's song (its own tempo and key): nothing of the old song may sound under the new one, so the old
  // layers are all gone a moment before the downbeat, the strip-down ends in a rising sweep, and the new song lands with a low impact
  function beginTransition(now, cross) {
    const cur = ST.cur, nxt = ST.nxt, bar = barLen(), tb = nextBar(now + 2 * bar + 0.15);
    startScene(nxt, tb);
    const L = nxt.def.levels(M.intensity | 0, M.tension, M.mode);
    for (const n of cur.def.names) {
      const g = cur.nodes[n].g.gain, thin = cur.def.thin[n];
      if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(now); else g.cancelScheduledValues(now);
      if (!thin) g.setTargetAtTime(0, tb - 2 * bar, 0.45);              // drums and bass step out first: two bars of just the quiet layers
      else if (cross) { g.setTargetAtTime(Math.min(cur.last[n], 0.5), tb - 2 * bar, 0.5); g.setTargetAtTime(0, tb - 1.8, 0.28); }   // the quiet layers hold, then ease out so they are gone exactly on the downbeat
      else { g.setTargetAtTime(Math.min(cur.last[n], 0.55), tb - 2 * bar, 0.5); g.setTargetAtTime(0, tb + 0.15, 0.8); }   // then those melt away under the new song
      cur.last[n] = 0;
    }
    for (const n of nxt.def.names) {
      const g = nxt.nodes[n].g.gain, thin = nxt.def.thin[n];
      g.setValueAtTime(0, tb);
      if (cross) {   // a new biome starts without its beat: the pads swell in, the bass joins after two bars and the drums after four
        if (thin) g.linearRampToValueAtTime(L[n], tb + 1.8);
        else { const at = tb + (n === 'bass' ? 2 : 4) * bar; g.setValueAtTime(0, at); g.linearRampToValueAtTime(L[n], at + bar); }
      } else if (thin) g.linearRampToValueAtTime(L[n], tb + 1.1); else g.linearRampToValueAtTime(L[n], tb + 0.05);   // the drums and bass land on the downbeat
      nxt.last[n] = L[n];
    }
    air(2 * bar, 0.07, tb - 2 * bar, 260, 6500, { peak: 0.95, rev: 0.6, bus: synthBus });   // a rising sweep through the strip-down
    if (cross) {
      const nk = nxt.def.key, F = i => mtof(nk.root + nk.scale[i % nk.scale.length] + 12 * Math.floor(i / nk.scale.length));
      soft(mtof(nk.root) / 2, 4, 0.07, tb - 0.3, { lp: 500, att: 1.5, rev: 0.6, bus: synthBus });   // a soft low swell under the arrival, no hit
      air(2.2, 0.05, tb, 7000, 500, { peak: 0.4, rev: 0.7, bus: synthBus });                         // and a long, gentle fall of air
      [0, 2, 4].forEach((d, i) => bell(F(d + 5), 1.8, 0.04, tb + 0.05 + i * 0.12, { bus: synthBus, rev: 0.7, dly: 0.4, pan: (i - 1) * 0.3 }));   // a few bells in the NEW key
    }
    ST.trans = { tb, doneAt: tb + (cross ? 8 : 4) * bar, keyed: false, cross: !!cross };
  }
  // a run begins while two songs are still being swapped: settle on the new one right away, so songs are never blended during a run
  function finishTransitionNow() {
    const now = ctx.currentTime, nxt = ST.nxt, cur = ST.cur;
    if (ST.xw) { abortCross(now); return; }
    if (!ST.trans || !nxt || !nxt.nodes) return;
    if (ST.trans.tb > now + 0.05) {   // the other song has not come in yet: stay with this one
      stopScene(nxt); ST.nxt = null; ST.trans = null; ST.want = null;
      for (const n of cur.def.names) { easeGain(cur.nodes[n].g.gain, now, now, 0, 0.05); cur.last[n] = 0; }
      return;
    }
    for (const n of cur.def.names) easeGain(cur.nodes[n].g.gain, now, now, 0, 0.08);
    const L = nxt.def.levels(0, 0, 'run');
    for (const n of nxt.def.names) { easeGain(nxt.nodes[n].g.gain, now, now, L[n], 0.08); nxt.last[n] = L[n]; }
    ST.trans.doneAt = now + 0.6; ST.trans.keyed = false; ST.trans.tb = Math.min(ST.trans.tb, now);
  }
  // the next biome is known a little before the planet arrives: its song is fetched and decoded now so the hand-over never waits
  function preload(w) {
    const id = w.id | 0, d = STEMS[id];
    if (!ctx || !d || !ST.cur || !ST.cur.nodes || ST.world === id || (ST.pre && ST.pre.world === id)) return;
    if (ST.pre) stopScene(ST.pre.sc);
    const k = (Math.random() * d.scenes.length) | 0; ST.pre = { world: id, k, sc: newScene(d.scenes[k], k) };
  }
  function abortCross(now) {
    const t = ST.trans, cur = ST.cur, nxt = ST.nxt;
    ST.xw = false;
    if (!nxt) { ST.trans = null; return; }
    if (t && t.tb <= now + 0.05 && nxt.nodes) {   // the new song is already playing: it stays, the usual path then fades it out
      stopScene(cur); ST.cur = nxt; ST.nxt = null; ST.idx = nxt.idx; ST.world = ST.xwWorld; ST.trans = null; ST.want = null;
    } else {   // not yet: the old song carries on and the usual path fades it
      stopScene(nxt); ST.nxt = null; ST.trans = null; ST.want = null;
      if (cur && cur.nodes) for (const n of cur.def.names) { cur.last[n] = 0; easeGain(cur.nodes[n].g.gain, now, now, 0, 0.05); }
    }
  }
  function stemsTick(now) {
    const defW = STEMS[M.palT];
    if (ST.pre && M.mode !== 'run') { stopScene(ST.pre.sc); ST.pre = null; }
    // a run is over (or restarted) while a hand-over to another biome's song is still under way: settle it first
    if (ST.xw && M.palT !== ST.xwWorld) abortCross(now);
    // the biome changed in a run and both biomes have songs: the new song loads while the old one plays on, and takes over on a bar line
    if (ST.world !== M.palT && !ST.xw && defW && ST.cur && ST.cur.nodes && !ST.cur.fading && !ST.nxt && !ST.trans && M.mode === 'run' && STEMS[ST.world]) {
      const pre = ST.pre && ST.pre.world === M.palT ? ST.pre : null, k = pre ? pre.k : (Math.random() * defW.scenes.length) | 0;
      ST.xw = true; ST.xwWorld = M.palT; ST.nxt = pre ? pre.sc : newScene(defW.scenes[k], k); ST.pre = null;
    }
    // the sector changed: fade the old music out, release it, load the new sector's
    if (ST.world !== M.palT && !ST.xw) {
      if (ST.cur || ST.nxt) {
        for (const sc of [ST.cur, ST.nxt]) if (sc && sc.nodes) { applyLevels(sc, now, false); sc.fading = true; }
        if (!ST.fadeAt) ST.fadeAt = now + 4;
        if (now > ST.fadeAt) { stopScene(ST.cur); stopScene(ST.nxt); ST.cur = ST.nxt = ST.trans = null; ST.fadeAt = 0; }
      }
      if (!ST.cur && !ST.nxt) {
        ST.world = defW ? M.palT : -1; ST.idx = 0; ST.trans = null; ST.want = null;
        if (defW) { const k = (Math.random() * defW.scenes.length) | 0; ST.cur = newScene(defW.scenes[k], k); ST.idx = k; }
      }
      if (!ST.cur) return;
    }
    const cur = ST.cur; if (!cur) return;
    if (cur.bufs && !cur.nodes && ST.world === M.palT) { startScene(cur, now + 0.25); }
    if (!cur.nodes) return;
    const def = STEMS[ST.world], live = stemsLive();
    if (!ST.trans) {
      applyLevels(cur, now, live, true);
      // a different song for the next run is chosen when a run ends, and swapped in only while you are in the menu: never during a run
      if (ST.want != null && !def.scenes[ST.want]) ST.want = null;
      if (ST.want != null && ST.want !== ST.idx && M.mode === 'menu' && live && !ST.nxt) ST.nxt = newScene(def.scenes[ST.want], ST.want);
      if (ST.want === ST.idx) ST.want = null;
      if (ST.nxt && ST.nxt.failed) { ST.nxt = null; ST.want = null; ST.xw = false; }   // it would not load: an old song fades out the usual way
      else if (ST.nxt && ST.nxt.bufs && !ST.nxt.nodes && live && (M.mode === 'menu' || ST.xw)) beginTransition(now, ST.xw);
    } else {
      const t = ST.trans;
      if (!t.keyed && now >= t.tb) {
        t.keyed = true; keyNow = { root: ST.nxt.def.key.root, scale: ST.nxt.def.key.scale };
        if (t.cross) { M.bpm = STEMS[ST.xwWorld].bpm; M.startT = t.tb; M.anchored = true; M.pending = false; M.soft = false; M.epoch++; }   // the beat clock follows the new song's tempo from its downbeat
      }
      if (now >= t.doneAt) {
        stopScene(ST.cur); ST.cur = ST.nxt; ST.nxt = null; ST.idx = ST.cur.idx; ST.trans = null; ST.want = null;
        if (t.cross) { ST.world = ST.xwWorld; ST.xw = false; }
      }
    }
    if (live) {
      const sc = ST.trans && ST.trans.keyed ? ST.nxt : ST.cur;
      keyNow = { root: sc.def.key.root, scale: sc.def.key.scale };
      if (M.pending && !ST.xw) { M.startT = nextBar(now + 0.05); M.anchored = true; M.pending = false; M.soft = false; M.epoch++; M.bpm = M.bpmT; }
      if (!(ST.xw && ST.trans && ST.trans.keyed)) M.bpm = def.bpm;
      M.t = now + 0.1;   // the generated score rests while the recorded one plays
    }
  }


  // --------------------------------------------------------- biome sounds
  // Each biome has a very quiet bed of its own air (wind, fire hush, a thin ice whistle, a hum, the void's low breath) and, now and
  // then, a single rare sound: a gust, a crack of ice, a whale-like call. They sit in the music's space and never repeat on a pattern.
  const PINGS = (t, f, n, gap, v) => { for (let i = 0; i < n; i++) bell(f, 1.6, v * (1 - i * 0.2), t + i * gap, { bus: synthBus, rev: 0.8, dly: 0.5 }); };
  const AMB_BED = [   // [filter type, frequency, Q, gain, wobble seconds]
    ['bandpass', 2600, 0.4, 0.010, 11], ['lowpass', 520, 0.5, 0.030, 7], ['lowpass', 190, 0.7, 0.032, 5],
    ['bandpass', 4200, 2.2, 0.006, 13], ['bandpass', 130, 3.5, 0.016, 3], ['lowpass', 95, 0.9, 0.04, 17],
  ];
  const AMB_EV = [
    [   // Aurora Reach: glass shimmer, a long far-off call
      (t, F) => { [7, 9, 11, 14, 16].forEach((d, i) => bell(F(d), 3.4, 0.032, t + i * 0.16, { bus: synthBus, rev: 0.95, dly: 0.4, pan: (i - 2) * 0.3 })); },
      (t, F) => { soft(F(4), 4.5, 0.045, t, { slide: F(2), lp: 700, att: 1.6, rev: 0.95, bus: synthBus }); },   // a far-off call that stays inside the key
    ],
    [   // Dust Belt: wind gusts, a distant boulder knocking and rumbling
      (t) => { air(5, 0.05, t, 260, 1000, { peak: 0.45, q: 0.5, rev: 0.4, bus: synthBus }); air(4, 0.03, t + 1.2, 500, 1500, { peak: 0.5, q: 0.6, pan: 0.5, bus: synthBus }); },
      (t, F) => { soft(F(0) / 4, 3.4, 0.1, t, { lp: 150, att: 0.5, rev: 0.5, bus: synthBus }); [0, 0.45, 0.62].forEach((d, i) => wood(t + 0.3 + d, 0.5 - i * 0.12, 210 + i * 30)); },
    ],
    [   // Ember Rift: crackling, a low roar, a flare
      (t) => { for (let i = 0; i < 16; i++) air(0.05, 0.05 * (0.4 + rnd()), t + rnd() * 2.2, 700 + rnd() * 1500, 300, { q: 1.4, peak: 0.1, pan: rnd() - 0.5, rev: 0.3, bus: synthBus }); },
      (t, F) => { air(4.4, 0.07, t, 110, 380, { peak: 0.5, q: 0.6, rev: 0.4, bus: synthBus }); soft(F(0) / 4, 4, 0.12, t, { lp: 130, att: 0.9, rev: 0.4, bus: synthBus }); },
      (t) => { air(2, 0.06, t, 500, 3200, { peak: 0.35, q: 0.7, rev: 0.6, bus: synthBus }); },
    ],
    [   // Glacier Drift: a crack in the ice that rings, wind chimes of ice, a thin wind
      (t, F) => { air(0.09, 0.14, t, 5200, 2200, { q: 3, peak: 0.05, rev: 0.8, bus: synthBus }); bell(F(12), 3.2, 0.05, t + 0.03, { bus: synthBus, rev: 0.9, dly: 0.5 }); },
      (t, F) => { PINGS(t, F(14), 4, 0.5, 0.032); },
      (t) => { air(6.5, 0.035, t, 1400, 3600, { peak: 0.5, q: 1.4, rev: 0.7, bus: synthBus }); },
    ],
    [   // Pulsar Storm: a distant zap, static, a sonar ping
      (t) => { soft(1400, 0.28, 0.04, t, { slide: 80, lp: 3500, att: 0.002, rev: 0.5, bus: synthBus }); air(0.18, 0.08, t, 4500, 800, { q: 1, peak: 0.1, rev: 0.4, bus: synthBus }); },
      (t) => { for (let i = 0; i < 22; i++) air(0.02, 0.04 * rnd(), t + i * 0.035 + rnd() * 0.03, 3500 + rnd() * 3500, 3000, { q: 2, peak: 0.1, pan: rnd() - 0.5, bus: synthBus }); },
      (t, F) => { PINGS(t, F(21), 3, 0.62, 0.03); },
    ],
    [   // Void Maw: a deep swell, whispers, a slow heartbeat
      (t, F) => { soft(F(0) / 4, 7, 0.14, t, { lp: 120, att: 3, rev: 0.6, bus: synthBus }); },
      (t) => { air(3.8, 0.03, t, 1800, 900, { q: 7, peak: 0.5, pan: -0.5, rev: 0.95, bus: synthBus }); air(3.4, 0.025, t + 0.7, 2300, 1200, { q: 7, peak: 0.5, pan: 0.5, rev: 0.95, bus: synthBus }); },
      (t) => { [0, 0.55, 2.2, 2.75, 4.4, 4.95].forEach((d, i) => thump(t + d, i % 2 ? 0.28 : 0.4, 62, 34, 0.45, 160)); },
      (t) => { air(5.5, 0.05, t, 180, 4500, { peak: 0.92, q: 0.7, rev: 0.8, bus: synthBus }); },
    ],
  ];
  const AMB = {
    id: -1, nextAt: 0, last: -1, bed: null,
    set(id, first) {
      if (id === this.id) return;
      this.id = id; this.nextAt = ctx.currentTime + first + rnd() * 3; this.last = -1;
      const [type, f, q, gain, wob] = AMB_BED[id];
      if (!this.bed) {
        const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
        const flt = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
        g.gain.value = 0; src.connect(flt); flt.connect(g); g.connect(musicBus); src.start();
        lfo.frequency.value = 0.1; lg.gain.value = 0; lfo.connect(lg); lg.connect(g.gain); lfo.start();
        this.bed = { flt, g, lfo, lg };
      }
      const b = this.bed, now = ctx.currentTime;
      b.flt.type = type; b.flt.Q.value = q;
      b.flt.frequency.setTargetAtTime(f, now, 2.5);
      b.g.gain.cancelScheduledValues(now); b.g.gain.setTargetAtTime(gain, now, 3);
      b.lfo.frequency.setTargetAtTime(1 / wob, now, 1); b.lg.gain.setTargetAtTime(gain * 0.45, now, 3);
    },
    tick(now) {
      if (this.id < 0 || now < this.nextAt) return;
      const list = AMB_EV[this.id], F = i => mtof(scaleNote(i));
      let k; do { k = (rnd() * list.length) | 0; } while (k === this.last && list.length > 1);
      this.last = k; list[k](now + 0.05, F);
      this.nextAt = now + 11 + rnd() * 14;   // rare: one every ten to twenty-five seconds
    },
    quiet() { if (this.bed) this.bed.g.gain.setTargetAtTime(0, ctx.currentTime, 0.5); this.id = -1; },
  };

  // --------------------------------------------------------- public API
  return {
    init, unlock, ready, applyVolumes,
    async loadTracks() { /* the score is generated; nothing to load */ },
    async preload() {}, async preloadFx() {},
    hasTrack: () => false, hasFx: () => true,
    bpm: w => w.bpm,
    // bass energy 0..1 from the live output: drives the visual pulse
    level() {
      if (!analyser || !ready()) return 0;
      analyser.getByteFrequencyData(fbuf);
      const v = (fbuf[1] + fbuf[2] + fbuf[3]) / (3 * 255);
      bassLv += (v - bassLv) * 0.5;
      return Math.max(0, Math.min(1, (bassLv - 0.35) * 2.2));
    },
    _stems: () => ({ world: ST.world, idx: ST.idx, cur: !!(ST.cur && ST.cur.nodes), nxt: !!ST.nxt, trans: ST.trans, live: stemsLive(), want: ST.want, gains: ST.cur && ST.cur.nodes ? Object.fromEntries(Object.keys(ST.cur.nodes).map(n => [n, +ST.cur.nodes[n].g.gain.value.toFixed(3)])) : null, force: () => { const n = STEMS[ST.world] ? STEMS[ST.world].scenes.length : 1; ST.want = (ST.idx + 1) % n; } }),
    _tap() { const d = ctx.createMediaStreamDestination(); master.connect(d); return d.stream; },
    _state: () => ({ now: ctx.currentTime, startT: M.startT, e: +M.e.toFixed(2), eff: +eff().toFixed(2), bpm: +M.bpm.toFixed(2), pal: M.pal, era: M.era, mode: M.mode, prog: M.prog, ci: M.ci, anchored: M.anchored, pending: M.pending, step: M.step, tension: +M.tension.toFixed(2) }),
    // The score never restarts: starting "music" just steers it (sector, menu/run/zen) and, for a run, ties the game's beat
    // clock to the next bar line so waves and events land on the music's bars.
    startMusic(w, opts = {}) {
      if (!init()) return;
      M.mode = opts.menu ? 'menu' : opts.zen ? 'zen' : 'run';
      if (M.mode !== 'menu' && ST.trans) finishTransitionNow();
      M.palT = clamp(w.id | 0, 0, PAL.length - 1);
      AMB.set(M.palT, M.mode === 'menu' ? 14 : 32);   // nothing long plays over the first seconds of the music
      M.eraT = 'genesis';
      M.bpmT = w.bpm;
      M.eT = M.mode === 'menu' ? 0.55 : M.mode === 'zen' ? 0.32 : 0.95;
      M.tensionT = 0; M.boost = 0; M.intensity = 0;
      if (M.mode === 'menu') { M.pending = false; M.anchored = false; } else { M.pending = true; M.anchored = false; }
      if (!M.on) {
        M.on = true; M.t = ctx.currentTime + 0.12; M.step = 0; M.bpm = w.bpm; M.pending = M.mode !== 'menu'; M.chords = []; M.ci = 0; M.prog = -1; M.voicing = null;
        newProgression(M.t);
        clearInterval(M.timer); M.timer = setInterval(tick, 25);
      }
      if (!keyNow) newProgression(ctx.currentTime);
      this.setMuffle(0);
    },
    // the music carries on between runs: this only releases the run's tension and clock
    stopMusic() {
      M.pending = false; M.anchored = false; M.tensionT = 0;
      const d = STEMS[ST.world]; if (d && d.scenes.length > 1 && !ST.trans && ST.want == null) ST.want = Math.random() < 0.75 ? (ST.idx + 1) % d.scenes.length : ST.idx;   // the next run's song
    },
    setIntensity(v) { M.intensity = v; if (M.mode === 'run') M.eT = 0.95 + 0.75 * v; },
    setEra(id) { M.eraT = ERA[id] ? id : 'genesis'; },
    setMuffle(a) {
      if (!ctx) return;
      musicLP.frequency.setTargetAtTime(OD.lerp(18000, 700, a), ctx.currentTime, 0.08);
    },
    // seconds since the bar the run was tied to, corrected for output latency; negative (clock held) until that bar line arrives
    time() { return ready() && M.on ? (M.anchored ? ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0) - M.startT : M.pending && !M.soft ? -1 : null) : null; },
    epoch: () => M.epoch,
    // a new biome during a run: its song takes over (the old one fades out), its sounds begin, and the beat clock re-anchors on the next bar
    preload,
    setBiome(w) {
      if (!ctx) return;
      const hand = !!(ST.cur && ST.cur.nodes && !ST.cur.fading && STEMS[ST.world] && STEMS[w.id | 0] && !ST.trans);   // song to song: the old one plays on until the bar line
      M.palT = clamp(w.id | 0, 0, PAL.length - 1); M.bpmT = w.bpm;
      if (!hand) { M.pending = true; M.anchored = false; M.soft = true; }
      AMB.set(w.id, hand ? 8 : 3);
    },
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); },
    // big moments: the score reacts rather than being replaced
    fx(name, o = {}) {
      if (!ready() || !M.on) return null;
      const t = ctx.currentTime;
      switch (name) {
        case 'hop': M.boost = Math.max(M.boost, 1.3); air(2.2, 0.07, t, 250, 5500, { peak: 0.9, rev: 0.6, bus: synthBus }); break;
        case 'blackhole': M.tensionT = 0.9; break;
        case 'boss': M.tensionT = 1; break;
        case 'supernova': M.boost = Math.max(M.boost, 1.6); air(1.6, 0.09, t, 200, 6000, { peak: 0.85, rev: 0.7, bus: synthBus }); soft(48, 2.4, 0.3, t + 1.5, { lp: 200, att: 0.01, rev: 0.4 }); break;
        case 'record': M.boost = Math.max(M.boost, 1.0); break;
        case 'newhome':   // arrival: a rising shimmer, a gentle ascending run of bells and a warm low swell
          M.boost = Math.max(M.boost, 1.8); air(1.6, 0.08, t, 200, 6000, { peak: 0.7, rev: 0.6, bus: synthBus });
          [0, 2, 4, 7, 9, 11].forEach((d, i) => bell(mtof(scaleNote(d + 3)), 1.8, 0.05, t + 0.12 + i * 0.09, { bus: synthBus, rev: 0.7, dly: 0.5, pan: (i - 2.5) * 0.2 }));
          soft(mtof(scaleNote(0)) / 2, 2.4, 0.12, t, { lp: 900, att: 0.25, rev: 0.5 }); break;
        case 'gameover': M.tensionT = 0; break;
      }
      return null;
    },
    fxStop(name) { if (name === 'blackhole' || name === 'boss') M.tensionT = 0; },
    note(idx, dur, type, vol, slide) {
      if (!ready() || !keyNow) return;
      bell(mtof(scaleNote(idx)), dur * 2.2, vol, 0, { rev: 0.35 });
    },
    // Effects are kept minimal and polite. Frequent ones are throttled, and when many play at once everything gets quieter
    // and rewards (power-ups, goals, records) share one slot instead of stacking into a pile of chimes.
    sfx(name, a = 0) {
      if (!ready() || !keyNow) return;
      const t = ctx.currentTime;
      const GAP = { dust: 0.06, graze: 0.12, flip: 0.05, click: 0.04, back: 0.04, warn: 0.5, jump: 0.1, charge: 0.3 };
      const REWARD = { power: 1, unlock: 1, record: 1, buy: 1, overdrive: 1 };
      const key = REWARD[name] ? 'reward' : name;
      const gap = REWARD[name] ? 0.55 : GAP[name] || 0;
      if (gap && t - (lastAt[key] || -9) < gap) return;
      lastAt[key] = t;
      recent.push(t); while (recent.length && t - recent[0] > 1.2) recent.shift();
      sfxLevel = 1 / (1 + 0.22 * Math.max(0, recent.length - 3));
      const pickN = (set, k) => { let n; do { n = set[(Math.random() * set.length) | 0]; } while (n === lastPick[k] && set.length > 1); lastPick[k] = n; return n; };
      const F = i => mtof(scaleNote(i)), P = [0, 2, 4, 7, 9];
      const step = i => F(P[i % 5] + 7 * Math.floor(i / 5));   // walk up the key's pentatonic scale
      switch (name) {
        case 'flip': blip(F(pickN(a ? [4, 7, 9] : [0, 2, 4], 'flip')), 0.12, 0.1, t, { rev: 0.12, pan: a ? 0.15 : -0.15 }); break;
        case 'charge': soft(190, 0.6, 0.045, t, { slide: 440, lp: 1200, att: 0.15, rev: 0.25 }); break;
        case 'jump': air(0.2, 0.04, t, 300, 1200, { peak: 0.4, rev: 0.15 }); blip(F(pickN([4, 7, 9], 'jump')), 0.16, 0.08, t + 0.04, { rev: 0.2 }); break;
        case 'slingshot': air(0.3, 0.05, t, 250, 1500, { peak: 0.35, rev: 0.2 }); blip(F(9), 0.3, 0.1, t + 0.04, { rev: 0.3 }); blip(F(14), 0.34, 0.06, t + 0.08, { rev: 0.3 }); break;
        case 'graze': blip(step(Math.min(8, 2 + (a | 0))), 0.2, 0.09, t, { rev: 0.2, pan: (Math.random() - 0.5) * 0.4 }); break;
        case 'dust': blip(step(5 + (((a | 0) >> 1) % 4)), 0.09, 0.055, t, { rev: 0.08, pan: (Math.random() - 0.5) * 0.3 }); break;   // a quiet little rising pip, four steps then it loops
        case 'power': blip(step(2), 0.2, 0.09, t, { rev: 0.25 }); blip(step(4), 0.22, 0.09, t + 0.07, { rev: 0.25 }); blip(step(7), 0.34, 0.09, t + 0.14, { rev: 0.3 }); break;
        case 'shield': soft(150, 0.3, 0.14, t, { slide: 70, lp: 600, rev: 0.2 }); blip(F(4), 0.4, 0.07, t + 0.03, { rev: 0.3 }); break;
        case 'warn': blip(F(7), 0.18, 0.05, t, { rev: 0.2 }); break;
        case 'overdrive': air(0.9, 0.06, t, 220, 1800, { peak: 0.8, rev: 0.3 }); soft(F(0) / 2, 0.9, 0.08, t, { slide: F(0), lp: 1100, att: 0.3, rev: 0.3 }); [0, 2, 4, 7].forEach((d, i) => blip(F(d + 2), 0.5, 0.06, t + 0.2 + i * 0.09, { rev: 0.35 })); break;
        case 'boss': soft(70, 1.4, 0.26, t, { slide: 38, lp: 400, att: 0.02, rev: 0.3 }); soft(F(0) / 4, 1.6, 0.09, t, { lp: 450, att: 0.35, rev: 0.4 }); break;
        case 'death': soft(130, 0.8, 0.4, t, { slide: 36, lp: 500, att: 0.004 }); air(0.9, 0.2, t, 1400, 90, { peak: 0.05, q: 0.6, rev: 0.45 }); [7, 4, 2].forEach((d, i) => blip(F(d) / 2, 0.9, 0.07, t + 0.05 + i * 0.12, { rev: 0.5 })); break;
        case 'click': blip(mtof(pickN([72, 76, 79], 'click')), 0.07, 0.055, t, { rev: 0.05 }); break;
        case 'back': blip(mtof(pickN([64, 67, 69], 'back')), 0.07, 0.045, t, { rev: 0.05 }); break;
        case 'unlock': [0, 2, 4].forEach((d, i) => blip(step(d + 2), 0.5, 0.085, t + i * 0.1, { rev: 0.4 })); break;
        case 'skill': {   // learning a skill level: 1, 2, 3 each start higher; the last one gets a bell and a sparkle
          const L = Math.max(1, Math.min(3, a | 0)), b = 1 + (L - 1) * 2;
          [0, 2, 4].forEach((d, i) => blip(step(b + d), 0.45, 0.085, t + i * 0.09, { rev: 0.35 }));
          if (L === 3) {
            bell(step(b + 7), 1.8, 0.08, t + 0.27, { rev: 0.55, dly: 0.35 }); bell(step(b + 7) * 1.5, 1.4, 0.04, t + 0.33, { rev: 0.55 });
            blip(step(b + 9), 0.6, 0.06, t + 0.36, { rev: 0.5 }); air(0.7, 0.035, t + 0.25, 2500, 9000, { peak: 0.3, rev: 0.45 });
          }
          break;
        }
        case 'buy': blip(step(4), 0.3, 0.09, t, { rev: 0.25 }); blip(step(7), 0.42, 0.09, t + 0.09, { rev: 0.3 }); break;
        case 'badge': {   // each badge in the reel rings a step higher than the last
          const k = a | 0, root = step(1 + k);
          bell(root, 1.6, 0.075, t, { rev: 0.5, dly: 0.35 }); bell(root * 1.5, 1.3, 0.04, t + 0.07, { rev: 0.5 }); blip(step(6 + k), 0.4, 0.05, t + 0.1, { rev: 0.4 });
          air(0.55, 0.03, t, 2500, 9000, { peak: 0.3, rev: 0.4 }); break;
        }
        case 'record': [0, 2, 4, 6].forEach((d, i) => blip(step(d + 2), 0.6, 0.085, t + i * 0.11, { rev: 0.45 })); break;
      }
    },
  };
})();
