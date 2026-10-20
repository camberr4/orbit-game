'use strict';
// The game itself: input, simulation, wave director, scoring and rendering.
OD.haptic = (() => {
  let last = 0;
  return kind => {
    if (!OD.save.settings.haptics) return;
    const now = performance.now();
    if (now - last < 35) return;
    last = now;
    try {
      const H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
      if (H) {
        if (kind === 'error') H.notification({ type: 'ERROR' });
        else H.impact({ style: kind === 'heavy' ? 'HEAVY' : kind === 'medium' ? 'MEDIUM' : 'LIGHT' });
      } else if (navigator.vibrate) navigator.vibrate(kind === 'heavy' || kind === 'error' ? 60 : kind === 'medium' ? 22 : 10);
    } catch (e) { /* haptics are optional */ }
  };
})();

OD.worldUnlocked = i => {
  if (i === 0) return true;
  if (!OD.save.full) return false;
  return (OD.save.bestWorld[i - 1] || 0) >= OD.WORLDS[i].unlockScore;
};

OD.game = (() => {
  const TAU = OD.TAU, { clamp, lerp, smooth, angDiff } = OD, G = OD.gfx;
  const CHARGE_START = 0.16, PERFECT_A = 0.2, PERFECT_B = 0.34, OVERCHARGE = 0.52, JUMP_DUR = 0.26;
  const DEMO_SECONDS = 60, REC_SEG = 6000;

  let cv, ctx, W = 360, H = 640, dpr = 1, cx = 180, cy = 300, base = 360, u = 1, PR = 36, safeTop = 24;
  let R = [0, 0, 0];
  let state = 'menu';            // menu | play | paused | resume | dying | ended
  let world = OD.WORLDS[0], mode = 'endless', S = null;
  let tAnim = 0, lastT = 0, dprCap = 2, perfAcc = 0, perfN = 0, perfT = 0;
  const stars = [G.makeStars(70, 11), G.makeStars(40, 12), G.makeStars(22, 13)];
  let menuDots = [];
  let recorders = [null, null], recTimer = 0, lastClip = null;
  let pointerId = null, keyDown = false;

  // ------------------------------------------------------------- layout
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    cx = W / 2; cy = H * 0.47;
    base = Math.min(W, H * 0.62); u = base / 360;
    R = [base * 0.2, base * 0.31, base * 0.42];
    PR = base * 0.1;
    const probe = document.getElementById('safeprobe');
    safeTop = Math.max(18, probe ? parseFloat(getComputedStyle(probe).paddingTop) || 0 : 0);
  }

  // ------------------------------------------------------------- helpers
  const rand = (a, b) => a + Math.random() * (b - a);
  const T = () => OD.save.settings;
  const pos = (o, a) => [cx + Math.cos(a) * R[o], cy + Math.sin(a) * R[o]];
  function playerXY() { const p = S.p; return [cx + Math.cos(p.th) * p.r, cy + Math.sin(p.th) * p.r]; }
  function fxScale() { return T().fx ? 1 : 0.45; }

  function particle(x, y, vx, vy, life, size, color, o = {}) {
    if (S.parts.length > 520) return;
    S.parts.push({ x, y, vx, vy, life, max: life, size, color, drag: o.drag == null ? 1.5 : o.drag, sq: !!o.sq, grow: o.grow || 0, rot: Math.random() * 6 });
  }
  function burst(x, y, n, speed, color, size = 3, life = 0.7, o = {}) {
    n = Math.ceil(n * fxScale());
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = speed * (0.25 + Math.random() * 0.9);
      particle(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.5 + Math.random() * 0.7), size * (0.5 + Math.random()), color, o);
    }
  }
  function text(str, x, y, color, size = 22) {
    S.texts.push({ str, x, y, color, size, t: 0, life: 0.9 });
  }
  function shockwave(x, y, color, maxR, life = 0.5) { S.waves.push({ x, y, color, maxR, t: 0, life }); }
  function shake(a) { if (T().shake) S.shake = Math.min(14, S.shake + a); }

  // ------------------------------------------------------------- run setup
  function newState(m) {
    const p = {
      th: -Math.PI / 2, dir: 1, o: 1, r: R[1], od: 1, jump: null,
      charging: false, ct: 0, over: false, holdT: 0, holding: false,
      trail: [], shield: false, slow: 0, magnet: 0, phase: 0, inv: 0, boost: 0, holeSlow: 1,
    };
    return {
      mode: m, p, hz: [], pk: [], parts: [], texts: [], waves: [],
      clock: 0, time: 0, ts: 1, real: 0, shake: 0, flash: 0, beatPulse: 0,
      score: 0, dispScore: 0, mult: 1, multT: 0, gm: 0, od: 0, odMax: 5,
      stats: { grazes: 0, perfects: 0, jumps: 0, flips: 0, dust: 0, powerups: 0, innerTime: 0, maxCombo: 1, bosses: 0, overdrives: 0, shields: 0 },
      dir: { lastBeat: -1, nextWave: 6, nextDust: 4, nextPower: 26, nextBoss: DEMO_SECONDS, lastType: '', boss: null },
      rng: null, tut: -1, tutT: 0, useAudio: false, dying: 0, banner: null, bannerT: 0,
      ghost: null, ghostRec: [], ghostAcc: 0, demo: false, over: false, endCause: '', resumeT: 0, calm: 0,
    };
  }

  function startRun(m, wIdx) {
    stopRecording(true);
    mode = m;
    const dayKey = OD.todayKey();
    world = m === 'daily' ? OD.WORLDS[OD.dayNumber(dayKey) % OD.WORLDS.length] : OD.WORLDS[wIdx || 0];
    S = newState(m);
    S.rng = OD.makeRng(m === 'daily' ? dayKey : (Math.random() * 1e9) | 0);
    S.demo = !OD.save.full;
    if (S.demo) { mode = S.mode = 'endless'; world = OD.WORLDS[0]; }
    S.tut = (!OD.save.tutorialDone && S.mode === 'endless') ? 0 : -1;
    if (S.tut === 0) { S.dir.nextWave = 1e9; S.dir.nextDust = 1e9; S.dir.nextPower = 1e9; }
    OD.audio.unlock();
    S.useAudio = OD.audio.ready() && !(OD.debug && /noaudio/.test(location.search));
    OD.audio.startMusic(world, { zen: S.mode === 'zen' });
    OD.audio.setIntensity(0);
    // ghost of the previous best
    const g = OD.save.full && OD.save.ghost[S.mode + world.id];
    if (g && g.d && g.d.length > 6) S.ghost = g;
    state = 'play';
    startRecording();
    OD.haptic('light');
  }

  // ------------------------------------------------------------- hazards
  const WARN = { rock: 0.75, comet: 1.0, mine: 0.9, ring: 1.5, beam: 1.3, hole: 1.1 };
  function addHazard(h) {
    h.warn = h.warn == null ? WARN[h.k] : h.warn;
    h.warn0 = h.warn; h.gcd = 0; h.t = 0; h.rot = Math.random() * TAU; h.dead = false;
    h.style = OD.save.equipped.debris;
    h.shape = G.makeShape(h.style, Math.random);
    S.hz.push(h);
    return h;
  }
  const lv = () => Math.min(1, S.time / 150);
  const speedMul = () => world.speed * (S.mode === 'hardcore' ? 1.15 : 1) * (1 + 0.42 * lv());

  function spawnRocks() {
    const n = clamp(1 + Math.floor(lv() * 3 + S.rng() * 1.6), 1, 4);
    const orbit = S.rng.int(0, 2);
    const a0 = S.rng() * TAU;
    for (let i = 0; i < n; i++) {
      const o = S.rng() < 0.65 ? orbit : S.rng.int(0, 2);
      let a = a0 + i * (TAU / n) + S.rng.range(-0.3, 0.3);
      if (o === S.p.o && Math.abs(angDiff(a, S.p.th)) < 1.0) a += 1.6;
      addHazard({ k: 'rock', o, a, w: S.rng.sign() * S.rng.range(0.2, 0.75 + lv() * 0.4), s: S.rng.range(7.5, 11) * u, life: 11 });
    }
  }
  function spawnComets() {
    const n = 1 + Math.floor(lv() * 2 + S.rng() * 1.2);
    for (let i = 0; i < n; i++) {
      const ta = S.rng() * TAU, tr = S.rng.range(0, R[2]);
      const tx = cx + Math.cos(ta) * tr, ty = cy + Math.sin(ta) * tr;
      const ang = S.rng() * TAU, L = Math.hypot(W, H) * 0.75;
      const sp = (330 + 120 * lv()) * u * world.speed;
      addHazard({ k: 'comet', x: tx - Math.cos(ang) * L, y: ty - Math.sin(ang) * L, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, ang, life: (L * 2) / sp, warn: WARN.comet + i * 0.4 });
    }
  }
  function spawnMines() {
    const n = clamp(2 + Math.floor(lv() * 2), 2, 4);
    const used = [];
    for (let i = 0; i < n; i++) {
      let o = S.rng.int(0, 2), tries = 0;
      while (used.includes(o) && ++tries < 4) o = S.rng.int(0, 2);
      used.push(o);
      let a = S.rng() * TAU;
      if (o === S.p.o && Math.abs(angDiff(a, S.p.th)) < 1.2) a += 2;
      addHazard({ k: 'mine', o, a, w: 0, s: 6 * u, life: 11 });
    }
  }
  function spawnRing(o, o2, g, life, warn) {
    const l = lv();
    addHazard({
      k: 'ring', o, a: S.rng() * TAU, g: g || lerp(0.95, 0.62, l), w: S.rng.sign() * (0.25 + 0.35 * l), life: life || 7.5, warn: warn || WARN.ring, thick: 7 * u,
    });
  }
  function spawnBeam() {
    const o0 = S.rng.int(0, 1);
    addHazard({ k: 'beam', o0, o1: o0 + 1, a: S.rng() * TAU, w: S.rng.sign() * (0.55 + 0.45 * lv()), life: 4.6, s: 4 * u });
  }
  function spawnHole() {
    addHazard({ k: 'hole', o: 1, a: S.rng() * TAU, w: S.rng.sign() * 0.22, s: 11 * u, field: 66 * u, life: 9 });
  }
  function spawnDust(o, a0, n = 6, gap = 0.17) {
    o = o == null ? S.rng.int(0, 2) : o;
    a0 = a0 == null ? S.rng() * TAU : a0;
    for (let i = 0; i < n; i++) S.pk.push({ k: 'dust', o, a: a0 + i * gap, life: 9, t: 0, x: 0, y: 0, pull: false });
  }
  function spawnPower() {
    const hard = S.mode === 'hardcore';
    const types = hard ? ['magnet'] : ['shield', 'slow', 'magnet', 'phase'];
    S.pk.push({ k: 'power', type: S.rng.pick(types), o: S.rng.int(0, 2), a: S.rng() * TAU, w: 0.3 * S.rng.sign(), life: 11, t: 0, x: 0, y: 0 });
  }
  function banner(str, sub) { S.banner = { str, sub }; S.bannerT = 2.2; }

  function spawnBoss() {
    const d = S.dir, free1 = S.rng.int(0, 2), free2 = (free1 + S.rng.int(1, 2)) % 3;
    d.boss = { phase: 1, free1, free2, t2: S.clock + 10.2, end: S.clock + 10.2 + 9.4 };
    banner('ECLIPSE', 'Stay on the open orbit');
    OD.audio.sfx('boss'); shake(8); OD.haptic('heavy');
    bossRings(free1, 8.4);
  }
  function bossRings(free, life) {
    for (let o = 0; o < 3; o++) if (o !== free) spawnRing(o, 0, 0.9, life, 2.2);
    spawnDust(free, S.rng() * TAU, 9, 0.2);
  }

  function spawnWave() {
    const t = S.time, allowed = [];
    const has = k => world.hazards.includes(k);
    const sub = S.mode === 'zen' ? ['rock'] : null;
    allowed.push(['rock', 3]);
    if (has('comet') && t > 10) allowed.push(['comet', 2]);
    if (has('mine') && t > 18) allowed.push(['mine', 2]);
    if (has('ring') && t > 26 && !S.hz.some(h => h.k === 'ring')) allowed.push(['ring', 2]);
    if (has('beam') && t > 38 && !S.hz.some(h => h.k === 'beam')) allowed.push(['beam', 2]);
    if (has('hole') && t > 48 && !S.hz.some(h => h.k === 'hole')) allowed.push(['hole', 1.2]);
    const baseP = sub ? [['rock', 1]] : allowed;
    let pool = baseP.filter(([k]) => k !== S.dir.lastType);
    if (!pool.length) pool = baseP;
    let tot = 0; for (const [, w] of pool) tot += w;
    let r = S.rng() * tot, pick = pool[0][0];
    for (const [k, w] of pool) { r -= w; if (r <= 0) { pick = k; break; } }
    S.dir.lastType = pick;
    const solid = S.hz.filter(h => h.warn <= 0 && h.k !== 'comet').length;
    if (solid > 5 + Math.floor(lv() * 3)) return;
    ({ rock: spawnRocks, comet: spawnComets, mine: spawnMines, ring: () => spawnRing(S.rng.int(0, 2)), beam: spawnBeam, hole: spawnHole })[pick]();
    OD.audio.sfx('warn');
  }

  // ------------------------------------------------------------- director
  function waveInterval() {
    let iv = lerp(7, 3.6, lv());
    if (S.mode === 'timeattack') iv *= 0.6;
    if (S.mode === 'zen') iv *= 1.9;
    if (S.mode === 'hardcore') iv *= 0.9;
    return clamp(Math.round(iv), 3, 12);
  }
  function onBeat(b) {
    S.beatPulse = 1;
    const d = S.dir;
    if (S.tut >= 0) return;
    if (b >= d.nextWave) { spawnWave(); d.nextWave = b + waveInterval(); }
    if (b >= d.nextDust) { spawnDust(); d.nextDust = b + S.rng.int(5, 9); }
    if (b >= d.nextPower && S.mode !== 'timeattack') { spawnPower(); d.nextPower = b + S.rng.int(30, 46); }
    const bossOk = S.mode === 'endless' || S.mode === 'daily' || S.mode === 'hardcore';
    if (bossOk && !d.boss && S.time >= d.nextBoss && !S.demo) { spawnBoss(); d.nextBoss += 90; }
  }
  function directorTick() {
    const bi = Math.floor(S.clock * world.bpm / 60);
    while (S.dir.lastBeat < bi) { S.dir.lastBeat++; onBeat(S.dir.lastBeat); }
    const bs = S.dir.boss;
    if (bs) {
      if (bs.phase === 1 && S.clock >= bs.t2) { bs.phase = 2; bossRings(bs.free2, 8.4); text('SWITCH!', cx, cy - R[2] - 30 * u, '#fff', 26); OD.audio.sfx('warn'); }
      if (S.clock >= bs.end) {
        S.dir.boss = null; S.stats.bosses++;
        S.score += 300 * S.mult; text('+' + 300 * S.mult, cx, cy - R[2] - 28 * u, world.accent2, 28);
        banner('CLEARED', 'Eclipse survived'); OD.audio.sfx('power'); OD.haptic('medium');
      }
    }
  }

  function tutorialTick() {
    const st = S.stats;
    if (S.tut === 0 && st.flips >= 3) { S.tut = 1; OD.audio.sfx('power'); }
    else if (S.tut === 1 && st.jumps >= 1) {
      S.tut = 2; S.tutT = 0; OD.audio.sfx('power');
      for (let i = 0; i < 2; i++) addHazard({ k: 'rock', o: S.p.o, a: S.p.th + 2.2 + i * 3, w: 0.35 * (i ? -1 : 1), s: 9 * u, life: 14, warn: 1.4 });
    } else if (S.tut === 2) {
      if (st.grazes >= 1 || S.tutT > 9) endTutorial();
    }
  }
  function endTutorial() {
    S.tut = -1; OD.save.tutorialDone = true; OD.persist();
    S.dir.nextWave = S.dir.lastBeat + 4; S.dir.nextDust = S.dir.lastBeat + 2; S.dir.nextPower = S.dir.lastBeat + 30;
    banner('GO!', 'Survive. Graze. Chain combos.');
  }

  // ------------------------------------------------------------- player actions
  function flip() {
    const p = S.p;
    p.dir *= -1; S.stats.flips++;
    OD.audio.sfx('flip', p.dir > 0 ? 1 : 0); OD.haptic('light');
    const [x, y] = playerXY();
    burst(x, y, 6, 70 * u, world.accent, 2, 0.4);
  }
  function targetOrbit() {
    const p = S.p;
    let d = p.od, n = p.o + d;
    if (n < 0 || n > 2) { d = -d; n = p.o + d; }
    return { n, d };
  }
  function doJump(perfect) {
    const p = S.p;
    if (p.jump) return;
    const { n, d } = targetOrbit();
    p.od = d;
    p.jump = { t: 0, dur: JUMP_DUR, from: p.r, to: R[n], n };
    S.stats.jumps++;
    OD.audio.sfx('jump'); OD.haptic('medium');
    const [x, y] = playerXY();
    burst(x, y, 10, 110 * u, '#fff', 2, 0.45);
    if (perfect) {
      p.boost = 1.1; S.stats.perfects++;
      const pts = 40 * S.mult * (S.od > 0 ? 2 : 1);
      S.score += pts;
      text('SLINGSHOT', x, y - 22 * u, '#ffd95a', 20);
      shockwave(x, y, '#ffd95a', 60 * u, 0.4);
      OD.audio.sfx('slingshot'); OD.haptic('heavy');
      burst(x, y, 16, 170 * u, '#ffd95a', 2.5, 0.6);
    }
  }
  function inputDown() {
    if (state !== 'play' || !S || S.over) return;
    OD.audio.unlock();
    S.p.holding = true; S.p.holdT = 0;
  }
  function inputUp() {
    if (state !== 'play' || !S) return;
    const p = S.p;
    if (!p.holding) return;
    p.holding = false;
    if (p.charging) {
      const ct = p.ct;
      p.charging = false;
      OD.audio.setMuffle(0);
      if (p.over) return;
      if (ct < 0.05) { flip(); return; }
      doJump(ct >= PERFECT_A && ct <= PERFECT_B);
    } else flip();
  }

  // ------------------------------------------------------------- update
  function die(h, why) {
    const p = S.p;
    if (S.dying) return;
    S.dying = 0.001; S.over = true;
    const [x, y] = playerXY();
    burst(x, y, 70, 330 * u, world.accent, 3.5, 1.1);
    burst(x, y, 30, 220 * u, '#fff', 2.5, 0.9);
    shockwave(x, y, world.danger, 130 * u, 0.7);
    S.flash = 1; shake(14);
    OD.audio.sfx('death'); OD.haptic('error');
    OD.audio.setIntensity(0); OD.audio.setMuffle(0.8);
    p.trail.length = 0; p.dead = true;
    S.endCause = why || (h && h.k) || 'hit';
    stopRecording(false);
  }
  function shieldBreak(h) {
    const p = S.p; p.shield = false; p.inv = 1.4; S.stats.shields++;
    const [x, y] = playerXY();
    shockwave(x, y, OD.POWERS.shield.color, 150 * u, 0.6);
    burst(x, y, 30, 260 * u, OD.POWERS.shield.color, 3, 0.8);
    for (const o of S.hz) {
      if (o.k === 'rock' || o.k === 'mine' || o.k === 'comet') {
        const [hx, hy] = hpos(o);
        if (Math.hypot(hx - x, hy - y) < 150 * u) destroy(o, false);
      }
    }
    OD.audio.sfx('shield'); OD.haptic('heavy'); shake(9); S.flash = 0.5;
    text('SHIELD!', x, y - 24 * u, OD.POWERS.shield.color, 22);
  }
  function destroy(h, score = true) {
    h.dead = true;
    const [x, y] = hpos(h);
    burst(x, y, 16, 190 * u, world.danger, 3, 0.7);
    if (score) {
      const pts = 30 * S.mult;
      S.score += pts; text('+' + pts, x, y - 14 * u, '#fff', 18);
      OD.haptic('light');
    }
  }
  function hpos(h) {
    if (h.k === 'comet') return [h.x, h.y];
    if (h.o != null) return pos(h.o, h.a);
    return [cx, cy];
  }
  function mineArmed(h) {
    const beat = S.clock * world.bpm / 60, b = Math.floor(beat), f = beat - b;
    return (b % 2 === 0 && f < 0.22) || (b % 2 === 1 && f > 0.9);
  }
  function addMult() {
    if (S.mult < 8) {
      S.mult++;
      if (S.mult > S.stats.maxCombo) S.stats.maxCombo = S.mult;
    }
    S.multT = 3.4;
  }
  function onGraze(h) {
    h.gcd = 1.6;
    S.stats.grazes++;
    addMult();
    const pts = 20 * S.mult;
    S.score += pts;
    const [x, y] = playerXY();
    text('GRAZE', x, y - 20 * u, world.accent2, 17);
    burst(x, y, 9, 120 * u, world.accent2, 2, 0.5);
    OD.audio.sfx('graze', S.mult); OD.haptic('light'); shake(2);
    if (S.od <= 0) {
      S.gm += 0.2;
      if (S.gm >= 1) startOverdrive();
    }
  }
  function startOverdrive() {
    S.od = S.odMax; S.gm = 0; S.stats.overdrives++;
    banner('NOVA', 'Smash through everything');
    OD.audio.sfx('overdrive'); OD.haptic('heavy'); shake(6); S.flash = 0.6;
    const [x, y] = playerXY();
    shockwave(x, y, '#fff', 200 * u, 0.7);
  }
  function collect(k) {
    const [x, y] = playerXY();
    if (k.k === 'dust') {
      S.stats.dust++;
      S.score += 3 * S.mult;
      S.multT = Math.max(S.multT, 2.2);
      OD.audio.sfx('dust', 7 + (S.stats.dust % 5) * 2);
      burst(k.x, k.y, 5, 90 * u, world.accent2, 2, 0.45);
      OD.haptic('light');
    } else {
      const P = OD.POWERS[k.type];
      S.stats.powerups++; S.score += 25;
      if (k.type === 'shield') S.p.shield = true;
      else S.p[k.type] = P.dur;
      text(P.name.toUpperCase(), x, y - 26 * u, P.color, 20);
      shockwave(k.x, k.y, P.color, 90 * u, 0.5);
      burst(k.x, k.y, 20, 180 * u, P.color, 3, 0.7);
      OD.audio.sfx('power'); OD.haptic('medium');
    }
    k.dead = true;
  }

  function collideAll(dt) {
    const p = S.p, [px, py] = playerXY();
    const pr = 4.6 * u, gz = 18 * u;
    const safe = S.od > 0 || p.phase > 0 || S.mode === 'zen' || p.inv > 0 || S.dying > 0;
    p.holeSlow = 1;
    const jumping = p.jump && p.jump.t / p.jump.dur;
    for (const h of S.hz) {
      if (h.dead || h.warn > 0) continue;
      let d = null;
      switch (h.k) {
        case 'rock': { const [x, y] = hpos(h); d = Math.hypot(px - x, py - y) - (h.s * 0.82 + pr); break; }
        case 'comet': d = Math.hypot(px - h.x, py - h.y) - (6.5 * u + pr); break;
        case 'mine': { const [x, y] = hpos(h); d = Math.hypot(px - x, py - y) - ((mineArmed(h) ? 20 * u : 5.5 * u) + pr); break; }
        case 'hole': {
          const [x, y] = hpos(h), dist = Math.hypot(px - x, py - y);
          if (dist < h.field) p.holeSlow = 0.5 + 0.5 * (dist / h.field);
          d = dist - (h.s * 0.9 + pr); break;
        }
        case 'ring': {
          const dr = Math.abs(p.r - R[h.o]);
          const inGap = Math.abs(angDiff(p.th, h.a)) < h.g;
          let ignoring = false;
          if (jumping != null && jumping !== false) ignoring = !(p.jump.n === h.o && jumping > 0.8);
          if (dr < h.thick / 2 + pr * 0.85) {
            if (!inGap && !ignoring) d = -1;
            else if (inGap && h.gcd <= 0 && h.g - Math.abs(angDiff(p.th, h.a)) < 0.22 && !ignoring) { onGraze(h); }
          }
          break;
        }
        case 'beam': {
          const r0 = R[h.o0] - 16 * u, r1 = R[h.o1] + 16 * u;
          if (p.r >= r0 && p.r <= r1) {
            const da = angDiff(p.th, h.a);
            if (Math.abs(da) < Math.PI / 2) d = Math.abs(Math.sin(da)) * p.r - (3.2 * u + pr);
          }
          break;
        }
      }
      if (d === null) continue;
      if (d < 0) {
        if (S.od > 0) { if (h.k === 'rock' || h.k === 'comet' || h.k === 'mine') destroy(h); }
        else if (safe) { /* ghosting through */ }
        else if (p.shield) shieldBreak(h);
        else die(h);
      } else if (d < gz && h.gcd <= 0 && h.k !== 'hole' && !safe) onGraze(h);
    }
    // pickups
    for (const k of S.pk) {
      if (k.dead) continue;
      const dist = Math.hypot(px - k.x, py - k.y);
      if (k.k === 'dust' && p.magnet > 0 && dist < 150 * u) k.pull = true;
      if (dist < (k.k === 'power' ? 17 : 12) * u + pr) collect(k);
    }
  }

  function update(dt) {
    const p = S.p;
    S.real += dt;
    // clock: audio clock when available, otherwise accumulated frame time
    if (S.useAudio) { const at = OD.audio.time(); S.clock = at === null ? S.clock + dt : Math.max(S.clock, at); }
    else S.clock += dt;
    S.time = Math.max(0, S.clock);

    // time scale
    let tsT = 1;
    if (S.dying) tsT = 0.22;
    else {
      if (p.charging && !p.over) tsT = 0.55;
      if (p.slow > 0) tsT *= 0.62;
    }
    S.ts += (tsT - S.ts) * Math.min(1, dt * 12);
    const gdt = dt * S.ts;

    if (!S.dying && !S.over) {
      // charge
      if (p.holding) {
        p.holdT += dt;
        if (!p.charging && p.holdT >= CHARGE_START && !p.jump) {
          p.charging = true; p.ct = 0; p.over = false;
          OD.audio.sfx('charge'); OD.audio.setMuffle(0.55);
        }
        if (p.charging) {
          p.ct += dt;
          if (!p.over && p.ct > OVERCHARGE) { p.over = true; OD.audio.setMuffle(0); }
        }
      }
      if (S.tut >= 0) { if (S.tut === 2) S.tutT += dt; tutorialTick(); }
      directorTick();

      // power timers
      for (const k of ['slow', 'magnet', 'phase']) if (p[k] > 0) p[k] = Math.max(0, p[k] - dt);
      if (p.inv > 0) p.inv -= dt;
      if (p.boost > 0) p.boost = Math.max(0, p.boost - dt);
      if (S.od > 0) { S.od -= dt; if (S.od <= 0) { S.od = 0; OD.audio.setIntensity(Math.min(3, Math.floor(S.mult / 2))); } }
      if (S.multT > 0) { S.multT -= dt; if (S.multT <= 0 && S.mult > 1) { S.mult--; S.multT = 1.1; } }

      // score
      const rate = (6 + 10 * lv()) * S.mult * (S.od > 0 ? 2 : 1) * (S.mode === 'hardcore' ? 2 : 1);
      if (S.mode !== 'zen' && S.tut < 0) S.score += rate * dt;
      if (p.o === 0 && !p.jump) S.stats.innerTime += dt;
      if (S.mode === 'zen') S.calm += dt;
    }

    // player motion
    if (!p.dead) {
      if (p.jump) {
        const j = p.jump;
        j.t += gdt;
        const k = clamp(j.t / j.dur, 0, 1);
        p.r = lerp(j.from, j.to, smooth(k));
        if (k >= 1) { p.o = j.n; p.r = R[p.o]; p.jump = null; }
      }
      const v = base * 0.62 * speedMul() * (1 + 0.55 * Math.min(1, p.boost)) * p.holeSlow * (S.od > 0 ? 1.12 : 1);
      p.th += p.dir * (v / p.r) * gdt;
      if (p.th > TAU) p.th -= TAU; else if (p.th < -TAU) p.th += TAU;
      const [x, y] = playerXY();
      p.trail.unshift({ x, y });
      const maxT = T().fx ? 30 : 18;
      if (p.trail.length > maxT) p.trail.length = maxT;
      // trail particles
      const tr = OD.save.equipped.trail;
      if (!S.dying && Math.random() < 0.6 * fxScale()) {
        if (tr === 'ember') particle(x, y, rand(-20, 20), rand(-40, -5), 0.6, rand(1.5, 3), '#ff8a2b', { drag: 1 });
        else if (tr === 'comet') particle(x, y, rand(-25, 25), rand(-25, 25), 0.5, rand(1, 2), '#cfefff', { drag: 2 });
        else if (tr === 'ice') particle(x, y, rand(-18, 18), rand(-18, 18), 0.7, rand(1.5, 2.5), '#e6fbff', { sq: true });
        else if (tr === 'glitch') particle(x + rand(-4, 4), y + rand(-4, 4), 0, 0, 0.25, rand(2, 4), Math.random() < 0.5 ? '#ff2bd6' : '#00f0ff', { sq: true, drag: 0 });
      }
      if (S.od > 0 && Math.random() < 0.9 * fxScale()) particle(x, y, rand(-70, 70), rand(-70, 70), 0.5, rand(1.5, 3), Math.random() < 0.5 ? '#fff' : world.accent2);
      // ghost recording at 10Hz
      S.ghostAcc += dt;
      if (S.ghostAcc >= 0.1 && !S.dying && S.ghostRec.length < 3600) {
        S.ghostAcc -= 0.1;
        S.ghostRec.push(+p.th.toFixed(2), +p.r.toFixed(1));
      }
    }

    // hazards
    for (const h of S.hz) {
      h.t += gdt;
      if (h.gcd > 0) h.gcd -= gdt;
      if (h.warn > 0) { h.warn -= gdt; continue; }
      h.life -= gdt;
      if (h.k === 'comet') { h.x += h.vx * gdt; h.y += h.vy * gdt; }
      else if (h.w) h.a += h.w * gdt;
      if (h.k === 'rock') h.rot += gdt * 1.3;
      if (h.life <= 0) h.dead = true;
    }
    // pickups
    for (const k of S.pk) {
      k.t += gdt; k.life -= gdt;
      if (k.k === 'power') k.a += k.w * gdt;
      const [bx, by] = pos(k.o, k.a);
      if (k.pull) {
        const [px, py] = playerXY();
        const dx = px - (k.x || bx), dy = py - (k.y || by), d = Math.hypot(dx, dy) || 1;
        k.x = (k.x || bx) + dx / d * 520 * u * dt; k.y = (k.y || by) + dy / d * 520 * u * dt;
      } else { k.x = bx; k.y = by; }
      if (k.life <= 0) k.dead = true;
    }
    if (!S.dying && !S.over && !p.dead) collideAll(dt);

    S.hz = S.hz.filter(h => !h.dead);
    S.pk = S.pk.filter(k => !k.dead);

    // cosmetic systems
    for (const q of S.parts) {
      q.life -= gdt; q.x += q.vx * gdt; q.y += q.vy * gdt;
      const dr = Math.exp(-q.drag * gdt); q.vx *= dr; q.vy *= dr;
    }
    S.parts = S.parts.filter(q => q.life > 0);
    for (const t of S.texts) { t.t += dt; t.y -= 22 * dt; }
    S.texts = S.texts.filter(t => t.t < t.life);
    for (const w of S.waves) w.t += dt;
    S.waves = S.waves.filter(w => w.t < w.life);
    S.shake *= Math.exp(-dt * 9); S.flash *= Math.exp(-dt * 4.5);
    S.beatPulse *= Math.exp(-dt * 6);
    if (S.bannerT > 0) S.bannerT -= dt;
    S.dispScore += (S.score - S.dispScore) * Math.min(1, dt * 12);

    // audio intensity follows the combo
    if (!S.dying && S.od <= 0 && S.mode !== 'zen') OD.audio.setIntensity(Math.min(3, Math.floor(S.mult / 2)));
    else if (S.od > 0) OD.audio.setIntensity(3);

    // end conditions
    if (S.dying) {
      S.dying += dt;
      if (S.dying > 1.05 && state !== 'ended') endRun('dead');
    } else if (S.demo && S.time >= DEMO_SECONDS) {
      S.endCause = 'demo'; S.over = true; S.dying = 0.001; p.dead = false;
      state = 'ended'; endRun('demo');
    } else if (S.mode === 'timeattack' && S.time >= 60) {
      S.endCause = 'time'; endRun('time');
    }
  }

  // ------------------------------------------------------------- run end
  function endRun(reason) {
    if (state === 'ended' && reason !== 'demo') return;
    state = 'ended';
    OD.audio.stopMusic();
    stopRecording(false);
    const sv = OD.save, st = sv.stats, rs = S.stats;
    const score = Math.floor(S.score);
    const before = OD.WORLDS.map((w, i) => OD.worldUnlocked(i));
    const res = {
      reason, mode: S.mode, world: world.id, score, time: S.time, demo: S.demo, cause: S.endCause,
      grazes: rs.grazes, perfects: rs.perfects, innerTime: rs.innerTime, maxCombo: rs.maxCombo, dust: rs.dust, jumps: rs.jumps,
      newBest: false, best: 0, stardust: 0, newAch: [], worldUnlocked: -1, dailyInfo: null, bonus: 0,
    };
    // stardust
    let sd = rs.dust + Math.floor(score / 150);
    if (S.mode === 'zen') sd = rs.dust + Math.floor(S.calm / 12);
    st.runs++; st.time += S.time; st.grazes += rs.grazes; st.dust += rs.dust; st.jumps += rs.jumps; st.flips += rs.flips || S.stats.flips;
    st.perfects += rs.perfects; st.deaths += reason === 'dead' ? 1 : 0; st.overdrives += rs.overdrives; st.powerups += rs.powerups;
    st.bosses += rs.bosses; st.maxCombo = Math.max(st.maxCombo, rs.maxCombo);
    if (S.mode === 'zen') st.zenTime += S.calm;
    if (S.demo) st.demoRuns++;
    // bests
    const key = S.mode;
    if (key in sv.best || key === 'daily') {
      if (key === 'daily') {
        const day = OD.todayKey(), d = sv.daily;
        if (d.bestDay !== day) { d.bestDay = day; d.bestScore = 0; }
        res.best = d.bestScore;
        if (score > d.bestScore) { res.newBest = score > 0; d.bestScore = score; }
        if (d.last !== day) {
          const yest = OD.dayNumber(day) - OD.dayNumber(d.last || 19000101) === 1;
          d.streak = yest ? d.streak + 1 : 1; d.last = day;
          sd += 25 + Math.min(d.streak, 7) * 5; res.bonus = 25 + Math.min(d.streak, 7) * 5;
        }
        st.dailies++;
        res.dailyInfo = { streak: d.streak, best: d.bestScore };
        res.best = d.bestScore;
      } else if (key === 'zen') {
        res.best = sv.best.zen;
        if (S.calm > sv.best.zen) { res.newBest = S.calm > 20; sv.best.zen = Math.floor(S.calm); res.best = sv.best.zen; }
      } else {
        res.best = sv.best[key];
        if (score > sv.best[key]) { res.newBest = score > 0; sv.best[key] = score; res.best = score; }
      }
    }
    if (S.mode === 'endless' || S.mode === 'daily' || S.mode === 'hardcore' || S.mode === 'timeattack') {
      sv.bestWorld[world.id] = Math.max(score, sv.bestWorld[world.id] || 0);
    }
    // ghost
    if (res.newBest && OD.save.full && S.ghostRec.length > 10 && S.mode !== 'daily') {
      sv.ghost[S.mode + world.id] = { s: score, d: S.ghostRec.slice() };
    }
    // challenges
    sv.stardust += sd;
    res.stardust = sd;
    res.newAch = checkChallenges(res);
    const after = OD.WORLDS.map((w, i) => OD.worldUnlocked(i));
    for (let i = 1; i < after.length; i++) if (after[i] && !before[i]) res.worldUnlocked = i;
    OD.persist();
    res.hasClip = !!lastClip;
    setTimeout(() => OD.ui.onRunEnd(res), reason === 'demo' ? 1300 : 120);
  }

  function checkChallenges(run) {
    const sv = OD.save, done = [];
    for (const c of OD.CHALLENGES) {
      if (sv.ach[c.id]) continue;
      let ok = false;
      try { ok = !!c.test(sv.stats, run, sv); } catch (e) { ok = false; }
      if (ok) { sv.ach[c.id] = Date.now(); sv.stardust += c.reward; done.push(c); }
    }
    return done;
  }
  OD.checkChallenges = () => { const d = checkChallenges(null); if (d.length) OD.persist(); return d; };

  // ------------------------------------------------------------- clip capture
  function pickMime() {
    for (const m of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
    }
    return '';
  }
  function startRecorder(i) {
    try {
      if (!cv.captureStream) return;
      const mime = pickMime();
      const stream = cv.captureStream(30);
      const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 2500000 });
      const chunks = [];
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      const slot = { rec, chunks, t0: performance.now(), mime: mime || 'video/webm', done: null };
      rec.onstop = () => { slot.done = new Blob(chunks, { type: slot.mime }); slot.dur = (performance.now() - slot.t0) / 1000; collectClip(); };
      rec.start(500);
      recorders[i] = slot;
    } catch (e) { recorders[i] = null; }
  }
  let finishing = false;
  function collectClip() {
    if (!finishing) return;
    const slots = recorders.filter(Boolean);
    if (slots.some(s => !s.done)) return;
    let best = null;
    for (const s of slots) if (!best || s.dur > best.dur) best = s;
    lastClip = best && best.done && best.done.size > 5000 ? { blob: best.done, mime: best.mime } : null;
    finishing = false;
    if (state === 'ended' && OD.ui && OD.ui.clipReady) OD.ui.clipReady(!!lastClip);
  }
  function recordingEnabled() { return T().clip && OD.save.full && !!window.MediaRecorder; }
  function startRecording() {
    lastClip = null; finishing = false;
    if (!recordingEnabled()) return;
    startRecorder(0);
    clearInterval(recTimer);
    let flipSlot = 1, first = true;
    recTimer = setInterval(() => {
      if (state !== 'play') return;
      const old = recorders[flipSlot];
      if (old && old.rec.state !== 'inactive') { try { old.rec.onstop = null; old.rec.stop(); } catch (e) { /* ignore */ } }
      startRecorder(flipSlot);
      flipSlot = 1 - flipSlot; first = false;
    }, REC_SEG / 2);
  }
  function stopRecording(discard) {
    clearInterval(recTimer);
    const slots = recorders.filter(Boolean);
    if (discard || !slots.length) {
      for (const s of slots) { try { s.rec.onstop = null; if (s.rec.state !== 'inactive') s.rec.stop(); } catch (e) { /* ignore */ } }
      recorders = [null, null]; return;
    }
    finishing = true;
    for (const s of slots) {
      if (s.rec.state !== 'inactive') { try { s.rec.stop(); } catch (e) { s.done = new Blob([], { type: s.mime }); s.dur = 0; } }
      else if (!s.done) { s.done = new Blob(s.chunks, { type: s.mime }); s.dur = 0; }
    }
    setTimeout(() => { if (finishing) { for (const s of slots) if (!s.done) { s.done = new Blob(s.chunks, { type: s.mime }); s.dur = (performance.now() - s.t0) / 1000; } collectClip(); } }, 600);
    recorders = recorders.map(x => x);
  }

  // ------------------------------------------------------------- rendering
  function drawOrbits(extra) {
    const p = S && S.p;
    for (let i = 0; i < 3; i++) {
      let a = 0.13;
      if (p && !p.dead) { if (i === p.o) a = 0.24; }
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = OD.rgba(world.accent, a);
      ctx.beginPath(); ctx.arc(cx, cy, R[i], 0, TAU); ctx.stroke();
    }
    if (extra) {
      ctx.save();
      ctx.setLineDash([6 * u, 8 * u]);
      ctx.lineDashOffset = -tAnim * 40;
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = 'rgba(255,217,90,0.85)';
      ctx.beginPath(); ctx.arc(cx, cy, R[extra.n], 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }

  function drawHazard(h) {
    const dc = world.danger;
    const warn = h.warn > 0;
    const prog = warn ? 1 - h.warn / h.warn0 : 1;
    const fadeOut = h.life < 0.45 ? Math.max(0, h.life / 0.45) : 1;
    switch (h.k) {
      case 'rock': {
        const [x, y] = hpos(h);
        if (warn) { ringPulse(x, y, h.s * (3.2 - 2.2 * prog), dc, 0.3 + 0.6 * prog); break; }
        const sc = Math.min(1, h.t / 0.2 + 0.2);
        G.drawDebris(ctx, h.style, x, y, h.s * sc, h.rot, dc, h.shape, S.mode === 'zen' ? 0.4 : fadeOut);
        break;
      }
      case 'mine': {
        const [x, y] = hpos(h);
        if (warn) { ringPulse(x, y, 20 * u * (1.5 - 0.5 * prog), dc, 0.3 + 0.6 * prog); break; }
        const armed = mineArmed(h), beat = S.clock * world.bpm / 60, f = beat - Math.floor(beat);
        const near = (Math.floor(beat) % 2 === 1 && f > 0.55) || armed;
        ctx.save(); ctx.globalAlpha = fadeOut;
        ctx.globalCompositeOperation = 'lighter';
        G.glow(ctx, x, y, (armed ? 40 : 22) * u, dc, armed ? 1 : 0.55);
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = OD.rgba(dc, armed ? 0.95 : near ? 0.5 : 0.2); ctx.lineWidth = armed ? 2.5 : 1.2;
        ctx.setLineDash([4 * u, 4 * u]);
        ctx.beginPath(); ctx.arc(x, y, 20 * u, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.translate(x, y); ctx.rotate(tAnim * 0.8);
        ctx.fillStyle = '#1a0710'; ctx.strokeStyle = dc; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, r = (i % 2 ? 5 : 9) * u; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = armed ? '#fff' : dc; ctx.beginPath(); ctx.arc(0, 0, 2.6 * u, 0, TAU); ctx.fill();
        ctx.restore();
        break;
      }
      case 'comet': {
        if (warn) {
          ctx.save(); ctx.setLineDash([10 * u, 10 * u]); ctx.lineDashOffset = -tAnim * 120;
          ctx.strokeStyle = OD.rgba(dc, 0.15 + 0.5 * prog); ctx.lineWidth = 2.5;
          const L = Math.hypot(W, H) * 1.5;
          ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(h.x + Math.cos(h.ang) * L, h.y + Math.sin(h.ang) * L); ctx.stroke();
          ctx.restore(); break;
        }
        const tl = 110 * u, tx = h.x - Math.cos(h.ang) * tl, ty = h.y - Math.sin(h.ang) * tl;
        const g = ctx.createLinearGradient(h.x, h.y, tx, ty);
        g.addColorStop(0, OD.rgba(dc, 0.95)); g.addColorStop(1, OD.rgba(dc, 0));
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = g; ctx.lineWidth = 11 * u; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(tx, ty); ctx.stroke();
        G.glow(ctx, h.x, h.y, 26 * u, '#ffffff', 0.8);
        ctx.restore();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(h.x, h.y, 5 * u, 0, TAU); ctx.fill();
        break;
      }
      case 'ring': {
        const r = R[h.o], t = h.thick;
        const a0 = h.a + h.g, a1 = h.a - h.g + TAU;
        ctx.save();
        if (warn) {
          ctx.globalAlpha = 0.25 + 0.5 * prog; ctx.setLineDash([8 * u, 8 * u]); ctx.lineDashOffset = -tAnim * 30;
          ctx.strokeStyle = dc; ctx.lineWidth = 2 + prog * 3;
          ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
          ctx.setLineDash([]); ctx.strokeStyle = world.accent2; ctx.lineWidth = 2;
          ctx.globalAlpha = 0.5 + 0.5 * Math.sin(tAnim * 14);
          ctx.beginPath(); ctx.arc(cx, cy, r, h.a - h.g, h.a + h.g); ctx.stroke();
        } else {
          ctx.globalAlpha = fadeOut;
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = OD.rgba(dc, 0.35); ctx.lineWidth = t * 3.2; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = dc; ctx.lineWidth = t;
          ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = t * 0.3;
          ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
          ctx.fillStyle = world.accent2;
          for (const e of [h.a + h.g, h.a - h.g]) { ctx.beginPath(); ctx.arc(cx + Math.cos(e) * r, cy + Math.sin(e) * r, t * 0.75, 0, TAU); ctx.fill(); }
        }
        ctx.restore();
        break;
      }
      case 'beam': {
        const r0 = R[h.o0] - 16 * u, r1 = R[h.o1] + 16 * u, c = Math.cos(h.a), s = Math.sin(h.a);
        ctx.save(); ctx.lineCap = 'round';
        if (warn) {
          ctx.globalAlpha = (0.2 + 0.7 * prog) * (Math.sin(tAnim * 30) > -0.3 ? 1 : 0.3);
          ctx.strokeStyle = dc; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(cx + c * r0, cy + s * r0); ctx.lineTo(cx + c * r1, cy + s * r1); ctx.stroke();
        } else {
          ctx.globalAlpha = fadeOut; ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = OD.rgba(dc, 0.4); ctx.lineWidth = 16 * u;
          ctx.beginPath(); ctx.moveTo(cx + c * r0, cy + s * r0); ctx.lineTo(cx + c * r1, cy + s * r1); ctx.stroke();
          ctx.strokeStyle = dc; ctx.lineWidth = 7 * u; ctx.stroke();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5 * u; ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case 'hole': {
        const [x, y] = hpos(h);
        if (warn) { ringPulse(x, y, h.field * (1.4 - 0.4 * prog), '#b57bff', 0.2 + 0.5 * prog); break; }
        ctx.save(); ctx.globalAlpha = fadeOut;
        ctx.globalCompositeOperation = 'lighter';
        G.glow(ctx, x, y, h.field * 1.1, '#8a3dff', 0.55);
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(190,140,255,0.35)'; ctx.lineWidth = 1.5; ctx.setLineDash([5 * u, 7 * u]);
        ctx.beginPath(); ctx.arc(x, y, h.field, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        for (let i = 0; i < 3; i++) {
          const a = tAnim * 2.4 + i * TAU / 3;
          ctx.strokeStyle = `rgba(210,170,255,${0.7 - i * 0.15})`; ctx.lineWidth = 2.2;
          ctx.beginPath(); ctx.arc(x, y, h.s * (1.5 + i * 0.55), a, a + 1.7); ctx.stroke();
        }
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x, y, h.s, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#d9b3ff'; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
        break;
      }
    }
  }
  function ringPulse(x, y, r, color, a) {
    ctx.save(); ctx.strokeStyle = OD.rgba(color, a); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, Math.max(2, r), 0, TAU); ctx.stroke();
    ctx.fillStyle = OD.rgba(color, a * 0.25); ctx.fill(); ctx.restore();
  }

  function drawPowerIcon(c, type, x, y, r, color) {
    c.save(); c.translate(x, y); c.strokeStyle = color; c.fillStyle = color; c.lineWidth = Math.max(1.5, r * 0.16); c.lineCap = 'round'; c.lineJoin = 'round';
    if (type === 'shield') { c.beginPath(); c.moveTo(0, -r * 0.7); c.lineTo(r * 0.6, -r * 0.35); c.lineTo(r * 0.5, r * 0.25); c.lineTo(0, r * 0.75); c.lineTo(-r * 0.5, r * 0.25); c.lineTo(-r * 0.6, -r * 0.35); c.closePath(); c.stroke(); }
    else if (type === 'slow') { c.beginPath(); c.arc(0, 0, r * 0.62, 0, TAU); c.moveTo(0, -r * 0.35); c.lineTo(0, 0); c.lineTo(r * 0.28, r * 0.2); c.stroke(); }
    else if (type === 'magnet') { c.beginPath(); c.arc(0, -r * 0.05, r * 0.52, Math.PI, 0); c.lineTo(r * 0.52, r * 0.55); c.moveTo(-r * 0.52, -r * 0.05); c.lineTo(-r * 0.52, r * 0.55); c.stroke(); }
    else { c.setLineDash([r * 0.22, r * 0.22]); c.beginPath(); c.arc(0, 0, r * 0.6, 0, TAU); c.stroke(); }
    c.restore();
  }

  function drawPlayer(p, x, y, alpha = 1, ghost = false) {
    const tr = OD.save.equipped.trail;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (!ghost || p.trail) G.drawTrail(ctx, p.trail, tr, world.accent, tAnim, (S && S.od > 0 ? 9 : 6.5) * u);
    ctx.globalCompositeOperation = 'lighter';
    G.glow(ctx, x, y, (S && S.od > 0 ? 40 : 26) * u, ghost ? '#ffffff' : (S && S.od > 0 ? '#fff6c8' : world.accent), 1);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 4.6 * u, 0, TAU); ctx.fill();
    if (!ghost) {
      ctx.strokeStyle = OD.rgba(world.accent, 0.9); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 7.4 * u, 0, TAU); ctx.stroke();
      if (p.shield) { ctx.strokeStyle = OD.POWERS.shield.color; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, 13 * u, 0, TAU); ctx.stroke(); ctx.fillStyle = OD.rgba(OD.POWERS.shield.color, 0.15); ctx.fill(); }
      if (p.phase > 0) { ctx.setLineDash([3 * u, 4 * u]); ctx.strokeStyle = OD.POWERS.phase.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 12 * u, tAnim * 4, tAnim * 4 + TAU); ctx.stroke(); ctx.setLineDash([]); }
      if (p.magnet > 0) { ctx.strokeStyle = OD.rgba(OD.POWERS.magnet.color, 0.25 + 0.2 * Math.sin(tAnim * 8)); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 150 * u * (0.9 + 0.1 * Math.sin(tAnim * 6)), 0, TAU); ctx.stroke(); }
      if (p.inv > 0 && Math.floor(p.inv * 14) % 2) { ctx.globalAlpha = 0.4; }
      if (S && S.od > 0) { ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, (13 + Math.sin(tAnim * 14) * 2) * u, 0, TAU); ctx.stroke(); }
    }
    ctx.restore();
  }

  function drawCharge(p, x, y) {
    const k = Math.min(1, p.ct / PERFECT_B);
    const r = 17 * u;
    ctx.save(); ctx.lineCap = 'round';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    const a0 = -Math.PI / 2 + (PERFECT_A / PERFECT_B) * TAU, a1 = -Math.PI / 2 + TAU;
    const inWin = p.ct >= PERFECT_A && p.ct <= PERFECT_B;
    if (p.over) { ctx.strokeStyle = 'rgba(255,80,100,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); }
    else {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.min(1, k) * TAU); ctx.stroke();
    }
    if (!p.over) {
      ctx.strokeStyle = inWin ? '#ffe48a' : 'rgba(255,200,60,0.9)';
      ctx.lineWidth = inWin ? 6 : 4;
      ctx.beginPath(); ctx.arc(x, y, r + (inWin ? 0 : 0), a0, a1); ctx.stroke();
    }
    if (inWin) { ctx.globalCompositeOperation = 'lighter'; G.glow(ctx, x, y, 34 * u, '#ffd95a', 0.8); }
    ctx.restore();
  }

  function drawScene() {
    const bg = G.background(world, W, H);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0, cv.width, cv.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sp = S && state === 'play' ? 1 + S.beatPulse * 2 : 1;
    G.drawStars(ctx, stars[0], W, H, tAnim, 1.2 * sp, '#9fb4ff');
    G.drawStars(ctx, stars[1], W, H, tAnim, 2.4 * sp, '#ffffff');
    if (T().fx) G.drawStars(ctx, stars[2], W, H, tAnim, 4.5 * sp, '#c8e0ff');
  }

  function drawWorld() {
    const inRun = S && state !== 'menu';
    const sh = inRun ? S.shake : 0;
    ctx.save();
    if (sh > 0.1) ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    const tgt = inRun && S.p.charging && !S.p.over ? targetOrbit() : null;
    drawOrbits(tgt);
    const pulse = inRun ? S.beatPulse : 0;
    const skin = OD.save.equipped.planet === 'terra' ? world.planet : OD.save.equipped.planet;
    G.drawPlanet(ctx, cx, cy, PR * (1 + pulse * 0.02), skin, tAnim, world.accent, dpr);

    if (inRun) {
      // overdrive/meter arc around the planet
      const mr = PR * 1.45;
      ctx.save(); ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.arc(cx, cy, mr, 0, TAU); ctx.stroke();
      const frac = S.od > 0 ? S.od / S.odMax : S.gm;
      if (frac > 0.005) {
        ctx.strokeStyle = S.od > 0 ? '#fff6c8' : world.accent2;
        ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath(); ctx.arc(cx, cy, mr, -Math.PI / 2, -Math.PI / 2 + frac * TAU); ctx.stroke();
      }
      ctx.restore();

      // ghost
      if (S.ghost && state === 'play') {
        const d = S.ghost.d, i = Math.floor(S.real / 0.1) * 2;
        if (i + 3 < d.length) {
          const f = (S.real / 0.1) % 1;
          const th = d[i] + angDiff(d[i + 2], d[i]) * f, r = lerp(d[i + 1], d[i + 3], f);
          const gx = cx + Math.cos(th) * r, gy = cy + Math.sin(th) * r;
          ctx.save(); ctx.globalAlpha = 0.55; ctx.globalCompositeOperation = 'lighter';
          G.glow(ctx, gx, gy, 18 * u, '#ffffff', 0.7); ctx.restore();
          ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(gx, gy, 3.2 * u, 0, TAU); ctx.fill();
        }
      }
      // pickups
      for (const k of S.pk) {
        const fade = k.life < 0.6 ? k.life / 0.6 : 1;
        ctx.save(); ctx.globalAlpha = fade * Math.min(1, k.t * 4);
        if (k.k === 'dust') {
          ctx.globalCompositeOperation = 'lighter';
          G.glow(ctx, k.x, k.y, 14 * u, '#ffe48a', 0.9);
          ctx.globalCompositeOperation = 'source-over';
          ctx.translate(k.x, k.y); ctx.rotate(k.t * 2 + k.a);
          ctx.fillStyle = '#fff6c8'; ctx.beginPath();
          for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, r = (i % 2 ? 1.6 : 4.4) * u; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
          ctx.closePath(); ctx.fill();
        } else {
          const P = OD.POWERS[k.type];
          ctx.globalCompositeOperation = 'lighter'; G.glow(ctx, k.x, k.y, 30 * u, P.color, 0.85);
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = 'rgba(8,10,24,0.85)'; ctx.beginPath(); ctx.arc(k.x, k.y, 13 * u, 0, TAU); ctx.fill();
          ctx.strokeStyle = P.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(k.x, k.y, 13 * u, 0, TAU); ctx.stroke();
          drawPowerIcon(ctx, k.type, k.x, k.y, 10 * u, P.color);
        }
        ctx.restore();
      }
      // hazards: rings first (behind), then others
      for (const h of S.hz) if (h.k === 'ring' || h.k === 'beam') drawHazard(h);
      for (const h of S.hz) if (h.k !== 'ring' && h.k !== 'beam') drawHazard(h);
      // shock waves
      for (const w of S.waves) {
        const k = w.t / w.life;
        ctx.save(); ctx.globalAlpha = (1 - k) * 0.9; ctx.strokeStyle = w.color; ctx.lineWidth = 3 * (1 - k) + 1;
        ctx.beginPath(); ctx.arc(w.x, w.y, w.maxR * OD.easeOut(k), 0, TAU); ctx.stroke(); ctx.restore();
      }
      // player
      if (!S.p.dead) {
        const [px, py] = playerXY();
        if (S.p.charging) drawCharge(S.p, px, py);
        if (tgt) { const [tx, ty] = [cx + Math.cos(S.p.th) * R[tgt.n], cy + Math.sin(S.p.th) * R[tgt.n]]; ctx.strokeStyle = 'rgba(255,217,90,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(tx, ty, 6 * u, 0, TAU); ctx.stroke(); }
        drawPlayer(S.p, px, py, 1);
      }
      // particles
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const q of S.parts) {
        const k = q.life / q.max;
        ctx.globalAlpha = Math.min(1, k * 1.4); ctx.fillStyle = q.color;
        const s = q.size * (0.4 + 0.6 * k + q.grow * (1 - k));
        if (q.sq) { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot + q.life * 6); ctx.fillRect(-s, -s, s * 2, s * 2); ctx.restore(); }
        else { ctx.beginPath(); ctx.arc(q.x, q.y, s, 0, TAU); ctx.fill(); }
      }
      ctx.restore();
      // floating texts
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const t of S.texts) {
        const k = t.t / t.life;
        ctx.globalAlpha = k < 0.1 ? k / 0.1 : 1 - Math.max(0, (k - 0.5) / 0.5);
        ctx.fillStyle = t.color; ctx.font = `800 ${t.size * Math.max(0.8, u)}px Outfit, system-ui, sans-serif`;
        ctx.fillText(t.str, t.x, t.y);
      }
      ctx.globalAlpha = 1;
    } else {
      // ambient menu dots
      for (const d of menuDots) {
        d.th += d.dir * d.v / R[d.o] * 0.016;
        const x = cx + Math.cos(d.th) * R[d.o], y = cy + Math.sin(d.th) * R[d.o];
        d.trail.unshift({ x, y }); if (d.trail.length > 28) d.trail.length = 28;
        drawPlayer({ trail: d.trail, shield: false, phase: 0, magnet: 0, inv: 0 }, x, y, d.a);
      }
    }
    ctx.restore();
  }

  function fmtTime(s) { const m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ':' + (r < 10 ? '0' : '') + r; }

  function drawHUD() {
    const sz = Math.min(58, W * 0.14);
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const y0 = safeTop + (S.demo ? 22 : 6);
    if (S.mode === 'zen') {
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = `300 ${sz * 0.7}px Outfit, system-ui, sans-serif`;
      ctx.fillText(fmtTime(S.calm), cx, y0 + sz * 0.8);
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `500 ${sz * 0.26}px Outfit, system-ui, sans-serif`;
      ctx.fillText('ZEN  ·  ' + S.stats.dust + ' stardust', cx, y0 + sz * 1.15);
    } else {
      ctx.fillStyle = '#fff'; ctx.font = `800 ${sz}px Outfit, system-ui, sans-serif`;
      ctx.shadowColor = OD.rgba(world.accent, 0.6); ctx.shadowBlur = 14;
      ctx.fillText(OD.fmt(S.dispScore), cx, y0 + sz * 0.85);
      ctx.shadowBlur = 0;
      // combo
      const my = y0 + sz * 1.35;
      ctx.font = `800 ${sz * 0.42}px Outfit, system-ui, sans-serif`;
      ctx.fillStyle = S.mult > 1 ? world.accent2 : 'rgba(255,255,255,0.4)';
      ctx.fillText('×' + S.mult, cx, my);
      if (S.mult > 1) {
        const k = clamp(S.multT / 3.4, 0, 1);
        ctx.strokeStyle = OD.rgba(world.accent2, 0.7); ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(cx, my - sz * 0.15, sz * 0.4, -Math.PI / 2, -Math.PI / 2 + k * TAU); ctx.stroke();
      }
      if (S.mode === 'timeattack') {
        const left = Math.max(0, 60 - S.time);
        ctx.fillStyle = left < 10 ? '#ff6a7a' : 'rgba(255,255,255,0.8)'; ctx.font = `700 ${sz * 0.42}px Outfit, system-ui, sans-serif`;
        ctx.fillText(Math.ceil(left) + 's', cx - sz * 1.5, my);
      }
    }
    if (S.demo) {
      const k = clamp(S.time / DEMO_SECONDS, 0, 1), bw = Math.min(260, W * 0.6);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(cx - bw / 2, safeTop + 10, bw, 3);
      ctx.fillStyle = world.accent; ctx.fillRect(cx - bw / 2, safeTop + 10, bw * k, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = `600 ${Math.max(10, sz * 0.2)}px Outfit, system-ui, sans-serif`;
      ctx.fillText('FREE DEMO  ' + fmtTime(S.time) + ' / 1:00', cx, safeTop + 4);
    }
    // power timers
    const p = S.p, items = [];
    if (p.shield) items.push(['shield', 1]);
    for (const k of ['slow', 'magnet', 'phase']) if (p[k] > 0) items.push([k, p[k] / OD.POWERS[k].dur]);
    if (S.od > 0) items.push(['nova', S.od / S.odMax]);
    const gap = 44, bx = cx - (items.length - 1) * gap / 2, by = H - Math.max(42, safeTop + 14);
    items.forEach(([k, f], i) => {
      const x = bx + i * gap, col = k === 'nova' ? '#fff6c8' : OD.POWERS[k].color;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(x, by, 17, 0, TAU); ctx.stroke();
      ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(x, by, 17, -Math.PI / 2, -Math.PI / 2 + f * TAU); ctx.stroke();
      if (k === 'nova') { ctx.fillStyle = col; ctx.font = '800 15px Outfit, system-ui'; ctx.textBaseline = 'middle'; ctx.fillText('★', x, by + 1); }
      else drawPowerIcon(ctx, k, x, by, 12, col);
    });
    ctx.restore();

    // banner / tutorial text
    ctx.save(); ctx.textAlign = 'center';
    if (S.bannerT > 0 && S.banner) {
      const k = S.bannerT / 2.2, a = Math.min(1, (1 - k) * 8, k * 3);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#fff'; ctx.font = `800 ${sz * 0.62}px Outfit, system-ui, sans-serif`; ctx.letterSpacing = '6px';
      ctx.fillText(S.banner.str, cx, cy + R[2] + sz * 1.7);
      ctx.letterSpacing = '0px'; ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = `500 ${sz * 0.28}px Outfit, system-ui, sans-serif`;
      ctx.fillText(S.banner.sub, cx, cy + R[2] + sz * 2.15);
    }
    if (S.tut >= 0) {
      const msgs = [['TAP', 'to flip direction', 3 - S.stats.flips > 0 ? `${Math.max(0, 3 - S.stats.flips)} more` : ''],
        ['HOLD', 'then release on the golden glow to jump orbits', ''],
        ['GRAZE', 'skim close to debris to build your combo', '']];
      const m = msgs[S.tut];
      ctx.globalAlpha = 0.75 + 0.25 * Math.sin(tAnim * 5);
      ctx.fillStyle = '#fff'; ctx.font = `800 ${sz * 0.6}px Outfit, system-ui, sans-serif`; ctx.letterSpacing = '6px';
      ctx.fillText(m[0], cx, cy + R[2] + sz * 1.7); ctx.letterSpacing = '0px';
      ctx.globalAlpha = 0.85; ctx.fillStyle = world.accent; ctx.font = `500 ${Math.min(17, W * 0.044)}px Outfit, system-ui, sans-serif`;
      ctx.fillText(m[1] + (m[2] ? '  ·  ' + m[2] : ''), cx, cy + R[2] + sz * 2.15);
    }
    ctx.restore();
  }

  function drawOverlayFX() {
    if (!S) return;
    if (S.flash > 0.02) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.55, S.flash * 0.5)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (S.od > 0) {
      const g = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.3, cx, cy, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(255,230,150,0)'); g.addColorStop(1, `rgba(255,220,120,${0.18 + 0.06 * Math.sin(tAnim * 12)})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (state === 'resume') {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.min(120, W * 0.3)}px Outfit, system-ui, sans-serif`;
      ctx.fillText(String(Math.max(1, Math.ceil(S.resumeT))), cx, cy);
    }
  }

  // ------------------------------------------------------------- main loop
  function frame(ts) {
    requestAnimationFrame(frame);
    let dt = (ts - lastT) / 1000; lastT = ts;
    if (!(dt > 0)) return;
    // adaptive quality: step the resolution down on slow devices
    perfAcc += dt; perfN++; perfT += dt;
    if (perfT > 3) {
      const avg = perfAcc / perfN;
      if (avg > 0.026 && state === 'play' && dprCap > 1) { dprCap = dprCap > 1.5 ? 1.5 : 1; T().clip = false; resize(); }
      perfAcc = 0; perfN = 0; perfT = 0;
    }
    dt = Math.min(dt, 0.05);
    tAnim += dt;
    try {
      if (state === 'play' || state === 'dying' || state === 'ended') { if (S) update(dt); }
      else if (state === 'resume') {
        S.resumeT -= dt;
        if (S.resumeT <= 0) { state = 'play'; OD.audio.resume(); }
      }
      drawScene();
      drawWorld();
      if (S && state !== 'menu') { if (state !== 'ended') drawHUD(); drawOverlayFX(); }
    } catch (e) {
      console.error(e);
      if (OD.debug) throw e;
    }
  }

  // ------------------------------------------------------------- public api
  function bindInput() {
    cv.addEventListener('pointerdown', e => {
      if (state !== 'play') return;
      e.preventDefault();
      if (pointerId !== null) return;
      pointerId = e.pointerId;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
      inputDown();
    });
    const up = e => { if (e.pointerId !== pointerId) return; pointerId = null; inputUp(); };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => {
      if (e.code === 'Space' && !e.repeat && state === 'play') { e.preventDefault(); keyDown = true; inputDown(); }
      else if ((e.code === 'Escape' || e.code === 'KeyP') && state === 'play') OD.ui.pause();
    });
    window.addEventListener('keyup', e => { if (e.code === 'Space' && keyDown) { keyDown = false; inputUp(); } });
    document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') OD.ui.pause(); });
    window.addEventListener('blur', () => { if (state === 'play') OD.ui.pause(); });
  }

  function initMenuDots() {
    menuDots = [0, 1, 2, 1].map((o, i) => ({ o, th: i * 1.7, dir: i % 2 ? -1 : 1, v: 55 + i * 12, trail: [], a: 0.95 }));
  }

  const api = {
    init(canvas) {
      cv = canvas; ctx = cv.getContext('2d', { alpha: false });
      resize(); window.addEventListener('resize', resize);
      bindInput(); initMenuDots();
      lastT = performance.now(); requestAnimationFrame(frame);
    },
    setWorld(i) { world = OD.WORLDS[i]; },
    get world() { return world; },
    get state() { return state; },
    get run() { return S; },
    get clip() { return lastClip; },
    menu() {
      state = 'menu'; S = null; stopRecording(true);
      OD.audio.stopMusic();
      if (OD.audio.ready() || OD.audio.init()) OD.audio.startMusic(world, { menu: true });
      OD.audio.setMuffle(0);
    },
    start: startRun,
    restart() { startRun(S ? S.mode : mode, world.id); },
    pause() {
      if (state !== 'play') return false;
      state = 'paused';
      if (S.p.charging) { S.p.charging = false; S.p.holding = false; OD.audio.setMuffle(0); }
      pointerId = null; OD.audio.suspend();
      return true;
    },
    resume() {
      if (state !== 'paused') return;
      state = 'resume'; S.resumeT = 3; OD.audio.resume();
      // hold the music until the countdown ends
      OD.audio.suspend();
    },
    quit() { state = 'menu'; S = null; stopRecording(true); OD.audio.resume(); api.menu(); },
    drawPowerIcon,
    resize,
    mode: () => mode,
  };
  return api;
})();
