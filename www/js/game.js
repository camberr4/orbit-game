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
  const REC_SEG = 6000;
  const STEER_PX = 18;
  // Everything starts gentle and speeds up at milestones (seconds survived). Each step is announced.
  const SPEED_LV = [0.6, 0.68, 0.76, 0.84, 0.92, 1.0, 1.07, 1.14, 1.21, 1.28, 1.35];
  const LEVEL_AT = [0, 14, 30, 50, 75, 105, 140, 180, 225, 275, 330];
  const levelFor = t => { let l = 0; while (l + 1 < LEVEL_AT.length && t >= LEVEL_AT[l + 1]) l++; return l + (t > 330 ? Math.floor((t - 330) / 60) : 0); };
  const speedFor = (l, m) => (m === 'zen' ? 0.6 : Math.min(1.5, l < SPEED_LV.length ? SPEED_LV[l] : 1.35 + 0.03 * (l - SPEED_LV.length + 1)) + (m === 'timeattack' ? 0.25 : 0));
  const VIS_IN = 2.6, VIS_HOLD = 14, VIS_OUT = 2.6, REACH = 58;   // twin planet timings (s) and transfer reach (x u)

  let cv, ctx, W = 360, H = 640, dpr = 1, cx = 180, cy = 300, base = 360, u = 1, PR = 36, safeTop = 24;
  let R = [0, 0, 0];
  let state = 'menu';            // menu | play | paused | resume | dying | ended
  let world = OD.WORLDS[0], mode = 'endless', S = null;
  let tAnim = 0, lastT = 0, dprCap = 2, perfAcc = 0, perfN = 0, perfT = 0;
  const stars = [G.makeStars(70, 11), G.makeStars(40, 12), G.makeStars(22, 13)];
  let menuDots = [];
  let recorders = [null, null], recTimer = 0, lastClip = null;
  let pointerId = null, keyDown = false, downY = 0;

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
  function playerXY() { const p = S.p; return [p.wx, p.wy]; }
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
      body: 'main', th2: 0, wx: cx, wy: cy - R[1], steer: null, dr: 0, pull: 0,
    };
    return {
      mode: m, p, hz: [], pk: [], parts: [], texts: [], waves: [], vis: null, evt: null,
      clock: 0, time: 0, ts: 1, real: 0, shake: 0, flash: 0, beatPulse: 0,
      score: 0, dispScore: 0, mult: 1, multT: 0, gm: 0, od: 0, odMax: 5,
      stats: { clutch: 0, razors: 0, events: 0, holes: 0, novas: 0, assists: 0, transfers: 0, grazes: 0, perfects: 0, jumps: 0, flips: 0, dust: 0, powerups: 0, innerTime: 0, maxCombo: 1, bosses: 0, overdrives: 0, shields: 0 },
      dir: { lastBeat: -1, nextWave: 6, nextDust: 4, nextPower: 26, nextBoss: 60, nextVis: 26, nextEvt: 20, evtAt: {}, lastType: '', boss: null },
      rng: null, tut: -1, tutT: 0, useAudio: false, dying: 0, banner: null, bannerT: 0,
      level: 0, spd: speedFor(0, m), chain: 0, chainT: 0, pstreak: 0, dustStreak: 0, dustT: 0, feats: [], clutchT: 0, nextTick: 15, powT: 0,
      introNew: 0, steerTip: false,
      ghost: null, ghostRec: [], ghostAcc: 0, demo: false, over: false, endCause: '', resumeT: 0, calm: 0,
    };
  }

  function startRun(m, wIdx) {
    if (!OD.save.full && OD.freeLeft() <= 0) { OD.ui.paywall('demo'); return false; }
    stopRecording(true);
    mode = m;
    const dayKey = OD.todayKey();
    world = m === 'daily' ? OD.WORLDS[OD.dayNumber(dayKey) % OD.WORLDS.length] : OD.WORLDS[wIdx || 0];
    S = newState(m);
    S.rng = OD.makeRng(m === 'daily' ? dayKey : (Math.random() * 1e9) | 0);
    S.demo = !OD.save.full;
    if (S.demo) { OD.save.stats.demoRuns++; OD.persist(); S.freeNo = OD.save.stats.demoRuns; }
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
    return true;
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
  const canUse = id => OD.intro.canUse(id, S);
  // First sighting of an element: remember it, and pause the run behind an explanation popup.
  function introduce(id) {
    if (!OD.INTRO_BY_ID[id] || OD.save.intro[id]) return;
    OD.save.intro[id] = true; S.introNew++; OD.persist();
    if (state !== 'play' || S.over) return;
    state = 'paused';
    S.p.charging = false; S.p.holding = false; pointerId = null; OD.audio.setMuffle(0); OD.audio.suspend();
    OD.ui.showIntro(id, true);
  }
  const lv = () => Math.min(1, S.time / 170);
  const speedMul = () => world.speed * (S.mode === 'hardcore' ? 1.12 : 1) * S.spd;

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
      const sp = (330 + 120 * lv()) * u * world.speed * (0.7 + 0.3 * S.spd);
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
    const types = (hard ? ['magnet'] : ['shield', 'slow', 'magnet', 'phase']).filter(canUse);
    if (!types.length) return;
    const type = S.rng.pick(types);
    introduce(type);
    S.pk.push({ k: 'power', type, o: S.rng.int(0, 2), a: S.rng() * TAU, w: 0.3 * S.rng.sign(), life: 11, t: 0, x: 0, y: 0 });
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
    if (has('comet') && t > 10 && canUse('comet')) allowed.push(['comet', 2]);
    if (has('mine') && t > 18 && canUse('mine')) allowed.push(['mine', 2]);
    if (has('ring') && t > 26 && canUse('ring') && !S.hz.some(h => h.k === 'ring')) allowed.push(['ring', 2]);
    if (has('beam') && t > 38 && canUse('beam') && !S.hz.some(h => h.k === 'beam')) allowed.push(['beam', 2]);
    if (has('hole') && t > 48 && canUse('well') && !S.hz.some(h => h.k === 'hole')) allowed.push(['hole', 1.2]);
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
    introduce(pick === 'hole' ? 'well' : pick);
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
    if (b >= d.nextDust) { spawnDust(); introduce('dust'); d.nextDust = b + S.rng.int(5, 9); }
    if (b >= d.nextPower && S.mode !== 'timeattack') { spawnPower(); d.nextPower = b + S.rng.int(30, 46); }
    const bossOk = S.mode === 'endless' || S.mode === 'daily' || S.mode === 'hardcore';
    if (bossOk && !d.boss && S.time >= d.nextBoss && canUse('boss')) { spawnBoss(); introduce('boss'); d.nextBoss += 90; }
    if (S.tut < 0 && S.time >= d.nextEvt && !S.over) { spawnEvent(); d.nextEvt = S.time + S.rng.range(24, 40); }
    if (!S.vis && !S.evt && !d.boss && S.mode !== 'timeattack' && S.time >= d.nextVis && canUse('twin')) { spawnVis(); introduce('twin'); d.nextVis = S.time + S.rng.range(40, 54); }
  }
  function directorTick() {
    const bi = Math.floor(S.clock * world.bpm / 60);
    if (bi - S.dir.lastBeat > 3) S.dir.lastBeat = bi - 1;   // never replay a backlog of beats (e.g. after a hitch)
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
    S.tut = -1; OD.save.tutorialDone = true; OD.save.intro.rock = true; OD.persist();
    S.dir.nextWave = S.dir.lastBeat + 4; S.dir.nextDust = S.dir.lastBeat + 2; S.dir.nextPower = S.dir.lastBeat + 30;
    banner('GO!', 'Survive. Graze. Chain combos.');
  }

  // ------------------------------------------------------------- player actions
  function flip() {
    const p = S.p;
    // a flip made just before a hazard on your path is a "clutch" dodge
    if (S.clutchT <= 0 && p.body === 'main' && !p.jump) {
      for (const h of S.hz) {
        if (h.dead || h.warn > 0 || (h.k !== 'rock' && h.k !== 'mine') || h.o !== p.o) continue;
        const ahead = angDiff(h.a, p.th) * p.dir, arc = Math.abs(angDiff(h.a, p.th)) * p.r;
        if (ahead > 0 && arc < 62 * u && arc > 14 * u) {
          const pts = 15 * S.mult; S.score += pts; S.clutchT = 1; S.stats.clutch++;
          text('CLUTCH +' + pts, p.wx, p.wy - 22 * u, '#9fffd0', 15);
          OD.audio.sfx('graze', 3); OD.haptic('medium'); break;
        }
      }
    }
    p.dir *= -1; S.stats.flips++;
    OD.audio.sfx('flip', p.dir > 0 ? 1 : 0); OD.haptic('light');
    const [x, y] = playerXY();
    burst(x, y, 6, 70 * u, world.accent, 2, 0.4);
  }
  // dirWanted: +1 bigger orbit, -1 tighter orbit, 0 = automatic bounce between the edges
  function mainTarget(dirWanted) {
    const p = S.p;
    let d;
    if (dirWanted === 1 && p.o < 2) d = 1;
    else if (dirWanted === -1 && p.o > 0) d = -1;
    else { d = p.od; if (p.o + d < 0 || p.o + d > 2) d = -d; }
    return { body: 'main', n: p.o + d, d, a: p.th };
  }
  function nearestMain(x, y) {
    const dist = Math.hypot(x - cx, y - cy);
    let n = 0, best = 1e9;
    for (let i = 0; i < 3; i++) { const d = Math.abs(dist - R[i]); if (d < best) { best = d; n = i; } }
    return { n, gap: best };
  }
  // Every place a jump could land right now, keyed by how the player asks for it.
  function jumpCandidates() {
    const p = S.p, v = S.vis, c = {};
    if (p.body === 'main') {
      if (v && v.phase === 'hold') {
        const dx = p.wx - v.x, dy = p.wy - v.y;
        if (Math.abs(Math.hypot(dx, dy) - v.rho) < REACH * u) c.vis = { body: 'vis', a: Math.atan2(dy, dx) };
      }
      if (p.o < 2) c.out = mainTarget(1);
      if (p.o > 0) c.in = mainTarget(-1);
      c.auto = c.vis || mainTarget(0);
    } else {
      const m = nearestMain(p.wx, p.wy);
      c.auto = m.gap < REACH * u ? { body: 'main', n: m.n, a: Math.atan2(p.wy - cy, p.wx - cx) } : null;
    }
    return c;
  }
  function jumpTarget() {
    const c = jumpCandidates(), st = S.p.steer;
    if (S.p.body === 'main') {
      if (st === 'out') return (S.p.o < 2 ? c.out : c.vis) || c.auto;
      if (st === 'in') return c.in || c.auto;
    }
    return c.auto;
  }
  function startCross(body, n, a, dur) {
    const p = S.p, ang = p.body === 'vis' ? p.th2 : p.th;
    p.jump = { cross: true, t: 0, dur, fx: p.wx, fy: p.wy, body, n, a, vx: p.dir * -Math.sin(ang), vy: p.dir * Math.cos(ang) };
  }
  function landCross(j) {
    const p = S.p;
    p.jump = null;
    let body = j.body, n = j.n, a = j.a;
    if (body === 'vis' && (!S.vis || S.vis.phase === 'out')) { body = 'main'; n = nearestMain(p.wx, p.wy).n; a = Math.atan2(p.wy - cy, p.wx - cx); }
    p.dir = (j.vx * -Math.sin(a) + j.vy * Math.cos(a)) >= 0 ? 1 : -1;   // keep travelling the way you were going
    if (body === 'vis') {
      p.body = 'vis'; p.th2 = a; S.stats.transfers++;
      const pts = 60 * S.mult; S.score += pts;
      text('TWIN ORBIT +' + pts, p.wx, p.wy - 24 * u, S.vis.skinColor, 19);
      shockwave(p.wx, p.wy, S.vis.skinColor, 80 * u, 0.5);
      OD.audio.sfx('power'); OD.haptic('medium');
    } else {
      p.body = 'main'; p.o = n; p.th = a; p.r = R[n]; p.od = n === 0 ? 1 : n === 2 ? -1 : p.od;
    }
  }
  function doJump(perfect) {
    const p = S.p;
    if (p.jump) return;
    const t = jumpTarget();
    if (!t) return;
    if (t.body === 'main' && p.body === 'main') {
      p.od = t.d;
      p.jump = { t: 0, dur: JUMP_DUR, from: p.r, to: R[t.n], n: t.n };
    } else startCross(t.body, t.body === 'main' ? t.n : -1, t.a, 0.34);
    if (!perfect) S.pstreak = 0;
    S.stats.jumps++;
    OD.audio.sfx('jump'); OD.haptic('medium');
    const [x, y] = playerXY();
    burst(x, y, 10, 110 * u, '#fff', 2, 0.45);
    if (S.evt && S.evt.type === 'giant' && p.pull > 0.28 && p.body === 'main') {   // gravity assist
      p.boost = Math.max(p.boost, 1.6); S.stats.assists++;
      const pts = 80 * S.mult; S.score += pts;
      text('GRAVITY ASSIST +' + pts, x, y - 30 * u, '#ffcf9c', 19);
      shockwave(x, y, '#ffcf9c', 90 * u, 0.5); OD.audio.sfx('slingshot'); OD.haptic('heavy');
    }
    if (perfect) {
      p.boost = 1.1; S.stats.perfects++; S.pstreak++;
      if (S.pstreak >= 2) feat('PERFECT ×' + S.pstreak, 'Back-to-back slingshots', '#ffd95a', 40 * S.pstreak * S.mult);
      const pts = 40 * S.mult * (S.od > 0 ? 2 : 1);
      S.score += pts;
      text('SLINGSHOT', x, y - 22 * u, '#ffd95a', 20);
      shockwave(x, y, '#ffd95a', 60 * u, 0.4);
      OD.audio.sfx('slingshot'); OD.haptic('heavy');
      burst(x, y, 16, 170 * u, '#ffd95a', 2.5, 0.6);
    }
  }

  // ------------------------------------------------------------- twin planet
  const VIS_SKINS = [['moon', '#cfd3e8'], ['gas', '#ffb36b'], ['ice', '#9fe6ff'], ['lava', '#ff8a4d']];
  function spawnVis() {
    const rho = base * 0.19, D = R[2] + rho * 0.55, side = S.rng.sign();
    const [skin, skinColor] = S.rng.pick(VIS_SKINS);
    S.vis = { side, rho, rad: base * 0.052, D, off: Math.max(cy, H - cy) + rho * 1.6 + 40, t: 0, phase: 'in', x: cx, y: cy + side * (Math.max(cy, H - cy) + rho * 1.6 + 40), skin, skinColor, warned: false };
    banner('TWIN PLANET', 'Hop across for bonus stardust');
    OD.audio.sfx('warn');
  }
  function visTick(dt) {
    const v = S.vis;
    if (!v) return;
    v.t += dt;
    if (v.phase === 'in') {
      const k = clamp(v.t / VIS_IN, 0, 1);
      v.y = cy + v.side * lerp(v.off, v.D, OD.easeOut(k));
      if (k >= 1) {
        v.phase = 'hold'; v.t = 0;
        const a0 = S.rng() * TAU;
        for (let i = 0; i < 10; i++) S.pk.push({ k: 'dust', vis: true, a: a0 + i * TAU / 10, life: VIS_HOLD, t: 0, x: 0, y: 0, pull: false, o: 0 });
      }
    } else if (v.phase === 'hold') {
      v.y = cy + v.side * (v.D + Math.sin(v.t * 0.9) * 5 * u);
      if (!v.warned && VIS_HOLD - v.t < 2.2) { v.warned = true; if (S.p.body === 'vis') { banner('LEAVING ORBIT', 'Jump back to the system'); OD.audio.sfx('warn'); } }
      if (v.t >= VIS_HOLD) { v.phase = 'out'; v.t = 0; }
    } else {
      const k = clamp(v.t / VIS_OUT, 0, 1);
      v.y = cy + v.side * lerp(v.D, v.off, smooth(k));
      if (k >= 1) { S.vis = null; S.pk = S.pk.filter(q => !q.vis); }
    }
    // the twin is leaving: whoever is still on it gets thrown back to the nearest orbit
    if (S.p.body === 'vis' && (!S.vis || S.vis.phase === 'out') && !S.p.jump) {
      const m = nearestMain(S.p.wx, S.p.wy);
      startCross('main', m.n, Math.atan2(S.p.wy - cy, S.p.wx - cx), 0.5);
      text('RETURN', S.p.wx, S.p.wy - 22 * u, '#fff', 18);
    }
  }
  // ------------------------------------------------------------- cosmic events
  // Rarer events are bigger and nastier. Instant ones just spawn things; major ones live in S.evt (one at a time).
  const EVT = {
    shower: { w: 5,   min: 18,  cool: 45 },
    bloom:  { w: 4.5, min: 14,  cool: 50 },
    giant:  { w: 2.4, min: 32,  cool: 110, major: true },
    flare:  { w: 2.2, min: 40,  cool: 90,  major: true },
    hole:   { w: 1.2, min: 70,  cool: 190, major: true },
    nova:   { w: 0.6, min: 100, cool: 300, major: true },
  };
  const EVT_ID = { hole: 'blackhole', nova: 'supernova' };
  function pickEvent() {
    const t = S.time, d = S.dir, list = [];
    for (const k of Object.keys(EVT)) {
      const e = EVT[k];
      if (t < e.min || (d.evtAt[k] != null && d.evtAt[k] + e.cool > t)) continue;
      if (S.mode === 'zen' && !['bloom', 'giant'].includes(k)) continue;
      if (S.mode === 'timeattack' && !['shower', 'bloom'].includes(k)) continue;
      if (S.demo && !['shower', 'bloom', 'giant'].includes(k)) continue;
      if (e.major && (S.evt || S.vis || d.boss)) continue;
      if (!canUse(EVT_ID[k] || k)) continue;
      list.push([k, e.w]);
    }
    if (!list.length) return null;
    let tot = 0; for (const [, w] of list) tot += w;
    let r = S.rng() * tot;
    for (const [k, w] of list) { r -= w; if (r <= 0) return k; }
    return list[0][0];
  }
  function spawnEvent() {
    const k = pickEvent();
    if (!k) return;
    S.dir.evtAt[k] = S.time;
    ({ shower: evShower, bloom: evBloom, giant: evGiant, flare: evFlare, hole: evHole, nova: evNova })[k]();
    introduce(EVT_ID[k] || k);
  }
  function evShower() {
    const n = 8 + Math.floor(lv() * 3 + S.rng() * 2), ang = S.rng() * TAU;
    const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
    const span = base * 0.95, sp = (350 + 90 * lv()) * u * world.speed * (0.7 + 0.3 * S.spd), L = Math.hypot(W, H) * 0.75;
    const order = []; for (let i = 0; i < n; i++) order.push(i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(S.rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    order.forEach((idx, i) => {
      const off = (idx / (n - 1) - 0.5) * span + S.rng.range(-0.08, 0.08) * span / n;
      const tx = cx + px * off, ty = cy + py * off;
      addHazard({ k: 'comet', x: tx - dx * L, y: ty - dy * L, vx: dx * sp, vy: dy * sp, ang, life: (L * 2) / sp, warn: 1.3 + i * 0.16 });
    });
    banner('METEOR SHOWER', 'Slip through the gaps');
    OD.audio.sfx('boss'); shake(4);
  }
  function evBloom() {
    for (let o = 0; o < 3; o++) spawnDust(o, S.rng() * TAU, 9, 0.2);
    banner('STARDUST BLOOM', 'Gather it all');
    OD.audio.sfx('power'); OD.haptic('light');
  }
  function evGiant() {
    const rad = base * 0.11;
    S.evt = { type: 'giant', t: 0, life: 20, side: S.rng.sign(), dirx: S.rng.sign(), rad, D: base * 0.6, field: base * 0.62, str: 26 * u, x: -999, y: -999, ramp: 0, gcd: 0, assisted: false,
      skin: S.rng.pick(['gas', 'ringed']), moons: [S.rng() * TAU, S.rng() * TAU] };
    banner('GAS GIANT', 'Jump close for a gravity assist');
    OD.audio.sfx('warn');
  }
  function evFlare() {
    const D = Math.max(W, H) * 0.6, a = S.rng() * TAU, x = cx + Math.cos(a) * D, y = cy + Math.sin(a) * D;
    const toC = Math.atan2(cy - y, cx - x), px = -Math.sin(toC), py = Math.cos(toC);
    const lane = lat => Math.atan2(cy + py * lat * u - y, cx + px * lat * u - x);
    const j = () => S.rng.range(-14, 14);
    S.evt = { type: 'flare', t: 0, x, y, gcd: 0, end: 6.6, bonus: false,
      volleys: [
        { at: 1.9, dur: 0.55, lanes: [lane(-95 + j()), lane(j()), lane(95 + j())] },
        { at: 4.5, dur: 0.55, lanes: [lane(-140 + j()), lane(-48 + j()), lane(48 + j()), lane(140 + j())] }] };
    banner('SOLAR FLARE', 'Stay out of the lanes');
    OD.audio.sfx('boss'); shake(4);
  }
  function evHole() {
    const a = S.rng.sign() * S.rng.range(0.38, 0.62) * Math.PI, D = R[2] + 54 * u;
    S.evt = { type: 'hole', t: 0, life: 17, x: cx + Math.cos(a) * D, y: cy + Math.sin(a) * D, core: 14 * u, field: base * 0.62, str: 42 * u, ramp: 0, gcd: 0, spin: 0 };
    banner('BLACK HOLE', 'Do not get pulled in');
    OD.audio.sfx('boss'); shake(6); OD.haptic('heavy');
  }
  function evNova() {
    const D = Math.max(W, H) * 0.58, a = S.rng() * TAU;
    S.evt = { type: 'nova', t: 0, x: cx + Math.cos(a) * D, y: cy + Math.sin(a) * D, warn: 3.4, speed: 270 * u, f: 0, blasted: false, gcd: 0 };
    banner('SUPERNOVA', 'Hide in the planet\'s shadow');
    OD.audio.sfx('boss'); OD.haptic('heavy');
  }
  function endEvent(ok) {
    const e = S.evt;
    S.evt = null;
    if (!ok || !e) return;
    S.stats.events++;
    const mid = [cx, cy - R[2] - 30 * u];
    if (e.type === 'hole') {
      S.stats.holes++; S.score += 400 * S.mult;
      banner('HORIZON CLEARED', '+' + 400 * S.mult);
      for (let o = 0; o < 3; o++) spawnDust(o, S.rng() * TAU, 7, 0.22);
    } else if (e.type === 'nova') {
      S.stats.novas++; S.score += 1000 * S.mult;
      banner('SUPERNOVA SURVIVED', '+' + 1000 * S.mult);
      for (let o = 0; o < 3; o++) spawnDust(o, S.rng() * TAU, 10, 0.18);
      S.flash = Math.max(S.flash, 0.5);
    } else if (e.type === 'flare') { S.score += 200 * S.mult; text('FLARE DODGED +' + 200 * S.mult, mid[0], mid[1], '#ffd95a', 22); }
    else if (e.type === 'giant') { S.score += 100 * S.mult; }
    OD.audio.sfx('power'); OD.haptic('medium');
  }
  // gravity felt at (x, y) from the giant or the black hole: [dx, dy, strength 0..1]
  function pullAt(x, y) {
    const e = S.evt;
    if (!e || (e.type !== 'giant' && e.type !== 'hole') || e.ramp <= 0) return [0, 0, 0];
    const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy) || 1;
    if (d >= e.field) return [0, 0, 0];
    const k = Math.pow(1 - d / e.field, 1.4) * e.ramp, m = e.str * k;
    return [dx / d * m, dy / d * m, k];
  }
  function inShadow(px, py, e) {
    const sx = cx - e.x, sy = cy - e.y, L = Math.hypot(sx, sy), ux = sx / L, uy = sy / L;
    const vx = px - e.x, vy = py - e.y, proj = vx * ux + vy * uy, perp = Math.abs(vx * uy - vy * ux);
    return proj > L && perp < PR * 1.3;
  }
  function evtTick(dt, gdt) {
    const e = S.evt;
    if (!e) return;
    e.t += dt;
    if (e.gcd > 0) e.gcd -= dt;
    if (e.type === 'giant') {
      const k = e.t / e.life, far = e.rad * 1.5;
      e.x = lerp(e.dirx > 0 ? -far : W + far, e.dirx > 0 ? W + far : -far, k);
      e.y = cy + e.side * e.D;
      e.ramp = Math.min(1, e.t / 2.5, (e.life - e.t) / 2.5);
      e.moons[0] += dt * 1.1; e.moons[1] -= dt * 0.7;
      if (e.t >= e.life) endEvent(true);
    } else if (e.type === 'hole') {
      e.ramp = clamp(Math.min(e.t / 3, (e.life - e.t) / 3), 0, 1);
      e.spin += dt;
      for (const h of S.hz) {
        if (h.dead || h.warn > 0) continue;
        const [hx, hy] = hpos(h), dx = e.x - hx, dy = e.y - hy, d = Math.hypot(dx, dy) || 1;
        if (h.k === 'comet' && d < e.field) {
          const a = 650 * u * Math.pow(1 - d / e.field, 1.2) * e.ramp;
          h.vx += dx / d * a * gdt; h.vy += dy / d * a * gdt; h.ang = Math.atan2(h.vy, h.vx);
        }
        if ((h.k === 'comet' || h.k === 'rock' || h.k === 'mine') && d < e.core * 1.7 + (h.s || 0) && e.ramp > 0.3) {
          h.dead = true;
          burst(hx, hy, 10, 120 * u, '#c58bff', 2.5, 0.6);
        }
      }
      if (!S.dying && Math.random() < 0.8 * fxScale()) {   // matter spiralling in
        const a = Math.random() * TAU, d = e.field * (0.35 + Math.random() * 0.35), x0 = e.x + Math.cos(a) * d, y0 = e.y + Math.sin(a) * d, life = 0.9;
        particle(x0, y0, (e.x - x0) / life + Math.cos(a + 1.57) * 60 * u, (e.y - y0) / life + Math.sin(a + 1.57) * 60 * u, life, rand(1, 2.4), Math.random() < 0.5 ? '#ffb36b' : '#c58bff', { drag: 0 });
      }
      if (e.t >= e.life) endEvent(true);
    } else if (e.type === 'flare') {
      if (e.t >= e.end) endEvent(true);
    } else if (e.type === 'nova') {
      if (e.t < e.warn) { if (Math.random() < 0.7) particle(e.x + rand(-30, 30), e.y + rand(-30, 30), rand(-60, 60) * u, rand(-60, 60) * u, 0.7, rand(1.5, 3), '#fff2c8'); }
      else {
        if (!e.blasted) { e.blasted = true; S.flash = 1; shake(10); OD.audio.sfx('death'); OD.haptic('heavy'); }
        const prev = e.f;
        e.f = (e.t - e.warn) * e.speed;
        for (const h of S.hz) {
          if (h.dead) continue;
          const [hx, hy] = hpos(h), d = Math.hypot(hx - e.x, hy - e.y);
          if (d <= e.f + 12 * u && d >= prev - 12 * u && !inShadow(hx, hy, e)) { h.dead = true; burst(hx, hy, 8, 140 * u, '#fff2c8', 2.5, 0.6); }
        }
        const far = Math.hypot(Math.max(e.x, W - e.x), Math.max(e.y, H - e.y)) + 30 * u;
        if (e.f > far) endEvent(true);
      }
    }
  }
  // lethal parts of events; returns nothing, hurts the player directly
  function evtCollide(px, py, pr, gz) {
    const e = S.evt;
    if (!e || S.od > 0) return;
    if (e.type === 'hole' && e.ramp > 0.15) {
      const d = Math.hypot(px - e.x, py - e.y) - (e.core + pr);
      if (d < 0) { e.gIn = false; hurt({ k: 'hole' }); }
      else { const g = trackGraze(e, d, gz); if (g >= 0) onGraze(e, g); }
    } else if (e.type === 'flare') {
      for (const v of e.volleys) {
        if (e.t < v.at || e.t > v.at + v.dur) continue;
        for (const a of v.lanes) {
          const vx = px - e.x, vy = py - e.y, proj = vx * Math.cos(a) + vy * Math.sin(a), perp = Math.abs(vx * Math.sin(a) - vy * Math.cos(a));
          if (proj <= 0) continue;
          e.lg = e.lg || {};
          const key = e.volleys.indexOf(v) + ':' + v.lanes.indexOf(a), tr = e.lg[key] || (e.lg[key] = { gcd: 0 });
          if (perp < 3.8 * u + pr) { tr.gIn = false; hurt({ k: 'flare' }); return; }
          const g = trackGraze(tr, perp - (3.8 * u + pr), gz * 0.7);
          if (g >= 0) onGraze(e, g);
        }
      }
    } else if (e.type === 'nova' && e.blasted) {
      const d = Math.abs(Math.hypot(px - e.x, py - e.y) - e.f) - (10 * u + pr);
      if (d < 0 && !inShadow(px, py, e)) hurt({ k: 'nova' });
    }
  }
  function hurt(h) {
    const p = S.p;
    if (S.od > 0 || p.phase > 0 || S.mode === 'zen' || p.inv > 0 || S.dying) return;
    if (p.shield) shieldBreak(h); else die(h);
  }

  function setSteer(v) {
    if (!S || S.over || state !== 'play') return;
    const p = S.p;
    if (p.steer !== v) {
      p.steer = v;
      if (p.charging) { OD.haptic('light'); OD.audio.sfx('flip', v === 'out' ? 1 : 0); }
    }
  }
  function inputDown() {
    if (state !== 'play' || !S || S.over) return;
    OD.audio.unlock();
    S.p.holding = true; S.p.holdT = 0; S.p.steer = null;
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
      p.steer = null;
    } else { p.steer = null; flip(); }
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
  // A graze is a near miss you survived: it is measured as you pass and paid out when you are clear of the hazard.
  function flushGraze(o) {
    if (!o.gIn) return -1;
    const g = o.gz; o.gIn = false; o.gz = null; o.gcd = 1.6;
    return g;
  }
  function trackGraze(o, d, gz) {
    if (o.gcd > 0) return -1;
    if (d >= 0 && d < gz) {
      o.gz = o.gIn ? Math.min(o.gz, d) : d; o.gIn = true;
      return d > o.gz + 3.5 * u ? flushGraze(o) : -1;   // moving away again: the pass is complete
    }
    return o.gIn && d >= gz ? flushGraze(o) : -1;
  }
  function feat(str, sub, color, pts) {
    if (pts) S.score += pts;
    if (S.feats.length < 3) S.feats.push({ str, sub: sub || '', color: color || '#fff', t: 0, pts: pts || 0 });
  }
  const CHAIN_NAMES = ['', '', 'DOUBLE', 'TRIPLE', 'QUAD', 'PENTA', 'HEXA'];
  function onGraze(h, g) {
    if (g == null) g = 12 * u;
    S.stats.grazes++;
    addMult();
    const tier = g < 4 * u ? 2 : g < 10 * u ? 1 : 0;
    if (tier === 2) S.stats.razors++;
    const label = ['GRAZE', 'CLOSE CALL', 'RAZOR THIN'][tier], pts = [20, 35, 60][tier] * S.mult;
    S.score += pts;
    const [x, y] = playerXY();
    text(label + ' +' + pts, x, y - 20 * u, tier === 0 ? world.accent2 : tier === 1 ? '#fff' : '#ffd95a', 15 + tier * 2);
    burst(x, y, 9 + tier * 5, 120 * u, tier === 2 ? '#ffd95a' : world.accent2, 2, 0.5);
    OD.audio.sfx('graze', S.mult + tier * 2); OD.haptic(tier ? 'medium' : 'light'); shake(2 + tier * 2);
    // several clean passes in a row pay a growing bonus
    S.chain = S.chainT > 0 ? S.chain + 1 : 1; S.chainT = 4.5;
    if (S.chain >= 2) {
      const bonus = 25 * S.chain * S.mult;
      feat(S.chain < CHAIN_NAMES.length ? CHAIN_NAMES[S.chain] : 'CHAIN ×' + S.chain, 'Clean passes in a row', '#ffd95a', bonus);
      OD.audio.sfx('power'); if (S.chain >= 4) shake(3);
    }
    if (S.od <= 0) {
      S.gm += [0.2, 0.28, 0.4][tier];
      if (S.gm >= 1) startOverdrive();
    }
  }
  function startOverdrive() {
    S.od = S.odMax; S.gm = 0; S.stats.overdrives++;
    banner('NOVA', 'Smash through everything');
    if (canUse('overdrive')) introduce('overdrive');
    OD.audio.sfx('overdrive'); OD.haptic('heavy'); shake(6); S.flash = 0.6;
    const [x, y] = playerXY();
    shockwave(x, y, '#fff', 200 * u, 0.7);
  }
  function collect(k) {
    const [x, y] = playerXY();
    if (k.k === 'dust') {
      S.stats.dust++;
      S.dustStreak = S.time - S.dustT < 0.9 ? S.dustStreak + 1 : 1; S.dustT = S.time;
      if (S.dustStreak > 0 && S.dustStreak % 5 === 0) feat('STARDUST ×' + S.dustStreak, 'Sweep it up', '#ffe48a', 5 * S.dustStreak * S.mult);
      S.score += 3 * S.mult;
      S.multT = Math.max(S.multT, 2.2);
      OD.audio.sfx('dust', 7 + (S.stats.dust % 5) * 2);
      burst(k.x, k.y, 5, 90 * u, world.accent2, 2, 0.45);
      OD.haptic('light');
    } else {
      const P = OD.POWERS[k.type];
      S.stats.powerups++; S.score += 25;
      if (S.time - S.powT < 6 && S.powT > 0) feat('POWER COMBO', 'Two power-ups close together', '#ff9ae6', 60 * S.mult);
      S.powT = S.time;
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
          const dr = Math.abs(p.r + p.dr - R[h.o]);
          const inGap = Math.abs(angDiff(p.th, h.a)) < h.g;
          let ignoring = false;
          if (jumping != null && jumping !== false) ignoring = !(p.jump.n === h.o && jumping > 0.8);
          if (dr < h.thick / 2 + pr * 0.85) {
            if (!inGap && !ignoring) d = -1;
            else if (inGap && !ignoring) {   // threading the gap close to a wall edge is a near miss
              const g = trackGraze(h, (h.g - Math.abs(angDiff(p.th, h.a))) * (p.r + p.dr), 18 * u);
              if (g >= 0) onGraze(h, g);
            }
          } else if (h.gIn) { const g = flushGraze(h); if (g >= 0) onGraze(h, g); }
          break;
        }
        case 'beam': {
          const r0 = R[h.o0] - 16 * u, r1 = R[h.o1] + 16 * u;
          if (p.r + p.dr >= r0 && p.r + p.dr <= r1) {
            const da = angDiff(p.th, h.a);
            if (Math.abs(da) < Math.PI / 2) d = Math.abs(Math.sin(da)) * (p.r + p.dr) - (3.2 * u + pr);
          }
          break;
        }
      }
      if (d === null) { if (h.gIn) { const g = flushGraze(h); if (g >= 0 && !safe) onGraze(h, g); } continue; }
      if (d < 0) {
        h.gIn = false; h.gz = null;
        if (S.od > 0) { if (h.k === 'rock' || h.k === 'comet' || h.k === 'mine') destroy(h); }
        else if (safe) { /* ghosting through */ }
        else if (p.shield) shieldBreak(h);
        else die(h);
      } else if (h.k !== 'hole' && !safe) {
        const g = trackGraze(h, d, gz);
        if (g >= 0) onGraze(h, g);
      }
    }
    evtCollide(px, py, pr, gz);
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
      if (S.mode !== 'zen' && S.tut < 0) {
        const L = levelFor(S.time);
        if (L > S.level) {
          S.level = L;
          feat('LEVEL ' + (L + 1), 'Speed up', '#fff', 50 * L);
          OD.audio.sfx('power'); OD.haptic('medium'); shake(2);
        }
        S.spd += (speedFor(S.level, S.mode) - S.spd) * Math.min(1, dt * 0.8);
        if (S.time >= S.nextTick) {                         // small reward for every stretch survived
          const sec = Math.round(S.nextTick);
          feat(sec + ' SECONDS', 'Still flying', '#9fe6ff', 25 * Math.ceil(sec / 15));
          S.nextTick += S.nextTick < 60 ? 15 : 30;
        }
      }
      if (!S.steerTip && S.time > 6 && S.tut < 0 && !S.evt && !S.vis && canUse('steer')) { S.steerTip = true; introduce('steer'); }
      visTick(dt);
      evtTick(dt, gdt);
      S.chainT -= dt; if (S.chainT <= 0) S.chain = 0;
      if (S.clutchT > 0) S.clutchT -= dt;
      if (S.feats.length) { S.feats[0].t += dt; if (S.feats[0].t > 1.6) S.feats.shift(); }

      // power timers
      for (const k of ['slow', 'magnet', 'phase']) if (p[k] > 0) p[k] = Math.max(0, p[k] - dt);
      if (p.inv > 0) p.inv -= dt;
      if (p.boost > 0) p.boost = Math.max(0, p.boost - dt);
      if (S.od > 0) { S.od -= dt; if (S.od <= 0) { S.od = 0; OD.audio.setIntensity(Math.min(3, Math.floor(S.mult / 2))); } }
      if (S.multT > 0) { S.multT -= dt; if (S.multT <= 0 && S.mult > 1) { S.mult--; S.multT = 1.1; } }

      // score
      const rate = (6 + 10 * lv()) * S.mult * (S.od > 0 ? 2 : 1) * (S.mode === 'hardcore' ? 2 : 1);
      if (S.mode !== 'zen' && S.tut < 0) S.score += rate * dt;
      if (p.o === 0 && !p.jump && p.body === 'main') S.stats.innerTime += dt;
      if (S.mode === 'zen') S.calm += dt;
    }

    // player motion
    if (!p.dead) {
      const v = base * 0.62 * speedMul() * (1 + 0.55 * Math.min(1, p.boost)) * p.holeSlow * (S.od > 0 ? 1.12 : 1);
      if (p.jump && p.jump.cross) {
        p.dr = 0; p.pull = 0;
        const j = p.jump;
        j.t += gdt;
        const k = clamp(j.t / j.dur, 0, 1), e = smooth(k);
        let tx, ty;
        if (j.body === 'vis' && S.vis) { tx = S.vis.x + Math.cos(j.a) * S.vis.rho; ty = S.vis.y + Math.sin(j.a) * S.vis.rho; }
        else { const rr = j.n >= 0 ? R[j.n] : R[1]; tx = cx + Math.cos(j.a) * rr; ty = cy + Math.sin(j.a) * rr; }
        p.wx = lerp(j.fx, tx, e); p.wy = lerp(j.fy, ty, e);
        if (k >= 1) landCross(j);
      } else if (p.body === 'vis' && S.vis) {
        p.th2 += p.dir * (v / S.vis.rho) * gdt;
        p.wx = S.vis.x + Math.cos(p.th2) * S.vis.rho; p.wy = S.vis.y + Math.sin(p.th2) * S.vis.rho;
      } else {
        if (p.jump) {
          const j = p.jump;
          j.t += gdt;
          const k = clamp(j.t / j.dur, 0, 1);
          p.r = lerp(j.from, j.to, smooth(k));
          if (k >= 1) { p.o = j.n; p.r = R[p.o]; p.jump = null; }
        }
        p.th += p.dir * (v / p.r) * gdt;
        if (p.th > TAU) p.th -= TAU; else if (p.th < -TAU) p.th += TAU;
        p.dr = 0; p.pull = 0;
        if (S.evt && !S.dying) {
          const pl = pullAt(cx + Math.cos(p.th) * p.r, cy + Math.sin(p.th) * p.r);
          p.dr = clamp(pl[0] * Math.cos(p.th) + pl[1] * Math.sin(p.th), -48 * u, 48 * u); p.pull = pl[2];
        }
        const re = p.r + p.dr;
        p.wx = cx + Math.cos(p.th) * re; p.wy = cy + Math.sin(p.th) * re;
      }
      if (p.body !== 'main' || (p.jump && p.jump.cross)) {
        // hazards are measured around the main planet, so keep that polar position in sync
        p.th = Math.atan2(p.wy - cy, p.wx - cx); p.r = Math.hypot(p.wx - cx, p.wy - cy);
      }
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
      else if (h.w) h.a += h.w * gdt * (0.55 + 0.45 * S.spd);
      if (h.k === 'rock') h.rot += gdt * 1.3;
      if (h.life <= 0) h.dead = true;
    }
    // pickups
    for (const k of S.pk) {
      k.t += gdt; k.life -= gdt;
      if (k.k === 'power') k.a += k.w * gdt;
      const [bx, by] = k.vis ? (S.vis ? [S.vis.x + Math.cos(k.a) * S.vis.rho, S.vis.y + Math.sin(k.a) * S.vis.rho] : [k.x, k.y]) : pos(k.o, k.a);
      const ev = S.evt;
      if (ev && ev.type === 'hole' && ev.ramp > 0.3 && !k.vis && !k.pull && !k.bh && k.k === 'dust' && Math.hypot((k.x || bx) - ev.x, (k.y || by) - ev.y) < ev.field * 0.55) k.bh = true;
      if (k.bh && ev) {
        const dx = ev.x - (k.x || bx), dy = ev.y - (k.y || by), d = Math.hypot(dx, dy) || 1, sp = (110 + (1 - d / ev.field) * 420) * u;
        k.x = (k.x || bx) + dx / d * sp * dt; k.y = (k.y || by) + dy / d * sp * dt;
        if (d < ev.core * 1.2) { k.dead = true; burst(ev.x, ev.y, 4, 80 * u, '#ffe48a', 1.8, 0.4); }
      } else if (k.pull) {
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
    if (S.feats.length && S.dying) S.feats.length = 0;
    S.dispScore += (S.score - S.dispScore) * Math.min(1, dt * 12);

    // audio intensity follows the combo
    if (!S.dying && S.od <= 0 && S.mode !== 'zen') OD.audio.setIntensity(Math.min(3, Math.floor(S.mult / 2)));
    else if (S.od > 0) OD.audio.setIntensity(3);

    // end conditions
    if (S.dying) {
      S.dying += dt;
      if (S.dying > 1.05 && state !== 'ended') endRun('dead');
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
    st.clutch += rs.clutch; st.razors += rs.razors; st.transfers += rs.transfers; st.events += rs.events; st.holes += rs.holes; st.novas += rs.novas; st.assists += rs.assists; st.bosses += rs.bosses; st.maxCombo = Math.max(st.maxCombo, rs.maxCombo);
    if (S.mode === 'zen') st.zenTime += S.calm;
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
  function drawVis(v, target, charging) {
    ctx.save();
    const eligible = target && target.body === 'vis';
    const a = v.phase === 'hold' ? 1 : v.phase === 'in' ? OD.easeOut(clamp(v.t / VIS_IN, 0, 1)) : 1 - smooth(clamp(v.t / VIS_OUT, 0, 1));
    ctx.globalAlpha = a;
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = OD.rgba(world.accent2 === '#ffffff' ? '#9fe6ff' : world.accent2, 0.3);
    ctx.beginPath(); ctx.arc(v.x, v.y, v.rho, 0, TAU); ctx.stroke();
    if (S.p.body === 'vis') { ctx.strokeStyle = OD.rgba(v.skinColor, 0.5); ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(v.x, v.y, v.rho, 0, TAU); ctx.stroke(); }
    if (eligible || (v.phase === 'hold' && S.p.body === 'main')) {
      ctx.setLineDash([6 * u, 8 * u]); ctx.lineDashOffset = -tAnim * 40;
      ctx.strokeStyle = eligible ? `rgba(255,217,90,${charging ? 0.95 : 0.55 + 0.25 * Math.sin(tAnim * 8)})` : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = eligible ? (charging ? 3 : 2) : 1.2;
      ctx.beginPath(); ctx.arc(v.x, v.y, v.rho, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
    G.drawPlanet(ctx, v.x, v.y, v.rad, v.skin, tAnim * 1.3, v.skinColor, dpr);
  }

  // ---- cosmic event visuals
  function drawEvtBack() {
    const e = S.evt;
    if (!e) return;
    ctx.save();
    if (e.type === 'giant') {
      ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.setLineDash([4 * u, 8 * u]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.field * e.ramp, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      G.drawPlanet(ctx, e.x, e.y, e.rad, e.skin, tAnim * 0.8, '#ffcf9c', dpr);
      for (let i = 0; i < 2; i++) {
        const a = e.moons[i], r = e.rad * (1.75 + i * 0.55), mx = e.x + Math.cos(a) * r, my = e.y + Math.sin(a) * r * 0.45;
        ctx.fillStyle = i ? '#d8d3ea' : '#bfb2a0'; ctx.beginPath(); ctx.arc(mx, my, (3.2 - i * 0.6) * u, 0, TAU); ctx.fill();
      }
      if (S.p.pull > 0.28) {   // you are close enough for a gravity assist
        const [px, py] = playerXY();
        ctx.strokeStyle = `rgba(255,217,90,${0.5 + 0.4 * Math.sin(tAnim * 10)})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px, py, 20 * u, 0, TAU); ctx.stroke();
      }
    } else if (e.type === 'hole') {
      const r = e.ramp;
      ctx.globalCompositeOperation = 'lighter';
      G.glow(ctx, e.x, e.y, e.field * 0.55 * r, '#8a3dff', 0.35 * r);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = `rgba(190,140,255,${0.22 * r})`; ctx.setLineDash([5 * u, 9 * u]); ctx.lineWidth = 1.2;
      ctx.lineDashOffset = -tAnim * 20;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.field * r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.translate(e.x, e.y);
      ctx.save(); ctx.rotate(e.spin * 0.7); ctx.scale(1, 0.36);
      const dg = ctx.createRadialGradient(0, 0, e.core * 1.2, 0, 0, e.core * 4.2 * r);
      dg.addColorStop(0, 'rgba(255,200,120,0.95)'); dg.addColorStop(0.4, 'rgba(255,120,60,0.6)'); dg.addColorStop(1, 'rgba(140,60,255,0)');
      ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(0, 0, e.core * 4.2 * r, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0, 0, e.core * Math.min(1, r * 1.4), 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * r})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, e.core * 1.3 * r, 0, TAU); ctx.stroke();
    } else if (e.type === 'flare' || e.type === 'nova') {
      const k = e.type === 'nova' ? clamp(e.t / e.warn, 0, 1) : 1;
      ctx.globalCompositeOperation = 'lighter';
      G.glow(ctx, e.x, e.y, (e.type === 'nova' ? 40 + 140 * k * k + Math.sin(tAnim * 20) * 8 : 70) * u, e.type === 'nova' ? '#fff2c8' : '#ffb347', 0.9);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(e.x, e.y, (e.type === 'nova' ? 8 + 8 * k : 7) * u, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  function shadowPoly(e, k) {
    const sx = cx - e.x, sy = cy - e.y, L = Math.hypot(sx, sy), ux = sx / L, uy = sy / L, nx = -uy, ny = ux, w = PR * 1.3, far = Math.hypot(W, H) * 1.6;
    return [[cx + nx * w, cy + ny * w], [cx + ux * far + nx * w, cy + uy * far + ny * w], [cx + ux * far - nx * w, cy + uy * far - ny * w], [cx - nx * w, cy - ny * w]];
  }
  function drawEvtFront() {
    const e = S.evt;
    if (!e) return;
    ctx.save();
    if (e.type === 'flare') {
      const far = Math.hypot(W, H) * 1.7;
      ctx.lineCap = 'round';
      for (const v of e.volleys) {
        const pre = clamp((e.t - (v.at - 1.6)) / 1.6, 0, 1), live = e.t >= v.at && e.t <= v.at + v.dur, done = e.t > v.at + v.dur;
        if (done || pre <= 0) continue;
        for (const a of v.lanes) {
          const x2 = e.x + Math.cos(a) * far, y2 = e.y + Math.sin(a) * far;
          if (!live) {
            ctx.setLineDash([10 * u, 10 * u]); ctx.lineDashOffset = -tAnim * 160; ctx.strokeStyle = `rgba(255,170,60,${0.12 + 0.6 * pre})`; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
          } else {
            const f = 1 - (e.t - v.at) / v.dur;
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = `rgba(255,150,50,${0.5 * f + 0.2})`; ctx.lineWidth = 17 * u; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(x2, y2); ctx.stroke();
            ctx.strokeStyle = '#ffd24d'; ctx.lineWidth = 7.5 * u; ctx.stroke();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 * u; ctx.stroke();
            ctx.globalCompositeOperation = 'source-over';
          }
        }
      }
    } else if (e.type === 'nova') {
      const poly = shadowPoly(e);
      const path = () => { ctx.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(poly[i][0], poly[i][1]); ctx.closePath(); };
      // planet shadow: the only safe place when the wave arrives
      ctx.beginPath(); path();
      const gr = ctx.createLinearGradient(cx, cy, cx + (cx - e.x) * 0.9, cy + (cy - e.y) * 0.9);
      gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0.12)');
      ctx.fillStyle = gr; ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.25 + 0.2 * Math.sin(tAnim * 6)})`; ctx.setLineDash([6 * u, 8 * u]); ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
      if (e.blasted) {
        ctx.save();
        ctx.beginPath(); ctx.rect(-50, -50, W + 100, H + 100); path(); ctx.clip('evenodd');   // the wave cannot enter the shadow
        ctx.globalCompositeOperation = 'lighter';
        const a = clamp(1 - e.f / (Math.hypot(W, H) * 1.3), 0.35, 1);
        ctx.strokeStyle = `rgba(255,230,160,${0.55 * a})`; ctx.lineWidth = 26 * u; ctx.beginPath(); ctx.arc(e.x, e.y, e.f, 0, TAU); ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 8 * u; ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function drawOrbits(extra) {
    const p = S && S.p;
    for (let i = 0; i < 3; i++) {
      let a = 0.13;
      if (p && !p.dead && p.body === 'main') { if (i === p.o) a = 0.24; }
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = OD.rgba(world.accent, a);
      ctx.beginPath(); ctx.arc(cx, cy, R[i], 0, TAU); ctx.stroke();
    }
    if (extra && extra.body === 'main') {
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

  // Always-on hint of where a jump would land: a diamond on the target orbit plus a faint guide line.
  function drawLanding(p, t, charging, px, py, dim, glyph) {
    let mx, my;
    if (t.body === 'vis' && S.vis) { mx = S.vis.x + Math.cos(t.a) * S.vis.rho; my = S.vis.y + Math.sin(t.a) * S.vis.rho; }
    else { mx = cx + Math.cos(t.a) * R[t.n]; my = cy + Math.sin(t.a) * R[t.n]; }
    const a = (charging ? 1 : 0.5) * (dim ? 0.45 : 1);
    ctx.save();
    ctx.setLineDash([3 * u, 5 * u]);
    ctx.strokeStyle = `rgba(255,217,90,${a * 0.55})`; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(mx, my); ctx.stroke();
    ctx.setLineDash([]);
    ctx.translate(mx, my); ctx.rotate(Math.PI / 4 + (charging ? tAnim * 2 : 0));
    const s = (charging ? 6.5 : 5) * u;
    ctx.strokeStyle = `rgba(255,217,90,${a})`; ctx.lineWidth = charging ? 2.4 : 1.8;
    ctx.strokeRect(-s, -s, s * 2, s * 2);
    if (t.body === 'vis') { ctx.fillStyle = `rgba(255,217,90,${a * 0.5})`; ctx.fillRect(-s, -s, s * 2, s * 2); }
    ctx.restore();
    if (glyph && charging) {   // small arrow showing which slide picks this orbit
      ctx.save(); ctx.fillStyle = `rgba(255,217,90,${a})`; ctx.translate(mx, my);
      const dirv = glyph === 'out' ? -1 : 1, gy = dirv * 17 * u;
      ctx.beginPath(); ctx.moveTo(0, gy + dirv * 5 * u); ctx.lineTo(-5 * u, gy - dirv * 3 * u); ctx.lineTo(5 * u, gy - dirv * 3 * u); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
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
    const target = inRun && !S.p.dead && !S.over ? jumpTarget() : null;
    const charging = inRun && S.p.charging && !S.p.over;
    drawOrbits(charging ? target : null);
    const pulse = inRun ? S.beatPulse : 0;
    const skin = OD.save.equipped.planet === 'terra' ? world.planet : OD.save.equipped.planet;
    G.drawPlanet(ctx, cx, cy, PR * (1 + pulse * 0.02), skin, tAnim, world.accent, dpr);
    if (inRun && S.vis) drawVis(S.vis, target, charging);
    if (inRun) drawEvtBack();

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
      drawEvtFront();
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
        if (charging && S.p.body === 'main') {
          const c = jumpCandidates();
          for (const [key, glyph] of [['out', 'out'], ['in', 'in']]) {
            const alt = c[key];
            if (alt && alt !== target && !(target && alt.n === target.n && alt.body === target.body)) drawLanding(S.p, alt, true, px, py, true, glyph);
          }
        }
        if (target) drawLanding(S.p, target, charging, px, py, false, charging && S.p.body === 'main' ? (S.p.steer === 'in' ? 'in' : S.p.steer === 'out' ? 'out' : null) : null);
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
    const y0 = safeTop + (S.demo ? 16 : 6);
    if (S.mode === 'zen') {
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = `300 ${sz * 0.7}px Outfit, system-ui, sans-serif`;
      ctx.fillText(fmtTime(S.calm), cx, y0 + sz * 0.8);
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `500 ${sz * 0.26}px Outfit, system-ui, sans-serif`;
      ctx.fillText('ZEN  ·  ' + S.stats.dust + ' stardust', cx, y0 + sz * 1.15);
    } else {
      ctx.fillStyle = '#fff'; ctx.font = `800 ${sz}px Outfit, system-ui, sans-serif`;
      if (T().fx) { ctx.shadowColor = OD.rgba(world.accent, 0.6); ctx.shadowBlur = 14; }
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
      if (S.feats.length) {
        const f = S.feats[0], k = f.t / 1.6, a = Math.min(1, f.t * 7, (1 - k) * 4), pop = 1 + Math.max(0, 0.25 - f.t * 1.2);
        ctx.save(); ctx.globalAlpha = a; ctx.translate(cx, my + sz * 0.78); ctx.scale(pop, pop);
        ctx.fillStyle = f.color; ctx.font = `800 ${sz * 0.34}px Outfit, system-ui, sans-serif`; ctx.letterSpacing = '3px';
        ctx.fillText(f.str + (f.pts ? '  +' + OD.fmt(f.pts) : ''), 0, 0); ctx.letterSpacing = '0px';
        if (f.sub) { ctx.globalAlpha = a * 0.7; ctx.fillStyle = '#fff'; ctx.font = `500 ${sz * 0.2}px Outfit, system-ui, sans-serif`; ctx.fillText(f.sub, 0, sz * 0.26); }
        ctx.restore();
      }
      if (S.mode === 'timeattack') {
        const left = Math.max(0, 60 - S.time);
        ctx.fillStyle = left < 10 ? '#ff6a7a' : 'rgba(255,255,255,0.8)'; ctx.font = `700 ${sz * 0.42}px Outfit, system-ui, sans-serif`;
        ctx.fillText(Math.ceil(left) + 's', cx - sz * 1.5, my);
      }
    }
    if (S.demo) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = `600 ${Math.max(10, sz * 0.2)}px Outfit, system-ui, sans-serif`; ctx.letterSpacing = '2px';
      ctx.fillText('FREE RUN ' + S.freeNo + ' OF ' + OD.FREE_RUNS, cx, safeTop + 4); ctx.letterSpacing = '0px';
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
        ['HOLD', 'slide up or down to pick the orbit, release on the glow', ''],
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
      pointerId = e.pointerId; downY = e.clientY;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
      inputDown();
    });
    cv.addEventListener('pointermove', e => {
      if (e.pointerId !== pointerId || state !== 'play') return;
      const dy = e.clientY - downY;
      if (dy < -STEER_PX) setSteer('out');        // slide up: bigger orbit
      else if (dy > STEER_PX) setSteer('in');     // slide down: tighter orbit
      else if (Math.abs(dy) < STEER_PX * 0.55) setSteer(null);
    });
    const up = e => { if (e.pointerId !== pointerId) return; pointerId = null; inputUp(); };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => {
      if (e.code === 'Space' && !e.repeat && state === 'play') { e.preventDefault(); keyDown = true; inputDown(); }
      else if ((e.code === 'ArrowUp' || e.code === 'KeyW') && state === 'play') { e.preventDefault(); setSteer('out'); }
      else if ((e.code === 'ArrowDown' || e.code === 'KeyS') && state === 'play') { e.preventDefault(); setSteer('in'); }
      else if ((e.code === 'Escape' || e.code === 'KeyP') && state === 'play') OD.ui.pause();
    });
    window.addEventListener('keyup', e => {
      if (e.code === 'Space' && keyDown) { keyDown = false; inputUp(); }
      else if (['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'].includes(e.code)) setSteer(null);
    });
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
      world = OD.WORLDS[OD.worldUnlocked(OD.save.world) ? OD.save.world : 0];
      OD.audio.stopMusic();
      if (OD.audio.ready() || OD.audio.init()) OD.audio.startMusic(world, { menu: true });
      OD.audio.setMuffle(0);
    },
    start: startRun,
    restart() { startRun(S ? S.mode : mode, world.id); },
    pause() {
      if (state !== 'play' || S.over) return false;
      state = 'paused';
      if (S.p.charging) { S.p.charging = false; S.p.holding = false; OD.audio.setMuffle(0); }
      pointerId = null; OD.audio.suspend();
      return true;
    },
    resume() {
      if (state !== 'paused') return;
      state = 'resume'; S.resumeT = 3;   // audio (and its beat clock) restarts when the countdown ends
    },
    quit() { state = 'menu'; S = null; stopRecording(true); OD.audio.resume(); api.menu(); },
    drawPowerIcon,
    resize,
    _dbg: { get S() { return S; }, set S(v) { S = v; }, update, die: () => die(null, 'debug'), jump: doJump, target: () => jumpTarget(), spawn: { rocks: spawnRocks, comets: spawnComets, mines: spawnMines, ring: spawnRing, beam: spawnBeam, hole: spawnHole, boss: spawnBoss, dust: spawnDust, power: spawnPower, vis: spawnVis, shower: evShower, bloom: evBloom, giant: evGiant, flare: evFlare, hole: evHole, nova: evNova, event: spawnEvent, overdrive: startOverdrive } },
    mode: () => mode,
  };
  return api;
})();
