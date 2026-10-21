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
  if (i === 0 || OD.TEST_UNLOCK) return true;
  if (!OD.save.full) return false;
  return (OD.save.bestWorld[i - 1] || 0) >= OD.WORLDS[i].unlockScore;
};

OD.game = (() => {
  const TAU = OD.TAU, { clamp, lerp, smooth, angDiff } = OD, G = OD.gfx;
  const SNAP_T = 0.55;   // drag mode: a quick, decisive jump (released within this long after the aim slows time) earns the boost
  const aim = () => (OD.save.settings.aim === 'sling' ? 'sling' : 'drag');
  const CHARGE_START = 0.16, PERFECT_A = 0.2, PERFECT_B = 0.34, OVERCHARGE = 0.52, JUMP_DUR = 0.26;
  const REC_SEG = 6000;
  const STEER_PX = 18, DRAG_PX = 14;
  // Everything starts gentle and speeds up at milestones (seconds survived). Each step is announced.
  const SPEED_LV = [0.6, 0.68, 0.76, 0.84, 0.92, 1.0, 1.07, 1.14, 1.21, 1.28, 1.35];
  const LEVEL_AT = [0, 14, 30, 50, 75, 105, 140, 180, 225, 275, 330];
  const levelFor = t => { let l = 0; while (l + 1 < LEVEL_AT.length && t >= LEVEL_AT[l + 1]) l++; return l + (t > 330 ? Math.floor((t - 330) / 60) : 0); };
  const modSpeed = () => (S && S.mods.swift ? 1.25 : 1) * (S && S.mods.chill ? 0.8 : 1);
  const speedFor = (l, m) => (m === 'zen' ? 0.6 : Math.min(1.5, l < SPEED_LV.length ? SPEED_LV[l] : 1.35 + 0.03 * (l - SPEED_LV.length + 1)) + (m === 'timeattack' ? 0.25 : 0));
  const VIS_IN = 2.6, VIS_HOLD = 14, VIS_OUT = 2.6, REACH = 58;   // twin planet timings (s) and transfer reach (x u)

  let cv, ctx, W = 360, H = 640, dpr = 1, cx = 180, cy = 300, base = 360, u = 1, PR = 36, safeTop = 24;
  let R = [0, 0, 0], Rb = [0, 0, 0];
  let state = 'menu';            // menu | play | paused | resume | dying | ended
  let world = OD.WORLDS[0], mode = 'endless', S = null;
  const SHOW_FPS = /[?&]fps/.test(location.search);
  let fpsJs = 0, fpsDt = 0.016;
  let tAnim = 0, lastT = 0, dprCap = 2, perfAcc = 0, perfN = 0, perfT = 0;
  const stars = [G.makeStars(70, 11), G.makeStars(40, 12), G.makeStars(22, 13)];
  let menuDots = [];
  let recorders = [null, null], recTimer = 0, lastClip = null;
  let pointerId = null, keyDown = false, downY = 0, downX = 0, ptrX = 0, ptrY = 0;

  // ------------------------------------------------------------- layout
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    cx = W / 2; cy = H * 0.47;
    base = Math.min(W, H * 0.62); u = base / 360;
    Rb = [base * 0.2, base * 0.31, base * 0.42];
    R = Rb.slice();
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
  const clean = v => String(v).replace(/(\d+)\.\d+/g, (m, a) => String(Math.round(parseFloat(m))));
  function text(str, x, y, color, size = 22) {
    S.texts.push({ str: clean(str), x, y, color, size, t: 0, life: 0.9 });
  }
  // small bonus callouts for slick moves; each has a short cooldown so they never spam the screen
  function trick(id, label, pts, color) {
    S.trickT = S.trickT || {};
    if (S.time - (S.trickT[id] || -9) < 1.2 || S.intro) return;
    S.trickT[id] = S.time;
    const v = Math.round(pts * S.mult); addScore(v); addMult(0.03);
    const [x, y] = playerXY();
    text(label + ' +' + v, x, y - 26 * u, color || '#cfe6ff', 13);
  }
  function shockwave(x, y, color, maxR, life = 0.5) { S.waves.push({ x, y, color, maxR, t: 0, life }); }
  function shake(a) { if (T().shake) S.shake = Math.min(14, S.shake + a); }

  // ------------------------------------------------------------- run setup
  function newState(m) {
    const p = {
      th: -Math.PI / 2, dir: 1, o: 1, r: R[1], od: 1, jump: null,
      charging: false, ct: 0, over: false, holdT: 0, holding: false,
      trail: [], shield: false, slow: 0, magnet: 0, phase: 0, inv: 0, boost: 0, holeSlow: 1,
      zap: 0, brake: 0, leap: 0, reaper: 0, amp: 0, prism: 0, fortune: 0, boostJ: 0, dragging: false, body: 'main', vd: 1, th2: 0, wx: cx, wy: cy - R[1], steer: null, dr: 0, pull: 0,
    };
    return {
      mode: m, p, pz: 1, perks: {}, hudA: {}, hudX: {}, hudLast: {}, hz: [], pk: [], parts: [], texts: [], waves: [], vis: null, evt: null,
      clock: 0, time: 0, ts: 1, real: 0, shake: 0, flash: 0, beatPulse: 0,
      score: 0, dispScore: 0, mult: 1, multT: 0, gm: 0, od: 0, odMax: 5,
      stats: { hops: 0, clutch: 0, razors: 0, events: 0, holes: 0, novas: 0, assists: 0, transfers: 0, grazes: 0, perfects: 0, jumps: 0, flips: 0, dust: 0, powerups: 0, innerTime: 0, maxCombo: 1, bosses: 0, overdrives: 0, shields: 0 },
      dir: { lastBeat: -1, nextWave: 6, nextDust: 4, nextPower: 26, nextBoss: 60, nextVis: 26, nextEvt: 20, evtAt: {}, lastType: '', boss: null },
      rng: null, tut: -1, tutT: 0, useAudio: false, dying: 0, banner: null, bannerT: 0,
      level: 0, spd: speedFor(0, m), chain: 0, chainT: 0, pstreak: 0, dustStreak: 0, dustT: 0, feats: [], clutchT: 0, nextTick: 15, powT: 0,
      introNew: 0, steerTip: false, intro: null, introQ: [], introTotal: 0, rampT: 0, lives: 0, beams: [], era: { id: 'genesis', mix: 1, from: null }, eraIdx: -1, eraSeq: null, tintA: 0, nextBolt: 6, camZ: 1, camY: 0, mods: {}, scoreMul: 1, traitMul: 1, homeSkin: null, old: null,
      ghost: null, ghostRec: [], ghostAcc: 0, demo: false, over: false, endCause: '', resumeT: 0, calm: 0,
    };
  }

  function startRun(m, wIdx) {
    OD.ui.hideTile();
    if (!OD.save.full && OD.freeLeft() <= 0) { OD.ui.paywall('demo'); return false; }
    stopRecording(true);
    mode = m;
    const dayKey = OD.todayKey();
    world = m === 'daily' ? OD.WORLDS[OD.dayNumber(dayKey) % OD.WORLDS.length] : OD.WORLDS[wIdx || 0];
    S = newState(m);
    S.rng = OD.makeRng(m === 'daily' ? dayKey : (Math.random() * 1e9) | 0);
    S.scoreMul = (world.mods && world.mods.scoreMul) || 1;
    if (m !== 'daily' && m !== 'zen' && OD.save.full) for (const id of OD.save.mods) if (OD.MODIFIERS[id]) { S.mods[id] = true; S.scoreMul *= OD.MODIFIERS[id].mul; }
    if (S.mods.chill) S.p.shield = true;
    S.noPerks = m === 'daily';
    S.demo = !OD.save.full;
    if (S.demo) { OD.save.stats.demoRuns++; OD.persist(); S.freeNo = OD.save.stats.demoRuns; }
    if (S.demo) { mode = S.mode = 'endless'; world = OD.WORLDS[0]; }
    S.tut = (!OD.save.tutorialDone && S.mode === 'endless') ? 0 : -1;
    if (S.tut === 0) { S.dir.nextWave = 1e9; S.dir.nextDust = 1e9; S.dir.nextPower = 1e9; }
    // perk tree and boosters
    if (pv('hull') > 0) S.p.shield = true;
    S.hullCd = 0;
    S.lives = Math.min(3 + (pv('bulwark') >= 2 ? 1 : 0), S.lives + [0, 1, 1, 2][pv('bulwark')]);
    S.phoenix = pv('phoenix') > 0 ? { at: [75, 40, 0][pv('phoenix') - 1], used: false } : null;
    S.boostersUsed = [];
    if (!S.demo && !S.noPerks) {
      const sv = OD.save;
      for (const b of OD.BOOSTERS) {
        if (!(sv.boosters[b.id] > 0) || sv.boosterOff[b.id]) continue;
        sv.boosters[b.id]--; S.boostersUsed.push(b.id);
        if (b.id === 'b_shield') S.p.shield = true;
        else if (b.id === 'b_mult') { S.mult = 2; S.stats.maxCombo = 2; }
        else if (b.id === 'b_life') S.lives = Math.min(3, S.lives + 1);
        else if (b.id === 'b_dust') S.dustBonus = 0.5;
      }
      if (S.boostersUsed.length) OD.persist();
    }
    OD.audio.unlock(); OD.audio.preload(String(world.id));
    S.useAudio = OD.audio.ready() && !(OD.debug && /noaudio/.test(location.search));
    OD.audio.startMusic(world, { zen: S.mode === 'zen' });
    OD.audio.setIntensity(0);
    // ghost of the previous best
    const g = OD.save.full && OD.save.ghost[S.mode + world.id];
    if (g && g.d && g.d.length > 6) S.ghost = g;
    state = 'play';
    if (S.boostersUsed.length) setTimeout(() => { if (S && !S.over) banner('BOOSTERS', S.boostersUsed.map(id => OD.BOOSTERS.find(b => b.id === id).name).join('  ·  ')); }, 400);
    if (world.id > 0 && S.mode !== 'daily') introduce('sector_' + world.id, true);
    startRecording();
    OD.haptic('light');
    return true;
  }

  // ------------------------------------------------------------- hazards
  const FADE_OUT = 0.5;
  const lifeFade = h => h.life < 1.2 ? OD.smooth(Math.max(0, h.life / 1.2)) : 1;   // hazards dissolve over their last 1.2 s
  const WARN = { spinner: 1.0, rock: 0.75, comet: 1.0, mine: 0.9, ring: 1.5, beam: 1.3, hole: 1.1 };
  function addHazard(h) {
    h.warn = (h.warn == null ? WARN[h.k] : h.warn) * (1 + 0.15 * pv('early'));
    h.warn0 = h.warn; h.gcd = 0; h.t = 0; h.rot = Math.random() * TAU; h.dead = false;
    h.style = OD.save.equipped.debris;
    h.shape = G.makeShape(h.style, Math.random);
    S.hz.push(h);
    return h;
  }
  const TIMED = Object.keys(OD.POWERS).filter(k => OD.POWERS[k].cat === 'timed');
  const perk = id => (S && S.perks[id]) || 0;
  const pv = id => (S && !S.noPerks ? OD.perkLevel(id) : 0);   // level of a perk from the shop's perk tree (off in the daily run, so it stays fair)
  const canUse = id => OD.intro.canUse(id, S);
  // First sighting of an element: remember it, and pause the run behind an explanation popup.
  function introduce(id, free) {
    if (!OD.INTRO_BY_ID[id] || OD.save.intro[id]) return;
    OD.save.intro[id] = true; if (!free) S.introNew++; OD.persist();
    if (state !== 'play' || S.over) return;
    if (S.intro) { S.introQ.push(id); return; }
    S.intro = { id, t: 0 };
    OD.ui.showTile(id);
  }
  // While a tile is up the world crawls: nothing can hurt you, nothing scores, nothing spawns.
  function endIntro() {
    if (!S || !S.intro) return;
    S.introTotal += S.intro.t; S.intro = null; S.rampT = 1.4;
    OD.ui.hideTile();
    if (S.introQ.length) { const id = S.introQ.shift(); setTimeout(() => { if (S && state === 'play' && !S.over && !S.intro) { S.intro = { id, t: 0 }; OD.ui.showTile(id); } }, 1500); }
  }
  const lv = () => Math.min(1, S.time / 170) + (S.mods && S.mods.heavy ? 0.12 : 0);
  const speedMul = () => world.speed * (S.mode === 'hardcore' ? 1.12 : 1) * S.spd * (1 - 0.06 * perk('calm')) * (1 - 0.03 * pv('calmorbit'));

  // Rock formations keep waves from feeling samey: a rotating spoke, a spiral and a curtain with one gap.
  function spawnRockPattern() {
    const l = lv(), kinds = ['gate'];
    if (l > 0.12) kinds.push('spiral');
    if (l > 0.2) kinds.push('rain');
    const kind = S.rng.pick(kinds), w = S.rng.sign() * S.rng.range(0.32, 0.55);
    let a0 = S.rng() * TAU;
    if (Math.abs(angDiff(a0, S.p.th)) < 1.3) a0 += 2.4;
    if (kind === 'gate') { for (let o = 0; o < 3; o++) addHazard({ k: 'rock', o, a: a0, w, s: 8.5 * u, life: 11 }); }
    else if (kind === 'spiral') { for (let i = 0; i < 6; i++) addHazard({ k: 'rock', o: i % 3, a: a0 + i * 0.95, w: w * 0.8, s: 8 * u, life: 11 }); }
    else { for (let i = 0; i < 7; i++) addHazard({ k: 'rock', o: 2, a: a0 + i * TAU / 7 + (i === 3 ? 0.35 : 0), w: w * 0.7, s: 7.5 * u, life: 11 }); }
  }
  function spawnRocks() {
    if (lv() > 0.04 && S.rng() < 0.38) { spawnRockPattern(); return; }
    const n = clamp(Math.round((1 + Math.floor(lv() * 3 + S.rng() * 1.6)) * ((world.mods && world.mods.rockMul) || 1)), 1, 6);
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
  function spawnSpinner() {
    const o = S.rng.int(0, 2);
    let a = S.rng() * TAU;
    if (o === S.p.o && Math.abs(angDiff(a, S.p.th)) < 1.2) a += 2;
    addHazard({ k: 'spinner', o, a, w: S.rng.sign() * S.rng.range(0.2, 0.4), rv: S.rng.sign() * S.rng.range(1.3, 2.0), len: 27 * u, life: 11, warn: 1.0 });
  }
  function spawnBeam() {
    const o0 = S.rng.int(0, 1);
    addHazard({ k: 'beam', o0, o1: o0 + 1, a: S.rng() * TAU, w: S.rng.sign() * (0.55 + 0.45 * lv()), life: 4.6, s: 4 * u });
  }
  function spawnHole() {
    addHazard({ k: 'hole', o: 1, a: S.rng() * TAU, w: S.rng.sign() * 0.22, s: 11 * u, field: 66 * u, life: 9 });
  }
  function spawnDust(o, a0, n = 6, gap = 0.17) {
    n = Math.max(3, Math.round(n * ((world.mods && world.mods.dustMul) || 1) * (S.mods.lucky ? 1.5 : 1)));
    o = o == null ? S.rng.int(0, 2) : o;
    a0 = a0 == null ? S.rng() * TAU : a0;
    for (let i = 0; i < n; i++) S.pk.push({ k: 'dust', o, a: a0 + i * gap, life: 9, t: 0, x: 0, y: 0, pull: false });
  }
  function spawnPower() {
    const hard = S.mode === 'hardcore';
    if (S.mods.glass) return;
    const WTS = { shield: 3, slow: 2.4, magnet: 2, phase: 2, bomb: 1.4, double: 2, zap: 2.4, brake: 2, overload: 1.1, life: 0.9, leap: 1.8, reaper: 1.4, amp: 1.2, alchemy: 1.1, prism: 1.4, fortune: 1.3, boost: 1.4, jackpot: 1, pulse: 1.2, calm: 0.6, sense: 0.6, daredevil: 0.6, lucky_star: 0.5, momentum: 0.6 };
    const types = (hard ? ['magnet', 'brake'] : Object.keys(WTS)).filter(canUse).filter(t => OD.POWERS[t].cat !== 'perk' || (S.perks[t] || 0) < 3);
    if (!types.length) return;
    let tw = 0; for (const t of types) tw += WTS[t];
    let rr = S.rng() * tw, type = types[0];
    for (const t of types) { rr -= WTS[t]; if (rr <= 0) { type = t; break; } }
    introduce(type);
    S.pk.push({ k: 'power', type, o: S.rng.int(0, 2), a: S.rng() * TAU, w: 0.3 * S.rng.sign(), life: 11, t: 0, x: 0, y: 0 });
  }
  function banner(str, sub) { S.banner = { str: clean(str), sub: clean(sub) }; S.bannerT = 2.2; }

  function spawnBoss() {
    const d = S.dir, free1 = S.rng.int(0, 2), free2 = (free1 + S.rng.int(1, 2)) % 3;
    d.boss = { phase: 1, free1, free2, t2: S.clock + 10.2, end: S.clock + 10.2 + 9.4 };
    banner('ECLIPSE', 'Stay on the open orbit'); OD.audio.fx('boss', { loop: true, fade: 1.5, gain: 0.7 });
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
    if (has('comet') && t > 10 && canUse('comet')) allowed.push(['comet', (eraIs('storm') ? 4 : 2) * ((world.mods && world.mods.cometMul) || 1)]);
    if (has('mine') && t > 18 && canUse('mine')) allowed.push(['mine', (eraIs('molten') ? 5 : 2) * ((world.mods && world.mods.mineMul) || 1)]);
    if (has('ring') && t > 26 && canUse('ring') && !S.hz.some(h => h.k === 'ring')) allowed.push(['ring', 2]);
    if (has('spinner') && t > 30 && canUse('spinner')) allowed.push(['spinner', 2]);
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
    ({ rock: spawnRocks, comet: spawnComets, mine: spawnMines, ring: () => spawnRing(S.rng.int(0, 2)), beam: spawnBeam, hole: spawnHole, spinner: spawnSpinner })[pick]();
    OD.audio.sfx('warn');
    introduce(pick === 'hole' ? 'well' : pick);
  }

  // ------------------------------------------------------------- director
  function waveInterval() {
    let iv = lerp(7, 3.6, lv());
    if (S.mode === 'timeattack') iv *= 0.6;
    if (S.mode === 'zen') iv *= 1.9;
    if (S.mode === 'hardcore') iv *= 0.9;
    if (S.mods.heavy) iv *= 0.72;
    return clamp(Math.round(iv), 3, 12);
  }
  function onBeat(b) {
    S.beatPulse = 1;
    const d = S.dir;
    if (S.tut >= 0 || S.intro || (S.vis && S.vis.phase === 'settle')) return;
    if (b >= d.nextWave && b % 2 === 0) { spawnWave(); d.nextWave = b + waveInterval(); }
    if (b >= d.nextDust) { spawnDust(); introduce('dust'); d.nextDust = b + S.rng.int(5, 9); }
    if (b >= d.nextPower && S.mode !== 'timeattack') { spawnPower(); d.nextPower = b + Math.round(S.rng.int(22, 34) / ((S.mods.lucky ? 2 : 1) * (1 + 0.25 * perk('lucky_star') + 0.15 * pv('charm')))); }
    const bossOk = S.mode === 'endless' || S.mode === 'daily' || S.mode === 'hardcore';
    if (bossOk && !d.boss && S.time >= d.nextBoss && canUse('boss') && b % 4 === 0) { spawnBoss(); introduce('boss'); d.nextBoss += 90; }
    if (S.tut < 0 && S.time >= d.nextEvt && !S.over && b % 4 === 0) { spawnEvent(); d.nextEvt = S.time + S.rng.range(24, 40) / (((world.mods && world.mods.evMul) || 1) * (S.mods.volatile ? 1.8 : 1)); }
    if (!S.vis && !S.evt && !d.boss && S.mode !== 'timeattack' && S.time >= d.nextVis && canUse('twin') && b % 4 === 0) { spawnVis(); introduce('twin'); d.nextVis = S.time + S.rng.range(40, 54) / (S.mods.volatile ? 1.5 : 1); }
  }
  function directorTick() {
    const bi = Math.floor(S.clock * OD.audio.bpm(world) / 60);
    if (bi - S.dir.lastBeat > 3) S.dir.lastBeat = bi - 1;   // never replay a backlog of beats (e.g. after a hitch)
    while (S.dir.lastBeat < bi) { S.dir.lastBeat++; onBeat(S.dir.lastBeat); }
    const bs = S.dir.boss;
    if (bs) {
      if (bs.phase === 1 && S.clock >= bs.t2) { bs.phase = 2; bossRings(bs.free2, 8.4); text('SWITCH!', cx, cy - R[2] - 30 * u, '#fff', 26); OD.audio.sfx('warn'); }
      if (S.clock >= bs.end) {
        S.dir.boss = null; S.stats.bosses++; addMult(0.5); OD.audio.fxStop('boss', 1.5);
        addScore(300 * S.mult); text('+' + 300 * S.mult, cx, cy - R[2] - 28 * u, world.accent2, 28);
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
          const pts = Math.round(15 * S.mult); addScore(pts); S.clutchT = 1; S.stats.clutch++; addMult(0.1);
          text('CLUTCH +' + pts, p.wx, p.wy - 22 * u, '#9fffd0', 15);
          OD.audio.sfx('graze', 3); OD.haptic('medium'); break;
        }
      }
    }
    if (S.lastLand && S.time - S.lastLand < 0.45) trick('snap', 'SNAP TURN', 12, '#9fe6ff');
    else if (S.lastFlipT && S.time - S.lastFlipT < 0.38) trick('dflip', 'DOUBLE FLIP', 8, '#ffd9a0');
    S.lastFlipT = S.time;
    p.dir *= -1; S.stats.flips++;
    OD.audio.sfx('flip', p.dir > 0 ? 1 : 0); OD.haptic('light');
    const [x, y] = playerXY();
    burst(x, y, 6, 70 * u, world.accent, 2, 0.4);
  }
  // dirWanted: +1 bigger orbit, -1 tighter orbit, 0 = automatic bounce between the edges
  function mainTarget(dirWanted) {
    const p = S.p;
    let d;
    if (dirWanted === 1 && p.o < 2) d = p.leap > 0 ? 2 - p.o : 1;
    else if (dirWanted === -1 && p.o > 0) d = p.leap > 0 ? -p.o : -1;
    else { d = p.od; if (p.o + d < 0 || p.o + d > 2) d = -d; }
    return { body: 'main', n: p.o + d, d: d > 0 ? 1 : -1, a: p.th };
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
      if (v && v.phase === 'pass' && p.o === 2 && !p.jump) {
        const dx = p.wx - v.x, dy = p.wy - v.y;
        if (Math.abs(Math.hypot(dx, dy) - v.rho) < (REACH + 14) * u) c.vis = { body: 'vis', a: Math.atan2(dy, dx) };
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
  // Where the finger is, in world coordinates (undoing the camera zoom/pan)
  function fingerWorld() { const z = S.camZ; return [cx + (ptrX - cx) / z, cy + S.camY + (ptrY - cy) / z]; }
  // Drag mode: the orbit ring closest to your finger is where you jump. Dragging back onto your own orbit cancels.
  // Drag mode: hold anywhere and slide your thumb. The slide is read against where your dot is: pushing away from the planet
  // (through the dot) picks the next BIGGER orbit, pulling towards the planet picks the next TIGHTER one. Sideways cancels.
  const DRAG_STEP = 26;
  function radialDir() { const [px, py] = playerXY(), dx = px - cx, dy = py - cy, d = Math.hypot(dx, dy) || 1; return [dx / d, dy / d]; }
  function dragSteps() {
    const [rx, ry] = radialDir(), mx = ptrX - downX, my = ptrY - downY, len = Math.hypot(mx, my);
    if (len < DRAG_STEP) return 0;
    const proj = mx * rx + my * ry;
    if (Math.abs(proj) < len * 0.5) return 0;                 // mostly sideways: not a choice
    return Math.sign(proj) * (S.p.leap > 0 && Math.abs(proj) > DRAG_STEP * 4 ? 2 : 1);
  }
  function dragTarget() {
    const p = S.p;
    if (p.body !== 'main') return null;
    const st = dragSteps();
    if (!st) return null;
    const n = clamp(p.o + st, 0, 2);
    if (p.o === 2 && st > 0) { const c = jumpCandidates(); if (c.vis) return c.vis; }
    if (n === p.o) return null;
    return { body: 'main', n, d: n > p.o ? 1 : -1, a: p.th };
  }
  function jumpTarget() {
    const c = jumpCandidates(), st = S.p.steer;
    if (aim() === 'drag') {          // nothing is picked until you drag (or press an arrow key on a keyboard)
      if (!S.p.charging) return null;
      if (S.p.dragging) return dragTarget();
      if (S.p.body === 'main') { if (st === 'out') return (S.p.o < 2 ? c.out : c.vis) || null; if (st === 'in') return c.in || null; }
      return null;
    }
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
    if (body === 'vis' && (!S.vis || S.vis.phase !== 'pass')) { body = 'main'; n = nearestMain(p.wx, p.wy).n; a = Math.atan2(p.wy - cy, p.wx - cx); }
    p.dir = (j.vx * -Math.sin(a) + j.vy * Math.cos(a)) >= 0 ? 1 : -1;   // keep travelling the way you were going
    if (body === 'vis') {
      p.body = 'vis'; p.th2 = a; S.stats.transfers++;
      const pts = 60 * S.mult; addScore(pts);
      text('LANDED +' + pts, p.wx, p.wy - 24 * u, S.vis.skinColor, 19);
      shockwave(p.wx, p.wy, S.vis.skinColor, 80 * u, 0.5);
      OD.audio.sfx('power'); OD.haptic('medium');
      startSettle();   // landing on a passing planet moves you in: the camera follows and it becomes home
    } else {
      p.body = 'main'; p.o = n; p.th = a; p.r = R[n]; p.od = n === 0 ? 1 : n === 2 ? -1 : p.od;
    }
  }
  function doJump(perfect, forced) {
    const p = S.p;
    if (p.jump || (S.vis && S.vis.phase === 'settle')) return;
    const t = forced ? jumpCandidates().auto : jumpTarget();
    if (!t) return;
    if (!perfect && p.boostJ > 0) { perfect = true; p.boostJ--; }
    if (t.body === 'main' && p.body === 'main') {
      p.od = t.d;
      p.jump = { t: 0, dur: JUMP_DUR * (1 - 0.08 * pv('swift')), from: p.r, to: R[t.n], n: t.n };
    } else startCross(t.body, t.body === 'main' ? t.n : -1, t.a, 0.34);
    if (!perfect) S.pstreak = 0;
    S.stats.jumps++;
    if (S.lastFlipT && S.time - S.lastFlipT < 0.35) trick('fj', 'FLIP & JUMP', 10, '#ffb8f0');
    S.hopT = (S.hopT || []).filter(q => S.time - q < 4.5); S.hopT.push(S.time);
    if (S.hopT.length >= 3) { trick('chainhop', 'HOP CHAIN ×' + S.hopT.length, 12 + 4 * S.hopT.length, '#b9ff9a'); }
    if (p.jump) { const [jx, jy] = playerXY(); p.jump.near = S.hz.some(h => { if (h.dead || h.warn > 0 || h.k === 'hole') return false; const [hx, hy] = h.k === 'comet' ? [h.x, h.y] : hpos(h); return Math.hypot(hx - jx, hy - jy) < 60 * u; }); }
    OD.audio.sfx('jump'); OD.haptic('medium');
    const [x, y] = playerXY();
    burst(x, y, 10, 110 * u, '#fff', 2, 0.45);
    if (S.evt && S.evt.type === 'giant' && p.pull > 0.28 && p.body === 'main') {   // gravity assist
      p.boost = Math.max(p.boost, 1.6); S.stats.assists++;
      const pts = 80 * S.mult; addScore(pts);
      text('GRAVITY ASSIST +' + pts, x, y - 30 * u, '#ffcf9c', 19);
      shockwave(x, y, '#ffcf9c', 90 * u, 0.5); OD.audio.sfx('slingshot'); OD.haptic('heavy');
    }
    if (perfect) {
      p.boost = 1.1 + 0.4 * pv('weaver'); S.stats.perfects++; S.pstreak++; addMult(0.2 + (pv('weaver') >= 3 ? 0.1 : 0));
      if (S.pstreak >= 2) feat('PERFECT ×' + S.pstreak, 'Back-to-back slingshots', '#ffd95a', 40 * S.pstreak * S.mult);
      const pts = 40 * S.mult * (S.od > 0 ? 2 : 1);
      addScore(pts);
      text('SLINGSHOT', x, y - 22 * u, '#ffd95a', 20);
      shockwave(x, y, '#ffd95a', 60 * u, 0.4);
      OD.audio.sfx('slingshot'); OD.haptic('heavy');
      burst(x, y, 16, 170 * u, '#ffd95a', 2.5, 0.6);
    }
  }

  // ------------------------------------------------------------- passing planets
  // A planet of another type drifts past above or below. The camera pulls back so you can choose: ignore it,
  // visit it for stardust and jump back, or stay one full lap and move in. Each planet type brings its own rule.
  const PLANET_TYPES = [
    { skin: 'moon',  trait: null,      color: '#cfd3e8', name: 'MOON',        bonus: '' },
    { skin: 'ocean', trait: 'tidal',   color: '#5aa8ff', name: 'OCEAN WORLD', bonus: 'Orbits breathe  ·  +10% score' },
    { skin: 'lava',  trait: 'molten',  color: '#ff8a4d', name: 'LAVA WORLD',  bonus: 'More mines  ·  +25% score' },
    { skin: 'ice',   trait: 'frozen',  color: '#9fe6ff', name: 'ICE WORLD',   bonus: 'Slippery turns  ·  +15% score' },
    { skin: 'gas',   trait: 'storm',   color: '#ffb36b', name: 'STORM GIANT', bonus: 'Speed surges  ·  +30% score' },
    { skin: 'void',  trait: 'eclipse', color: '#c77dff', name: 'DARK WORLD',  bonus: 'Night falls  ·  +40% score' },
  ];
  const TRAIT_MUL = { tidal: 1.1, molten: 1.25, frozen: 1.15, storm: 1.3, eclipse: 1.4 };
  function spawnVis() {
    const rho = Rb[2], D = Rb[2] * 1.62, side = S.rng.sign(), dirx = S.rng.sign();
    const ok = PLANET_TYPES.filter(t => (!t.trait || canUse('era_' + t.trait)) && t.skin !== S.homeSkin);
    const type = S.rng.pick(ok.length ? ok : [PLANET_TYPES[0]]);
    const span = W * 0.5 + rho + 50;
    S.vis = { side, dirx, rho, R: Rb.slice(), rad: PR, D, span, life: 18, t: 0, phase: 'pass', x: cx - dirx * span, y: cy + side * D, type, skin: type.skin, skinColor: type.color, sx: 0, sy: 0, st: 0 };
    banner('A NEW PLANET DRIFTS IN', 'Jump across from your outer orbit  ·  ' + type.name);
    OD.audio.sfx('warn');
    if (type.trait) introduce('era_' + type.trait);
    const a0 = S.rng() * TAU;
    for (let i = 0; i < 9; i++) S.pk.push({ k: 'dust', vis: true, ri: 1, a: a0 + i * TAU / 9, life: 20, t: 0, x: 0, y: 0, pull: false, o: 0 });
  }
  function setTrait(trait) {
    S.era = { id: trait || 'genesis', mix: 0, from: null };
    OD.audio.setEra(trait || 'genesis');
    S.traitMul = trait ? TRAIT_MUL[trait] : 1;
  }
  function startSettle() {
    const v = S.vis;
    v.phase = 'settle'; v.st = 0; v.sx = v.x; v.sy = v.y;
    const dx = cx - v.x, dy = cy - v.y, d = Math.hypot(dx, dy) || 1;
    S.old = { skin: S.homeSkin || baseSkin(), t: 0, vx: -dx / d, vy: -dy / d };
    // everything that belonged to the old system drifts off with it
    for (const h of S.hz) if (h.o != null || h.k === 'beam') { const [hx, hy] = hpos(h); burst(hx, hy, 6, 90 * u, world.danger, 2, 0.8); h.dead = true; }
    for (const q of S.pk) if (!q.vis) q.dead = true;
    banner('MOVING IN', v.type.name + (v.type.bonus ? '  ·  ' + v.type.bonus : ''));
    OD.audio.sfx('overdrive'); OD.haptic('heavy'); shake(5); OD.audio.fx('hop', { gain: 0.9 });
  }
  function finishSettle() {
    const v = S.vis, p = S.p;
    S.homeSkin = v.skin; setTrait(v.type.trait); S.old = null;
    for (let i = 1; i <= 2; i++) setTimeout(() => { if (S && !S.over) shockwave(cx, cy, i === 1 ? '#ffffff' : v.skinColor, (300 + i * 90) * u, 1.2); }, i * 220);
    burst(cx, cy, 46, 380 * u, v.skinColor, 3.2, 1.1);
    p.body = 'main'; p.o = 2; p.r = R[2]; p.th = p.th2; p.dr = 0; p.od = -1;
    p.wx = cx + Math.cos(p.th) * p.r; p.wy = cy + Math.sin(p.th) * p.r;
    S.stats.hops++; addMult(0.5);
    addScore(150 * S.mult);
    for (const k of S.pk) if (k.vis) { k.vis = false; k.o = k.ri; }   // its stardust stays on the new orbits
    S.vis = null;
    S.dir.nextWave = S.dir.lastBeat + 6;
    shockwave(cx, cy, v.skinColor, 240 * u, 1);
    S.flash = Math.max(S.flash, 0.35);
    banner('NEW HOME', v.type.name);
    OD.audio.sfx('unlock'); OD.haptic('heavy');
  }
  function visPresence(v) {
    const d = Math.hypot(v.x - cx, v.y - cy);
    return v.phase === 'settle' ? smooth(clamp(d / v.D, 0, 1)) : smooth(clamp(1 - (d - v.D) / (0.75 * base), 0, 1));
  }
  function visTick(dt) {
    const v = S.vis, p = S.p;
    if (!v) return;
    v.t += dt;
    if (v.phase === 'pass') {
      const k = clamp(v.t / v.life, 0, 1);
      v.x = cx + v.dirx * lerp(-1, 1, k) * v.span;
      v.y = cy + v.side * (v.D + Math.sin(v.t * 0.8) * 4 * u);
      if (k >= 1) {
        if (p.body === 'vis') {}   // handled below
        else { S.vis = null; S.pk = S.pk.filter(q => !q.vis); return; }
      }
    } else if (v.phase === 'settle') {
      v.st += dt;
      const q = clamp(v.st / 2.1, 0, 1), e = smooth(q);
      v.x = lerp(v.sx, cx, e); v.y = lerp(v.sy, cy, e);
      if (S.old) S.old.t += dt;
      if (q >= 1) finishSettle();
      return;
    }
    // the planet drifted away while you were on it: you are carried back to the nearest orbit
    if (p.body === 'vis' && v.t >= v.life && !p.jump) {
      const m = nearestMain(p.wx, p.wy);
      startCross('main', m.n, Math.atan2(p.wy - cy, p.wx - cx), 0.6);
      text('RETURN', p.wx, p.wy - 22 * u, '#fff', 18);
      v.lap = 0;
    }
  }

  // ------------------------------------------------------------- planet eras
  // Every ERA_LEN seconds the planet transforms and one rule of the world changes, so a long run keeps evolving.
  const ERAS = {
    tidal:   { name: 'TIDAL',   skin: 'ocean', tint: '#2f7bff', rule: 'Orbits breathe in and out' },
    molten:  { name: 'MOLTEN',  skin: 'lava',  tint: '#ff5a1f', rule: 'Pulse mines everywhere, embers rising' },
    frozen:  { name: 'FROZEN',  skin: 'ice',   tint: '#7fe4ff', rule: 'Slippery: turning takes a moment' },
    storm:   { name: 'STORM',   skin: 'gas',   tint: '#c9a0ff', rule: 'Speed surges with the lightning' },
    eclipse: { name: 'ECLIPSE', skin: 'void',  tint: '#7a3dff', rule: 'Night falls. The beat lights the way' },
  };
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  function baseSkin() { return world.planet; }
  const eraIs = id => !!S && S.mode !== 'zen' && ((S.era && S.era.id === id) || (world.rules && world.rules.includes(id)));
  function applyBreath() {
    const k = eraIs('tidal') ? Math.min(1, S.era.mix) : 0;
    for (let i = 0; i < 3; i++) R[i] = Rb[i] * (1 + 0.055 * k * Math.sin(S.clock * 0.9 + i * 1.4));
  }
  function fogAmount() {
    const mod = S.mods.fog ? 1 : 0, era = eraIs('eclipse') ? Math.min(1, S.era.mix) : 0;
    return Math.max(mod, era) * (1 - 0.55 * S.beatPulse);
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
      list.push([k, e.w * ((world.mods && world.mods.evW && world.mods.evW[k]) || 1)]);
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
    banner('BLACK HOLE', 'Do not get pulled in'); OD.audio.fx('blackhole', { loop: true, fade: 2.5, gain: 0.7 });
    OD.audio.sfx('boss'); shake(6); OD.haptic('heavy');
  }
  function evNova() {
    const D = Math.max(W, H) * 0.58, a = S.rng() * TAU;
    S.evt = { type: 'nova', t: 0, x: cx + Math.cos(a) * D, y: cy + Math.sin(a) * D, warn: 3.4, speed: 270 * u, f: 0, blasted: false, gcd: 0 };
    banner('SUPERNOVA', 'Hide in the planet\'s shadow'); OD.audio.fx('supernova', { gain: 0.9 });
    OD.audio.sfx('boss'); OD.haptic('heavy');
  }
  function endEvent(ok) {
    const e = S.evt;
    S.evt = null;
    if (e && e.type === 'hole') OD.audio.fxStop('blackhole', 2);
    if (!ok || !e) return;
    S.stats.events++; addMult(0.3);
    const mid = [cx, cy - R[2] - 30 * u];
    if (e.type === 'hole') {
      S.stats.holes++; addScore(400 * S.mult);
      banner('HORIZON CLEARED', '+' + 400 * S.mult);
      for (let o = 0; o < 3; o++) spawnDust(o, S.rng() * TAU, 7, 0.22);
    } else if (e.type === 'nova') {
      S.stats.novas++; addScore(1000 * S.mult);
      banner('SUPERNOVA SURVIVED', '+' + 1000 * S.mult);
      for (let o = 0; o < 3; o++) spawnDust(o, S.rng() * TAU, 10, 0.18);
      S.flash = Math.max(S.flash, 0.5);
    } else if (e.type === 'flare') { addScore(200 * S.mult); text('FLARE DODGED +' + 200 * S.mult, mid[0], mid[1], '#ffd95a', 22); }
    else if (e.type === 'giant') { addScore(100 * S.mult); }
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
    if (!absorb(h)) die(h);
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
    S.p.holding = true; S.p.holdT = 0; S.p.steer = null; S.p.dragging = false;
  }
  function inputUp() {
    if (state !== 'play' || !S) return;
    const p = S.p;
    if (!p.holding) return;
    p.holding = false;
    if (!p.charging) { p.steer = null; p.dragging = false; flip(); return; }   // a quick tap flips direction in both modes
    const ct = p.ct, drag = p.dragging;
    OD.audio.setMuffle(0);
    if (aim() === 'drag') {
      // drag mode: the aimed orbit is where you land; releasing without choosing one cancels
      if (drag || p.steer) doJump(ct <= SNAP_T);
      else if (OD.save.stats.runs < 25) text('DRAG AWAY OR TOWARDS THE PLANET', p.wx, p.wy - 26 * u, '#ffd95a', 15);
    } else {
      // slingshot mode: release on the golden glow for the boost; the next orbit is chosen for you
      if (ct < 0.05) { p.charging = false; flip(); return; }
      doJump(ct >= PERFECT_A && ct <= PERFECT_B);
    }
    p.charging = false; p.dragging = false; p.steer = null;
  }

  // ------------------------------------------------------------- update
  function die(h, why) {
    const p = S.p;
    if (S.dying) return;
    S.dying = 0.001; S.over = true;
    const [x, y] = playerXY();
    const bs = OD.save.equipped.burst;
    if (bs === 'rings') { for (let i = 0; i < 4; i++) setTimeout(() => { if (S) shockwave(x, y, i % 2 ? '#fff' : world.accent, (110 + i * 55) * u, 0.9); }, i * 110); burst(x, y, 36, 260 * u, world.accent, 3, 1); }
    else if (bs === 'confetti') { for (let i = 0; i < 90; i++) { const a = Math.random() * TAU, sp = 120 + Math.random() * 360; particle(x, y, Math.cos(a) * sp * u, Math.sin(a) * sp * u - 60, 1.4 + Math.random() * 0.8, 2 + Math.random() * 2.4, OD.hsl(Math.random() * 360, 100, 62), { sq: true, drag: 1.1 }); } }
    else if (bs === 'implode') { for (let i = 0; i < 70; i++) { const a = Math.random() * TAU, d = (90 + Math.random() * 160) * u; particle(x + Math.cos(a) * d, y + Math.sin(a) * d, -Math.cos(a) * d / 0.5, -Math.sin(a) * d / 0.5, 0.5, 2.6, world.accent, { drag: 0 }); } setTimeout(() => { if (S) { burst(x, y, 50, 400 * u, '#fff', 3, 0.9); shockwave(x, y, '#fff', 170 * u, 0.6); } }, 480); }
    else if (bs === 'stars') { for (let i = 0; i < 60; i++) { const a = Math.random() * TAU, sp = 100 + Math.random() * 320; particle(x, y, Math.cos(a) * sp * u, Math.sin(a) * sp * u, 1.2 + Math.random(), 2 + Math.random() * 3, Math.random() < 0.5 ? '#ffe48a' : '#fff6c8', { sq: true, drag: 1.6 }); } shockwave(x, y, '#ffe48a', 140 * u, 0.7); }
    else { burst(x, y, 70, 330 * u, world.accent, 3.5, 1.1); burst(x, y, 30, 220 * u, '#fff', 2.5, 0.9); shockwave(x, y, world.danger, 130 * u, 0.7); }
    S.flash = 1; shake(14);
    OD.audio.sfx('death'); OD.haptic('error');
    OD.audio.setIntensity(0); OD.audio.setMuffle(0.8);
    p.trail.length = 0; p.dead = true;
    S.endCause = why || (h && h.k) || 'hit';
    stopRecording(false);
  }
  // Every way the run can survive a hit, in order: the guardian zaps it, a shield blocks it, an extra life revives you.
  function absorb(h) {
    const p = S.p;
    if (p.zap > 0 && (h.k === 'rock' || h.k === 'comet' || h.k === 'mine' || h.k === 'spinner') && !h.dead) {
      p.zap--; p.inv = Math.max(p.inv, 0.4);
      const [x, y] = playerXY(), [hx, hy] = hpos(h);
      S.beams.push({ x1: x, y1: y, x2: hx, y2: hy, t: 0 });
      destroy(h, true); addMult(0.1);
      text('ZAPPED' + (p.zap ? '  ×' + p.zap + ' left' : ''), x, y - 24 * u, OD.POWERS.zap.color, 17);
      OD.audio.sfx('slingshot'); OD.haptic('heavy'); shake(4);
      return true;
    }
    if (p.shield) { shieldBreak(h); return true; }
    if (S.lives > 0) {
      if (!(pv('lifeline') && Math.random() < 0.15 * pv('lifeline'))) S.lives--;
      p.inv = 2.4 + 0.5 * pv('afterglow'); S.mult = Math.max(1, S.mult * 0.6);
      const [x, y] = playerXY();
      shockwave(x, y, OD.POWERS.life.color, 240 * u, 0.9); burst(x, y, 40, 300 * u, OD.POWERS.life.color, 3, 0.9);
      for (const o of S.hz) { if (o.k === 'beam' || o.k === 'ring') continue; const [hx, hy] = hpos(o); if (Math.hypot(hx - x, hy - y) < (170 + 60 * pv('tough')) * u) destroy(o, false); }
      banner('EXTRA LIFE USED', S.lives ? S.lives + ' left' : 'No more lives');
      OD.audio.sfx('shield'); OD.haptic('heavy'); shake(9); S.flash = 0.6;
      return true;
    }
    if (S.phoenix && !S.phoenix.used && S.time >= S.phoenix.at) {
      S.phoenix.used = true; p.inv = 2.4 + 0.5 * pv('afterglow'); S.mult = Math.max(1, S.mult * 0.5);
      const [x, y] = playerXY();
      shockwave(x, y, '#ffb347', 320 * u, 1); burst(x, y, 60, 340 * u, '#ffb347', 3, 1);
      for (const o of S.hz) { if (o.k === 'beam' || o.k === 'ring') continue; const [hx, hy] = hpos(o); if (Math.hypot(hx - x, hy - y) < 230 * u) destroy(o, false); }
      banner('PHOENIX', 'Back from the ashes');
      OD.audio.sfx('overdrive'); OD.haptic('heavy'); shake(10); S.flash = 0.7;
      return true;
    }
    return false;
  }
  function shieldBreak(h) {
    const p = S.p; p.shield = false; p.inv = 1.4 + 0.5 * pv('afterglow'); if (pv('hull') >= 2 && !S.hullCd) S.hullCd = pv('hull') === 2 ? 70 : 40; S.stats.shields++; S.mult = Math.max(1, S.mult * 0.7);
    const [x, y] = playerXY();
    shockwave(x, y, OD.POWERS.shield.color, 150 * u, 0.6);
    burst(x, y, 30, 260 * u, OD.POWERS.shield.color, 3, 0.8);
    for (const o of S.hz) {
      if (o.k === 'rock' || o.k === 'mine' || o.k === 'comet' || o.k === 'spinner') {
        const [hx, hy] = hpos(o);
        if (Math.hypot(hx - x, hy - y) < (150 + 60 * pv('tough')) * u) destroy(o, false);
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
      addScore(pts); text('+' + pts, x, y - 14 * u, '#fff', 18);
      OD.haptic('light');
    }
  }
  function hpos(h) {
    if (h.k === 'comet') return [h.x, h.y];
    if (h.o != null) return pos(h.o, h.a);
    return [cx, cy];
  }
  function mineArmed(h) {
    const beat = S.clock * OD.audio.bpm(world) / 60, b = Math.floor(beat), f = beat - b;
    return (b % 2 === 0 && f < 0.22) || (b % 2 === 1 && f > 0.9);
  }
  function addScore(x) { if (S.intro) return; S.score += x * S.scoreMul * S.traitMul * (S.p.double > 0 ? 2 : 1) * (1 + 0.08 * pv('spark')); }
  const MULT_CAP = 5, multCap = () => MULT_CAP + 0.5 * pv('ceiling');
  // Every good action nudges the multiplier up a little; it holds for a few seconds, then drains back toward x1.
  function addMult(a = 0.1) {
    S.mult = Math.min(multCap(), Math.round((S.mult + a) * 100) / 100);
    if (S.mult > S.stats.maxCombo) S.stats.maxCombo = S.mult;
    S.multT = 5;
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
    if (S.intro) return;
    if (pts) addScore(pts);
    if (S.feats.length < 3) S.feats.push({ str: clean(str), sub: clean(sub || ''), color: color || '#fff', t: 0, pts: pts || 0 });
  }
  const CHAIN_NAMES = ['', '', 'DOUBLE', 'TRIPLE', 'QUAD', 'PENTA', 'HEXA'];
  function onGraze(h, g) {
    if (g == null) g = 12 * u;
    S.stats.grazes++;
    const tier = g < 4 * u ? 2 : g < 10 * u ? 1 : 0;
    addMult([0.1, 0.15, 0.25][tier]);
    if (tier === 2) S.stats.razors++;
    const label = ['GRAZE', 'CLOSE CALL', 'RAZOR THIN'][tier], pts = Math.round([20, 35, 60][tier] * S.mult * (1 + 0.25 * perk('daredevil') + 0.2 * pv('razor')) * (S.p.prism > 0 ? 2 : 1));
    addScore(pts);
    const [x, y] = playerXY();
    text(label + ' +' + pts, x, y - 20 * u, tier === 0 ? world.accent2 : tier === 1 ? '#fff' : '#ffd95a', 15 + tier * 2);
    burst(x, y, 9 + tier * 5, 120 * u, tier === 2 ? '#ffd95a' : world.accent2, 2, 0.5);
    OD.audio.sfx('graze', S.mult + tier * 2); OD.haptic(tier ? 'medium' : 'light'); shake(2 + tier * 2);
    // several clean passes in a row pay a growing bonus
    S.chain = S.chainT > 0 ? S.chain + 1 : 1; S.chainT = 4.5;
    if (S.chain >= 2) {
      const bonus = 25 * S.chain * S.mult * (1 + [0, 0.3, 0.6, 1][pv('chain')]);
      feat(S.chain < CHAIN_NAMES.length ? CHAIN_NAMES[S.chain] : 'CHAIN ×' + S.chain, 'Clean passes in a row', '#ffd95a', bonus); addMult(0.1);
      OD.audio.sfx('power'); if (S.chain >= 4) shake(3);
    }
    if (S.od <= 0) {
      S.gm += [0.2, 0.28, 0.4][tier] * (1 + 0.1 * pv('zenith'));
      if (S.gm >= 1) startOverdrive();
    }
  }
  function startOverdrive() {
    S.odMax = 5 + pv('zenith'); S.od = S.odMax; S.gm = 0; S.stats.overdrives++;
    banner('NOVA', 'Smash through everything'); addMult(0.2);
    if (canUse('overdrive')) introduce('overdrive');
    OD.audio.sfx('overdrive'); OD.haptic('heavy'); shake(6); S.flash = 0.6;
    const [x, y] = playerXY();
    shockwave(x, y, '#fff', 200 * u, 0.7);
  }
  function perkGain(k, P) {
    const n = perk(k.type);
    if (n >= 3) { const pts = Math.round(150 * S.mult); addScore(pts); text(P.name.toUpperCase() + ' MAXED  +' + pts, k.x, k.y - 28 * u, P.color, 18); }
    else { S.perks[k.type] = n + 1; addMult(0.2); text(P.name.toUpperCase() + '  ' + (n + 1) + '/3', k.x, k.y - 28 * u, P.color, 20); }
    shockwave(k.x, k.y, P.color, 180 * u, 0.8);
  }
  function collect(k) {
    const [x, y] = playerXY();
    if (k.k === 'dust') {
      const fz = S.p.fortune > 0 ? 3 : 1;
      S.stats.dust += (fz > 1 ? 2 : 1) + (pv('veins') && Math.random() < 0.1 * pv('veins') ? 1 : 0);
      S.dustStreak = S.time - S.dustT < 0.9 ? S.dustStreak + 1 : 1; S.dustT = S.time;
      if (S.dustStreak > 0 && S.dustStreak % 5 === 0) addMult(0.1);
      if (S.dustStreak > 0 && S.dustStreak % 5 === 0) feat('STARDUST ×' + S.dustStreak, 'Sweep it up', '#ffe48a', 5 * S.dustStreak * S.mult);
      addScore(3 * S.mult * fz);
      S.multT = Math.max(S.multT, 2.2);
      OD.audio.sfx('dust', 7 + (S.stats.dust % 5) * 2);
      burst(k.x, k.y, 5, 90 * u, world.accent2, 2, 0.45);
      OD.haptic('light');
    } else {
      const P = OD.POWERS[k.type];
      S.stats.powerups++; addScore(25); addMult(0.1);
      if (S.time - S.powT < 6 && S.powT > 0) feat('POWER COMBO', 'Two power-ups close together', '#ff9ae6', 60 * S.mult);
      S.powT = S.time;
      introduce('cat_' + P.cat, true);
      if (P.cat === 'perk') perkGain(k, P);
      else if (k.type === 'shield') S.p.shield = true;
      else if (k.type === 'amp') { addMult(1.0); S.p.amp = P.dur * (1 + 0.15 * pv('fuse')); S.multT = P.dur; text('MULTIPLIER +1', k.x, k.y - 28 * u, P.color, 20); }
      else if (k.type === 'alchemy') {
        let n = 0;
        for (const h of S.hz) {
          if (h.dead || h.warn > 0 || h.k === 'hole' || h.k === 'beam' || h.k === 'ring') continue;
          const [hx, hy] = hpos(h);
          S.pk.push(h.o != null ? { k: 'dust', o: h.o, a: h.a, life: 9, t: 0, x: hx, y: hy, pull: false } : { k: 'dust', free: true, life: 7, t: 0, x: hx, y: hy, pull: false });
          burst(hx, hy, 10, 140 * u, P.color, 2.6, 0.8); h.dead = true; n++;
        }
        shockwave(k.x, k.y, P.color, 380 * u, 0.9); shake(5);
        text(n ? 'ALCHEMY ×' + n : 'ALCHEMY', k.x, k.y - 28 * u, P.color, 21);
      }
      else if (k.type === 'boost') { S.p.boostJ = Math.min(6, S.p.boostJ + 3); text('BOOSTED JUMPS ×' + S.p.boostJ, k.x, k.y - 28 * u, P.color, 20); }
      else if (k.type === 'jackpot') {
        for (let o = 0; o < 3; o++) for (let i = 0; i < 10; i++) S.pk.push({ k: 'dust', o, a: i * TAU / 10 + o * 0.35, life: 9, t: 0, x: 0, y: 0, pull: false });
        const pts = Math.round(200 * S.mult); addScore(pts); shockwave(k.x, k.y, P.color, 400 * u, 1); shake(4);
        text('JACKPOT +' + pts, k.x, k.y - 28 * u, P.color, 22);
      }
      else if (k.type === 'pulse') {
        let n = 0;
        for (const h of S.hz) {
          if (h.dead || h.warn > 0 || h.k === 'hole' || h.k === 'beam' || h.k === 'ring') continue;
          const [hx, hy] = hpos(h);
          if (Math.hypot(hx - x, hy - y) < 260 * u) { destroy(h, true); n++; }
        }
        shockwave(x, y, P.color, 300 * u, 0.8); shockwave(x, y, '#ffffff', 190 * u, 0.55); shake(5);
        text(n ? 'PULSE ×' + n : 'PULSE', k.x, k.y - 28 * u, P.color, 21);
      }
      else if (k.type === 'life') { S.lives = Math.min(3 + (pv('bulwark') >= 2 ? 1 : 0), S.lives + 1); text('+1 LIFE', k.x, k.y - 28 * u, OD.POWERS.life.color, 21); }
      else if (k.type === 'zap') { S.p.zap = Math.min(4, S.p.zap + 2); text('GUARDIAN  ×' + S.p.zap, k.x, k.y - 28 * u, OD.POWERS.zap.color, 20); }
      else if (k.type === 'overload') { startOverdrive(); S.od = S.odMax = 6.5; }
      else if (k.type === 'bomb') {
        let n = 0;
        for (const h of S.hz) if (!h.dead && h.warn <= 0 && h.k !== 'hole') { const [hx, hy] = hpos(h); burst(hx, hy, 8, 160 * u, '#ff9a3d', 2.6, 0.7); h.dead = true; n++; }
        addScore(10 * n * S.mult); shockwave(k.x, k.y, '#ff9a3d', 420 * u, 0.9); shake(8); S.flash = Math.max(S.flash, 0.5);
        if (n) text('BOOM  ×' + n, k.x, k.y - 28 * u, '#ffb36b', 22);
      } else S.p[k.type] = P.dur * (1 + 0.15 * pv('fuse'));
      if (k.type === 'leap' || k.type === 'reaper') text(P.name.toUpperCase(), x, y - 26 * u, P.color, 20); else if (k.type !== 'amp' && k.type !== 'alchemy' && P.cat !== 'perk' && k.type !== 'boost' && k.type !== 'jackpot' && k.type !== 'pulse') text(P.name.toUpperCase(), x, y - 26 * u, P.color, 20);
      shockwave(k.x, k.y, P.color, 110 * u, 0.55); setTimeout(() => { if (S) shockwave(k.x, k.y, '#ffffff', 70 * u, 0.4); }, 90);
      burst(k.x, k.y, 26, 200 * u, P.color, 3, 0.8); burst(k.x, k.y, 10, 120 * u, '#ffffff', 2, 0.6);
      OD.audio.sfx('power'); OD.haptic('medium');
    }
    k.dead = true;
  }

  function collideAll(dt) {
    const p = S.p, [px, py] = playerXY();
    const pr = 4.6 * u, gz = (18 + 5 * perk('daredevil') + 2 * pv('razor') + (p.prism > 0 ? 14 : 0)) * u;
    const safe = S.od > 0 || p.phase > 0 || S.mode === 'zen' || p.inv > 0 || S.dying > 0;
    p.holeSlow = 1;
    const jumping = p.jump && p.jump.t / p.jump.dur;
    for (const h of S.hz) {
      if (h.dead || h.warn > 0) continue;
      let d = null;
      switch (h.k) {
        case 'rock': { const [x, y] = hpos(h); d = Math.hypot(px - x, py - y) - (h.s * 0.82 + pr); break; }
        case 'comet': d = Math.hypot(px - h.x, py - h.y) - (6.5 * u + pr); break;
        case 'spinner': {
          const [x, y] = hpos(h), ax = Math.cos(h.rot) * h.len, ay = Math.sin(h.rot) * h.len;
          const vx = px - x, vy = py - y, t = clamp((vx * ax + vy * ay) / (ax * ax + ay * ay), -1, 1);
          d = Math.hypot(vx - ax * t, vy - ay * t) - (3.6 * u + pr); break;
        }
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
        if (S.od > 0) { if (h.k === 'rock' || h.k === 'comet' || h.k === 'mine' || h.k === 'spinner') destroy(h); }
        else if (safe) { /* ghosting through */ }
        else if (!absorb(h)) die(h);
      } else if (h.k !== 'hole' && !safe) {
        const g = trackGraze(h, d, gz);
        if (g >= 0) onGraze(h, g);
      }
    }
    if (p.reaper > 0) {   // anything destroyable that touches the aura is destroyed
      for (const h of S.hz) {
        if (h.dead || h.warn > 0 || (h.k !== 'rock' && h.k !== 'comet' && h.k !== 'mine' && h.k !== 'spinner')) continue;
        const [hx, hy] = hpos(h);
        if (Math.hypot(hx - px, hy - py) < (h.k === 'spinner' ? 62 : 46) * u) { destroy(h, true); addMult(0.05); }
      }
    }
    evtCollide(px, py, pr, gz);
    // pickups
    for (const k of S.pk) {
      if (k.dead) continue;
      const dist = Math.hypot(px - k.x, py - k.y);
      if (k.k === 'dust' && ((p.magnet > 0 && dist < 150 * u) || (perk('sense') && dist < (24 + 24 * perk('sense')) * u) || (pv('pull') && dist < [0, 38, 66, 96][pv('pull')] * u))) k.pull = true;
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

    applyBreath();
    // camera: pull back when a second planet or a big event is on screen
    {
      let tz = 1, ty = 0;
      const v = S.vis, ev = S.evt;
      if (v) { const pres = visPresence(v); tz = 1 - 0.22 * pres; ty = v.side * v.D * 0.5 * pres; }
      if (ev) { if (ev.type === 'nova') tz = Math.min(tz, 0.88); else if (ev.type === 'hole' || ev.type === 'giant') tz = Math.min(tz, 1 - 0.1 * ev.ramp); }
      S.camZ += (tz - S.camZ) * Math.min(1, dt * 2.5); S.camY += (ty - S.camY) * Math.min(1, dt * 2.5);
    }
    // time scale
    let tsT = 1;
    if (S.vis && S.vis.phase === 'settle') tsT = 0.62;   // slow, cinematic move to the new planet
    if (S.dying) tsT = 0.22;
    else {
      if (p.charging) tsT = p.ct > 2.5 ? 1 : (p.dragging ? 0.4 : 0.55) * (1 - 0.09 * pv('steady'));   // aiming slows time, but not forever
      if (p.slow > 0) tsT *= 0.62;
      if (S.intro) { tsT = 0.05; S.intro.t += dt; if (S.intro.t > 14) endIntro(); }
    }
    if (S.rampT > 0) S.rampT -= dt;
    S.ts += (tsT - S.ts) * Math.min(1, dt * (S.intro ? 12 : S.rampT > 0 ? 3.2 : 12));
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
        }
      }
      if (S.tut >= 0) { if (S.tut === 2) S.tutT += dt; tutorialTick(); }
      directorTick();
      if (S.tut < 0) {
        S.era.mix = Math.min(1, S.era.mix + dt / 2.5);
        S.tintA += ((S.era.id === 'genesis' || S.mode === 'zen' ? 0 : 0.11) - S.tintA) * Math.min(1, dt * 1.5);
        if (eraIs('storm')) {
          S.nextBolt -= dt;
          if (S.nextBolt <= 0) { S.nextBolt = rand(4, 8); S.flash = Math.max(S.flash, 0.45); shake(2); OD.audio.sfx('warn'); }
        }
      }
      if (S.mode !== 'zen' && S.tut < 0) {
        const L = levelFor(S.time);
        if (L > S.level) {
          S.level = L;
          feat('LEVEL ' + (L + 1), 'Speed up', '#fff', 50 * L);
          OD.audio.sfx('power'); OD.haptic('medium'); shake(2);
        }
        S.spd += (speedFor(S.level, S.mode) * modSpeed() - S.spd) * Math.min(1, dt * 0.8);
        if (S.time >= S.nextTick) {                         // small reward for every stretch survived
          const sec = Math.round(S.nextTick);
          feat(sec + ' SECONDS', 'Still flying', '#9fe6ff', 25 * Math.ceil(sec / 15));
          S.nextTick += S.nextTick < 60 ? 15 : 30;
        }
      }
      if (!S.steerTip && S.time > 6 && S.tut < 0 && !S.evt && !S.vis && canUse(aim() === 'drag' ? 'steer' : 'sling')) { S.steerTip = true; introduce(aim() === 'drag' ? 'steer' : 'sling'); }
      visTick(dt);
      evtTick(dt, gdt);
      S.chainT -= dt; if (S.chainT <= 0) S.chain = 0;
      if (S.clutchT > 0) S.clutchT -= dt;
      if (S.feats.length) { S.feats[0].t += dt; if (S.feats[0].t > 1.6) S.feats.shift(); }

      // power timers
      for (const k of TIMED) if (p[k] > 0) p[k] = Math.max(0, p[k] - dt);
      if (p.inv > 0) p.inv -= dt;
      if (S.hullCd > 0) { S.hullCd -= dt; if (S.hullCd <= 0) { S.hullCd = 0; if (!p.shield) { p.shield = true; const [sx, sy] = playerXY(); shockwave(sx, sy, OD.POWERS.shield.color, 120 * u, 0.6); text('SHIELD READY', sx, sy - 26 * u, OD.POWERS.shield.color, 16); OD.audio.sfx('power'); } } }
      if (p.boost > 0) p.boost = Math.max(0, p.boost - dt);
      if (S.od > 0) { S.od -= dt; if (S.od <= 0) { S.od = 0; OD.audio.setIntensity(Math.min(3, Math.floor((S.mult - 1) * 1.2))); } }
      if (S.multT > 0) S.multT -= dt; else if (S.mult > 1 && !(S.p.amp > 0)) S.mult = Math.max(1, S.mult - dt * 0.15 * (1 - 0.25 * perk('momentum')) * (1 - [0, 0.2, 0.35, 0.5][pv('hang')]));

      // score
      const rate = (6 + 10 * lv()) * S.mult * (S.od > 0 ? 2 : 1) * (S.mode === 'hardcore' ? 2 : 1);
      if (S.mode !== 'zen' && S.tut < 0) addScore(rate * dt);
      if (p.o === 0 && !p.jump && p.body === 'main') S.stats.innerTime += dt;
      if (S.mode === 'zen') S.calm += dt;
    }

    // player motion
    if (!p.dead) {
      p.vd += (p.dir - p.vd) * Math.min(1, dt * (eraIs('frozen') ? 7 : 80));
      const surge = eraIs('storm') ? 1 + 0.15 * Math.sin(S.clock * 1.1) * Math.min(1, S.era.mix) : 1;
      const v = base * 0.62 * speedMul() * surge * (p.brake > 0 ? 0.55 : 1) * (1 + 0.55 * Math.min(1, p.boost)) * p.holeSlow * (S.od > 0 ? 1.12 : 1);
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
        const dth = p.vd * (v / S.vis.rho) * gdt; p.th2 += dth; S.vis.lap += Math.abs(dth);
        p.wx = S.vis.x + Math.cos(p.th2) * S.vis.rho; p.wy = S.vis.y + Math.sin(p.th2) * S.vis.rho;
      } else {
        if (p.jump) {
          const j = p.jump;
          j.t += gdt;
          const k = clamp(j.t / j.dur, 0, 1);
          p.r = lerp(j.from, R[j.n], smooth(k));
          if (k >= 1) { p.o = j.n; p.r = R[p.o]; p.jump = null; S.lastLand = S.time; if (j.near) trick('dodgej', 'DODGE JUMP', 14, '#ffe48a'); }
        }
        if (!p.jump) p.r = R[p.o];
        p.th += p.vd * (v / p.r) * gdt;
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
        else if (tr === 'stardust') particle(x + rand(-3, 3), y + rand(-3, 3), rand(-14, 14), rand(-14, 14), 0.9, rand(1, 2.2), '#fff2b0', { drag: 0.6 });
        else if (tr === 'plasma') particle(x, y, rand(-30, 30), rand(-30, 30), 0.4, rand(2, 3.5), Math.random() < 0.5 ? '#ff6ad5' : '#ffffff', { drag: 2 });
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
      else if (h.w) h.a += h.w * gdt * (0.55 + 0.45 * S.spd) * (eraIs('frozen') ? 0.6 : 1);
      if (h.k === 'rock') h.rot += gdt * 1.3;
      else if (h.k === 'spinner') h.rot += h.rv * gdt;
      if (h.life <= 0) h.dead = true;
    }
    // pickups
    for (const k of S.pk) {
      k.t += gdt; k.life -= gdt;
      if (k.k === 'power') {
        k.a += k.w * gdt;
        if (!S.intro && Math.random() < 0.28 * fxScale()) {
          const col = OD.POWERS[k.type].color, a = Math.random() * TAU;
          if (k.type === 'magnet') particle(k.x + Math.cos(a) * 30 * u, k.y + Math.sin(a) * 30 * u, -Math.cos(a) * 50 * u, -Math.sin(a) * 50 * u, 0.6, 1.6, col, { drag: 0 });
          else if (k.type === 'amp' || k.type === 'leap') particle(k.x + rand(-8, 8) * u, k.y, rand(-6, 6), (k.type === 'amp' ? -1 : -0.6) * rand(30, 60) * u, 0.8, rand(1.2, 2.2), col, { drag: 0.6 });
          else if (k.type === 'alchemy') particle(k.x + Math.cos(a) * 14 * u, k.y + Math.sin(a) * 14 * u, Math.cos(a) * 24 * u, Math.sin(a) * 24 * u, 0.9, 2, OD.hsl(Math.random() * 360, 100, 66), { sq: true });
          else particle(k.x + Math.cos(a) * 14 * u, k.y + Math.sin(a) * 14 * u, Math.cos(a) * 22 * u, Math.sin(a) * 22 * u, 0.9, rand(1.2, 2.4), col, { drag: 1.2 });
        }
      }
      const [bx, by] = k.free ? [k.x, k.y] : k.vis ? (S.vis ? [S.vis.x + Math.cos(k.a) * S.vis.R[k.ri == null ? 2 : k.ri], S.vis.y + Math.sin(k.a) * S.vis.R[k.ri == null ? 2 : k.ri]] : [k.x, k.y]) : pos(k.o, k.a);
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
    if (!S.dying && !S.over && !p.dead && !S.intro) collideAll(dt);

    // things that die linger for a moment (still moving, no longer dangerous) while they fade out
    for (const h of S.hz) if (h.dead) h.fo = (h.fo || 0) + dt;
    for (const k of S.pk) if (k.dead) k.fo = (k.fo || 0) + dt;
    S.hz = S.hz.filter(h => !h.dead || h.fo < FADE_OUT);
    S.pk = S.pk.filter(k => !k.dead || k.fo < FADE_OUT);

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
    S.bass = OD.audio.level();
    if (S.bannerT > 0) S.bannerT -= dt;
    if (S.feats.length && S.dying) S.feats.length = 0;
    if (S.beams.length) { for (const b of S.beams) b.t += dt; S.beams = S.beams.filter(b => b.t < 0.3); }
    S.dispScore += (S.score - S.dispScore) * Math.min(1, dt * 12);

    // audio intensity follows the combo
    if (!S.dying && S.od <= 0 && S.mode !== 'zen') OD.audio.setIntensity(Math.min(3, Math.max((S.dir.boss || S.evt || (S.vis && S.vis.phase === 'settle')) ? 2 : 0, Math.floor((S.mult - 1) * 1.2))));
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
    OD.audio.stopMusic(); OD.audio.fxStop('blackhole', 0.5); OD.audio.fxStop('boss', 0.5);
    stopRecording(false);
    const sv = OD.save, st = sv.stats, rs = S.stats;
    const score = Math.floor(S.score);
    const before = OD.WORLDS.map((w, i) => OD.worldUnlocked(i));
    const res = {
      reason, mode: S.mode, world: world.id, score, time: Math.max(0, S.time - S.introTotal), demo: S.demo, cause: S.endCause,
      grazes: rs.grazes, perfects: rs.perfects, innerTime: rs.innerTime, maxCombo: rs.maxCombo, dust: rs.dust, jumps: rs.jumps,
      newBest: false, best: 0, stardust: 0, newAch: [], worldUnlocked: -1, dailyInfo: null, bonus: 0,
    };
    // stardust
    let sd = rs.dust + Math.floor(score / 150);
    if (S.mode === 'zen') sd = rs.dust + Math.floor(S.calm / 12);
    sd = Math.round(sd * (1 + 0.1 * pv('prospect') + (S.dustBonus || 0)));
    if (pv('windfall') && score > 500) sd += [0, 25, 50, 100][pv('windfall')];
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
          res.bonus = Math.round((25 + Math.min(d.streak, 7) * 5) * (1 + 0.2 * perkLvl('scholar'))); sd += res.bonus;
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

  const perkLvl = id => OD.perkLevel(id);
  function checkChallenges(run) {
    const sv = OD.save, done = [];
    for (const c of OD.CHALLENGES) {
      if (sv.ach[c.id]) continue;
      let ok = false;
      try { ok = !!c.test(sv.stats, run, sv); } catch (e) { ok = false; }
      if (ok) { sv.ach[c.id] = Date.now(); c.paid = Math.round(c.reward * (1 + 0.2 * perkLvl('scholar'))); sv.stardust += c.paid; done.push(c); }
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
  function drawVis(v, eligible, charging, target) {
    ctx.save();
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = OD.rgba(v.skinColor, i === 2 ? 0.4 : 0.2); ctx.lineWidth = i === 2 ? 1.8 : 1.2;
      ctx.beginPath(); ctx.arc(v.x, v.y, v.R[i], 0, TAU); ctx.stroke();
    }
    if (v.phase === 'pass') {   // the outer ring glows gold when a jump across is possible
      ctx.setLineDash([6 * u, 8 * u]); ctx.lineDashOffset = -tAnim * 40;
      ctx.strokeStyle = eligible ? `rgba(255,217,90,${charging ? 0.95 : 0.6 + 0.25 * Math.sin(tAnim * 8)})` : 'rgba(255,255,255,0.14)';
      ctx.lineWidth = eligible ? (charging ? 3.2 : 2.2) : 1.2;
      ctx.beginPath(); ctx.arc(v.x, v.y, v.rho, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
    G.drawPlanet(ctx, v.x, v.y, v.rad, v.skin, tAnim * 1.3, v.skinColor, dpr, OD.save.equipped.aura);
    if (v.phase === 'pass') {      // label so the choice is informed
      ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = v.skinColor;
      const ly = v.y + v.rad * 1.6 + 14 * u;
      ctx.font = `800 ${11 * u}px Outfit, system-ui, sans-serif`; ctx.letterSpacing = '2px'; ctx.globalAlpha = 0.95;
      ctx.fillText(v.type.name, v.x, ly); ctx.letterSpacing = '0px';
      if (v.type.bonus) { ctx.globalAlpha = 0.75; ctx.fillStyle = '#fff'; ctx.font = `500 ${9.5 * u}px Outfit, system-ui, sans-serif`; ctx.fillText(v.type.bonus, v.x, ly + 13 * u); }
      ctx.restore();
    }
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
        ctx.beginPath(); ctx.rect(-W, -H, W * 3, H * 3); path(); ctx.clip('evenodd');   // the wave cannot enter the shadow
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
      G.drawOrbitRing(ctx, cx, cy, R[i], OD.save.equipped.orbit, tAnim, world.accent, a + (S && state !== 'menu' ? 0.1 * S.beatPulse : 0), u);
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
    if (warn && h.dead) return;
    const fm = (warn ? 1 : OD.smooth(clamp((h.t - h.warn0) / 0.45, 0, 1))) * (h.dead ? 1 - OD.smooth(clamp((h.fo || 0) / FADE_OUT, 0, 1)) : 1);
    if (fm < 0.01) return;
    const prog = warn ? 1 - h.warn / h.warn0 : 1;
    const fadeOut = lifeFade(h);
    switch (h.k) {
      case 'rock': {
        const [x, y] = hpos(h);
        if (warn) { ringPulse(x, y, h.s * (3.2 - 2.2 * prog), dc, 0.3 + 0.6 * prog); break; }
        const sc = Math.min(1, h.t / 0.2 + 0.2);
        G.drawDebris(ctx, h.style, x, y, h.s * sc, h.rot, dc, h.shape, (S.mode === 'zen' ? 0.4 : fadeOut) * fm);
        break;
      }
      case 'mine': {
        const [x, y] = hpos(h);
        if (warn) { ringPulse(x, y, 20 * u * (1.5 - 0.5 * prog), dc, 0.3 + 0.6 * prog); break; }
        const armed = mineArmed(h), beat = S.clock * OD.audio.bpm(world) / 60, f = beat - Math.floor(beat);
        const near = (Math.floor(beat) % 2 === 1 && f > 0.55) || armed;
        ctx.save(); ctx.globalAlpha = fm * (fadeOut);
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
      case 'spinner': {
        const [x, y] = hpos(h);
        if (warn) { ringPulse(x, y, h.len * (1.6 - 0.6 * prog), dc, 0.3 + 0.6 * prog); break; }
        ctx.save(); ctx.globalAlpha = fm * (fadeOut); ctx.translate(x, y); ctx.rotate(h.rot); ctx.lineCap = 'round';
        ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = OD.rgba(dc, 0.4); ctx.lineWidth = 15 * u; ctx.beginPath(); ctx.moveTo(-h.len, 0); ctx.lineTo(h.len, 0); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = dc; ctx.lineWidth = 6.5 * u; ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * u; ctx.stroke();
        ctx.fillStyle = '#12060c'; ctx.strokeStyle = dc; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 6 * u, 0, TAU); ctx.fill(); ctx.stroke();
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
          ctx.globalAlpha = fm * (0.25 + 0.5 * prog); ctx.setLineDash([8 * u, 8 * u]); ctx.lineDashOffset = -tAnim * 30;
          ctx.strokeStyle = dc; ctx.lineWidth = 2 + prog * 3;
          ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
          ctx.setLineDash([]); ctx.strokeStyle = world.accent2; ctx.lineWidth = 2;
          ctx.globalAlpha = fm * (0.5 + 0.5 * Math.sin(tAnim * 14));
          ctx.beginPath(); ctx.arc(cx, cy, r, h.a - h.g, h.a + h.g); ctx.stroke();
        } else {
          ctx.globalAlpha = fm * (fadeOut);
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
          ctx.globalAlpha = fm * ((0.2 + 0.7 * prog) * (Math.sin(tAnim * 30) > -0.3 ? 1 : 0.3));
          ctx.strokeStyle = dc; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(cx + c * r0, cy + s * r0); ctx.lineTo(cx + c * r1, cy + s * r1); ctx.stroke();
        } else {
          ctx.globalAlpha = fm * (fadeOut); ctx.globalCompositeOperation = 'lighter';
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
        ctx.save(); ctx.globalAlpha = fm * (fadeOut);
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

  // Power-up pickups: pulsing glow, orbiting sparks, an expanding ripple and a few touches unique to each type.
  function drawPowerPickup(k) {
    const P = OD.POWERS[k.type], col = P.color, x = k.x, y = k.y, t = tAnim + k.a * 3;
    const beat = S ? Math.max(S.beatPulse, S.bass || 0) : 0;
    const pulse = 1 + 0.1 * Math.sin(t * 5) + 0.12 * beat + (k.type === 'life' ? 0.14 * Math.pow(Math.max(0, Math.sin(t * 8)), 3) : 0);
    const hue = k.type === 'alchemy' ? OD.hsl((t * 90) % 360, 100, 66) : null;
    const c2 = hue || col;
    ctx.save();
    // expanding ripple
    const q = (t * 0.7) % 1;
    ctx.strokeStyle = OD.rgba(col, 0.5 * (1 - q)); ctx.lineWidth = 2 * (1 - q) + 0.6;
    ctx.beginPath(); ctx.arc(x, y, (14 + 26 * q) * u, 0, TAU); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    G.glow(ctx, x, y, 36 * u * pulse, col, 0.95);
    // sparks orbiting the pickup
    const n = k.type === 'overload' ? 8 : 5, spin = k.type === 'slow' ? 1.0 : k.type === 'brake' ? 0.6 : 2.4;
    for (let i = 0; i < n; i++) {
      const a = t * spin * (k.type === 'reaper' ? -1 : 1) + i * TAU / n, r = (20 + 3 * Math.sin(t * 3 + i)) * u;
      G.glow(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r, 6.5 * u, k.type === 'overload' ? OD.hsl((i * 45 + t * 120) % 360, 100, 65) : c2, 0.95);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(8,10,24,0.88)'; ctx.beginPath(); ctx.arc(x, y, 13 * u * (1 + 0.03 * Math.sin(t * 5)), 0, TAU); ctx.fill();
    ctx.strokeStyle = c2; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(x, y, 13 * u, 0, TAU); ctx.stroke();
    // each category has its own outline so you can tell a timed bonus from a charge, an instant or a perk at a glance
    ctx.save(); ctx.strokeStyle = OD.rgba(c2, 0.85); ctx.lineWidth = 1.6; ctx.translate(x, y);
    if (P.cat === 'charge') { ctx.rotate(Math.PI / 4 + Math.sin(t * 1.5) * 0.08); const s = 17 * u; ctx.strokeRect(-s / 2, -s / 2, s, s); }
    else if (P.cat === 'instant') { for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + t * 0.9, r0 = 17 * u, r1 = (21 + 4 * Math.sin(t * 6 + i)) * u; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.stroke(); } }
    else if (P.cat === 'perk') { ctx.rotate(t * 0.5); for (const rr of [18 * u, 22 * u]) { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i * TAU / 6; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.globalAlpha = rr > 20 * u ? 0.4 : 1; ctx.stroke(); } }
    ctx.restore();
    switch (k.type) {
      case 'shield': ctx.strokeStyle = OD.rgba(col, 0.7); ctx.lineWidth = 1.4; ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = t * 0.8 + i * TAU / 6; ctx.lineTo(x + Math.cos(a) * 17 * u, y + Math.sin(a) * 17 * u); } ctx.closePath(); ctx.stroke(); break;
      case 'slow': { const a = t * 3; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 12 * u, y + Math.sin(a) * 12 * u); ctx.stroke(); break; }
      case 'phase': ctx.globalAlpha *= 0.55 + 0.45 * (Math.sin(t * 17) > 0 ? 1 : 0.4); ctx.setLineDash([3 * u, 3 * u]); ctx.lineDashOffset = -t * 20; ctx.beginPath(); ctx.arc(x, y, 17 * u, 0, TAU); ctx.stroke(); ctx.setLineDash([]); break;
      case 'bomb': { const a = t * 6; G.glow(ctx, x + 6 * u, y - 8 * u, (7 + 3 * Math.sin(a * 2)) * u, '#ffd24d', 1); break; }
      case 'zap': { const rr = OD.makeRng(Math.floor(t * 14) * 7 + 3); ctx.strokeStyle = '#eaffb0'; ctx.lineWidth = 1.4; for (let i = 0; i < 3; i++) { let a = rr() * TAU, px = x + Math.cos(a) * 14 * u, py = y + Math.sin(a) * 14 * u; ctx.beginPath(); ctx.moveTo(px, py); for (let j = 0; j < 3; j++) { a += (rr() - 0.5) * 1.2; px += Math.cos(a) * 5 * u; py += Math.sin(a) * 5 * u; ctx.lineTo(px, py); } ctx.stroke(); } break; }
      case 'magnet': for (let i = 0; i < 3; i++) { const qq = (t * 0.9 + i / 3) % 1, a = i * 2.1 + t * 0.5; ctx.fillStyle = OD.rgba(col, 0.9 * qq); ctx.beginPath(); ctx.arc(x + Math.cos(a) * (28 - 18 * qq) * u, y + Math.sin(a) * (28 - 18 * qq) * u, 1.8 * u, 0, TAU); ctx.fill(); } break;
      case 'overload': ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = OD.rgba('#ffffff', 0.5); ctx.lineWidth = 1.2; for (let i = 0; i < 8; i++) { const a = t * 1.4 + i * TAU / 8; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 15 * u, y + Math.sin(a) * 15 * u); ctx.lineTo(x + Math.cos(a) * 25 * u, y + Math.sin(a) * 25 * u); ctx.stroke(); } break;
      case 'leap': for (let i = 0; i < 2; i++) { const qq = (t * 1.2 + i * 0.5) % 1; ctx.strokeStyle = OD.rgba(col, 0.9 * (1 - qq)); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 6 * u, y - (qq * 22 - 6) * u); ctx.lineTo(x, y - (qq * 22 - 12) * u); ctx.lineTo(x + 6 * u, y - (qq * 22 - 6) * u); ctx.stroke(); } break;
      case 'reaper': ctx.strokeStyle = OD.rgba(col, 0.8); ctx.lineWidth = 1.6; for (let i = 0; i < 3; i++) { const a = -t * 2.2 + i * TAU / 3; ctx.beginPath(); ctx.arc(x, y, 18 * u, a, a + 0.7); ctx.stroke(); } break;
      case 'amp': for (let i = 0; i < 3; i++) { const qq = (t * 0.9 + i / 3) % 1; ctx.fillStyle = OD.rgba(col, 0.9 * (1 - qq)); ctx.fillRect(x + (i - 1) * 7 * u - 1, y - (8 + 22 * qq) * u, 2, 4 * u); } break;
      default:
    }
    ctx.restore();
    ctx.save();
    drawPowerIcon(ctx, k.type, x, y, 10 * u * (1 + 0.06 * Math.sin(t * 5)), c2);
    ctx.restore();
  }
  function drawPowerIcon(c, type, x, y, r, color) {
    c.save(); c.translate(x, y); c.strokeStyle = color; c.fillStyle = color; c.lineWidth = Math.max(1.5, r * 0.16); c.lineCap = 'round'; c.lineJoin = 'round';
    if (type === 'shield') { c.beginPath(); c.moveTo(0, -r * 0.7); c.lineTo(r * 0.6, -r * 0.35); c.lineTo(r * 0.5, r * 0.25); c.lineTo(0, r * 0.75); c.lineTo(-r * 0.5, r * 0.25); c.lineTo(-r * 0.6, -r * 0.35); c.closePath(); c.stroke(); }
    else if (type === 'slow') { c.beginPath(); c.arc(0, 0, r * 0.62, 0, TAU); c.moveTo(0, -r * 0.35); c.lineTo(0, 0); c.lineTo(r * 0.28, r * 0.2); c.stroke(); }
    else if (type === 'leap') { c.beginPath(); c.moveTo(-r * 0.55, r * 0.5); c.lineTo(0, -r * 0.05); c.lineTo(r * 0.55, r * 0.5); c.moveTo(-r * 0.55, -r * 0.1); c.lineTo(0, -r * 0.65); c.lineTo(r * 0.55, -r * 0.1); c.stroke(); }
    else if (type === 'reaper') { c.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, rr = (i % 2 ? 0.42 : 0.78) * r; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.stroke(); }
    else if (type === 'amp') { c.beginPath(); c.moveTo(0, -r * 0.7); c.lineTo(r * 0.5, -r * 0.05); c.lineTo(r * 0.18, -r * 0.05); c.lineTo(r * 0.18, r * 0.7); c.lineTo(-r * 0.18, r * 0.7); c.lineTo(-r * 0.18, -r * 0.05); c.lineTo(-r * 0.5, -r * 0.05); c.closePath(); c.fill(); }
    else if (type === 'alchemy') { c.beginPath(); c.moveTo(0, -r * 0.75); c.lineTo(r * 0.25, -r * 0.2); c.lineTo(r * 0.75, 0); c.lineTo(r * 0.25, r * 0.2); c.lineTo(0, r * 0.75); c.lineTo(-r * 0.25, r * 0.2); c.lineTo(-r * 0.75, 0); c.lineTo(-r * 0.25, -r * 0.2); c.closePath(); c.fill(); }
    else if (type === 'life') { c.beginPath(); c.moveTo(0, r * 0.62); c.bezierCurveTo(-r * 1.0, -r * 0.1, -r * 0.55, -r * 0.8, 0, -r * 0.3); c.bezierCurveTo(r * 0.55, -r * 0.8, r * 1.0, -r * 0.1, 0, r * 0.62); c.fill(); }
    else if (type === 'zap') { c.beginPath(); c.moveTo(r * 0.2, -r * 0.8); c.lineTo(-r * 0.45, r * 0.1); c.lineTo(0, r * 0.1); c.lineTo(-r * 0.2, r * 0.8); c.lineTo(r * 0.5, -r * 0.15); c.lineTo(0.02 * r, -r * 0.15); c.closePath(); c.fill(); }
    else if (type === 'brake') { c.beginPath(); c.arc(0, 0, r * 0.62, 0, TAU); c.moveTo(-r * 0.32, 0); c.lineTo(r * 0.32, 0); c.stroke(); }
    else if (type === 'overload') { c.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, rr = (i % 2 ? 0.28 : 0.78) * r; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill(); }
    else if (type === 'bomb') { c.beginPath(); c.arc(0, r * 0.12, r * 0.5, 0, TAU); c.stroke(); c.beginPath(); c.moveTo(r * 0.3, -r * 0.3); c.lineTo(r * 0.55, -r * 0.62); c.stroke(); c.beginPath(); c.arc(r * 0.6, -r * 0.7, r * 0.12, 0, TAU); c.fill(); }
    else if (type === 'double') { c.font = `800 ${r * 1.15}px Outfit, system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('×2', 0, r * 0.05); }
    else if (type === 'magnet') { c.beginPath(); c.arc(0, -r * 0.05, r * 0.52, Math.PI, 0); c.lineTo(r * 0.52, r * 0.55); c.moveTo(-r * 0.52, -r * 0.05); c.lineTo(-r * 0.52, r * 0.55); c.stroke(); }
    else if (type === 'prism') { c.beginPath(); c.moveTo(0, -r * 0.72); c.lineTo(r * 0.66, r * 0.5); c.lineTo(-r * 0.66, r * 0.5); c.closePath(); c.stroke(); c.beginPath(); c.moveTo(-r * 0.9, r * 0.05); c.lineTo(-r * 0.25, r * 0.05); c.moveTo(r * 0.25, -r * 0.05); c.lineTo(r * 0.9, -r * 0.3); c.moveTo(r * 0.28, 0.1 * r); c.lineTo(r * 0.9, r * 0.2); c.stroke(); }
    else if (type === 'fortune') { c.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU - Math.PI / 2, rr = (i % 2 ? 0.26 : 0.78) * r; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill(); }
    else if (type === 'boost') { for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(0, 0, r * (0.28 + i * 0.22), -0.9, 0.9); c.stroke(); } c.beginPath(); c.arc(-r * 0.5, 0, r * 0.1, 0, TAU); c.fill(); }
    else if (type === 'jackpot') { c.font = `800 ${r * 1.2}px Outfit, system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('$', 0, r * 0.06); }
    else if (type === 'pulse') { for (let i = 0; i < 2; i++) { c.beginPath(); c.arc(0, 0, r * (0.28 + i * 0.36), 0, TAU); c.stroke(); } c.beginPath(); c.arc(0, 0, r * 0.1, 0, TAU); c.fill(); }
    else if (type === 'calm') { c.beginPath(); c.arc(0, 0, r * 0.62, 0, TAU); c.stroke(); c.beginPath(); c.arc(r * 0.62, 0, r * 0.14, 0, TAU); c.fill(); }
    else if (type === 'sense') { c.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, rr = (i % 2 ? 0.2 : 0.5) * r; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill(); c.beginPath(); c.arc(0, 0, r * 0.82, 0.3, 1.9); c.stroke(); c.beginPath(); c.arc(0, 0, r * 0.82, 3.4, 5.0); c.stroke(); }
    else if (type === 'daredevil') { c.beginPath(); c.arc(-r * 0.3, 0, r * 0.4, 0, TAU); c.stroke(); c.beginPath(); c.moveTo(r * 0.15, -r * 0.55); c.lineTo(r * 0.7, 0); c.lineTo(r * 0.15, r * 0.55); c.stroke(); }
    else if (type === 'lucky_star') { c.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, rr = (i % 2 ? 0.34 : 0.8) * r; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.stroke(); }
    else if (type === 'momentum') { c.beginPath(); c.moveTo(-r * 0.7, r * 0.4); c.lineTo(-r * 0.1, -r * 0.1); c.lineTo(-r * 0.1, r * 0.4); c.lineTo(r * 0.5, -r * 0.2); c.lineTo(r * 0.5, r * 0.4); c.stroke(); c.beginPath(); c.moveTo(-r * 0.7, -r * 0.5); c.lineTo(r * 0.7, -r * 0.5); c.stroke(); }
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
    if (ghost) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 4.6 * u, 0, TAU); ctx.fill(); }
    else {
      G.drawCore(ctx, x, y, u, OD.save.equipped.core, tAnim, world.accent);
      if (p.reaper > 0) { ctx.save(); ctx.setLineDash([5 * u, 5 * u]); ctx.lineDashOffset = -tAnim * 60; ctx.strokeStyle = OD.rgba(OD.POWERS.reaper.color, 0.8); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 46 * u, 0, TAU); ctx.stroke(); ctx.fillStyle = OD.rgba(OD.POWERS.reaper.color, 0.08); ctx.fill(); ctx.restore(); }
      if (p.leap > 0) { ctx.strokeStyle = OD.rgba(OD.POWERS.leap.color, 0.7); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, (15 + Math.sin(tAnim * 9) * 2) * u, 0, TAU); ctx.stroke(); }
      if (p.double > 0) { ctx.strokeStyle = OD.rgba('#ffe45a', 0.6); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 16 * u, 0, TAU); ctx.stroke(); }
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
    const r = 17 * u;
    ctx.save(); ctx.lineCap = 'round';
    ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    if (aim() === 'drag') {
      // gold ring drains over SNAP_T: let go before it empties for a quick-jump boost
      const left = Math.max(0, 1 - p.ct / SNAP_T);
      if (left > 0) { ctx.strokeStyle = left < 0.25 ? 'rgba(255,200,60,0.6)' : '#ffe48a'; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + left * TAU); ctx.stroke(); }
      else { ctx.strokeStyle = p.dragging ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); }
    } else {
      const k = Math.min(1, p.ct / PERFECT_B), a0 = -Math.PI / 2 + (PERFECT_A / PERFECT_B) * TAU, a1 = -Math.PI / 2 + TAU;
      const inWin = p.ct >= PERFECT_A && p.ct <= PERFECT_B;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.min(1, k) * TAU); ctx.stroke();
      ctx.strokeStyle = inWin ? '#ffe48a' : p.ct > PERFECT_B ? 'rgba(255,200,60,0.35)' : 'rgba(255,200,60,0.9)';
      ctx.lineWidth = inWin ? 6 : 4;
      ctx.beginPath(); ctx.arc(x, y, r, a0, a1); ctx.stroke();
      if (inWin) { ctx.globalCompositeOperation = 'lighter'; G.glow(ctx, x, y, 34 * u, '#ffd95a', 0.8); }
    }
    ctx.restore();
  }

  const ambient = G.makeStars(46, 77);
  // slow background life per world: aurora ribbons, rising embers, snow, drifting motes
  function drawAmbient() {
    if (!S && state === 'menu') { /* menu also shows ambience */ }
    const t = tAnim, id = world.amb;
    ctx.save();
    if (id === 'ribbons' || id === 'sparks') {
      ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 46; ctx.lineCap = 'round';
      for (let b = 0; b < 3; b++) {
        const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, OD.rgba(id === 'sparks' ? '#ff6ad5' : '#3dffb0', 0)); g.addColorStop(0.5, OD.rgba(id === 'sparks' ? '#7a5bff' : '#4df3ff', 0.07)); g.addColorStop(1, OD.rgba('#b36bff', 0));
        ctx.strokeStyle = g; ctx.beginPath();
        for (let x = -20; x <= W + 20; x += 24) { const y = H * (0.13 + b * 0.07) + Math.sin(x * 0.013 + t * 0.35 + b * 1.7) * 26 + Math.sin(x * 0.031 - t * 0.5) * 8; x < 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        ctx.stroke();
      }
    } else {
      const n = T().fx ? ambient.length : 18;
      for (let i = 0; i < n; i++) {
        const a = ambient[i];
        if (id === 'embers') { const y = H - ((a.y * H + t * (20 + a.z * 40)) % (H + 20)); const x = a.x * W + Math.sin(t * 0.8 + a.p) * 14; ctx.globalAlpha = 0.25 + 0.5 * a.z; ctx.fillStyle = a.s > 1.4 ? '#ffb347' : '#ff6a3d'; ctx.beginPath(); ctx.arc(x, y, 0.8 + a.s * 0.7, 0, TAU); ctx.fill(); }
        else if (id === 'snow') { const y = (a.y * H + t * (18 + a.z * 34)) % (H + 10); const x = a.x * W + Math.sin(t * 0.6 + a.p) * 18; ctx.globalAlpha = 0.25 + 0.4 * a.z; ctx.fillStyle = '#eaffff'; ctx.beginPath(); ctx.arc(x, y, 0.8 + a.s * 0.8, 0, TAU); ctx.fill(); }
        else if (id === 'motes') { const x = a.x * W + Math.sin(t * 0.15 + a.p) * 40, y = a.y * H + Math.cos(t * 0.12 + a.p) * 30, r = 2 + a.s * 2 + Math.sin(t + a.p) * 1; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.18 + 0.12 * Math.sin(t * 0.8 + a.p); G.glow(ctx, x, y, r * 6, a.s > 1.5 ? '#4dffb8' : '#c77dff', 1); }
        else { const x = a.x * W + Math.sin(t * 0.2 + a.p) * 30, y = (a.y * H - t * 6 * a.z + H * 4) % H; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.14; G.glow(ctx, x, y, 8 + a.s * 8, '#ffe9a8', 1); }
      }
    }
    ctx.restore();
  }
  // hyperspace streaks while the camera glides to the new planet
  function drawHopFx() {
    const v = S && S.vis;
    if (!v || v.phase !== 'settle') return;
    const q = clamp(v.st / 2.1, 0, 1), k = Math.sin(q * Math.PI);
    const dx = cx - v.sx, dy = cy - v.sy, d = Math.hypot(dx, dy) || 1, ux = -dx / d, uy = -dy / d;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const a of ambient) {
      const x = a.x * W, y = ((a.y + tAnim * 0.2 * a.z) % 1) * H, len = (40 + a.z * 150) * u * k;
      ctx.strokeStyle = OD.rgba(v.skinColor, 0.55 * k * a.z + 0.1 * k); ctx.lineWidth = 0.8 + a.z * 1.6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + ux * len, y + uy * len); ctx.stroke();
    }
    const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(W, H) * 0.7);
    g.addColorStop(0, OD.rgba(v.skinColor, 0.28 * k)); g.addColorStop(1, OD.rgba(v.skinColor, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  function drawFog() {
    if (!S || state === 'menu') return;
    const a = fogAmount() * 0.86;
    if (a < 0.02) return;
    const z = S.camZ, px = cx + (S.p.wx - cx) * z, py = cy + (S.p.wy - (cy + S.camY)) * z, r = 170 * u * z;
    const g = ctx.createRadialGradient(px, py, r * 0.3, px, py, r * 1.7);
    g.addColorStop(0, 'rgba(2,3,12,0)'); g.addColorStop(1, `rgba(2,3,12,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  function drawScene() {
    const bg = G.background(world, W, H);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0, cv.width, cv.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (S && state !== 'menu' && S.tintA > 0.005) { ctx.fillStyle = OD.rgba(S.era.id === 'genesis' ? world.accent : ERAS[S.era.id].tint, S.tintA); ctx.fillRect(0, 0, W, H); }
    drawAmbient();
    const sp = 1;   // the sky drifts on its own: it never reacts to the music
    G.drawSky(ctx, OD.save.equipped.sky, stars, W, H, tAnim, sp);
  }

  function drawWorld() {
    const inRun = S && state !== 'menu';
    const sh = inRun ? S.shake : 0;
    ctx.save();
    if (sh > 0.1) ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    if (inRun && (S.camZ < 0.999 || Math.abs(S.camY) > 0.5)) {   // camera zoom + pan
      ctx.translate(cx, cy); ctx.scale(S.camZ, S.camZ); ctx.translate(-cx, -(cy + S.camY));
    }
    const target = inRun && !S.p.dead && !S.over ? jumpTarget() : null;
    const cands = inRun && !S.p.dead && !S.over ? jumpCandidates() : null;
    const charging = inRun && S.p.charging;
    if (!(inRun && S.old)) drawOrbits(charging ? target : null);
    const pulse = inRun ? Math.max(S.beatPulse, S.bass || 0) : OD.audio.level() * 0.8;
    const pr = PR * (1 + pulse * 0.02);
    if (inRun && S.old) {   // the planet you left drifts away, orbits and all
      const q = OD.easeOut(clamp(S.old.t / 2.1, 0, 1)), k = 1 - 0.55 * q, ox = cx + S.old.vx * q * base * 1.2, oy = cy + S.old.vy * q * base * 1.2;
      ctx.save(); ctx.globalAlpha = 1 - 0.6 * q;
      for (let i = 0; i < 3; i++) G.drawOrbitRing(ctx, ox, oy, Rb[i] * k, OD.save.equipped.orbit, tAnim, world.accent, 0.2, u);
      ctx.restore();
      G.drawPlanet(ctx, ox, oy, pr * k, S.old.skin, tAnim, world.accent, dpr, OD.save.equipped.aura);
    } else G.drawPlanet(ctx, cx, cy, pr, (inRun && S.homeSkin) || baseSkin(), tAnim, world.accent, dpr, OD.save.equipped.aura);
    if (inRun && S.beatPulse > 0.05) {
      ctx.strokeStyle = OD.rgba(world.accent, 0.16 * S.beatPulse); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, pr * (1.4 + 2.6 * (1 - S.beatPulse)), 0, TAU); ctx.stroke();
    }
    if (inRun && S.vis) drawVis(S.vis, !!(cands && cands.vis), charging, target);
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
        const inQ = OD.smooth(clamp(k.t / 0.6, 0, 1)), lifeQ = k.life < 1 ? OD.smooth(clamp(k.life, 0, 1)) : 1, outQ = k.dead ? 1 - OD.smooth(clamp((k.fo || 0) / FADE_OUT, 0, 1)) : 1;
        const sc = (0.5 + 0.5 * inQ) * (k.dead ? 1 + 0.7 * (1 - outQ) : 0.75 + 0.25 * lifeQ);
        ctx.save(); ctx.globalAlpha = inQ * lifeQ * outQ; ctx.translate(k.x, k.y); ctx.scale(sc, sc); ctx.translate(-k.x, -k.y);
        if (k.k === 'dust') {
          ctx.globalCompositeOperation = 'lighter';
          G.glow(ctx, k.x, k.y, 14 * u, '#ffe48a', 0.9);
          ctx.globalCompositeOperation = 'source-over';
          ctx.translate(k.x, k.y); ctx.rotate(k.t * 2 + k.a);
          ctx.fillStyle = '#fff6c8'; ctx.beginPath();
          for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, r = (i % 2 ? 1.6 : 4.4) * u; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
          ctx.closePath(); ctx.fill();
        } else {
          drawPowerPickup(k);
        }
        ctx.restore();
      }
      // hazards: rings first (behind), then others
      for (const h of S.hz) if (h.k === 'ring' || h.k === 'beam') drawHazard(h);
      for (const h of S.hz) {
        if (h.k === 'ring' || h.k === 'beam') continue;
        if (h.warn > 0 || h.k === 'hole') { drawHazard(h); continue; }
        const q = OD.smooth(clamp((h.t - h.warn0) / 0.45, 0, 1)), o = h.dead ? OD.smooth(clamp((h.fo || 0) / FADE_OUT, 0, 1)) : 0, sc = (0.6 + 0.4 * q) * (1 + 0.35 * o) * (0.7 + 0.3 * lifeFade(h));
        const [hx, hy] = h.k === 'comet' ? [h.x, h.y] : hpos(h);
        ctx.save(); ctx.translate(hx, hy); ctx.scale(sc, sc); ctx.translate(-hx, -hy); drawHazard(h); ctx.restore();
      }
      drawEvtFront();
      for (const b of S.beams) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.globalAlpha = 1 - b.t / 0.3; ctx.strokeStyle = OD.POWERS.zap.color; ctx.lineWidth = 6 * u; ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * u; ctx.stroke(); ctx.restore(); }
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
        if (charging && S.p.body === 'main' && aim() === 'drag') {
          // every orbit you could pick, dim; the one you aim at lit; your finger shown
          for (let i = 0; i < 3; i++) { if (i === S.p.o) continue; if (target && target.body === 'main' && target.n === i) continue; drawLanding(S.p, { body: 'main', n: i, a: S.p.th }, true, px, py, true, null); }
          if (cands && cands.vis && !(target && target.body === 'vis')) { const v = S.vis; drawLanding(S.p, cands.vis, true, px, py, true, null); }
          if (S.p.dragging) {
            const [fx, fy] = fingerWorld();
            ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(fx, fy, 14 * u, 0, TAU); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill();
            const st = dragSteps(), [rx, ry] = radialDir(); ctx.fillStyle = 'rgba(255,255,255,0.55)';
            for (const dir of [-1, 1]) {   // + = away from the planet (bigger orbit), - = towards it (tighter)
              const on = st * dir > 0, ax = rx * dir, ay = ry * dir; ctx.globalAlpha = on ? 1 : 0.35;
              ctx.beginPath(); ctx.moveTo(fx + ax * 32 * u, fy + ay * 32 * u); ctx.lineTo(fx + ax * 22 * u - ay * 6 * u, fy + ay * 22 * u + ax * 6 * u); ctx.lineTo(fx + ax * 22 * u + ay * 6 * u, fy + ay * 22 * u - ax * 6 * u); ctx.closePath(); ctx.fill();
            }
            ctx.restore();
          } else if (OD.save.stats.runs < 25 && !target) {
            ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,217,90,0.9)'; ctx.font = `800 ${11 * u}px Outfit, system-ui, sans-serif`; ctx.letterSpacing = '2px';
            ctx.fillText('DRAG AWAY FROM THE PLANET OR TOWARDS IT', px, py - 30 * u); ctx.restore();
          }
        } else if (charging && S.p.body === 'main') {
          const c = jumpCandidates();
          for (const [key, glyph] of [['out', 'out'], ['in', 'in']]) {
            const alt = c[key];
            if (alt && alt !== target && !(target && alt.n === target.n && alt.body === target.body)) drawLanding(S.p, alt, true, px, py, true, glyph);
          }
        }
        if (target) drawLanding(S.p, target, charging, px, py, false, null);
        else if (aim() === 'sling' && !charging && cands && cands.auto) drawLanding(S.p, cands.auto, false, px, py, false, null);
        drawPlayer(S.p, px, py, S.intro ? 0.55 : 1);
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
        ctx.globalAlpha *= 0.85; ctx.fillStyle = t.color; ctx.font = `700 ${t.size * 0.7 * Math.max(0.8, u)}px Outfit, system-ui, sans-serif`;
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
      // combo pill: multiplier with its decay shown as a fill, sitting clear of the score
      const ph = sz * 0.5, my = y0 + sz * 1.0 + ph / 2 + sz * 0.18;
      const hot = S.mult > 1, ft = `800 ${sz * 0.3}px Outfit, system-ui, sans-serif`;
      ctx.font = ft; ctx.letterSpacing = '1px';
      const label = '×' + S.mult.toFixed(1), pw = Math.max(sz * 1.15, ctx.measureText(label).width + sz * 0.6);
      const px = cx - pw / 2, py = my - ph / 2, pr = ph / 2;
      const rr = () => { ctx.beginPath(); ctx.moveTo(px + pr, py); ctx.arcTo(px + pw, py, px + pw, py + ph, pr); ctx.arcTo(px + pw, py + ph, px, py + ph, pr); ctx.arcTo(px, py + ph, px, py, pr); ctx.arcTo(px, py, px + pw, py, pr); ctx.closePath(); };
      ctx.save();
      rr(); ctx.fillStyle = 'rgba(6,10,30,0.42)'; ctx.fill();
      if (hot) {
        const k = S.multT > 0 ? clamp(S.multT / 5, 0, 1) : clamp((S.mult - 1) / 1.5, 0, 0.3);
        ctx.save(); rr(); ctx.clip(); ctx.fillStyle = OD.rgba(world.accent2, 0.28); ctx.fillRect(px, py, pw * k, ph); ctx.restore();
      }
      rr(); ctx.lineWidth = 1.5; ctx.strokeStyle = hot ? OD.rgba(world.accent2, 0.8) : 'rgba(255,255,255,0.18)'; ctx.stroke();
      ctx.textBaseline = 'middle'; ctx.fillStyle = hot ? '#fff' : 'rgba(255,255,255,0.45)';
      ctx.fillText(label, cx, my + 1);
      ctx.restore(); ctx.letterSpacing = '0px'; ctx.textBaseline = 'alphabetic';
      const fy = py + ph + sz * 0.42;
      if (S.feats.length) {
        const f = S.feats[0], k = f.t / 1.6, a = Math.min(1, f.t * 7, (1 - k) * 4), pop = 1 + Math.max(0, 0.2 - f.t * 1.0);
        ctx.save(); ctx.globalAlpha = a; ctx.translate(cx, fy); ctx.scale(pop, pop);
        ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 8;
        ctx.fillStyle = f.color; ctx.font = `800 ${sz * 0.27}px Outfit, system-ui, sans-serif`; ctx.letterSpacing = '2.5px';
        ctx.fillText(f.str + (f.pts ? '   +' + OD.fmt(Math.round(f.pts)) : ''), 0, 0); ctx.letterSpacing = '0px';
        if (f.sub) { ctx.globalAlpha = a * 0.75; ctx.fillStyle = '#fff'; ctx.font = `500 ${sz * 0.2}px Outfit, system-ui, sans-serif`; ctx.fillText(f.sub, 0, sz * 0.3); }
        ctx.restore();
      }
      if (S.mode === 'timeattack') {
        const left = Math.max(0, 60 - S.time);
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillStyle = left < 10 ? '#ff6a7a' : 'rgba(255,255,255,0.85)'; ctx.font = `700 ${sz * 0.3}px Outfit, system-ui, sans-serif`;
        ctx.fillText(Math.ceil(left) + 's', px - sz * 0.25, my + 1); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      }
    }
    if (S.demo) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = `600 ${Math.max(10, sz * 0.2)}px Outfit, system-ui, sans-serif`; ctx.letterSpacing = '2px';
      ctx.fillText('FREE RUN ' + S.freeNo + ' OF ' + OD.FREE_RUNS, cx, safeTop + 4); ctx.letterSpacing = '0px';
    }
    // power timers: icons ease in and out and slide into place instead of popping
    const p = S.p, live = {};
    if (p.shield) live.shield = [1];
    for (const k of TIMED) if (p[k] > 0) live[k] = [p[k] / OD.POWERS[k].dur];
    if (S.lives > 0) live.life = [1, S.lives];
    if (p.zap > 0) live.zap = [1, p.zap];
    if (p.boostJ > 0) live.boost = [1, p.boostJ];
    if (S.od > 0) live.nova = [S.od / S.odMax];
    for (const k in live) { S.hudLast[k] = live[k]; if (S.hudA[k] == null) { S.hudA[k] = 0; S.hudX[k] = null; } }
    const keys = Object.keys(S.hudA);
    for (const k of keys) { S.hudA[k] += ((live[k] ? 1 : 0) - S.hudA[k]) * 0.18; if (!live[k] && S.hudA[k] < 0.02) { delete S.hudA[k]; delete S.hudX[k]; delete S.hudLast[k]; } }
    const vis = Object.keys(S.hudA), gap = 44, bx = cx - (vis.length - 1) * gap / 2, by = H - Math.max(42, safeTop + 14);
    vis.forEach((k, i) => {
      const tx = bx + i * gap; S.hudX[k] = S.hudX[k] == null ? tx : S.hudX[k] + (tx - S.hudX[k]) * 0.2;
      const x = S.hudX[k], [f, cnt] = S.hudLast[k], a = S.hudA[k], col = k === 'nova' ? '#fff6c8' : OD.POWERS[k].color;
      const low = live[k] && f < 0.25 && !cnt && k !== 'shield', bl = low ? (Math.sin(tAnim * 16) > 0 ? 1 : 0.35) : 1, br = (1 + 0.06 * Math.sin(tAnim * 5 + i)) * (0.7 + 0.3 * a);
      ctx.save(); ctx.globalAlpha = bl * a; ctx.globalCompositeOperation = 'lighter'; G.glow(ctx, x, by, 30 * br, col, 0.45); ctx.globalCompositeOperation = 'source-over';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(x, by, 17 * br, 0, TAU); ctx.stroke();
      ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(x, by, 17 * br, -Math.PI / 2, -Math.PI / 2 + (live[k] ? f : 0) * TAU); ctx.stroke();
      if (k === 'nova') { ctx.fillStyle = col; ctx.font = '800 15px Outfit, system-ui'; ctx.textBaseline = 'middle'; ctx.fillText('★', x, by + 1); }
      else drawPowerIcon(ctx, k, x, by, 12 * (0.8 + 0.2 * a), col);
      if (cnt) { ctx.fillStyle = '#fff'; ctx.font = '800 11px Outfit, system-ui'; ctx.textBaseline = 'alphabetic'; ctx.fillText('×' + cnt, x + 13, by + 22); }
      ctx.restore();
    });
    // perks: small hexagons above the timers, one pip per level
    const pk = Object.keys(S.perks).filter(k => S.perks[k] > 0), pgap = 34, pbx = cx - (pk.length - 1) * pgap / 2, pby = by - 40;
    pk.forEach((k, i) => {
      const x = pbx + i * pgap, col = OD.POWERS[k].color, pulse = 1 + 0.05 * Math.sin(tAnim * 3 + i);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; G.glow(ctx, x, pby, 20 * pulse, col, 0.3); ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath(); for (let j = 0; j < 6; j++) { const a = j * TAU / 6 + Math.PI / 6; ctx.lineTo(x + Math.cos(a) * 13 * pulse, pby + Math.sin(a) * 13 * pulse); } ctx.closePath();
      ctx.fillStyle = 'rgba(8,10,24,0.7)'; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.stroke();
      drawPowerIcon(ctx, k, x, pby, 8.5, col);
      for (let j = 0; j < S.perks[k]; j++) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x + (j - (S.perks[k] - 1) / 2) * 5, pby + 19, 1.8, 0, TAU); ctx.fill(); }
      ctx.restore();
    });
    ctx.restore();

    // banner / tutorial text
    ctx.save(); ctx.textAlign = 'center';
    if (S.bannerT > 0 && S.banner && !S.intro) {
      const k = S.bannerT / 2.2, a = Math.min(1, (1 - k) * 8, k * 3);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#fff'; ctx.font = `800 ${sz * 0.62}px Outfit, system-ui, sans-serif`; ctx.letterSpacing = '6px';
      ctx.fillText(S.banner.str, cx, cy + R[2] + sz * 1.7);
      ctx.letterSpacing = '0px'; ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = `500 ${sz * 0.28}px Outfit, system-ui, sans-serif`;
      ctx.fillText(S.banner.sub, cx, cy + R[2] + sz * 2.15);
    }
    if (S.tut >= 0) {
      const msgs = [['TAP', 'to flip direction', 3 - S.stats.flips > 0 ? `${Math.max(0, 3 - S.stats.flips)} more` : ''],
        aim() === 'drag' ? ['HOLD', 'then drag to the orbit you want and let go', ''] : ['HOLD', 'then release on the golden glow to jump', ''],
        ['GRAZE', 'skim close to debris to build your combo', '']];
      const m = msgs[S.tut];
      ctx.globalAlpha = 0.75 + 0.25 * Math.sin(tAnim * 5);
      ctx.fillStyle = '#fff'; ctx.font = `800 ${sz * 0.6}px Outfit, system-ui, sans-serif`; ctx.letterSpacing = '6px';
      ctx.fillText(m[0], cx, cy + R[2] + sz * 1.7); ctx.letterSpacing = '0px';
      ctx.globalAlpha = 0.85; ctx.fillStyle = world.accent; ctx.font = `500 ${Math.min(17, W * 0.044)}px Outfit, system-ui, sans-serif`;
      ctx.fillText(m[1] + (m[2] ? '  ·  ' + m[2] : ''), cx, cy + R[2] + sz * 2.15);
      // animated finger hint
      const fy = Math.min(H - 70, cy + R[2] + sz * 3.2), ph = (tAnim * 1.2) % 1;
      ctx.globalAlpha = 0.9; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.4;
      if (S.tut === 0) { ctx.beginPath(); ctx.arc(cx, fy, 14 + ph * 22, 0, TAU); ctx.globalAlpha = 0.8 * (1 - ph); ctx.stroke(); ctx.globalAlpha = 0.9; }
      else if (S.tut === 1) { const hold = Math.min(1, ph * 1.6), sl = ph > 0.55 ? Math.sin((ph - 0.55) / 0.45 * Math.PI) * -26 : 0; ctx.beginPath(); ctx.arc(cx, fy + sl, 15, -Math.PI / 2, -Math.PI / 2 + hold * TAU); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(cx, fy + sl, 15, 0, TAU); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(cx, fy + (S.tut === 1 && ph > 0.55 ? Math.sin((ph - 0.55) / 0.45 * Math.PI) * -26 : 0), 6, 0, TAU); ctx.fill();
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
    if (S.pz < 1) { ctx.fillStyle = `rgba(4,6,18,${0.38 * (1 - S.pz)})`; ctx.fillRect(0, 0, W, H); }
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
    const jt0 = performance.now();
    try {
      if (S && (state === 'pausing' || state === 'play') && S.pz < 1 || state === 'pausing') {
        // pausing eases time down in a third of a second; resuming eases it back up over about a second, no countdown
        if (state === 'pausing') { S.pz = Math.max(0, S.pz - dt / 0.35); if (S.pz <= 0) { state = 'paused'; OD.audio.suspend(); OD.ui.show('pause'); } }
        else S.pz = Math.min(1, S.pz + dt / 1.0);
      }
      if (state === 'play' || state === 'pausing' || state === 'dying' || state === 'ended') { if (S) update(dt * (S.pz < 1 ? S.pz * S.pz * (3 - 2 * S.pz) : 1)); }
      drawScene();
      drawWorld();
      drawHopFx();
      drawFog();
      if (S && state !== 'menu') { if (state !== 'ended') drawHUD(); drawOverlayFX(); }
    } catch (e) {
      console.error(e);
      if (OD.debug) throw e;
      cv.width = cv.width; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);   // a failed frame must never leave stray canvas state behind
    }
    // ?fps shows the frame rate and how long the game's own JavaScript took per frame
    if (SHOW_FPS) {
      fpsJs += ((performance.now() - jt0) - fpsJs) * 0.1; fpsDt += (dt - fpsDt) * 0.1;
      ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(6, H - 44, 150, 38);
      ctx.fillStyle = '#9fffd0'; ctx.font = '600 12px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(Math.round(1 / fpsDt) + ' fps  ' + fpsJs.toFixed(1) + ' ms JS', 12, H - 40); ctx.fillText('dpr ' + dpr.toFixed(2) + (dprCap < 2 ? ' (reduced)' : ''), 12, H - 24); ctx.restore();
    }
  }

  // ------------------------------------------------------------- public api
  function bindInput() {
    cv.addEventListener('pointerdown', e => {
      if (state !== 'play') return;
      e.preventDefault();
      if (pointerId !== null) return;
      pointerId = e.pointerId; downY = e.clientY; downX = e.clientX; ptrX = e.clientX; ptrY = e.clientY;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
      inputDown();
    });
    cv.addEventListener('pointermove', e => {
      if (e.pointerId !== pointerId || state !== 'play' || !S) return;
      ptrX = e.clientX; ptrY = e.clientY;
      if (aim() === 'drag' && Math.hypot(ptrX - downX, ptrY - downY) > DRAG_PX && S.p.holding) S.p.dragging = true;   // dragging picks the orbit directly
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
      state = 'pausing';
      if (S.p.charging) { S.p.charging = false; S.p.holding = false; }
      pointerId = null; OD.audio.setMuffle(0.7);
      return true;
    },
    resume() {
      if (state !== 'paused' && state !== 'pausing') return;
      state = 'play'; OD.audio.resume(); OD.audio.setMuffle(0);   // time speeds back up from where it stopped
    },
    quit() { state = 'menu'; S = null; OD.ui.hideTile(); stopRecording(true); OD.audio.resume(); api.menu(); },
    drawPowerIcon,
    endIntro,
    resize,
    _dbg: { get S() { return S; }, set S(v) { S = v; }, update, die: () => die(null, 'debug'), jump: () => doJump(false, true), target: () => jumpTarget(), cands: () => jumpCandidates(), spawn: { rocks: spawnRocks, comets: spawnComets, mines: spawnMines, ring: spawnRing, beam: spawnBeam, hole: spawnHole, boss: spawnBoss, dust: spawnDust, power: spawnPower, vis: spawnVis, shower: evShower, bloom: evBloom, giant: evGiant, flare: evFlare, hole: evHole, nova: evNova, event: spawnEvent, overdrive: startOverdrive } },
    mode: () => mode,
  };
  return api;
})();
