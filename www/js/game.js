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

// a buzz whose strength follows 0..1 (the skill screen's hold-to-learn climbs through it), without the usual spacing between buzzes
OD.haptic.pulse = k => {
  if (!OD.save.settings.haptics) return;
  try {
    const H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
    if (H) H.impact({ style: k > 0.75 ? 'HEAVY' : k > 0.35 ? 'MEDIUM' : 'LIGHT' });
    else if (navigator.vibrate) navigator.vibrate(6 + Math.round(k * 26));
  } catch (e) { /* haptics are optional */ }
};

OD.worldUnlocked = () => true;   // there are no sector gates any more: planets join your pool by best score (OD.planetUnlocked)

OD.game = (() => {
  const TAU = OD.TAU, { clamp, lerp, smooth, angDiff } = OD, G = OD.gfx;
  const SNAP_T = 0.55;   // drag mode: a quick, decisive jump (released within this long after the aim slows time) earns the boost
  const aim = () => 'drag';
  const CHARGE_START = 0.16, PERFECT_A = 0.2, PERFECT_B = 0.34, OVERCHARGE = 0.52, JUMP_DUR = 0.26;
  const STEER_PX = 18, DRAG_PX = 14;
  // Everything starts gentle and speeds up at milestones (seconds survived). Each step is announced.
  const SPEED_LV = [0.6, 0.645, 0.69, 0.735, 0.78, 0.825, 0.865, 0.905, 0.945, 0.985, 1.02];
  const LEVEL_AT = [0, 14, 30, 50, 75, 105, 140, 180, 225, 275, 330];
  const levelFor = t => { let l = 0; while (l + 1 < LEVEL_AT.length && t >= LEVEL_AT[l + 1]) l++; return l + (t > 330 ? Math.floor((t - 330) / 60) : 0); };
  const modSpeed = () => (S && S.mods.swift ? 1.25 : 1) * (S && S.mods.chill ? 0.8 : 1);
  const speedFor = (l, m) => (m === 'zen' ? 0.6 : Math.min(1.2, l < SPEED_LV.length ? SPEED_LV[l] : 1.02 + 0.015 * (l - SPEED_LV.length + 1)) + (m === 'timeattack' ? 0.25 : 0));
  const VIS_IN = 2.6, VIS_HOLD = 14, VIS_OUT = 2.6, REACH = 58;   // twin planet timings (s) and transfer reach (x u)

  let cv, ctx, W = 360, H = 640, dpr = 1, cx = 180, cy = 300, base = 360, u = 1, PR = 36, safeTop = 24;
  let R = [0, 0, 0, 0, 0, 0], Rb = [0, 0, 0, 0, 0, 0];
  // Planets differ in size and in how many orbits they have: small moons have two, most worlds three or four, the biggest five.
  let NO = 3, OUT = 2, PR0 = 36, curSkin = 'terra';
  const ORBITS = { moon: 2, terra: 3, garden: 3, ocean: 4, lava: 4, ice: 4, toxic: 4, ringed: 4, crystal: 5, gas: 5, void: 5, boss: 6 };
  const PSCALE = { moon: 0.8, gas: 1.2, ringed: 1.15, void: 1.08, ice: 0.95 };
  const orbitsFor = skin => ORBITS[skin] || 3;
  // radii of n orbits: the innermost and outermost stay near the same places, so a giant's four orbits sit closer together
  function radii(n) {
    const lo = [0, 0, 0.22, 0.2, 0.19, 0.18, 0.17][n] * base, hi = [0, 0, 0.4, 0.42, 0.45, 0.46, 0.47][n] * base, a = [];
    for (let i = 0; i < 6; i++) a.push(lo + (hi - lo) * Math.min(i, n - 1) / Math.max(1, n - 1));
    return a;
  }
  function setOrbits(skin) {
    curSkin = skin || 'terra'; NO = orbitsFor(curSkin); OUT = NO - 1;
    Rb = radii(NO); R = Rb.slice(); PR = PR0 * (PSCALE[curSkin] || 1);
  }
  let state = 'menu';            // menu | play | paused | resume | dying | ended
  let world = OD.WORLDS[0], mode = 'endless', S = null, menuSkin = 'terra';   // world = the biome you are in (sky, song, sounds); the planet is separate
  const SHOW_FPS_Q = /[?&]fps/.test(location.search);
  // ?prof times every part of a frame, forcing the canvas to finish each part (a 1-pixel read), so the slow parts can be found: OD.game._prof()
  const PROF = /[?&]prof/.test(location.search), profAcc = {};
  let pmT = 0; const pmark = n => { if (!PROF) return; ctx.getImageData(0, 0, 1, 1); const t = performance.now(); if (pmT) { const a = profAcc[n] || (profAcc[n] = { ms: 0, n: 0 }); a.ms += t - pmT; a.n++; a.last = t - pmT; } pmT = t; };   // closes the part of the frame that just ended
  const pf = (name, f) => { if (!PROF && !SHOW_FPS_Q && !T().fps) return f(); const t0 = performance.now(); f(); if (PROF) ctx.getImageData(0, 0, 1, 1); const d = performance.now() - t0, a = profAcc[name] || (profAcc[name] = { ms: 0, n: 0, ema: d }); a.ms += d; a.n++; a.last = d; a.ema += (d - a.ema) * 0.08; };
  let fpsJs = 0, fpsDt = 0.016;
  let vz = 0.86;   // the view: a little pulled back in the menu and in pause, fully in during play, so starting and pausing are one smooth zoom
  const MENU_Z = 0.86, PAUSE_Z = 0.9;
  let skyX = 0, skyV = 0;   // how far the sky has flowed (px) and how fast: it never stops, in the menu, in a run and in pause
  let perfFxOff = false, tAnim = 0, lastT = 0, dprCap = 4, perfAcc = 0, perfN = 0, perfT = 0;
  const stars = [G.makeStars(70, 11), G.makeStars(40, 12), G.makeStars(22, 13)];
  let menuDots = [];
  let pointerId = null, keyDown = false, downY = 0, downX = 0, ptrX = 0, ptrY = 0;

  // ------------------------------------------------------------- layout
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, Math.min(dprCap, OD.Q().dprCap));
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    OD.glr.resize(cv.width, cv.height, W, H);
    OD.biomes.setScale(Math.min(window.devicePixelRatio || 1, OD.Q().sky));
    cx = W / 2; cy = H * 0.47;
    base = Math.min(W, H * 0.62); u = base / 360;
    PR0 = base * 0.1;
    setOrbits(curSkin);
    const probe = document.getElementById('safeprobe');
    safeTop = Math.max(18, probe ? parseFloat(getComputedStyle(probe).paddingTop) || 0 : 0);
  }

  // ------------------------------------------------------------- helpers
  const rand = (a, b) => a + Math.random() * (b - a);
  const T = () => OD.save.settings;
  const pos = (o, a) => [cx + Math.cos(a) * R[o], cy + Math.sin(a) * R[o]];
  function playerXY() { const p = S.p; return [p.wx, p.wy]; }
  function fxScale() { return (T().fx ? 1 : 0.45) * OD.Q().fxMul; }

  function particle(x, y, vx, vy, life, size, color, o = {}) {
    if (S.parts.length > OD.Q().parts) return;
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
  // Trick callouts: small and quiet. At most two at once, one above the other. A new one fades up a few pixels and settles; the older
  // one steps up a row, and anything pushed out (or finished) lifts away and fades. Only a high combo adds a little extra light.
  const POP_OUT = 0.18;
  const vivid = hex => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex); if (!m) return hex; const c = [1, 2, 3].map(i => parseInt(m[i], 16)), mean = (c[0] + c[1] + c[2]) / 3; return 'rgb(' + c.map(v => clamp(Math.round(mean + (v - mean) * 1.8 + 12), 0, 255)).join(',') + ')'; };   // the same hue, pushed to a stronger colour
  function trickPop(label, val, color, chain = 1) {
    const pops = S.tpops = S.tpops || [];
    for (const q of pops) { q.slot++; if (q.slot >= 2) q.life = Math.min(q.life, q.t + POP_OUT); }
    while (pops.length > 3) pops.shift();
    pops.push({ label: clean(label), val: clean(val), n: parseInt(String(val).replace(/\D/g, ''), 10) || 0, color, t: 0, life: 1.35, slot: 0, sy: -4 * u, hot: chain >= 5 ? 2 : chain >= 3 ? 1 : 0 });
  }
  const popIn = t => { const x = clamp(t / 0.22, 0, 1); return 1 - Math.pow(1 - x, 3) + Math.sin(x * Math.PI) * 0.06; };   // a soft ease-out with the barest overshoot
  const trickMode = () => { const v = T().trickPos; return v === 'off' ? 'off' : v === 'below' || v === 'top' ? 'below' : 'dot'; };   // 'top' was the old name of 'below'
  const trickBelow = () => trickMode() === 'below';
  function drawTrickPops(px, py, top) {   // top: stacked downward under the multiplier instead of above the dot
    const pops = S.tpops; if (!pops || !pops.length) return;
    ctx.save(); try { drawPopsInner(pops, px, py, top); } finally { ctx.restore(); ctx.letterSpacing = '0px'; }
  }
  function drawPopsInner(pops, px, py, top) {
    ctx.save(); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    for (const q of pops) {
      const e = popIn(q.t), x0 = clamp((q.t - (q.life - POP_OUT)) / POP_OUT, 0, 1), xo = x0 * x0;
      const a = Math.min(1, q.t * 8) * (1 - xo), shown = q.n ? Math.round(q.n * (1 - Math.pow(1 - Math.min(1, q.t / 0.3), 2))) : 0;
      const fs = 6.2 * u; ctx.font = `600 ${fs}px Outfit, system-ui, sans-serif`; ctx.letterSpacing = 1 * u + 'px';
      const val = q.n ? '+' + shown : q.val, w1 = ctx.measureText(q.label).width, w2 = ctx.measureText('+' + q.n).width, tw = w1 + w2 + 3.5 * u;
      const x = clamp(px - tw / 2, 8 * u, W - tw - 8 * u), y = top ? py + q.sy - (1 - e) * 6 * u - xo * 8 * u : Math.max(safeTop + 90 * u, py - 26 * u - q.sy + (1 - e) * 6 * u - xo * 10 * u);
      const gs = (0.94 + 0.06 * e) * (1 + 0.09 * q.hot);   // a high combo is a bit bigger
      ctx.save(); ctx.translate(x + tw / 2, y); ctx.scale(gs, gs); ctx.translate(-tw / 2, 0);
      if (q.hot > 0) {   // a long combo: a tight glow hugging the letters, in a more intense version of the trick's colour (never a wide aura)
        const vc = vivid(q.color), br = 0.85 + 0.15 * Math.sin(q.t * 16);
        ctx.shadowColor = vc; ctx.shadowOffsetY = 0; ctx.fillStyle = vc;
        ctx.globalAlpha = Math.max(0, a) * 0.8 * br; ctx.shadowBlur = 2.5 * u; ctx.fillText(q.label, 0, 0);
        ctx.globalAlpha = Math.max(0, a) * 0.55 * br; ctx.shadowBlur = 5 * u + 1.5 * u * q.hot; ctx.fillText(q.label, 0, 0);
      }
      ctx.globalAlpha = Math.max(0, a) * 0.95; ctx.shadowColor = 'rgba(2,4,18,0.7)'; ctx.shadowBlur = 3 * u; ctx.shadowOffsetY = 1;
      ctx.fillStyle = q.color; ctx.fillText(q.label, 0, 0);
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillText(val, w1 + 3.5 * u, 0);
      ctx.restore();
    }
    ctx.restore(); ctx.letterSpacing = '0px';
  }
  // small bonus callouts for slick moves; each has a short cooldown so they never spam the screen
  function trick(id, label, pts, color) {
    S.trickT = S.trickT || {};
    if (S.time - (S.trickT[id] || -9) < 1.2 || S.intro) return;
    S.trickT[id] = S.time; introduce('tricks', true);
    const sh = 0, v = Math.round(pts * S.mult * [1, 1.5, 2, 2.5][sh] * (1 + [0, 0.4, 0.8, 1.3][pv('flow')])); addScore(v); addMult(0.03 + (sh >= 2 ? 0.03 : 0) + 0.02 * pv('flow'));
    S.stats.tricks++; if (id === 'weave') S.stats.weaves++; else if (id === 'zig') S.stats.zigs++; else if (id === 'lap') S.stats.laps++;
    const [x, y] = playerXY();
    // several tricks close together build a combo
    S.trickChain = S.time - (S.lastTrickT || -9) < 3 ? (S.trickChain || 0) + 1 : 1; S.lastTrickT = S.time;
    trickPop(label, '+' + v, color || '#cfe6ff', S.trickChain); OD.audio.sfx('dust', 3 + 2 * Math.min(3, S.trickChain - 1));
    S.stats.tcombo = Math.max(S.stats.tcombo, S.trickChain);
    if (S.trickChain >= 3 && S.trickChain % 2 === 1) { feat('TRICK COMBO ×' + S.trickChain, 'Slick moves in a row', '#b9ff9a', 20 * S.trickChain * S.mult * (sh >= 3 ? 2 : 1)); addMult(0.1); }
  }
  function shockwave(x, y, color, maxR, life = 0.5) { S.waves.push({ x, y, color, maxR, t: 0, life }); }
  function shake(a) { if (T().shake) S.shake = Math.min(14, S.shake + a); }

  // ------------------------------------------------------------- run setup
  function newState(m) {
    const p = {
      th: -Math.PI / 2, dir: 1, o: 1, r: R[1], od: 1, jump: null,
      charging: false, ct: 0, over: false, holdT: 0, holding: false,
      trail: [], shield: false, slow: 0, magnet: 0, phase: 0, inv: 0, boost: 0, holeSlow: 1,
      zap: 0, brake: 0, reaper: 0, amp: 0, prism: 0, fortune: 0, boostJ: 0, surge: 0, twin: 0, stasis: 0, aegis: 0, dragging: false, body: 'main', vd: 1, th2: 0, wx: cx, wy: cy - R[1], steer: null, dr: 0, pull: 0,
    };
    return {
      mode: m, p, pz: 1, perks: {}, hudA: {}, hudX: {}, hudLast: {}, hz: [], pk: [], parts: [], texts: [], waves: [], vis: null, evt: null,
      clock: 0, time: 0, ts: 1, real: 0, shake: 0, flash: 0, beatPulse: 0,
      score: 0, dispScore: 0, mult: 1, multT: 0, gm: 0, od: 0, odMax: 5,
      stats: { tricks: 0, weaves: 0, zigs: 0, laps: 0, tcombo: 0, hops: 0, clutch: 0, razors: 0, events: 0, holes: 0, novas: 0, assists: 0, transfers: 0, grazes: 0, perfects: 0, jumps: 0, flips: 0, dust: 0, powerups: 0, innerTime: 0, maxCombo: 1, bosses: 0, overdrives: 0, shields: 0 },
      dir: { lastBeat: -1, nextWave: 6, nextDust: 4, nextPower: 26, bossHops: 2, nextVis: 110, nextEvt: 20, evtAt: {}, lastType: '', boss: null },
      rng: null, tut: -1, tutT: 0, useAudio: false, dying: 0, banner: null, bannerT: 0,
      level: 0, spd: speedFor(0, m), chain: 0, chainT: 0, pstreak: 0, dustStreak: 0, dustT: 0, feats: [], clutchT: 0, nextTick: 15, powT: 0,
      introNew: 0, steerTip: false, intro: null, introQ: [], introTotal: 0, rampT: 0, lives: 0, beams: [], frags: [], delayed: [], era: { id: 'genesis', mix: 1, from: null }, eraIdx: -1, eraSeq: null, tintA: 0, nextBolt: 6, camZ: 1, camY: 0, mods: {}, scoreMul: 1, traitMul: 1, homeSkin: null, old: null,
      ghost: null, ghostRec: [], ghostAcc: 0, demo: false, over: false, endCause: '', resumeT: 0, calm: 0,
    };
  }

  // which planets can come next: unlocked ones, no deeper than your run has earned, never the one you are on
  // the Home world is where every run starts and never comes back; the Garden world can appear once
  const usedOnce = skin => !!S && !!S.seenSkin && !!S.seenSkin[skin] && (skin === 'terra' || skin === 'garden');
  function planetPool(depth, skip) {
    const daily = S && S.mode === 'daily';   // the daily route must be the same for everybody, whatever they have unlocked
    const all = OD.PLANETS.filter(p => p.skin !== skip && p.tier <= depth && (daily || OD.planetUnlocked(p.skin)) && !usedOnce(p.skin));
    const ready = all.filter(p => OD.planets.ready(p.skin));   // a planet whose picture is still being painted waits its turn, so none ever switches look in front of you
    return ready.length ? ready : all;
  }
  let nextMusic = OD.WORLDS[0];   // the song of the next run (picked when you reach the menu, so the menu already plays it)
  function startRun(m, startSkin) {
    OD.ui.hideTile();
    m = 'endless'; mode = m;   // (there is only the one way to play)
    const dayKey = OD.todayKey();
    // the run starts on a calm planet (the daily one is the same for everybody); tests can ask for a particular start planet
    const starters = planetPool(0, null), rr = m === 'daily' ? OD.makeRng(dayKey) : Math.random;
    let skin = typeof startSkin === 'string' ? startSkin : OD.debugStart ? OD.debugStart : 'terra';   // every run begins on the Home world
    if (!OD.PLANET_BY_SKIN[skin]) skin = 'terra';
    let tour = null;   // testing (OD.TEST_TOUR): one run walks through every sky, 20 s each (Aurora to Void), then the black hole fight; the planet stays
    if (OD.TEST_TOUR && typeof startSkin !== 'string' && typeof startSkin !== 'number') { tour = { i: 0, t: 0, pre: false, skin: 'terra', world: OD.WORLDS[0] }; skin = tour.skin; }
    // the biome you begin in: the one the menu was showing (the daily run starts in the same one for everybody)
    world = typeof startSkin === 'number' && OD.WORLDS[startSkin] ? OD.WORLDS[startSkin] : OD.debugBiome != null ? OD.WORLDS[OD.debugBiome] : m === 'daily' ? OD.WORLDS[Math.floor(rr() * 2)] : nextMusic;
    if (tour) world = tour.world;
    setOrbits(skin);
    S = newState(m);
    if (tour) { S.tour = tour; setTimeout(() => { if (S && S.tour === tour) banner('MUSIC TOUR', 'Every sky for 20 s, then the black hole'); }, 700); }
    S.rng = OD.makeRng(m === 'daily' ? dayKey : (Math.random() * 1e9) | 0);
    S.seenSkin = { [skin]: true };
    S.musicWorld = world; S.homeSkin = skin; S.homeType = typeFor(skin); S.bgFrom = null; S.bgT = 1; S.bspd = world.speed;
    S.envMul = (world.mods && world.mods.scoreMul) || 1; S.scoreMul = S.envMul;
    S.uni = OD.save.universe || 1; S.scoreMul *= 1 + 0.12 * (S.uni - 1); S.uniSpd = Math.min(1.3, 1 + 0.04 * (S.uni - 1));   // each new universe is a little faster and pays a little more   // the biome pays a bonus; a planet with a rule pays its own through traitMul
    S.biomeN = 0; S.biomeAt = OD.biomeStay(0); S.seenBiomes = { [world.id]: true }; OD.save.seenBiomes[world.id] = true;
    if (S.homeType && S.homeType.trait) S.era = { id: S.homeType.trait, mix: 1, from: null };
    S.traitMul = planetMul(S.homeType);
    OD.save.seenPlanets[skin] = true;
    if (m !== 'daily' && m !== 'zen' && OD.save.full) for (const id of OD.save.mods) if (OD.MODIFIERS[id]) { S.mods[id] = true; S.scoreMul *= OD.MODIFIERS[id].mul; }
    if (S.mods.chill) S.p.shield = true;
    S.noPerks = m === 'daily';
    S.demo = false; S.free = !OD.save.full; S.gateWorld = null; S.gateShown = false;   // the free game: Aurora Reach, all the way up to its difficulty ceiling; the next sky is behind the full game
    S.tut = !OD.save.hintsDone && OD.save.stats.runs === 0 ? 0 : -1;   // the very first run is a gentle one: no hazards, three short hints (tap, swipe, graze); the full tutorial lives in the menu
    if (S.tut === 0) { S.dir.nextWave = 1e9; S.dir.nextDust = 1e9; S.dir.nextPower = 1e9; }
    // perk tree and boosters
    if (pv('hull') > 0) S.p.shield = true;
    S.hullCd = 0; S.focusT = 0; S.focusCd = 0; S.phoenixT = 0; S.windT = 0; S.giftDone = false; S.aE = 2; S.aOn = false; S.shockCd = 0; S.drawCd = 0; S.hopCd = 0; S.shockFx = 0;
    S.lives = maxLives();   // every run starts with three hearts (Bulwark adds more)
    S.boostersUsed = [];
    if (!S.demo && !S.noPerks) {
      const sv = OD.save;
      for (const b of OD.BOOSTERS) {
        if (!(sv.boosters[b.id] > 0) || sv.boosterOff[b.id]) continue;
        sv.boosters[b.id]--; S.boostersUsed.push(b.id);
        if (b.id === 'b_shield') S.p.shield = true;
        else if (b.id === 'b_mult') { S.mult = 2; S.stats.maxCombo = 2; }
        else if (b.id === 'b_life') S.lives += 1;   // a spare heart beyond the usual
        else if (b.id === 'b_dust') S.dustBonus = 0.5;
      }
      if (S.boostersUsed.length) OD.persist();
    }
    OD.audio.unlock();
    S.useAudio = OD.audio.ready() && !(OD.debug && /noaudio/.test(location.search));
    OD.audio.startMusic(S.musicWorld, { zen: S.mode === 'zen' });
    if (S.homeType && S.homeType.trait) OD.audio.setEra(S.homeType.trait);
    OD.audio.setIntensity(0);
    // ghost of the previous best
    // (the old best-run ghost orb has been removed)
    state = 'play';
    if (S.boostersUsed.length) setTimeout(() => { if (S && !S.over) banner('BOOSTERS', S.boostersUsed.map(id => OD.BOOSTERS.find(b => b.id === id).name).join('  ·  ')); }, 400);
    if (S.homeType && S.homeType.trait && S.mode !== 'daily') introduce('era_' + S.homeType.trait, true);
    OD.haptic('light');
    return true;
  }

  // ------------------------------------------------------------- hazards
  const FADE_OUT = 0.5;
  // rocks, mines and spinners that reach the end of their time (or belong to a planet you left) slowly slide out into space instead of vanishing
  const DRIFT = new Set(['rock', 'mine', 'spinner']), DRIFT_T = 1.7;
  const exitQ = h => {
    if (!DRIFT.has(h.k)) return 0;
    if (h.dead) return h.exit ? clamp((h.fo || 0) / DRIFT_T, 0, 1) : 0;
    return h.life < DRIFT_T ? 1 - Math.max(0, h.life) / DRIFT_T : 0;
  };
  const lifeFade = h => h.life < 1.2 ? OD.smooth(Math.max(0, h.life / 1.2)) : 1;   // hazards dissolve over their last 1.2 s
  const WARN = { spinner: 1.0, rock: 0.75, comet: 1.0, mine: 0.9, ring: 1.5, beam: 1.3, hole: 1.1, ribbon: 1.2, tether: 1.1, cinder: 1.05, spear: 1.15, pylon: 1.2, shade: 1.6 };
  function addHazard(h) {
    h.warn = (h.warn == null ? WARN[h.k] : h.warn) * (1 + 0.35 * pv('early'));
    h.warn0 = h.warn; h.gcd = 0; h.t = 0; h.rot = Math.random() * TAU; h.dead = false;
    h.style = G.biomeRock(world.id);   // the common rock belongs to the sky you are in: each biome has its own
    h.shape = G.makeShape(h.style, Math.random);
    S.hz.push(h);
    return h;
  }
  const TIMED = Object.keys(OD.POWERS).filter(k => OD.POWERS[k].cat === 'timed');
  const perk = id => (S && S.perks[id]) || 0;
  const pth = id => !!S && !S.noPerks && OD.pathDone(id);   // is this the skill path you committed to? (each path also gives something for free)
  const maxLives = () => 3 + pv('bulwark');   // hearts you start with, and the most you can hold
  const pv = id => (S && !S.noPerks ? OD.perkLevel(id) : 0);   // level of a perk from the shop's perk tree (off in the daily run, so it stays fair)
  const canUse = id => OD.intro.canUse(id, S);
  // First sighting of an element: remember it, and pause the run behind an explanation popup.
  // First meeting with anything new gets an explanation tile. A danger that keeps killing you is explained again (see trackDeath).
  function introduce(id, free) {
    const sv = OD.save, again = !!(sv.reshow && sv.reshow[id]);
    if (!OD.INTRO_BY_ID[id] || (sv.intro[id] && !again)) return;
    if (state !== 'play' || S.over || S.dying > 0 || S.tut >= 0 || S.introQ.includes(id) || (S.intro && S.intro.id === id)) return;
    const tips = sv.settings.tips || 'all';
    if (tips === 'off' || (tips === 'core' && !OD.INTRO_CORE.has(id))) { sv.intro[id] = true; if (again) delete sv.reshow[id]; OD.persist(); return; }   // tips are limited: remember it as known, show nothing
    if (!sv.intro[id] && !free) S.introNew++;
    sv.intro[id] = true; if (again) delete sv.reshow[id]; OD.persist();
    if (S.intro) { S.introQ.push(id); return; }
    S.intro = { id, t: 0, again };
    OD.ui.showTile(id, again);
  }
  // Which explanation belongs to whatever just killed you
  const CAUSE_INTRO = { rock: 'rock', comet: 'comet', mine: 'mine', ring: 'ring', beam: 'beam', hole: 'well', spinner: 'spinner', strike: 'strike', flare: 'flare', nova: 'supernova', blackhole: 'blackhole', ribbon: 'ribbon', shoal: 'shoal', devil: 'devil', bloom: 'blossom', hail: 'hail', serpent: 'serpent', rift: 'rift', tether: 'tether', cinder: 'cinder', spear: 'spear', pylon: 'pylon', shade: 'shade', singularity: 'singularity' };
  function trackDeath(cause, res) {
    const id = CAUSE_INTRO[cause], sv = OD.save;
    if (!id || !sv.intro[id]) return;
    sv.deathLog = (sv.deathLog || []).concat([id]).slice(-6);
    if (sv.deathLog.filter(x => x === id).length >= 3 && sv.stats.runs - ((sv.lastReshow || {})[id] || -99) >= 6) {
      sv.reshow = sv.reshow || {}; sv.lastReshow = sv.lastReshow || {};
      sv.reshow[id] = true; sv.lastReshow[id] = sv.stats.runs; sv.deathLog = sv.deathLog.filter(x => x !== id); res.reshow = id;
    }
  }
  // While a tile is up the world crawls: nothing can hurt you, nothing scores, nothing spawns.
  function endIntro() {
    if (!S || !S.intro) return;
    S.introTotal += S.intro.t; S.intro = null; S.rampT = 1.4;
    OD.ui.hideTile();
    if (S.introQ.length) { const id = S.introQ.shift(); setTimeout(() => { if (S && state === 'play' && !S.over && !S.intro) { S.intro = { id, t: 0 }; OD.ui.showTile(id); } }, 1500); }
  }
  // difficulty follows how deep the run is (planet switches and time), not which planet you are on
  const wd = () => clamp((S.stats.hops || 0) * 0.13 + S.time / 700, 0, 1);   // depth: planet switches and time survived
  const lv = () => { const D = wd(), lo = 0.5 * D, cap = 0.6 + 0.4 * D; return lo + (cap - lo) * Math.min(1, S.time / 170) + (S.mods && S.mods.heavy ? 0.12 : 0); };
  const speedMul = () => ((S && S.bspd) || world.speed) * (S.mode === 'hardcore' ? 1.12 : 1) * S.spd * (1 - 0.06 * perk('calm')) * (eraIs('verdant') ? 0.88 : 1);

  // Rock formations keep waves from feeling samey: a rotating spoke, a spiral and a curtain with one gap.
  function spawnRockPattern() {
    const l = lv(), kinds = ['gate'];
    if (l > 0.12) kinds.push('spiral');
    if (l > 0.2) kinds.push('rain');
    const kind = S.rng.pick(kinds), w = S.rng.sign() * S.rng.range(0.32, 0.55);
    let a0 = S.rng() * TAU;
    if (Math.abs(angDiff(a0, S.p.th)) < 1.3) a0 += 2.4;
    if (kind === 'gate') { for (let o = 0; o < NO; o++) addHazard({ k: 'rock', o, a: a0, w, s: 8.5 * u, life: 11 }); }
    else if (kind === 'spiral') { for (let i = 0; i < 6; i++) addHazard({ k: 'rock', o: i % NO, a: a0 + i * 0.95, w: w * 0.8, s: 8 * u, life: 11 }); }
    else { for (let i = 0; i < 7; i++) addHazard({ k: 'rock', o: 2, a: a0 + i * TAU / 7 + (i === 3 ? 0.35 : 0), w: w * 0.7, s: 7.5 * u, life: 11 }); }
  }
  function spawnRocks() {
    if (lv() > 0.04 && S.rng() < 0.38) { spawnRockPattern(); return; }
    const n = clamp(Math.round((1 + Math.floor(lv() * 3 + S.rng() * 1.6)) * ((world.mods && world.mods.rockMul) || 1) * pmod('rockMul')), 1, 6);
    const orbit = S.rng.int(0, OUT);
    const a0 = S.rng() * TAU;
    for (let i = 0; i < n; i++) {
      const o = S.rng() < 0.65 ? orbit : S.rng.int(0, OUT);
      let a = a0 + i * (TAU / n) + S.rng.range(-0.3, 0.3);
      if (o === S.p.o && Math.abs(angDiff(a, S.p.th)) < 1.0) a += 1.6;
      addHazard({ k: 'rock', o, a, w: S.rng.sign() * S.rng.range(0.2, 0.75 + lv() * 0.4), s: S.rng.range(7.5, 11) * u, life: 11 });
    }
  }
  function spawnComets() {
    const n = 1 + Math.floor(lv() * 2 + S.rng() * 1.2);
    for (let i = 0; i < n; i++) {
      const ta = S.rng() * TAU, tr = S.rng.range(0, R[OUT]);
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
      let o = S.rng.int(0, OUT), tries = 0;
      while (used.includes(o) && ++tries < 4) o = S.rng.int(0, OUT);
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
    const o = S.rng.int(0, OUT);
    let a = S.rng() * TAU;
    if (o === S.p.o && Math.abs(angDiff(a, S.p.th)) < 1.2) a += 2;
    addHazard({ k: 'spinner', o, a, w: S.rng.sign() * S.rng.range(0.2, 0.4), rv: S.rng.sign() * S.rng.range(1.3, 2.0), len: 27 * u, life: 11, warn: 1.0 });
  }
  function spawnBeam() {
    const o0 = S.rng.int(0, 1);
    addHazard({ k: 'beam', o0, o1: o0 + 1, a: S.rng() * TAU, w: S.rng.sign() * (0.55 + 0.45 * lv()), life: 4.6, s: 4 * u });
  }
  // a telegraphed lightning bolt: a closing ring warns you, then it strikes that spot
  function spawnStrike() {
    const p = S.p, n = S.time > 70 ? 3 : 2;
    for (let i = 0; i < n; i++) addHazard({ k: 'strike', o: (p.o + i + S.rng.int(0, OUT)) % NO, a: p.th + p.dir * S.rng.range(0.5, 1.5) / (S.rs || 1) + i * 1.9, w: 0, s: 21 * u, life: 0.22, warn: 1.15 + i * 0.4 });
  }
  // a drifting bank of poison gas on one orbit: not deadly, but it eats your multiplier and slows you
  function spawnCloud() {
    addHazard({ k: 'cloud', o: S.rng.int(0, OUT), a: S.rng() * TAU, w: S.rng.sign() * S.rng.range(0.14, 0.32), arc: S.rng.range(0.95, 1.5), life: 14, warn: 1.3 });
  }
  function spawnHole() {
    addHazard({ k: 'hole', o: 1, a: S.rng() * TAU, w: S.rng.sign() * 0.22, s: 11 * u, field: 66 * u, life: 9, life0: 9 });
  }
  // the little black hole evaporates over its last 1.7 s: its core shrinks, its field draws in and it breathes out light
  const holeEvap = h => h.life < 1.7 ? OD.smooth(clamp(h.life / 1.7, 0, 1)) : 1;
  // ...and it opens the same way: after its warning the core swells out of nothing and the field spreads over 1.6 s (so does the danger)
  const holeBorn = h => OD.smooth(clamp(((h.life0 || h.life) - h.life) / 1.6, 0, 1));
  const holeK = h => Math.min(holeEvap(h), holeBorn(h));
  function holePop(h) {
    const [x, y] = hpos(h);
    shockwave(x, y, '#e6ccff', 70 * u, 0.7); shockwave(x, y, '#ffffff', 34 * u, 0.4);
    burst(x, y, 26, 150 * u, '#e6ccff', 2.4, 0.9); burst(x, y, 12, 90 * u, '#ffffff', 2, 0.7);
    spawnDust(1, h.a - 0.22, 5, 0.09);   // it evaporates into a little arc of stardust
    OD.audio.sfx('evap');
  }

  // ------------------------------------------------------------- one unique danger in every biome
  const BIOME_HAZ_SET = new Set(['ribbon', 'tether', 'cinder', 'spear', 'pylon', 'shade', 'shoal', 'devil', 'bloom', 'hail', 'serpent', 'rift']);
  const UNHARMED = new Set(['hole', 'beam', 'ring', 'ribbon', 'tether', 'spear', 'pylon', 'shade', 'shoal', 'devil', 'bloom', 'hail', 'serpent', 'rift']);   // solid things that Pulse and its kin leave alone
  const DIRECT = new Set(['hole', 'cloud', 'strike', 'ribbon', 'tether', 'cinder', 'spear', 'pylon', 'shade', 'shoal', 'devil', 'bloom', 'hail', 'serpent', 'rift']);   // drawn as they are, without the pop-in scale
  const BIOME_HAZ = { 0: 'ribbon', 1: 'tether', 2: 'cinder', 3: 'spear', 4: 'pylon', 5: 'shade' };
  const BIOME_T = { ribbon: 16, tether: 22, cinder: 18, spear: 24, pylon: 26, shade: 28 };   // seconds into a run before it may show up
  const BIOME_CAP = { ribbon: 1, tether: 1, cinder: 2, spear: 2, pylon: 1, shade: 1 };
  // ...and a second, rarer one: Aurora's light shoal, Dust Belt's devil, Ember's fire blossom, Glacier's hail, Pulsar's coiling serpent, Void's rift twins.
  // Never two of a biome's dangers at once, and a pause between them, so the sky stays varied without ever piling up.
  const BIZ2 = { 0: 'shoal', 1: 'devil', 2: 'bloom', 3: 'hail', 4: 'serpent', 5: 'rift' };
  const BIZ2_T = { shoal: 44, devil: 48, bloom: 46, hail: 52, serpent: 56, rift: 60 };
  const wrapA = x => Math.atan2(Math.sin(x), Math.cos(x));
  const segDist = (px, py, x1, y1, x2, y2) => { const vx = x2 - x1, vy = y2 - y1, L = vx * vx + vy * vy || 1, t = clamp(((px - x1) * vx + (py - y1) * vy) / L, 0, 1); return Math.hypot(px - x1 - vx * t, py - y1 - vy * t); };
  const hash1 = n => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); };
  // AURORA REACH, the Ribbon: a wave of living light that circles the planet and ripples across two orbits as it goes. Only the bright
  // core hurts; its ripple swings the danger from orbit to orbit, so you slip in behind it or jump to a calm lane.
  function spawnRibbon() {
    const gap = Math.abs(R[Math.min(1, OUT)] - R[0]) || 40 * u;
    addHazard({ k: 'ribbon', o: S.rng.int(0, OUT), a: S.rng() * TAU, w: S.rng.sign() * S.rng.range(0.42, 0.6), arc: S.rng.range(1.05, 1.4), amp: gap * 0.62, ph: S.rng() * TAU, life: 13, warn: 1.2 });
  }
  const ribbonR = (h, th) => R[h.o] + h.amp * Math.sin(wrapA(th - h.a) * 3.1 + h.t * 2.3 + h.ph);
  const ribbonS = (h, th) => wrapA((Math.sign(h.w) || 1) * (h.a - th)) / h.arc;   // 0 at the head, 1 at the tail
  // DUST BELT, the Tether: two boulders on neighbouring orbits joined by a taut, glowing cable. As they circle, the cable swings across
  // the lanes between them like a gate on a hinge.
  function spawnTether() {
    const o = S.rng.int(0, Math.max(0, OUT - 1)), o2 = Math.min(OUT, o + 1 + (OUT - o > 1 && S.rng() < 0.4 ? 1 : 0));
    const h = addHazard({ k: 'tether', o, o2, a: S.rng() * TAU, w: S.rng.sign() * S.rng.range(0.2, 0.32), sep: S.rng.sign() * S.rng.range(0.7, 1.0), s: 10.5 * u, life: 13, warn: 1.1 });
    h.shape2 = G.makeShape(h.style, Math.random);
  }
  const tetherEnds = h => { const sp = h.sep + Math.sign(h.sep) * 0.26 * Math.sin(h.t * 0.85), [x1, y1] = pos(h.o, h.a), [x2, y2] = pos(h.o2, h.a + sp); return [x1, y1, x2, y2]; };
  // EMBER RIFT, the Cinder: a living ember that hunts you. It cannot turn sharply, so a late flip or a jump to another orbit outwits it,
  // but it never stops coming. A shield, a zap, a Pulse or Nova ends it.
  function spawnCinder(delay = 0) {
    const [px, py] = playerXY(), pa = Math.atan2(py - cy, px - cx), sa = pa + S.rng.sign() * S.rng.range(1.7, 2.7), D = Math.max(W, H) * 0.6;
    const x = cx + Math.cos(sa) * D, y = cy + Math.sin(sa) * D;
    addHazard({ k: 'cinder', free: true, x, y, ang: Math.atan2(cy - y, cx - x), sp: 0, sa, life: 9, warn: 1.05 + delay });
  }
  // GLACIER DRIFT, the Ice Lance: a crystal spear drops in from outside the sky and sticks, walling off every orbit from its tip outward at
  // that angle, then shatters. Lanes inside the tip stay open.
  const spearOuter = () => Math.max(W, H) * 0.62;
  const spearTipR = h => R[h.o] - 8 * u;
  function spawnSpear(delay = 0) {
    const [px, py] = playerXY(), pa = Math.atan2(py - cy, px - cx), dir = S.p.dir || 1;
    addHazard({ k: 'spear', o: S.rng.int(0, Math.max(0, OUT - 1)), a: pa + dir * S.rng.range(0.95, 2.3), thr: 0, life: 7.5, warn: 1.15 + delay, s: 6 * u });
  }
  const spearTip = h => { const rT = lerp(spearOuter(), spearTipR(h), OD.easeOut(clamp(h.thr, 0, 1))); return [cx + Math.cos(h.a) * rT, cy + Math.sin(h.a) * rT]; };
  // PULSAR STORM, the Arc Pylons: two pylons joined by lightning that beats in time with the music: a quiet beat, a beat of charging,
  // a beat of lightning (deadly), a beat of afterglow. Cross it on the quiet beats.
  function spawnPylon() {
    if (OUT < 1) return;
    const o1 = S.rng.int(1, OUT), a = S.rng() * TAU;
    addHazard({ k: 'pylon', o: o1, a, o2: o1 - 1, a2: a + S.rng.sign() * S.rng.range(0.5, 0.85), life: 15, warn: 1.2, b0: null });
  }
  const pylonEnds = h => { const [x1, y1] = pos(h.o, h.a), [x2, y2] = pos(h.o2, h.a2); return [x1, y1, x2, y2]; };
  const pylonPhase = h => h.b0 == null ? -1 : ((((S.clock * OD.audio.bpm(S.musicWorld || world) / 60) - h.b0) % 4) + 4) % 4;
  // VOID MAW, the Shade: the dark echo of your own path. It follows exactly where you were a couple of seconds ago, so your own wake
  // comes back for you. It cannot hurt you from behind (it only trails you), but turn round or cut across your old path and it can.
  function spawnShade() { addHazard({ k: 'shade', free: true, x: -999, y: -999, D: 2.4, life: 11, warn: 1.6 }); }
  function histAt(t) {
    const L = S.hist; if (!L || L.length < 2 || L[0][0] > t) return null;
    let i = L.length - 1; while (i > 0 && L[i][0] > t) i--;
    const a = L[i], b = L[Math.min(i + 1, L.length - 1)], k = b[0] > a[0] ? (t - a[0]) / (b[0] - a[0]) : 0;
    return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  }
  function shadeLethal(h) {
    const L = S.hist; if (!L || L.length < 6) return false;
    const n = L.length - 1; let j = n - 1; while (j > 0 && L[n][0] - L[j][0] < 0.08) j--;
    const vpx = L[n][1] - L[j][1], vpy = L[n][2] - L[j][2], vsx = h.x - (h.px == null ? h.x : h.px), vsy = h.y - (h.py == null ? h.y : h.py);
    const lp = Math.hypot(vpx, vpy), ls = Math.hypot(vsx, vsy);
    if (lp < 1e-3 || ls < 1e-3) return true;
    return (vpx * vsx + vpy * vsy) / (lp * ls) < 0.35;   // trailing you in the same direction is harmless
  }

  // a small arrow at the edge of the sky, pointing in from where something will come
  function edgeArrow(ang, color, prog) {
    const ca = Math.cos(ang), sa = Math.sin(ang), tx = ca > 0 ? (W - 22 - cx) / ca : ca < 0 ? (22 - cx) / ca : 1e9, ty = sa > 0 ? (H - 80 - cy) / sa : sa < 0 ? (safeTop + 90 - cy) / sa : 1e9;
    const t = Math.min(Math.abs(tx), Math.abs(ty)), ex = cx + ca * t, ey = cy + sa * t, pl = 0.6 + 0.4 * Math.sin(tAnim * 14);
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(ang + Math.PI); ctx.globalCompositeOperation = 'lighter';
    G.glow(ctx, 0, 0, 30 * u, color, 0.5 * pl * (0.4 + prog));
    ctx.fillStyle = OD.rgba(color, (0.5 + 0.5 * prog) * pl); ctx.beginPath(); ctx.moveTo(13 * u, 0); ctx.lineTo(-7 * u, -8 * u); ctx.lineTo(-3 * u, 0); ctx.lineTo(-7 * u, 8 * u); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // AURORA REACH, the Light Shoal: a school of seven glowing fish swims in from the edge of the sky, weaving as it goes, and swims out the other side.
  // Each fish is small and none of them wait: slip through the gaps, or stay out of its lane.
  function spawnShoal() {
    const D = Math.max(W, H) * 0.62, a = S.rng() * TAU, sx = cx + Math.cos(a) * D, sy = cy + Math.sin(a) * D, off = S.rng.range(-70, 70) * u;
    const tx = cx + Math.cos(a + Math.PI / 2) * off, ty = cy + Math.sin(a + Math.PI / 2) * off, dir = Math.atan2(ty - sy, tx - sx), sp = (118 + 30 * lv()) * u;
    addHazard({ k: 'shoal', free: true, x: sx, y: sy, sx, sy, dir, sp, amp: S.rng.range(34, 52) * u, fr: S.rng.range(1.7, 2.3), ph: S.rng() * TAU, n: 7, sa: a, life: 2 * D / sp + 1.6, warn: 1.15, fish: [] });
  }
  const shoalAt = (h, tau) => { const q = Math.max(0, tau), nx = -Math.sin(h.dir), ny = Math.cos(h.dir), w = h.amp * Math.sin(h.fr * q + h.ph) * Math.min(1, q / 1.2);
    return [h.sx + Math.cos(h.dir) * h.sp * q + nx * w, h.sy + Math.sin(h.dir) * h.sp * q + ny * w]; };
  // DUST BELT, the Dust Devil: a whirl of sand that wanders across the orbits. Its core is deadly; the wind around it spins you the other way round.
  function spawnDevil() { addHazard({ k: 'devil', o: S.rng.int(0, OUT), a: S.rng() * TAU, w: S.rng.sign() * S.rng.range(0.34, 0.5), ph: S.rng() * TAU, life: 12, warn: 1.1 }); }
  const devilPos = h => { const lo = R[Math.max(0, h.o - 1)], hi = R[Math.min(OUT, h.o + 1)], r = lerp(lo, hi, 0.5 + 0.5 * Math.sin(h.t * 0.8 + h.ph)); return [cx + Math.cos(h.a) * r, cy + Math.sin(h.a) * r]; };
  // EMBER RIFT, the Fire Blossom: a bud of fire sits on an orbit, opens its petals (shown by faint spokes) and throws six slow fireballs outward.
  function spawnBloom() { addHazard({ k: 'bloom', o: S.rng.int(0, OUT), a: S.rng() * TAU, w: S.rng.sign() * 0.14, ph: S.rng() * TAU, life: 7.8, warn: 1.2, fired: false, balls: [] }); }
  const BLOOM_FIRE = 2.5;
  // GLACIER DRIFT, the Hail Volley: shards of ice fall from the top of the sky down straight lanes, one after another. Each lane is marked first.
  function spawnHail() {
    const n = lv() > 0.5 ? 5 : 4, xs = [], span = (R[OUT] + 46 * u);
    for (let i = 0; i < 40 && xs.length < n; i++) { const x = cx + S.rng.range(-1, 1) * span; if (x > 22 * u && x < W - 22 * u && xs.every(q => Math.abs(q - x) > 34 * u)) xs.push(x); }
    const order = xs.map((x, i) => ({ x, at: 0.2 + i * 0.36 + S.rng.range(0, 0.14), y: -40 * u, done: false }));
    for (let i = order.length - 1; i > 0; i--) { const j = S.rng.int(0, i), t = order[i].x; order[i].x = order[j].x; order[j].x = t; }   // the order they fall in is shuffled
    addHazard({ k: 'hail', free: true, x: cx, y: cy, lanes: order, life: order.length * 0.4 + 2.2, warn: 1.25 });
  }
  const HAIL_FALL = 1.05, HAIL_LEN = 34;
  // PULSAR STORM, the Coil: a serpent of lightning spirals in from the edge towards the planet, then back out, its long body crossing every orbit.
  function spawnSerpent() { addHazard({ k: 'serpent', free: true, x: cx, y: cy, th0: S.rng() * TAU, dir: S.rng.sign(), Rs: Math.max(W, H) * 0.62, life: 9.2, warn: 1.3, pts: [] }); }
  const SERP_T1 = 4.3, SERP_T2 = 8.6;
  const serpentAt = (h, tau) => { const Rm = R[0] * 0.8, r = tau < SERP_T1 ? lerp(h.Rs, Rm, clamp(tau / SERP_T1, 0, 1)) : lerp(Rm, h.Rs, clamp((tau - SERP_T1) / (SERP_T2 - SERP_T1), 0, 1)), th = h.th0 + h.dir * 1.35 * tau;
    return [cx + Math.cos(th) * r, cy + Math.sin(th) * r]; };
  // VOID MAW, the Rift Twins: two doorways in the dark on different orbits. Touch one and you step out of the other.
  function spawnRift() {
    if (OUT < 1) return;
    const o1 = S.rng.int(0, OUT); let o2 = S.rng.int(0, OUT); if (o2 === o1) o2 = (o1 + 1 + S.rng.int(0, OUT - 1)) % (OUT + 1);
    const a1 = S.rng() * TAU;
    addHazard({ k: 'rift', o: o1, a: a1, o2, a2: a1 + S.rng.sign() * S.rng.range(1.7, 2.9), w: S.rng.sign() * S.rng.range(0.12, 0.22), life: 14, warn: 1.2 });
  }
  const riftEnds = h => [pos(h.o, h.a), pos(h.o2, h.a2)];
  function riftJump(h, to) {
    const p = S.p, [ox, oy] = playerXY(), no = to === 2 ? h.o2 : h.o, na = to === 2 ? h.a2 : h.a;
    p.o = no; p.th = na; p.r = R[no]; p.dr = 0; p.wx = cx + Math.cos(na) * R[no]; p.wy = cy + Math.sin(na) * R[no]; p.trail.length = 0;
    S.riftCd = 1.2; const [nx, ny] = playerXY();
    for (const [x, y] of [[ox, oy], [nx, ny]]) { burst(x, y, 12, 130 * u, '#c9a6ff', 2.2, 0.7); shockwave(x, y, '#e6d6ff', 60 * u, 0.6); }
    S.flash = Math.max(S.flash, 0.1); OD.audio.sfx('slingshot'); OD.haptic('medium');
    text('RIFT', nx, ny - 24 * u, '#e6d6ff', 17);
  }
  function tickBiomeHazard(h, dt, mg) {
    const [px, py] = playerXY(), fx = fxScale();
    if (h.k === 'ribbon') {
      if (Math.random() < 0.6 * fx) {
        const dir = Math.sign(h.w) || 1, th = h.a - dir * h.arc * Math.random(), r = ribbonR(h, th);
        particle(cx + Math.cos(th) * r, cy + Math.sin(th) * r, rand(-6, 6) * u, rand(6, 26) * u, rand(0.7, 1.2), rand(1.2, 2.4), Math.random() < 0.5 ? world.accent : world.accent2, { drag: 0.5 });
      }
    } else if (h.k === 'tether') {
      if (Math.random() < 0.45 * fx) { const [x1, y1, x2, y2] = tetherEnds(h), k = Math.random(); particle(x1 + (x2 - x1) * k, y1 + (y2 - y1) * k, rand(-30, 30) * u, rand(-30, 30) * u, 0.35, 1.7, '#ffc36b', { drag: 2 }); }
    } else if (h.k === 'cinder') {
      const want = Math.atan2(py - h.y, px - h.x), turn = (1.55 + 0.5 * lv()) * dt * mg, df = wrapA(want - h.ang);
      h.ang += clamp(df, -turn, turn);
      h.sp = Math.min(lerp(112, 150, lv()) * u, h.sp + 150 * u * dt);
      h.x += Math.cos(h.ang) * h.sp * dt * mg; h.y += Math.sin(h.ang) * h.sp * dt * mg;
      if (Math.random() < 0.9 * fx) particle(h.x - Math.cos(h.ang) * 7 * u, h.y - Math.sin(h.ang) * 7 * u, rand(-18, 18) * u - Math.cos(h.ang) * 20 * u, rand(-18, 18) * u - Math.sin(h.ang) * 20 * u - 8 * u, rand(0.4, 0.8), rand(1.4, 3), Math.random() < 0.5 ? '#ff7a2a' : '#ffd27a', { drag: 1.4 });
      if (h.life < 0.05 && !h.popped) { h.popped = true; burst(h.x, h.y, 18, 150 * u, '#ff9a4a', 2.4, 0.8); }
    } else if (h.k === 'spear') {
      if (h.thr < 1) {
        if (h.thr === 0) OD.audio.sfx('lance');
        h.thr = Math.min(1, h.thr + dt / 0.26);
        if (h.thr >= 1) { const [x, y] = spearTip(h); burst(x, y, 22, 200 * u, '#dff6ff', 2.4, 0.8); shockwave(x, y, '#bfeaff', 90 * u, 0.6); S.flash = Math.max(S.flash, 0.08); OD.haptic('light'); }
      } else if (Math.random() < 0.5 * fx) { const [x, y] = spearTip(h); particle(x + rand(-10, 10) * u, y + rand(-10, 10) * u, rand(-10, 10) * u, rand(-14, 4) * u, rand(0.6, 1.1), rand(1, 2.2), Math.random() < 0.5 ? '#ffffff' : '#9fe6ff', { drag: 0.6 }); }
      if (h.life < 0.05 && !h.shat) {
        h.shat = true;
        for (let i = 0; i < 16; i++) { const r = lerp(spearTipR(h), spearOuter() * 0.8, Math.random()); particle(cx + Math.cos(h.a) * r, cy + Math.sin(h.a) * r, rand(-70, 70) * u, rand(-70, 70) * u, rand(0.5, 1.0), rand(1.6, 3.4), Math.random() < 0.5 ? '#ffffff' : '#9fe6ff', { drag: 1.2 }); }
        OD.audio.sfx('dust', 12);
      }
    } else if (h.k === 'pylon') {
      const beat = S.clock * OD.audio.bpm(S.musicWorld || world) / 60;
      if (h.b0 == null) h.b0 = Math.ceil(beat);
      const ph = pylonPhase(h), pi = Math.floor(ph), [x1, y1, x2, y2] = pylonEnds(h);
      if (pi !== h.pi) {
        h.pi = pi;
        if (pi === 2) {   // the lightning
          OD.audio.sfx('arc'); S.flash = Math.max(S.flash, 0.06);
          for (const [x, y] of [[x1, y1], [x2, y2]]) burst(x, y, 8, 120 * u, '#e8dcff', 2, 0.5);
        }
      }
      if (pi === 1 && Math.random() < 0.8 * fx) { const e = Math.random() < 0.5 ? [x1, y1] : [x2, y2]; particle(e[0], e[1], rand(-40, 40) * u, rand(-40, 40) * u, 0.3, 1.5, '#cfe0ff', { drag: 2 }); }
    } else if (h.k === 'shade') {
      const q = histAt(S.histT - h.D);
      if (q) { h.px = h.x; h.py = h.y; h.x = q[0]; h.y = q[1]; if (h.px < -900) { h.px = h.x; h.py = h.y; } }
      if (Math.random() < 0.7 * fx) particle(h.x + rand(-6, 6) * u, h.y + rand(-6, 6) * u, rand(-10, 10) * u, rand(-20, -4) * u, rand(0.7, 1.3), rand(1.4, 3), Math.random() < 0.5 ? '#6b2bb8' : '#c77dff', { drag: 0.8 });
      if (h.life < 0.05 && !h.popped) { h.popped = true; burst(h.x, h.y, 22, 110 * u, '#c77dff', 2.6, 1); }
    } else if (h.k === 'shoal') {
      const tau = h.t - h.warn0;
      h.fish = []; for (let i = 0; i < h.n; i++) h.fish.push(shoalAt(h, tau - i * 0.16));
      h.x = h.fish[0][0]; h.y = h.fish[0][1];
      if (h.life < 0.5 && !h.popped) { h.popped = true; for (const f of h.fish) burst(f[0], f[1], 3, 50 * u, world.accent, 1.8, 0.6); }
      if (Math.random() < 0.7 * fx) { const f = h.fish[(Math.random() * h.n) | 0]; particle(f[0], f[1], rand(-8, 8) * u, rand(-8, 8) * u, rand(0.5, 0.9), rand(1, 2), Math.random() < 0.5 ? world.accent : '#ffffff', { drag: 1 }); }
    } else if (h.k === 'devil') {
      h.a += 0;   // (moves with the other orbit hazards, see the shared w step)
      S.devilCd = Math.max(0, (S.devilCd || 0) - dt);
      const [x, y] = devilPos(h);
      if (h.life < 0.9 && !h.popped) { h.popped = true; burst(x, y, 18, 120 * u, '#e0b070', 2.4, 0.9); }   // it spins itself out into a puff of sand
      if (Math.random() < 1.3 * fx) { const a = Math.random() * TAU, r = (6 + Math.random() * 18) * u; particle(x + Math.cos(a) * r, y + Math.sin(a) * r, -Math.sin(a) * 60 * u, Math.cos(a) * 60 * u - 14 * u, rand(0.5, 0.9), rand(1.4, 2.8), Math.random() < 0.5 ? '#e0b070' : '#a67b45', { drag: 1.2 }); }
    } else if (h.k === 'bloom') {
      const tau = h.t - h.warn0, [bx, by] = pos(h.o, h.a);
      if (!h.fired && tau >= BLOOM_FIRE) {
        h.fired = true; const n = 6, ph = h.ph, sp = (118 + 20 * lv()) * u;
        for (let i = 0; i < n; i++) { const a = ph + i * TAU / n; h.balls.push({ x: bx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0 }); }
        burst(bx, by, 22, 170 * u, '#ff9a4a', 2.6, 0.8); shockwave(bx, by, '#ffb347', 70 * u, 0.6); S.flash = Math.max(S.flash, 0.1); shake(2); OD.audio.sfx('boss');
      }
      if (h.life < 0.9 && !h.popped) { h.popped = true; burst(bx, by, 10, 90 * u, '#ff9a4a', 2.2, 0.7); }
      for (const b of h.balls) { b.t += dt * mg; b.x += b.vx * dt * mg; b.y += b.vy * dt * mg; if (Math.random() < 0.8 * fx) particle(b.x, b.y, rand(-14, 14) * u, rand(-14, 14) * u, rand(0.3, 0.6), rand(1.2, 2.6), Math.random() < 0.5 ? '#ff7a2a' : '#ffd27a', { drag: 1.6 }); }
      if (!h.fired && Math.random() < 0.9 * fx) particle(bx + rand(-8, 8) * u, by + rand(-8, 8) * u, rand(-14, 14) * u, rand(-40, -14) * u, rand(0.5, 0.9), rand(1.2, 2.4), '#ffb347', { drag: 1.4 });
    } else if (h.k === 'hail') {
      const tau = h.t - h.warn0;
      for (const l of h.lanes) {
        if (tau < l.at) { l.y = -60 * u; continue; }
        const k = clamp((tau - l.at) / HAIL_FALL, 0, 1); l.y = lerp(-HAIL_LEN * u, H + 20 * u, k * k * 0.35 + k * 0.65);
        if (k < 1 && Math.random() < 0.8 * fx) particle(l.x + rand(-3, 3) * u, l.y - HAIL_LEN * u * rand(0, 1), rand(-8, 8) * u, rand(-10, 6) * u, rand(0.3, 0.6), rand(1, 2), Math.random() < 0.5 ? '#ffffff' : '#9fe6ff', { drag: 1.5 });
        if (k >= 1 && !l.done) { l.done = true; for (let i = 0; i < 9; i++) particle(l.x, H - 30 * u, rand(-80, 80) * u, rand(-130, -30) * u, rand(0.4, 0.8), rand(1.4, 3), Math.random() < 0.5 ? '#ffffff' : '#bfeaff', { drag: 1.6 }); if (l.x > 0 && l.x < W) OD.audio.sfx('dust', 9); }
      }
    } else if (h.k === 'serpent') {
      const tau = h.t - h.warn0; h.pts = [];
      for (let i = 0; i < 15; i++) h.pts.push(serpentAt(h, tau - i * 0.085));
      h.x = h.pts[0][0]; h.y = h.pts[0][1];
      if (h.life < 0.6 && !h.popped) { h.popped = true; for (const q of h.pts) burst(q[0], q[1], 2, 70 * u, '#cfc2ff', 1.8, 0.7); }   // it comes apart into sparks
      if (Math.random() < 1.2 * fx) { const q = h.pts[(Math.random() * 15) | 0]; particle(q[0], q[1], rand(-30, 30) * u, rand(-30, 30) * u, rand(0.25, 0.5), rand(1, 2.2), Math.random() < 0.5 ? '#e8dcff' : '#8fb6ff', { drag: 2 }); }
    } else if (h.k === 'rift') {
      S.riftCd = Math.max(0, (S.riftCd || 0) - dt);
      if (h.life < 0.9 && !h.popped) { h.popped = true; for (const [x, y] of riftEnds(h)) { burst(x, y, 14, 100 * u, '#c9a6ff', 2.2, 0.8); shockwave(x, y, '#e6d6ff', 46 * u, 0.5); } }
      h.a2 += h.w * dt * mg / (S.rs || 1) * (0.55 + 0.45 * S.spd);   // both doorways circle together
      for (const [x, y] of riftEnds(h)) if (Math.random() < 0.8 * fx) { const a = Math.random() * TAU, r = 18 * u; particle(x + Math.cos(a) * r, y + Math.sin(a) * r, -Math.cos(a) * 36 * u, -Math.sin(a) * 36 * u, 0.5, rand(1, 2), Math.random() < 0.5 ? '#c9a6ff' : '#ffffff', { drag: 0.5 }); }
    }
  }
  function spawnDust(o, a0, n = 6, gap = 0.17) {
    n = Math.max(3, Math.round(n * ((world.mods && world.mods.dustMul) || 1) * pmod('dustMul') * (S.mods.lucky ? 1.5 : 1)));
    o = o == null ? S.rng.int(0, OUT) : o;
    a0 = a0 == null ? S.rng() * TAU : a0;
    for (let i = 0; i < n; i++) S.pk.push({ k: 'dust', o, a: a0 + i * gap, life: 9, t: -i * 0.07, x: 0, y: 0, pull: false });
  }
  function spawnPower(near) {
    const hard = S.mode === 'hardcore';
    if (S.mods.glass) return;
    const WTS = { shield: 1.6 * (pth('guard') ? 1.3 : 1), slow: 2.4, magnet: 2, phase: 2, bomb: 1.4, double: 2, zap: 2.4, overload: 1.1, life: 0.9, reaper: 1.4, amp: 1.2, alchemy: 1.1, prism: 1.4, fortune: 1.3, jackpot: 1, pulse: 1.2, surge: 0.9, twin: 1.2, stasis: 1, vortex: 0.9, aegis: 1.1, calm: 0.6, sense: 0.6, daredevil: 0.6, lucky_star: 0.5, momentum: 0.6 };
    // no power-up you are already full of is likely, and the last few kinds are skipped, so it keeps surprising you
    const p = S.p;
    if (p.shield >= (pth('guard') ? 3 : 2)) WTS.shield *= 0.2; if (S.lives >= maxLives()) WTS.life *= 0.05; if (p.zap >= 4) WTS.zap *= 0.3; if (p.aegis >= 2) WTS.aegis *= 0.2;
    for (const k of TIMED) if (p[k] > 0) WTS[k] = (WTS[k] || 1) * 0.35;
    const gate = t => OD.save.stats.runs >= 4 || canUse(t);   // after the first few runs every kind can show up; the first time you meet one it is explained
    let types = (hard ? ['magnet'] : Object.keys(WTS)).filter(gate).filter(t => OD.POWERS[t].cat !== 'perk' || (S.perks[t] || 0) < 3);
    if (!types.length) return;
    if (pv('providence')) {   // Providence: when you are short of protection, what comes next is defensive
      const prot = (+p.shield || 0) + (p.zap > 0 ? 1 : 0) + (p.aegis > 0 ? p.aegis : 0) + Math.max(0, S.lives), def = types.filter(t => t === 'shield' || t === 'zap' || t === 'aegis' || t === 'life');
      if (prot <= Math.min(1, pv('providence') - 1) && def.length) types = def;
    }
    const rec = S.dir.recentPow = S.dir.recentPow || [], fresh = types.filter(t => !rec.includes(t));
    if (fresh.length >= 3) types = fresh;
    // variety: the kind of power-up you just got (a charge, a timed boost, an instant...) is less likely again, and what you actually need is likelier
    const lastCat = rec.length ? OD.POWERS[rec[rec.length - 1]].cat : null, lastCat2 = rec.length > 1 ? OD.POWERS[rec[rec.length - 2]].cat : null;
    for (const t of types) { const c = OD.POWERS[t].cat; if (c === lastCat) WTS[t] *= c === lastCat2 ? 0.2 : 0.55; }
    if (S.lives <= 1 && WTS.life) WTS.life *= 2.2;
    if (p.shield <= 0 && WTS.shield) WTS.shield *= 1.5;
    let tw = 0; for (const t of types) tw += WTS[t];
    let rr = S.rng() * tw, type = types[0];
    for (const t of types) { rr -= WTS[t]; if (rr <= 0) { type = t; break; } }
    introduce(type === 'twin' ? 'wingman' : type); rec.push(type); if (rec.length > 4) rec.shift();
    if (near) S.pk.push({ k: 'power', type, o: S.p.o, a: S.p.th + S.p.dir * 0.7, w: 0, life: 11, t: 0, x: 0, y: 0 });
    else S.pk.push({ k: 'power', type, o: S.rng.int(0, OUT), a: S.rng() * TAU, w: 0.3 * S.rng.sign(), life: 11, t: 0, x: 0, y: 0 });
  }
  function banner(str, sub) { S.banner = { str: clean(str), sub: clean(sub) }; S.bannerT = 2.2; S.bannerTgt = null; S.bannerY = null; }

  // THE BLACK HOLE, the last fight of a universe. A black hole so huge that only a sliver of it fits on screen slides in from the left and drags the
  // whole system towards its edge: its six orbits become the world, drawn as arcs. Your planet is torn apart and swallowed. For about a minute the hole
  // eats its orbits one by one, innermost first (the one nearest the hole): the orbit blinks as a warning, then collapses into the hole with everything
  // on it. When a single orbit is left you still have to hold on a few seconds, and then the hole takes you anyway: the screen goes black, then
  // white, and the universe is won.
  const BH = { IN: 4.6, EAT: [14, 26, 37, 47, 55], WARN: 3.8, EATD: 1.8, LAST: 3.6, SUCK: 3.4, BLACK: 1.9, WHITE: 1.6 };
  const NB = 6;   // the hole's orbits
  const lowO = () => { const b = S && S.dir && S.dir.boss; return b && b.kind === 'singularity' && b.cap ? b.minO : 0; };   // the lowest orbit that still exists
  const bossOn = () => !!(S && S.dir && S.dir.boss && S.dir.boss.kind === 'singularity');
  const bossCap = () => { const b = S && S.dir && S.dir.boss; return !!(b && b.kind === 'singularity' && b.cap); };
  // only a sliver of each orbit is visible: that arc, around angle 0, is the playfield
  const holeLim = r => Math.asin(Math.min(1, H * 0.3 / Math.max(r, 1)));
  function holeSpread(from) {   // new hazards appear on the visible arc, not somewhere round the back
    for (let i = from; i < S.hz.length; i++) {
      const h = S.hz[i];
      if (h.k === 'strike') continue;
      const lim = holeLim(R[h.o != null ? h.o : OUT]);
      if (h.k === 'ring') h.a = rand(-0.5, 0.5) * lim;
      else if (h.o != null) h.a = Math.random() < 0.68 ? rand(-0.85, 0.85) * lim : (Math.random() < 0.5 ? 1 : -1) * (lim + rand(0.12, 0.9));   // some wait just beyond the edge of the screen
    }
  }
  function holeGeom() {   // a huge black hole with six orbits: its centre sits far to the left, so only a sliver of each orbit shows
    const cxH = -H * 0.55, r = [];
    for (let i = 0; i < NB; i++) r.push(W * lerp(0.12, 0.8, i / (NB - 1)) - cxH);
    return { cxH, r, rH: r[0] - W * 0.08, gap: W * 0.08 };
  }
  function spawnSingularity() {
    introduce('singularity');
    const d = S.dir, hg = holeGeom();
    d.boss = { kind: 'singularity', born: S.clock, t: 0, cap: false, hg, cxH: hg.cxH, hx: hg.cxH - hg.rH - W * 0.7, minO: 0, eatI: 0, eat: null, warned: false, warnQ: 0, nextSpawn: BH.IN + 5, nextDust: 0, seq: 0, e: 0, rH: hg.rH, lc: S.clock, lastAt: -1, suck: false, eaten: false, home: null, oldRings: null };
    banner('THE BLACK HOLE', 'It is drifting in'); OD.audio.fx('boss', { loop: true, fade: 1.5, gain: 0.85 }); OD.audio.setBoss(true);   // the fight has its own song, mixed in
    OD.audio.sfx('boss'); shake(6); OD.haptic('heavy'); S.flash = Math.max(S.flash, 0.2);
    for (const h of S.hz) { if (DRIFT.has(h.k)) { h.dead = true; h.exit = true; h.fo = 0; } else { const [hx, hy] = hpos(h); burst(hx, hy, 6, 90 * u, world.danger, 2, 0.8); h.dead = true; } }
    for (const q of S.pk) q.dead = true;
    S.vis = null;
  }
  // keep a freshly spawned hazard on an orbit that still exists
  function boxHazards(from, bs) {
    const lo = bs.minO, span = OUT - lo + 1;
    for (let i = from; i < S.hz.length; i++) {
      const h = S.hz[i];
      if (h.o != null && h.o < lo) h.o = lo + ((h.o + bs.seq) % span);
      if (h.o0 != null && h.o0 < lo) { h.o0 = Math.min(lo, OUT - 1); h.o1 = h.o0 + 1; }
    }
  }
  // hazards from every sky you have crossed come back here, one or two at a time
  const BOSS_POOL = [[0, ['rock', 'comet', 'mine']], [0.08, ['ring', 'ribbon', 'shoal']], [0.2, ['spinner', 'tether', 'devil']], [0.32, ['cinder', 'bloom', 'beam']], [0.44, ['hail', 'hole', 'rift']], [0.55, ['pylon', 'strike']]];
  const HARD_LAST = new Set(['cinder', 'beam', 'hail', 'pylon', 'strike', 'rift', 'hole', 'spinner']);   // too much for the last orbit left
  function bossHazard(bs) {
    const prog = clamp(bs.t / 58, 0, 1), left = OUT - bs.minO + 1, pool = [];
    for (const [at, ks] of BOSS_POOL) if (prog >= at) for (const k of ks) { if (k === 'beam' && left < 3) continue; if (left < 2 && HARD_LAST.has(k)) continue; pool.push(k); if (k === 'rock' || k === 'comet') pool.push(k); }
    let k = pool[(S.rng() * pool.length) | 0]; if (k === S.dir.lastBoss) k = pool[(S.rng() * pool.length) | 0]; S.dir.lastBoss = k;
    const from = S.hz.length;
    ({ rock: spawnRocks, comet: spawnComets, mine: spawnMines, ring: () => { const oo = S.rng.int(bs.minO, OUT); spawnRing(oo, 0, clamp(170 * u / R[oo], 0.12, 0.5), 6, 1.8); }, beam: spawnBeam, hole: spawnHole, spinner: spawnSpinner, strike: spawnStrike,
      ribbon: spawnRibbon, tether: spawnTether, pylon: spawnPylon, shoal: spawnShoal, devil: spawnDevil, bloom: spawnBloom, hail: spawnHail, rift: spawnRift,
      cinder: () => spawnCinder(), })[k]();
    const cap = prog > 0.5 ? 3 : 2; if (S.hz.length > from + cap) S.hz.length = from + cap;
    boxHazards(from, bs); holeSpread(from);
    OD.audio.sfx('warn');
  }
  function eatOrbit(bs) {
    const o = bs.minO, p = S.p; bs.eat = { o, t0: bs.t, q: 0 };
    // everything on the orbit is dragged into the hole with it
    for (const h of S.hz) {
      if (h.dead || h.o == null || h.o > o) continue;
      const [hx, hy] = hpos(h); h.dead = true;
      for (let i = 0; i < 6; i++) particle(hx, hy, (bs.hx - hx) * (0.8 + Math.random() * 0.5) + rand(-30, 30) * u, rand(-40, 40) * u, 0.9, rand(1.4, 3), world.danger, { drag: 0 });
    }
    for (const q of S.pk) { if (q.o != null && q.o <= o) q.dead = true; }
    if (!S.dying && !S.over && ((p.body === 'main' && p.o <= o) || (p.jump && p.jump.n != null && p.jump.n <= o))) { S.endCause = 'singularity'; p.inv = 0; die(null, 'singularity'); return; }
    shake(7); S.flash = Math.max(S.flash, 0.22); OD.haptic('heavy'); OD.audio.sfx('boss');
  }
  function singularityTick(bs) {
    const t = S.clock - bs.born, hg = bs.hg, hold0 = BH.IN, p = S.p, dtb = clamp(S.clock - bs.lc, 0, 0.1), hx0 = hg.cxH - hg.rH - W * 0.7; bs.lc = S.clock; bs.t = t;
    bs.e = OD.smooth(Math.min(1, t / 1.2));
    if (bs.cap && bs.minO >= OUT && !bs.pruned) { bs.pruned = true; for (const h of S.hz) if (!h.dead && HARD_LAST.has(h.k)) { const [hx, hy] = hpos(h); burst(hx, hy, 8, 110 * u, world.danger, 2, 0.7); h.dead = true; } }   // the last orbit is left in peace: no chasing embers or walls
    bs.hx = t < hold0 ? lerp(hx0, hg.cxH, OD.smooth(t / hold0)) : hg.cxH;   // sliding in, then parked
    if (t >= hold0 && !bs.cap) {   // captured: the hole's orbits become the world, and you are pulled onto the outermost one
      const home = { NO, OUT, outR: Rb[OUT] };
      bs.oldRings = { r: Rb.slice(0, NO), cx0: cx, t0: S.clock, t: 0 }; bs.home = home; NO = NB; OUT = NB - 1; Rb = hg.r.concat(hg.r[NB - 1]).slice(0, 6); R = Rb.slice(); cx = hg.cxH; bs.cap = true; S.old = null;
      if (p.body === 'main') { const a = clamp(Math.atan2(p.wy - cy, p.wx - cx), -holeLim(R[OUT]) * 0.9, holeLim(R[OUT]) * 0.9); startCross('main', OUT, a, 0.65); p.dir = 1; p.vd = 1; }
      shake(10); S.flash = Math.max(S.flash, 0.35); OD.haptic('heavy'); banner('THE BLACK HOLE', 'Hold on. It eats the orbits');
    }
    // your own planet is torn into a streak, heated and swallowed along a spiral while the hole holds you
    S.bhPlanet = null;
    if (bs.cap && !bs.eaten) {
      const k = clamp((t - hold0) / 3.4, 0, 1), kk = k * k * (3 - 2 * k), r0 = W / 2 - hg.cxH, r1 = bs.rH + PR * 0.3;
      const pos = kq => { const q = kq * kq * (3 - 2 * kq), rr = lerp(r0, r1, Math.pow(q, 1.35)), th = -0.55 * Math.pow(q, 1.25); return [bs.hx + Math.cos(th) * rr, cy + Math.sin(th) * rr]; };
      const [x, y] = pos(k), [x2, y2] = pos(Math.min(1, k + 0.02)), ang = Math.atan2(y2 - y, x2 - x);
      S.bhPlanet = { x, y, s: 1 - 0.78 * kk, stretch: 1 + 5 * kk * kk, ang, a: k < 0.85 ? 1 : 1 - (k - 0.85) / 0.15, heat: kk, ghosts: [1, 2, 3, 4, 5].map(j => { const [gx, gy] = pos(Math.max(0, k - j * 0.035)); return [gx, gy]; }) };
      if (Math.random() < 1.2 * fxScale()) particle(x + rand(-1, 1) * PR * 0.7, y + rand(-1, 1) * PR * 0.7, (x2 - x) * 30 + rand(-30, 30) * u, (y2 - y) * 30 + rand(-30, 30) * u, 1.1, rand(1.6, 3.8), ['#ffd9a0', '#ff9a50', world.accent][(Math.random() * 3) | 0], { drag: 0.3 });
      if (k >= 1) { bs.eaten = true; const ex = bs.hx + r1; shockwave(ex, y, '#ffd9a0', 150 * u, 0.8); shockwave(ex, y, '#ffffff', 80 * u, 0.5); burst(ex, y, 26, 260 * u, '#ffd9a0', 2.6, 0.9); S.flashes = S.flashes || []; S.flashes.push({ x: ex, y, t: 0, r: 120 * u, c: '#ffb070' }); shake(10); S.flash = Math.max(S.flash, 0.4); }
    }
    if (t < BH.EAT[BH.EAT.length - 1] + 3 && (S.tick = (S.tick || 0) + 1) % 14 === 0) shake(2 + (bs.cap ? 2 : 1) + 2 * bs.warnQ);
    if (!bs.suck && Math.random() < 1.1 * fxScale()) {   // gas and starlight spiralling into the hole: tangent plus inward, speeding up as it falls
      const a0 = rand(-0.7, 0.7), span = hg.r[NB - 1] - hg.r[0] + W * 0.12, rr = hg.r[0] + rand(-0.05, 0.9) * span, x = bs.hx + Math.cos(a0) * rr, y = cy + Math.sin(a0) * rr;
      if (x > -20 && x < W + 20 && y > -20 && y < H + 20) {
        const sp = (60 + 160 * (1 - (rr - hg.r[0]) / span)) * u, tx = -Math.sin(a0), ty = Math.cos(a0), ix = -Math.cos(a0), iy = -Math.sin(a0), s2 = rand(0.8, 1.2) * (Math.random() < 0.5 ? 1 : -1);
        particle(x, y, (tx * s2 * sp + ix * sp * 0.35), (ty * s2 * sp + iy * sp * 0.35), rand(1.3, 2.4), rand(1, 2.6), ['#fff0d0', '#ffb070', '#c9a0ff', '#9fd6ff'][(Math.random() * 4) | 0], { drag: 0 });
      }
    }
    if (!bs.cap) return;
    // the edge of the hole grows to fill the space of the orbits it has eaten
    const rHt = hg.r[Math.min(bs.minO, OUT)] - hg.gap; bs.rH += (rHt - bs.rH) * Math.min(1, dtb * 2.4);
    // the eating: a blinking warning, then the collapse
    const at = BH.EAT[bs.eatI];
    if (at != null && !bs.eat) {
      bs.warnQ = clamp((t - (at - BH.WARN)) / BH.WARN, 0, 1);
      if (bs.warnQ > 0 && t - (bs.beepAt || 0) > lerp(0.9, 0.36, bs.warnQ)) { bs.beepAt = t; OD.audio.sfx('warn'); OD.haptic('light'); }
      if (bs.warnQ > 0 && !bs.warned) { bs.warned = true; banner(bs.eatI === 0 ? 'THE NEAREST ORBIT IS COLLAPSING' : 'ANOTHER ORBIT IS GOING', 'Move out'); OD.audio.sfx('warn'); OD.haptic('medium'); }
      if (t >= at) eatOrbit(bs);
    }
    if (bs.eat) {
      bs.eat.q = clamp((t - bs.eat.t0) / BH.EATD, 0, 1);
      if (Math.random() < 2.2 * fxScale()) { const a = rand(-0.5, 0.5) * holeLim(R[bs.eat.o]), rr = R[bs.eat.o] * (1 - bs.eat.q * 0.4); particle(bs.hx + Math.cos(a) * rr, cy + Math.sin(a) * rr, -Math.cos(a) * 170 * u, -Math.sin(a) * 170 * u, 0.6, rand(1.6, 3.2), '#ffd9a0', { drag: 0 }); }
      if (bs.eat.q >= 1) {
        const o = bs.eat.o; bs.minO = o + 1; bs.eat = null; bs.eatI++; bs.warned = false; bs.warnQ = 0;
        const ex = bs.hx + hg.r[Math.min(bs.minO, OUT)] - hg.gap; shockwave(ex, cy, '#ffd9a0', 230 * u, 0.9); shockwave(ex, cy, '#ffffff', 130 * u, 0.6); shake(7); S.flash = Math.max(S.flash, 0.3);
        S.stats.eaten = (S.stats.eaten || 0) + 1; addScore(250 * S.mult); const left = OUT - bs.minO + 1; text(left + (left === 1 ? ' ORBIT LEFT' : ' ORBITS LEFT'), W * 0.5, H * 0.3, '#ffd9a0', 22);
        if (bs.minO >= OUT) { bs.lastAt = t; banner('ONE ORBIT LEFT', 'Hold on'); }
      }
    }
    // hazards: more and more of them in less and less room
    if (t > hold0 + 3.6 && !bs.suck && S.clock >= bs.nextSpawn && !(bs.eat && bs.eat.q < 0.5)) { bossHazard(bs); bs.nextSpawn = S.clock + lerp(4.2, 2.2, clamp(t / 58, 0, 1)); }
    if (t > hold0 + 4 && !bs.suck && S.clock >= bs.nextDust) { const o = S.rng.int(bs.minO, OUT), lim = holeLim(R[o]); spawnDust(o, Math.random() < 0.6 ? rand(-0.3, 0.2) : (Math.random() < 0.5 ? 1 : -1) * (lim + 0.1), 5, 0.17 / (S.rs || 1)); bs.nextDust = S.clock + 3.8; }
    // the last orbit: a few seconds, then the hole takes you
    if (bs.minO >= OUT && !bs.suck && !S.dying && bs.lastAt >= 0 && t >= bs.lastAt + BH.LAST) {
      bs.suck = true; S.win = { t: 0, r0: p.r || R[OUT], th0: p.th, stage: 0 }; p.inv = 999; p.jump = null;
      for (const h of S.hz) { h.dead = true; h.exit = true; h.fo = 0; } for (const q of S.pk) q.dead = true;
      OD.audio.sfx('horizon'); OD.haptic('heavy'); OD.audio.fxStop('boss', 2.5);
    }
  }
  // the end of the fight: you fall into the hole along the visible arc, the screen goes black, and then white
  function winTick(dt) {
    const w = S.win, p = S.p, bs = S.dir.boss; w.t += dt;
    const k = clamp(w.t / BH.SUCK, 0, 1), e = k * k;
    if (w.t < BH.SUCK + 0.4) {
      const rr = lerp(w.r0, bs.rH + 4 * u, Math.pow(k, 1.6)), th = w.th0 * (1 - Math.min(1, k * 1.4)) + Math.sin(w.t * 6) * 0.03 * (1 - k);
      p.wx = cx + Math.cos(th) * rr; p.wy = cy + Math.sin(th) * rr; p.th = th; p.r = rr;
      p.trail.push({ x: p.wx, y: p.wy, t: 0 }); if (p.trail.length > 44) p.trail.shift();
    }
    w.ox = bs.hx + bs.rH; w.oy = cy;   // the light starts at the edge of the hole
    w.blackK = clamp((w.t - (BH.SUCK - 0.25)) / 1.15, 0, 1);   // the darkness spreads out of the hole as soon as you are inside it
    w.white = clamp((w.t - (BH.SUCK + BH.BLACK)) / BH.WHITE, 0, 1);   // and after a moment the white light blooms from the middle of the screen
    shake(2 + 8 * e);
    if (!w.muted && w.t >= BH.SUCK - 0.3) { w.muted = true; OD.audio.stopMusic(); }
    if (w.stage === 0 && w.t >= BH.SUCK + BH.BLACK) { w.stage = 1; OD.audio.sfx('victory'); OD.haptic('heavy'); }
    if (w.stage === 1 && w.t >= BH.SUCK + BH.BLACK + BH.WHITE) { w.stage = 2; winRun(); }
  }
  function winRun() {
    S.stats.bosses++; S.won = true;
    addScore(3000 * S.mult * (S.uni || 1));
    OD.save.wins = (OD.save.wins || 0) + 1;
    S.endCause = 'win'; OD.audio.setBoss(false);
    endRun('win');
  }
  // the black hole itself: a dark horizon, many glowing accretion layers, a lensing halo
  function drawSingularity(bs) {
    const e = bs.e; if (e <= 0.01) return;
    const hg = bs.hg, rH = bs.rH, reach = hg.r[NB - 1] + W * 0.14;
    if (bs.hx + reach < -10) return;
    const t = tAnim, win = S.win ? 1 + 0.6 * clamp(S.win.t / BH.SUCK, 0, 1) : 1;
    // the old system's rings are stretched towards the hole and fade as it takes over
    if (bs.oldRings) {
      const q = (S.clock - bs.oldRings.t0) / 1.8;
      if (q > 0 && q < 1) {
        ctx.save(); ctx.translate(bs.oldRings.cx0 - q * q * W * 0.55, cy); ctx.scale(1 + 2.2 * q * q, 1 - 0.45 * q); ctx.lineWidth = 1.4;
        for (const rr of bs.oldRings.r) { ctx.strokeStyle = `rgba(160,220,255,${0.5 * Math.pow(1 - q, 1.5)})`; ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke(); }
        ctx.restore();
      }
    }
    ctx.save(); ctx.translate(bs.hx, cy);
    const gl = ctx.createRadialGradient(0, 0, rH * 0.9, 0, 0, reach);
    gl.addColorStop(0, `rgba(0,0,0,${0.9 * e})`); gl.addColorStop(0.16, `rgba(80,24,120,${0.34 * e})`); gl.addColorStop(0.5, `rgba(255,120,40,${0.09 * e})`); gl.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, 0, reach, 0, TAU); ctx.fill();
    // slow gravity ripples spreading outwards
    for (let j = 0; j < 3; j++) { const k = (t * 0.28 + j / 3) % 1; ctx.strokeStyle = `rgba(190,150,255,${0.16 * (1 - k) * e})`; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.arc(0, 0, rH * 1.04 + k * (reach - rH), 0, TAU); ctx.stroke(); }
    ctx.globalCompositeOperation = 'lighter';
    const layers = 14;
    for (let i = 0; i < layers; i++) {
      const q = i / (layers - 1), rr = lerp(rH * 1.025, rH + (reach - rH) * 0.8, Math.pow(q, 0.8)) + Math.sin(t * 0.7 + i * 1.7) * 3 * u;
      const dir = i % 3 === 1 ? -1 : 1, a0 = t * (0.55 - 0.4 * q) * dir * 220 / rr * 1.6 * win + i * 2.1;
      const col = q < 0.25 ? [255, 244, 220] : q < 0.55 ? [255, 160, 90] : [165, 100, 255];
      const A = (0.55 - 0.32 * q) * e, wdt = (5.5 - 3.6 * q) * u * (0.8 + 0.4 * Math.sin(t * 0.9 + i));
      let grad; try { grad = ctx.createConicGradient(a0, 0, 0); } catch (err) { grad = null; }
      if (grad) {
        const c = a_ => `rgba(${col[0]},${col[1]},${col[2]},${a_.toFixed(3)})`;
        grad.addColorStop(0, c(A)); grad.addColorStop(0.2, c(A * 0.4)); grad.addColorStop(0.5, c(A * 0.06)); grad.addColorStop(0.9, c(A * 0.04)); grad.addColorStop(1, c(A));
        ctx.strokeStyle = grad; ctx.lineWidth = wdt; ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
      } else { ctx.strokeStyle = OD.rgba('#ffb070', A * 0.5); ctx.lineWidth = wdt; ctx.beginPath(); ctx.arc(0, 0, rr, a0, a0 + 2); ctx.stroke(); }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(2,0,8,${0.99 * e})`; ctx.beginPath(); ctx.arc(0, 0, rH, 0, TAU); ctx.fill();
    // the photon ring: a thin, bright, slightly breathing edge, with a faint echo of lensed light just outside
    ctx.strokeStyle = OD.rgba('#ffe7c0', 0.28 * e); ctx.lineWidth = 12 * u; ctx.beginPath(); ctx.arc(0, 0, rH + 4 * u, 0, TAU); ctx.stroke();
    ctx.strokeStyle = OD.rgba('#fff3dc', (0.85 + 0.1 * Math.sin(t * 2)) * e); ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.arc(0, 0, rH + 1.5 * u, 0, TAU); ctx.stroke();
    ctx.strokeStyle = OD.rgba('#ffd0a0', 0.18 * e); ctx.lineWidth = 1.2 * u; ctx.beginPath(); ctx.arc(0, 0, rH * 1.07, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  // the hole's orbits: the nearest one blinks red before it is eaten, and the one being eaten shrinks into the hole
  function drawBossOrbits(bs) {
    const pu = 0.5 + 0.5 * Math.sin(tAnim * 3);
    ctx.save(); ctx.lineCap = 'round';
    for (let i = bs.minO; i < NO; i++) {
      const mine = S.p.body === 'main' && S.p.o === i, edge = i === OUT; let r = R[i], a = 1, col = null, extra = 0;
      if (i === bs.minO && !bs.eat && bs.warnQ > 0) { const bl = Math.sin(tAnim * (9 + 18 * bs.warnQ)) > 0 ? 1 : 0.15; col = '#ff3355'; a = 0.3 + 0.7 * bl; extra = 1 + 2 * bs.warnQ; glowRing(r, '#ff1f44', 0.55 * bl * (0.4 + 0.6 * bs.warnQ)); dangerEdge(bl * bs.warnQ); }
      if (bs.eat && i === bs.eat.o) { const q = bs.eat.q, ee = q * q; r = lerp(R[i], bs.rH + 4 * u, ee); a = 1 - q * q; col = '#ffd9a0'; extra = q; glowRing(r, '#ffb070', 0.5 * (1 - q)); }
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = col ? OD.rgba(col, 0.2 * a) : `rgba(150,215,255,${mine ? 0.22 : 0.1})`; ctx.lineWidth = (mine ? 9 : 6) * u + 6 * extra * u; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = col ? OD.rgba(col, 0.9 * a) : mine ? 'rgba(255,255,255,0.85)' : `rgba(200,230,255,${edge ? 0.6 + 0.2 * pu : 0.5})`; ctx.lineWidth = (mine ? 2.6 : edge ? 2.4 : 1.8) * u + 2.5 * extra * u;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
  // the end of the fight on screen: everything fades to black, and then a white light spreads from the hole until the whole screen is white
  function drawWinOverlay() {
    const w = S.win; if (!w) return;
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const D = Math.hypot(W, H);
    if (w.blackK > 0.001) {   // blackness propagating from the hole, over the whole screen
      const ox = w.ox == null ? W * 0.1 : w.ox, oy = w.oy == null ? H / 2 : w.oy, k = 1 - Math.pow(1 - w.blackK, 2.2), rb = D * 1.25 * k;
      const g = ctx.createRadialGradient(ox, oy, rb * 0.72, ox, oy, rb + 1); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.85, 'rgba(0,0,0,0.96)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      if (w.blackK >= 1) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
    }
    if (w.white > 0.001) {   // a clean, even explosion of white from the centre: a bright wavefront, rings behind it, then everything is white
      const k = w.white, e = 1 - Math.pow(1 - k, 2.4), mx = W / 2, my = H / 2, rr = D * 0.62 * e + 1;
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(mx, my, 0, mx, my, rr);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.7, `rgba(255,250,240,${0.95})`); g.addColorStop(0.92, 'rgba(255,236,200,0.9)'); g.addColorStop(1, 'rgba(255,230,190,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mx, my, rr, 0, TAU); ctx.fill();
      for (let i = 0; i < 3; i++) { const q = clamp(e * 1.15 - i * 0.14, 0, 1); if (q <= 0 || q >= 1) continue; ctx.strokeStyle = `rgba(255,245,225,${0.8 * (1 - q)})`; ctx.lineWidth = (14 - 8 * q) * u; ctx.beginPath(); ctx.arc(mx, my, D * 0.62 * q, 0, TAU); ctx.stroke(); }
      for (let i = 0; i < 24; i++) { const a = i / 24 * TAU + 0.2, l0 = rr * 0.55, l1 = rr * (0.9 + 0.12 * Math.sin(i * 3.1)); ctx.strokeStyle = `rgba(255,248,230,${0.5 * (1 - k)})`; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.moveTo(mx + Math.cos(a) * l0, my + Math.sin(a) * l0); ctx.lineTo(mx + Math.cos(a) * l1, my + Math.sin(a) * l1); ctx.stroke(); }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = clamp((k - 0.62) / 0.3, 0, 1); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  // a red pulse along the left edge, where the hole is, while an orbit is about to be eaten
  function dangerEdge(k) {
    if (k <= 0.01) return;
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, W * 0.4, 0); g.addColorStop(0, `rgba(255,30,60,${0.38 * k})`); g.addColorStop(1, 'rgba(255,30,60,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W * 0.4, H); ctx.restore();
  }
  function glowRing(r, col, al) { ctx.save(); ctx.strokeStyle = OD.rgba(col, al); ctx.lineWidth = 12 * u; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke(); ctx.restore(); }
  function spawnBoss() { spawnSingularity(); }

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
    { const bk = BIOME_HAZ[world.id];   // this biome's own danger
      if (bk && has(bk) && t > BIOME_T[bk] && canUse(bk) && S.hz.filter(h => h.k === bk && !h.dead).length < BIOME_CAP[bk] && !S.hz.some(h => !h.dead && h.k === BIZ2[world.id])) allowed.push([bk, S.bizSeen && S.bizSeen[bk] ? 3.4 : 9]); }   // the biome's own danger comes early, then often
    { const b2 = BIZ2[world.id], live = S.hz.some(h => !h.dead && BIOME_HAZ_SET.has(h.k));   // a second, rarer one: never together with another, and after a pause
      if (b2 && has(b2) && t > BIZ2_T[b2] && canUse(b2) && !live && t - (S.bizAt || -99) > 12) allowed.push([b2, S.bizSeen && S.bizSeen[b2] ? 2.2 : 8]); }
    for (const id in ERA_SPAWN) if (eraIs(id)) for (const [k, w, gate] of ERA_SPAWN[id]) {
      if (!canUse(gate) || t < 12 || allowed.some(q => q[0] === k && q[1] >= w) || (k === 'hole' || k === 'ring') && S.hz.some(h => h.k === k)) continue;
      allowed.push([k, w]);
    }
    const baseP = sub ? [['rock', 1]] : allowed;
    let pool = baseP.filter(([k]) => k !== S.dir.lastType);
    if (!pool.length) pool = baseP;
    let tot = 0; for (const [, w] of pool) tot += w;
    let r = S.rng() * tot, pick = pool[0][0];
    for (const [k, w] of pool) { r -= w; if (r <= 0) { pick = k; break; } }
    S.dir.lastType = pick;
    if (BIOME_HAZ_SET.has(pick)) { (S.bizSeen || (S.bizSeen = {}))[pick] = true; S.bizAt = t; }
    const solid = S.hz.filter(h => h.warn <= 0 && h.k !== 'comet').length;
    if (solid > 5 + Math.floor(lv() * 3)) return;
    ({ rock: spawnRocks, comet: spawnComets, mine: spawnMines, ring: () => spawnRing(S.rng.int(0, OUT)), beam: spawnBeam, hole: spawnHole, spinner: spawnSpinner, strike: spawnStrike, cloud: spawnCloud,
      ribbon: spawnRibbon, tether: spawnTether, pylon: spawnPylon, shade: spawnShade, shoal: spawnShoal, devil: spawnDevil, bloom: spawnBloom, hail: spawnHail, serpent: spawnSerpent, rift: spawnRift,
      cinder: () => { spawnCinder(); if (lv() > 0.5 && S.rng() < 0.5) spawnCinder(0.9); }, spear: () => { spawnSpear(); if (lv() > 0.6 && S.rng() < 0.45) spawnSpear(0.5); } })[pick]();
    OD.audio.sfx('warn');
    introduce(pick === 'hole' ? 'well' : pick === 'bloom' ? 'blossom' : pick);
  }

  // ------------------------------------------------------------- director
  function waveInterval() {
    let iv = lerp(7, 3.6, lv()) * (1.25 - 0.4 * wd());
    if (S.mode === 'timeattack') iv *= 0.6;
    if (S.mode === 'zen') iv *= 1.9;
    if (S.mode === 'hardcore') iv *= 0.9;
    if (S.mods.heavy) iv *= 0.72;
    return clamp(Math.round(iv), 3, 12);
  }
  function onBeat(b) {
    S.beatPulse = 1;
    const d = S.dir;
    if (S.tut >= 0 || S.intro || (S.vis && S.vis.phase === 'settle') || (d.boss && d.boss.kind === 'singularity')) return;
    if (b >= d.nextWave && b % 2 === 0) { spawnWave(); d.nextWave = b + waveInterval(); }
    if (b >= d.nextDust) { spawnDust(); introduce('dust'); d.nextDust = b + Math.max(3, Math.round(S.rng.int(5, 9) * (eraIs('verdant') ? 0.6 : 1))); }
    if (b >= d.nextPower && S.mode !== 'timeattack') { spawnPower(); d.nextPower = b + Math.round(S.rng.int(22, 34) * (0.85 + 0.3 * wd()) / ((S.mods.lucky ? 2 : 1) * (1 + 0.25 * perk('lucky_star') + 0.08 * pv('charm')) * (eraIs('verdant') ? 1.3 : 1) * (eraIs('prism') ? 0.8 : 1))); }
    if (S.bossDue && !d.boss && !S.vis && !S.evt && !S.win && b % 4 === 0) { S.bossDue = false; spawnBoss(); }   // the sixth sky is done: the black hole comes
    if (S.tut < 0 && S.time >= d.nextEvt && !S.over && b % 4 === 0) { spawnEvent(); d.nextEvt = S.time + S.rng.range(24, 40) / ((1 + 0.5 * wd()) * ((world.mods && world.mods.evMul) || 1) * (S.mods.volatile ? 1.8 : 1)); }
    if (!S.vis && !S.evt && !d.boss && !S.bossDue && S.mode !== 'timeattack' && !S.tour && S.score >= OD.planetScoreAt(S.stats.hops) * (S.mods.volatile ? 0.67 : 1) && S.time >= d.nextVis && b % 4 === 0) { spawnVis(); introduce('twin'); d.nextVis = S.time + 70 + 4 * S.stats.hops; d.visAt = S.time; }
  }
  function directorTick() {
    // testing: ?bh brings the black hole 3 seconds into every run
    if (OD.TEST_BH && !S.dir.bhTest && S.time >= 3 && !S.dir.boss && !S.vis && !S.evt && !S.intro && S.tut < 0 && !S.over) { S.dir.bhTest = true; spawnBoss(); }
    const bi = Math.floor(beatPos());
    if (bi - S.dir.lastBeat > 3) S.dir.lastBeat = bi - 1;   // never replay a backlog of beats (e.g. after a hitch)
    while (S.dir.lastBeat < bi) { S.dir.lastBeat++; onBeat(S.dir.lastBeat); }
    const bs = S.dir.boss;
    if (bs) singularityTick(bs);
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
    S.tut = -1; OD.save.tutorialDone = true; OD.save.hintsDone = true; OD.save.intro.rock = true; OD.persist();
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
          trickPop('CLUTCH', '+' + pts, '#9fffd0');
          OD.audio.sfx('graze', 3); OD.haptic('medium'); break;
        }
      }
    }
    if (S.fjAt && S.time - S.fjAt < 1.0) { trick('weave', 'WEAVE', 16, '#ffb8f0'); S.fjAt = 0; }
    else if (S.lastLand && S.time - S.lastLand < 0.45) trick('snap', 'SNAP TURN', 12, '#9fe6ff');
    else if (S.lastFlipT && S.time - S.lastFlipT < 0.38) trick('dflip', 'DOUBLE FLIP', 8, '#ffd9a0');
    S.lastFlipT = S.time;
    S.lapAcc = 0;
    p.dir *= -1; S.stats.flips++;
    OD.audio.sfx('flip', p.dir > 0 ? 1 : 0); OD.haptic('light');
    const [x, y] = playerXY();
    burst(x, y, 6, 70 * u, world.accent, 2, 0.4);
  }
  // dirWanted: +1 bigger orbit, -1 tighter orbit, 0 = automatic bounce between the edges
  function mainTarget(dirWanted) {
    const p = S.p;
    let d;
    if (dirWanted === 1 && p.o < OUT) d = 1;
    else if (dirWanted === -1 && p.o > lowO()) d = -1;
    else { d = p.od; if (p.o + d < lowO() || p.o + d > OUT) d = -d; }
    return { body: 'main', n: p.o + d, d: d > 0 ? 1 : -1, a: p.th };
  }
  function nearestMain(x, y) {
    const dist = Math.hypot(x - cx, y - cy);
    let n = 0, best = 1e9;
    for (let i = 0; i < NO; i++) { const d = Math.abs(dist - R[i]); if (d < best) { best = d; n = i; } }
    return { n, gap: best };
  }
  // Every place a jump could land right now, keyed by how the player asks for it.
  function jumpCandidates() {
    const p = S.p, v = S.vis, c = {};
    if (p.body === 'main') {
      if (v && v.phase === 'pass' && p.o === OUT && !p.jump) {
        const dx = p.wx - v.x, dy = p.wy - v.y;
        if (Math.abs(Math.hypot(dx, dy) - v.rho) < (REACH + 14) * u) c.vis = { body: 'vis', a: Math.atan2(dy, dx) };
      }
      if (p.o < OUT) c.out = mainTarget(1);
      if (p.o > lowO()) c.in = mainTarget(-1);
      c.auto = c.vis || mainTarget(0);
    } else {
      const m = nearestMain(p.wx, p.wy);
      c.auto = m.gap < REACH * u ? { body: 'main', n: m.n, a: Math.atan2(p.wy - cy, p.wx - cx) } : null;
    }
    return c;
  }
  // Where the finger is, in world coordinates (undoing the camera zoom/pan)
  function fingerWorld() { const z = S.camZ * vz; return [cx + (ptrX - cx) / z, cy + S.camY + (ptrY - cy) / z]; }
  // Drag mode: the orbit ring closest to your finger is where you jump. Dragging back onto your own orbit cancels.
  // Drag mode: hold anywhere and slide your thumb. The slide is read against where your dot is: pushing away from the planet
  // (through the dot) picks the next BIGGER orbit, pulling towards the planet picks the next TIGHTER one. Sideways cancels.
  // Controls: TAP flips direction. SWIPE (a quick flick) moves exactly one orbit: away from the planet = bigger orbit, towards it
  // = tighter. HOLD and drag to cross several orbits in one go: the farther you slide, the more orbits you pass through, and they
  // are shown before you let go. Swipes and drags never flip your direction.
  const AB_T = 0.2, AB_STEP = 40;   // how long you hold before Retro Thrust / Afterburner starts; how far you drag, at level 2, for each hop
  let abX = 0, abY = 0;
  const HOLD_CHAIN = 0.07, SWIPE_PX = 24, SWIPE_T = 0.4, TAP_PX = 22, DRAG_MIN = 26, DRAG_STEP = 44, AXIS = 0.4;   // forgiving on a real finger: a tap may wander 22 px, a swipe is 24 px, may take 0.4 s and may be a little off the radial line
  function radialDir() { const [px, py] = playerXY(), dx = px - cx, dy = py - cy, d = Math.hypot(dx, dy) || 1; return [dx / d, dy / d]; }
  // signed number of orbits asked for by the finger's slide so far (+ = outwards); 0 = nothing chosen (too short or sideways)
  function dragSteps(max) {
    const [rx, ry] = radialDir(), mx = ptrX - downX, my = ptrY - downY, len = Math.hypot(mx, my);
    if (len < DRAG_MIN) return 0;
    const proj = mx * rx + my * ry;
    if (Math.abs(proj) < len * AXIS) return 0;                 // mostly sideways: not a choice
    const n = 1 + Math.floor((Math.abs(proj) - DRAG_MIN) / DRAG_STEP);
    return Math.sign(proj) * Math.min(n, max == null ? NO : max);
  }
  function dragTarget() {
    const p = S.p;
    if (p.body !== 'main') return null;
    const st0 = dragSteps();
    if (!st0) return null;
    if (p.o === OUT && st0 > 0) { const c = jumpCandidates(); if (c.vis) return c.vis; }
    const n = clamp(p.o + st0, 0, OUT);
    if (n === p.o) return null;
    return { body: 'main', n, d: n > p.o ? 1 : -1, a: p.th };
  }
  function jumpTarget() {
    const c = jumpCandidates(), st = S.p.steer;
    if (!S.p.charging) return null;      // nothing is picked until you drag (or press an arrow key on a keyboard)
    if (S.p.dragging) return dragTarget();
    if (S.p.body === 'main') { if (st === 'out') return (S.p.o < OUT ? c.out : c.vis) || null; if (st === 'in') return c.in || null; }
    return null;
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
      p.body = 'main'; p.o = n; p.th = a; p.r = R[n]; p.od = n === 0 ? 1 : n === OUT ? -1 : p.od;
    }
  }
  function doJump(perfect, forced) {
    const p = S.p;
    if (p.jump || (S.vis && S.vis.phase === 'settle')) return;
    const t = forced ? jumpCandidates().auto : (p.swipeTarget || jumpTarget());
    if (!t) return;
    let boosted = false;      // a real speed boost: slingshot timing in slingshot mode, or a Boost Jumps charge
    if (!perfect && p.boostJ > 0) { perfect = true; boosted = true; p.boostJ--; }
    if (t.body === 'main' && p.body === 'main') {
      p.od = t.d;
      const first = t.n;
      p.queue = [];
      p.jump = { t: 0, dur: JUMP_DUR * (1 - 0.18 * pv('swift')) * (p.fastHop ? 0.55 : 1), from: p.r, to: R[first], n: first };
    } else startCross(t.body, t.body === 'main' ? t.n : -1, t.a, 0.34);
    if (!perfect) S.pstreak = 0;
    S.stats.jumps++;
    if (S.lastFlipT && S.time - S.lastFlipT < 0.35) { trick('fj', 'FLIP & JUMP', 10, '#ffb8f0'); S.fjAt = S.time; }
    S.lapAcc = 0;
    if (t.body === 'main' && p.body === 'main' && !p.fastHop) {
      // two new tricks built from swipes: a DIP (to another orbit and straight back) and STEPS (several swipes the same way, one after another)
      const jh = S.jh = (S.jh || []).filter(q => S.time - q.t < 2), last = jh[jh.length - 1];
      if (last && last.from === t.n && last.to === p.o && S.time - last.t < 1.1) { trick('dip', 'DIP', 16, '#a8ffd8'); jh.length = 0; }
      else {
        let run = 1, tt = S.time;
        for (let i = jh.length - 1; i >= 0 && jh[i].d === t.d && tt - jh[i].t < 1.4; i--) { run++; tt = jh[i].t; }
        if (run === 2) trick('step2', 'DOUBLE STEP', 14, '#ffe48a'); else if (run === 3) trick('step3', 'TRIPLE STEP', 24, '#ffd95a'); else if (run >= 4) trick('step4', 'STAIRCASE', 36, '#ffb347');
      }
      jh.push({ t: S.time, from: p.o, to: t.n, d: t.d });
    }
    if (t.body === 'main') {   // out, in, out (or in, out, in) in quick succession
      S.zig = (S.zig || []).filter(q => S.time - q[0] < 5); S.zig.push([S.time, t.d]);
      const z = S.zig; if (z.length >= 3 && z[z.length - 1][1] !== z[z.length - 2][1] && z[z.length - 2][1] !== z[z.length - 3][1]) { trick('zig', 'ZIGZAG', 18, '#9fe6ff'); S.zig = []; }
    }
    S.hopT = (S.hopT || []).filter(q => S.time - q < 4.5); S.hopT.push(S.time);
    if (S.hopT.length >= 3) { trick('chainhop', 'HOP CHAIN ×' + S.hopT.length, 12 + 4 * S.hopT.length, '#b9ff9a'); }
    if (p.jump) { const [jx, jy] = playerXY(); p.jump.near = S.hz.some(h => { if (h.dead || h.warn > 0 || h.k === 'hole') return false; const [hx, hy] = h.k === 'comet' ? [h.x, h.y] : hpos(h); return Math.hypot(hx - jx, hy - jy) < 60 * u; }); }
    OD.audio.sfx('jump'); OD.haptic('medium');
    const [x, y] = playerXY();
    burst(x, y, 10, 110 * u, '#fff', 2, 0.45);
    if (perfect && boosted) {
      p.boost = 1.1; S.stats.perfects++; S.pstreak++; addMult(0.2);
      if (S.pstreak >= 2) feat('PERFECT ×' + S.pstreak, 'Back-to-back slingshots', '#ffd95a', 40 * S.pstreak * S.mult);
      const pts = 40 * S.mult * (S.od > 0 ? 2 : 1);
      addScore(pts);
      text('SLINGSHOT', x, y - 22 * u, '#ffd95a', 20);
      shockwave(x, y, '#ffd95a', 60 * u, 0.4);
      OD.audio.sfx('slingshot'); OD.haptic('heavy');
      burst(x, y, 16, 170 * u, '#ffd95a', 2.5, 0.6);
    } else if (perfect) {     // a quick drag or swipe jump: same speed, no fanfare, just a small reward
      S.stats.perfects++; addMult(0.05); addScore(10 * S.mult);
    }
  }

  // ------------------------------------------------------------- passing planets
  // A planet of another type drifts past above or below. The camera pulls back so you can choose: ignore it,
  // visit it for stardust and jump back, or stay one full lap and move in. Each planet type brings its own rule.
  const PLANET_TYPES = [
    { skin: 'terra',  trait: null,      color: '#6bc1ff', name: 'HOME WORLD',  bonus: 'More stardust', pill: 'More stardust', mods: { dustMul: 1.35 } },
    { skin: 'moon',  trait: null,      color: '#cfd3e8', name: 'MOON',        bonus: 'Crowded with rocks  ·  +10% score', pill: 'Crowded with rocks', mods: { rockMul: 1.5 }, sb: 1.1 },
    { skin: 'ocean', trait: 'tidal',   color: '#5aa8ff', name: 'OCEAN WORLD', bonus: 'Orbits breathe, whirlpools form  ·  +10% score', pill: 'Orbits breathe, whirlpools' },
    { skin: 'lava',  trait: 'molten',  color: '#ff8a4d', name: 'LAVA WORLD',  bonus: 'Mines and fiery comets  ·  +25% score', pill: 'Mines and fiery comets' },
    { skin: 'ice',   trait: 'frozen',  color: '#9fe6ff', name: 'ICE WORLD',   bonus: 'Slippery turns, ice blades  ·  +15% score', pill: 'Slippery turns, ice blades' },
    { skin: 'gas',   trait: 'storm',   color: '#ffb36b', name: 'STORM GIANT', bonus: 'Speed surges, lightning strikes  ·  +30% score', pill: 'Speed surges, lightning' },
    { skin: 'void',  trait: 'eclipse', color: '#c77dff', name: 'DARK WORLD',  bonus: 'Night falls, walls close in  ·  +40% score', pill: 'Night falls, walls close in' },
    { skin: 'garden', trait: 'verdant', color: '#7be08a', name: 'GARDEN WORLD', bonus: 'Calm skies, more stardust and power-ups  ·  +5% score', pill: 'More stardust and power-ups' },
    { skin: 'crystal', trait: 'prism',  color: '#8affea', name: 'CRYSTAL WORLD', bonus: 'Grazes pay double and shatter into stardust  ·  +20% score', pill: 'Grazes pay double' },
    { skin: 'toxic', trait: 'toxic',    color: '#b4ff5a', name: 'TOXIC WORLD', bonus: 'Poison clouds drain your multiplier  ·  +35% score', pill: 'Poison clouds' },
  ];
  const typeFor = skin => PLANET_TYPES.find(t => t.skin === skin) || null;
  const planetMul = t => t ? (t.trait ? TRAIT_MUL[t.trait] || 1 : t.sb || 1) : 1;
  const pmod = k => (S && S.homeType && S.homeType.mods && S.homeType.mods[k]) || 1;   // what the planet you are on changes
  const TRAIT_MUL = { tidal: 1.1, molten: 1.25, frozen: 1.15, storm: 1.3, eclipse: 1.4, verdant: 1.05, prism: 1.2, toxic: 1.35 };
  function spawnVis() {
    const side = S.rng.sign(), dirx = S.rng.sign();
    const depth = 1 + Math.floor(S.stats.hops * 0.9);   // how bold the next planet may be grows with every planet switch
    let pool = planetPool(depth, S.homeSkin);
    if (!pool.length) pool = OD.PLANETS.filter(p => p.skin !== S.homeSkin && p.tier <= 1 && !usedOnce(p.skin));
    const wts = pool.map(p => 1 + (p.tier === Math.min(depth, 5) ? 2.5 : p.tier === Math.min(depth, 5) - 1 ? 1 : 0)); let tw = 0; wts.forEach(w => { tw += w; });
    let rr = S.rng() * tw, pk = pool[0]; for (let i = 0; i < pool.length; i++) { rr -= wts[i]; if (rr <= 0) { pk = pool[i]; break; } }
    const type = typeFor(pk.skin);
    const no = orbitsFor(type.skin), vR = radii(no), rho = vR[no - 1], D = (Rb[OUT] + rho) * 0.81;
    const span = W * 0.5 + rho + 50;
    S.vis = { side, dirx, rho, no, R: vR, rad: PR0 * (PSCALE[type.skin] || 1), D, span, life: 22, t: 0, phase: 'pass', x: cx - dirx * span, y: cy + side * D, type, skin: type.skin, skinColor: type.color, sx: 0, sy: 0, st: 0 };
    S.driftDir = dirx;   // the whole sky starts to flow the way the planet is travelling
    if (OD.glr.ok) { OD.planets.warm([type.skin]); const pre = (n = 0) => { if (!OD.glr.prep(type.skin) && n < 20) setTimeout(() => pre(n + 1), 250); }; pre(); }
    else OD.planets.prewarm(type.skin, PR0 * (PSCALE[type.skin] || 1), dpr);   // its picture is painted now, while it is still far away
    if (S.stats.hops >= S.biomeAt && !S.nextBiome) { S.nextBiome = pickBiome(S.forceBiome); if (S.nextBiome) { OD.audio.preload(S.nextBiome); OD.biomes.prepare(S.nextBiome, W, H); } }   // this planet brings a new biome: its song loads while it drifts in
    banner('A NEW PLANET DRIFTS IN', 'Jump across from your outer orbit  ·  ' + type.name);
    OD.audio.sfx('warn');
    if (type.trait) introduce('era_' + type.trait);
    const a0 = S.rng() * TAU;
    for (let i = 0; i < 9; i++) S.pk.push({ k: 'dust', vis: true, ri: 1, a: a0 + i * TAU / 9, life: 20, t: 0, x: 0, y: 0, pull: false, o: 0 });
  }
  function setTrait(trait) {
    S.era = { id: trait || 'genesis', mix: 0, from: null };
    OD.audio.setEra(trait || 'genesis');
    S.traitMul = planetMul(S.homeType);
  }
  const SETTLE = 2.8;   // how long the glide to the new planet takes
  const smoother = t => t * t * t * (t * (t * 6 - 15) + 10);   // eases in and out more gently than smoothstep
  function startSettle() {
    const v = S.vis;
    v.phase = 'settle'; v.st = 0; v.sx = v.x; v.sy = v.y;
    const dx = cx - v.x, dy = cy - v.y, d = Math.hypot(dx, dy) || 1;
    S.old = { skin: S.homeSkin || baseSkin(), t: 0, vx: -dx / d, vy: -dy / d };
    // everything that belonged to the old system drifts off with it
    for (const h of S.hz) if (h.o != null || h.k === 'beam' || h.free) { if (DRIFT.has(h.k)) { h.dead = true; h.exit = true; h.fo = 0; } else { const [hx, hy] = hpos(h); burst(hx, hy, 6, 90 * u, world.danger, 2, 0.8); h.dead = true; } }
    for (const q of S.pk) if (!q.vis) q.dead = true;
    banner('MOVING IN', v.type.name);
    OD.haptic('medium'); OD.audio.fx('hop', { gain: 0.9 });
    S.hopColor = v.skinColor;
  }
  function finishSettle() {
    const v = S.vis, p = S.p;
    S.homeType = v.type; OD.save.seenPlanets[v.skin] = true; (S.seenSkin = S.seenSkin || {})[v.skin] = true;
    S.homeSkin = v.skin; setTrait(v.type.trait); S.old = null; setOrbits(v.skin);
    p.inv = Math.max(p.inv || 0, 2.2);   // a moment to settle in: nothing can hurt you for about two seconds
    for (let i = 1; i <= 2; i++) setTimeout(() => { if (S && !S.over) shockwave(cx, cy, i === 1 ? '#ffffff' : v.skinColor, (300 + i * 90) * u, 1.9); }, i * 320);
    burst(cx, cy, 46, 380 * u, v.skinColor, 3.2, 1.1);
    p.body = 'main'; p.o = OUT; p.r = R[OUT]; p.th = p.th2; p.dr = 0; p.od = -1;
    p.wx = cx + Math.cos(p.th) * p.r; p.wy = cy + Math.sin(p.th) * p.r;
    S.stats.hops++; addMult(0.5);
    const biomeSwitch = S.stats.hops >= S.biomeAt;
    addScore(150 * S.mult);
    for (const k of S.pk) if (k.vis) { k.vis = false; k.o = k.ri; }   // its stardust stays on the new orbits
    S.vis = null;
    S.dir.nextWave = S.dir.lastBeat + 6;
    shockwave(cx, cy, v.skinColor, 260 * u, 1.7);
    S.flash = Math.max(S.flash, 0.12);
    S.orbIn = 0; S.ringTrail = { R: v.R, no: v.no, color: v.skinColor, t: 0 };   // the new planet's orbits take over from the drifting ones by fading, not popping
    // the arrival: a soft bloom of light, the planet settling with a gentle swell and a little stardust reward
    S.hopBloom = 1; S.homePop = 1; S.hopColor = v.skinColor; S.settleTail = 1.4;
    for (let i = 0; i < 12; i++) S.pk.push({ k: 'dust', o: 1, a: i * TAU / 12 + 0.2, life: 11, t: -0.3 - i * 0.05, x: 0, y: 0, pull: false });
    for (let i = 0; i < 8; i++) S.pk.push({ k: 'dust', o: 0, a: i * TAU / 8, life: 11, t: -0.5 - i * 0.05, x: 0, y: 0, pull: false });
    for (let i = 0; i < 34; i++) { const a = Math.random() * TAU, sp = (100 + Math.random() * 280) * u; particle(cx, cy, Math.cos(a) * sp, Math.sin(a) * sp, 1.1 + Math.random() * 0.8, 1.6 + Math.random() * 2.4, Math.random() < 0.5 ? v.skinColor : '#ffffff', { sq: true, drag: 1.8 }); }
    S.dock = { type: v.type, t: 0 };   // the title shows, then glides down to the planet pill (drawHUD)
    feat('NEW HOME', v.type.name, v.skinColor, 0);
    if (biomeSwitch) enterBiome(v.dirx);
    OD.audio.fx('newhome'); OD.haptic('heavy'); setTimeout(() => OD.haptic('medium'), 150); setTimeout(() => OD.haptic('light'), 300);
  }
  // After enough planet switches the whole sky changes: a new biome with its own look, song and sounds. Each stay is longer than the last.
  // which biome comes next: later stays lean toward the deeper biomes, and a place you have not been to yet is favoured
  function pickBiome(force) {
    if (force != null && OD.WORLDS[force]) return OD.WORLDS[force];
    if (OD.TEST_LOCK != null && S) return null;   // testing: the sky never changes
    const nb = OD.WORLDS[world.id + 1];   // the skies come in order, Aurora to Void
    if (nb && !OD.biomeUnlocked(nb.id)) { if (S) S.gateWorld = nb.id; return null; }
    return nb || null;
  }
  // After enough planet switches the whole sky changes: a new biome with its own look, song and sounds. It sweeps in from the side
  // the new planet came from, the old sky and the new one mixing along a soft front. Each stay is longer than the last.
  function enterBiome(dirx) {
    const nb = S.nextBiome || pickBiome(S.forceBiome); S.nextBiome = null; S.forceBiome = null;
    S.biomeN++; S.biomeAt += OD.biomeStay(S.biomeN);
    if (!nb && S.free && S.gateWorld != null && !S.gateShown) { S.gateShown = true; const gw = OD.WORLDS[S.gateWorld]; banner('THE NEXT SKY WAITS', gw.name + ' is part of the full game'); }
    if (!nb) { if (world.id === 5 && OD.TEST_LOCK == null) S.bossDue = true; return; }   // after the last sky comes the black hole
    S.bgFrom = world; S.bgT = 0; S.bgDur = 6.5; S.bgDir = dirx || S.driftDir || 1; world = nb; S.seenBiomes[nb.id] = true; OD.save.seenBiomes[nb.id] = true;
    S.musicNext = nb; if (!S.useAudio) S.musicWorld = nb;   // the beat grid follows the new song's tempo from the moment that song actually comes in (the music's epoch changes)
    S.scoreMul = S.scoreMul / (S.envMul || 1) * (S.envMul = (nb.mods && nb.mods.scoreMul) || 1);
    OD.audio.setBiome(nb);
    resyncBeat();
    // the new planet's title is gliding down to its pill at the same moment: the biome's name waits until it has gone
    if (S.dock && S.dock.t < 2.0) S.pendingBanner = { t: 2.0 - S.dock.t, str: nb.name.toUpperCase(), sub: nb.sub }; else banner(nb.name.toUpperCase(), nb.sub);
    S.stats.biomes = (S.stats.biomes || 1) + 1;
    shockwave(cx, cy, nb.accent, 340 * u, 1.6);
  }
  function beatPos() { return S.clock * OD.audio.bpm(S.musicWorld || world) / 60; }
  function resyncBeat() { S.dir.lastBeat = Math.floor(beatPos()) - 1; }
  function visPresence(v) {
    const d = Math.hypot(v.x - cx, v.y - cy);
    return v.phase === 'settle' ? smooth(clamp(d / v.D, 0, 1)) : smooth(clamp(1 - (d - v.D) / (0.75 * base), 0, 1));
  }
  function visTick(dt) {
    const v = S.vis, p = S.p;
    if (!v) return;
    v.t += dt;
    if (v.phase === 'pass' && v.bh) {   // the rescue planet drifts down past the black hole's outer orbit
      const k = clamp(v.t / v.life, 0, 1);
      // it hovers near your dot (so it can always be reached) and slides slowly past it: jump across while it is close
      const py = clamp(p.body === 'main' ? p.wy : v.y, H * 0.22, H * 0.78), want = py + lerp(-150 * u, 170 * u, k);
      v.x = cx + R[OUT] + v.rho * 0.85; v.y += (want - v.y) * Math.min(1, dt * (v.t < 1.2 ? 1.6 : 3.2));
      if (k >= 1 && p.body !== 'vis') { S.vis = null; S.pk = S.pk.filter(q => !q.vis); }
      return;
    }
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
      const q = clamp(v.st / SETTLE, 0, 1), e = smoother(q);
      v.x = lerp(v.sx, cx, e); v.y = lerp(v.sy, cy, e);
      if (Math.random() < 0.85) particle(v.x + rand(-0.9, 0.9) * v.rad, v.y + rand(-0.9, 0.9) * v.rad, rand(-24, 24), rand(-24, 24), 0.8, rand(1.5, 3), Math.random() < 0.4 ? '#ffffff' : v.skinColor, { drag: 1 });
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
    verdant: { name: 'VERDANT', skin: 'garden', tint: '#4fd37a', rule: 'Calm and generous: more stardust and power-ups' },
    prism:   { name: 'PRISM',   skin: 'crystal', tint: '#59f0d6', rule: 'Grazes pay double and shatter into stardust' },
    toxic:   { name: 'TOXIC',   skin: 'toxic', tint: '#9ae83a', rule: 'Poison clouds drain your multiplier' },
  };
  // what each planet type adds to the obstacle mix: [hazard, weight, intro id it waits for]
  const ERA_SPAWN = {
    tidal: [['hole', 1.6, 'well']], molten: [['comet', 3, 'comet']], frozen: [['spinner', 3, 'spinner']],
    storm: [['strike', 4, 'strike']], eclipse: [['ring', 2.5, 'ring']], toxic: [['cloud', 4, 'cloud']],
  };
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  function baseSkin() { return (S && S.homeSkin) || menuSkin; }
  const eraIs = id => !!S && S.mode !== 'zen' && ((S.era && S.era.id === id) || (world.rules && world.rules.includes(id)));
  function applyBreath() {
    const k = eraIs('tidal') ? Math.min(1, S.era.mix) : 0;
    for (let i = 0; i < NO; i++) R[i] = Rb[i] * (1 + 0.055 * k * Math.sin(S.clock * 0.9 + i * 1.4));
    { const bs = S.dir && S.dir.boss, inHole = bs && bs.kind === 'singularity' && bs.cap; cx = inHole ? bs.cxH : W / 2; S.rs = inHole ? Rb[OUT] / bs.home.outR : 1; }
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
      if (S.mode === 'zen' && !['bloom'].includes(k)) continue;
      if (S.mode === 'timeattack' && !['shower', 'bloom'].includes(k)) continue;
      if (S.demo && !['shower', 'bloom'].includes(k)) continue;
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
    ({ shower: evShower, bloom: evBloom, flare: evFlare, hole: evHole, nova: evNova })[k]();
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
    for (let o = 0; o < NO; o++) spawnDust(o, S.rng() * TAU, 9, 0.2);
    banner('STARDUST BLOOM', 'Gather it all');
    OD.audio.sfx('power'); OD.haptic('light');
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
    const a = S.rng.sign() * S.rng.range(0.38, 0.62) * Math.PI, D = R[OUT] + 54 * u;
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
    if (e && e.type === 'flare') { S.flareAfter = { x: e.x, y: e.y, lanes: e.volleys.flatMap(v => v.lanes), t: 0, life: 2.8 }; S.flash = Math.max(S.flash, 0.1); }   // the flare leaves scorched lanes, embers and a fading warmth behind
    if (!ok || !e) return;
    S.stats.events++; addMult(0.3);
    const mid = [cx, cy - R[OUT] - 30 * u];
    if (e.type === 'hole') {
      S.stats.holes++; addScore(400 * S.mult);
      banner('HORIZON CLEARED', '+' + 400 * S.mult);
      for (let o = 0; o < NO; o++) spawnDust(o, S.rng() * TAU, 7, 0.22);
    } else if (e.type === 'nova') {
      S.stats.novas++; addScore(1000 * S.mult);
      banner('SUPERNOVA SURVIVED', '+' + 1000 * S.mult);
      for (let o = 0; o < NO; o++) spawnDust(o, S.rng() * TAU, 10, 0.18);
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
      const far = Math.hypot(W, H) * 1.5;
      for (const v of e.volleys) {
        if (!v.fired && e.t >= v.at) { v.fired = true; shockwave(e.x, e.y, '#ffb347', 260 * u, 0.9); shockwave(e.x, e.y, '#ffffff', 130 * u, 0.5); S.flash = Math.max(S.flash, 0.18); shake(3); OD.audio.sfx('warn'); }
        if (e.t >= v.at - 1.6 && e.t < v.at && Math.random() < 0.9 * fxScale()) {   // the sun gathers itself: sparks stream in along each lane as the volley charges
          const a = v.lanes[(Math.random() * v.lanes.length) | 0], d = far * (0.25 + 0.6 * Math.random());
          particle(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, -Math.cos(a) * 90 * u, -Math.sin(a) * 90 * u, 0.6, rand(1, 2), '#ffcf7a', { drag: 0 });
        }
        if (e.t >= v.at && e.t <= v.at + v.dur && Math.random() < 2.2 * fxScale()) {   // embers shed along a firing lane
          const a = v.lanes[(Math.random() * v.lanes.length) | 0], d = far * (0.15 + 0.7 * Math.random());
          particle(e.x + Math.cos(a) * d + rand(-6, 6) * u, e.y + Math.sin(a) * d + rand(-6, 6) * u, rand(-30, 30) * u, rand(-30, 30) * u, 0.8, rand(1.2, 2.6), Math.random() < 0.5 ? '#ffd24d' : '#ff8a3a', { drag: 1.6 });
        }
      }
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
  // every hit has the same shape: the world holds still for a breath, the edges of the screen pulse in the colour of what happened, the phone buzzes
  function hitFeedback(rgb, k = 1, stop = 0.07) { if (!S) return; S.hitFx = { t: 0, rgb, k }; S.hitStop = Math.max(S.hitStop || 0, stop * (k > 1 ? 1.4 : 1)); }
  function hurt(h) {
    const p = S.p;
    if (S.od > 0 || p.phase > 0 || p.surge > 0 || S.mode === 'zen' || p.inv > 0 || S.dying) return;
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
  // keyboard: an arrow key is a swipe (hold it to keep going)
  function keyHop(d) {
    if (!S || S.over || S.intro) return;
    const p = S.p; if (p.body !== 'main' || p.jump) return;
    const t = d > 0 ? (p.o < OUT ? { body: 'main', n: p.o + 1, d: 1, a: p.th } : jumpCandidates().vis) : (p.o > lowO() ? { body: 'main', n: p.o - 1, d: -1, a: p.th } : null);
    if (!t) return;
    p.swipeTarget = t; p.fastHop = false; doJump(true); p.swipeTarget = null;
  }
  function inputDown() {
    if (state !== 'play' || !S || S.over || S.win) return;
    OD.audio.unlock();
    S.p.holding = true; S.p.holdT = 0; S.p.slowed = false; S.p.steer = null; S.p.dragging = false; S.p.swiped = false; S.p.moved = false; S.p.swipeDir = 0; S.p.holdAfter = 0; S.p.abDir = 0; S.p.abStarted = false;
  }
  // SWIPE: a quick flick jumps one orbit straight away, no hold needed. It is read against the planet: away from it = next bigger
  // orbit, towards it = next tighter one. Too short a move, or one that is mostly sideways, is ignored. If your finger then stays
  // down, the jumps carry on, orbit after orbit in the same direction, until you let go or run out of orbits.
  function trySwipe() {
    const p = S.p;
    if (!p.holding || p.swiped || p.body !== 'main' || p.jump || S.intro) return;
    const len = Math.hypot(ptrX - downX, ptrY - downY);
    if (len >= TAP_PX) p.moved = true;
    if (S.aOn && OD.perkLevel(S.aEq) >= 2) return;   // braking or boosting at level 2: the drag picks the orbit instead (abDrag)
    if (p.holdT > SWIPE_T || len < SWIPE_PX) return;
    const [rx, ry] = radialDir(), proj = (ptrX - downX) * rx + (ptrY - downY) * ry;
    if (Math.abs(proj) < len * AXIS) return;       // not clearly along the radial axis yet: keep watching a little longer
    const st = Math.sign(proj), c = jumpCandidates();
    const t = st > 0 ? (p.o < OUT ? c.out : c.vis) : c.in;
    p.swiped = true; p.steer = null;
    if (!t) { OD.haptic('light'); return; }          // nowhere to go that way: no jump, and never a flip
    p.swipeDir = st; p.holdAfter = 0;
    p.swipeTarget = t.body === 'main' ? { body: 'main', n: p.o + st, d: st, a: t.a } : t;
    doJump(true);
    p.swipeTarget = null;
  }
  // Retro Thrust / Afterburner, level 2: while the brake or boost is on, slide the finger away from the planet or towards it and the dot hops to the
  // next orbit that way; keep sliding for the next one. It lasts only as long as the brake or boost does.
  function abDrag() {
    const p = S.p;
    if (!S.aOn || OD.perkLevel(S.aEq) < 2 || !p.holding || p.body !== 'main' || S.intro) return;
    const dx = ptrX - abX, dy = ptrY - abY, len = Math.hypot(dx, dy);
    if (len < AB_STEP * Math.max(0.7, u) * (p.abDir ? 0.6 : 1)) return;   // turning round while hopping takes a shorter slide
    const [rx, ry] = radialDir(), proj = dx * rx + dy * ry;
    if (Math.abs(proj) < len * AXIS) return;
    const st = Math.sign(proj);
    if (p.jump) { if (p.abDir && st !== p.abDir) { p.abDir = st; p.abWait = 0; abX = ptrX; abY = ptrY; } return; }   // mid-hop: only the new direction is noted
    const c = jumpCandidates(), t = st > 0 ? (p.o < OUT ? c.out : c.vis) : c.in;
    abX = ptrX; abY = ptrY;
    if (!t) { OD.haptic('light'); return; }
    p.swipeTarget = t.body === 'main' ? { body: 'main', n: p.o + st, d: st, a: t.a } : t; p.fastHop = true;
    p.abDir = st; p.abWait = 0;   // one slide is enough: the hops carry on in that direction, like Cascade, until the brake or boost ends
    doJump(true);
    p.swipeTarget = null; p.fastHop = false;
  }
  function abChain() {
    const p = S.p, d = p.abDir, n = p.o + d;
    if (!d || p.body !== 'main' || p.jump) return;
    let t = null;
    if (n >= lowO() && n <= OUT) t = { body: 'main', n, d, a: p.th };
    else if (d > 0 && p.o === OUT) t = jumpCandidates().vis || null;
    if (!t) return;   // at the edge: wait there, a slide the other way turns round
    p.swipeTarget = t; p.fastHop = true; p.abWait = 0;
    doJump(true);
    p.swipeTarget = null; p.fastHop = false;
  }
  // the finger stayed down after a swipe: keep hopping through the orbits, quickly
  function chainHop() {
    const p = S.p, d = p.swipeDir, n = p.o + d;
    if (!d || p.body !== 'main' || p.jump) return;
    let t = null;
    if (n >= lowO() && n <= OUT) t = { body: 'main', n, d, a: p.th };
    else if (d > 0 && p.o === OUT) t = jumpCandidates().vis || null;
    if (!t) { p.swipeDir = 0; return; }
    p.swipeTarget = t; p.fastHop = true;
    doJump(true);
    p.swipeTarget = null; p.fastHop = false;
  }
  // Shockwave: three quick taps in place blast the hazards near you away
  let downT0 = 0; const tapTimes = [];   // downT0: when the first finger touched down (a second finger within 160 ms is a Lucky Draw); tapTimes: recent taps in place, for the Shockwave triple tap
  function fireShock() {
    if (state !== 'play' || !S || S.over || S.win || S.dying || !OD.ability('shock') || S.shockCd > 0 || S.intro) return;
    const [x, y] = playerXY(); let n = 0;
    for (const h of S.hz) { if (h.dead || h.warn > 0 || UNHARMED.has(h.k)) continue; const [hx, hy] = hpos(h); if (Math.hypot(hx - x, hy - y) < 190 * u) { destroy(h, true, 'shock'); n++; } }
    S.shockCd = 24; S.shockFx = 0.6; shockwave(x, y, '#ff9a5a', 220 * u, 0.7); shockwave(x, y, '#ffffff', 130 * u, 0.5); shake(5);
    text(n ? 'SHOCKWAVE ×' + n : 'SHOCKWAVE', x, y - 26 * u, '#ff9a5a', 19); OD.audio.sfx('power'); OD.haptic('heavy');
    introduce('ab_shock', true);
  }
  // Lucky Draw: two fingers down at the same moment call a random power-up onto your orbit
  function fireDraw() {
    if (state !== 'play' || !S || S.over || S.win || S.dying || !OD.ability('draw') || S.drawCd > 0 || S.intro || S.mods.glass) return false;
    S.drawCd = 45; const [x, y] = playerXY();
    spawnPower(true); shockwave(x, y, '#ff8ad9', 150 * u, 0.6); shockwave(x, y, '#ffffff', 80 * u, 0.4);
    text('LUCKY DRAW', x, y - 26 * u, '#ff8ad9', 18); OD.audio.sfx('power'); OD.haptic('medium');
    return true;
  }
  function inputUp() {
    if (state !== 'play' || !S) return;
    const p = S.p;
    if (!p.holding) return;
    const held = p.holdT, len = Math.hypot(ptrX - downX, ptrY - downY);
    p.holding = false; p.swipeDir = 0;
    // only a quick, still tap flips direction: a swipe, even a missed one, never does
    const briefAb = p.slowed && held < 0.34;   // Retro Thrust / Afterburner had only just begun (a slow tap): it is still a tap
    if (p.swiped || p.moved || (p.slowed && !briefAb) || len >= TAP_PX || held > 0.6) { tapTimes.length = 0; return; }   // a swipe, a drag or a hold breaks the run of taps
    flip();
    // Shockwave: three quick taps in place, one right after the other (so a swipe, or slow taps, never set it off by accident)
    const nt = performance.now(); tapTimes.push(nt); while (tapTimes.length > 3) tapTimes.shift();
    if (tapTimes.length === 3 && tapTimes[1] - tapTimes[0] < 420 && tapTimes[2] - tapTimes[1] < 420) { tapTimes.length = 0; fireShock(); }
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
    S.flash = 1; shake(14); hitFeedback('255,50,80', 1.4, 0.09);   // the end: the strongest pulse
    OD.audio.sfx('death'); OD.haptic('error');
    OD.audio.setIntensity(0); OD.audio.setMuffle(0.8);
    p.trail.length = 0; p.dead = true;
    S.endCause = why || (h && h.k) || 'hit';
  }
  // Every way the run can survive a hit, in order: the guardian zaps it, a shield blocks it, an extra life revives you.
  // Safety Hop: a deadly hit hops you to the nearest orbit that is clear instead
  function safetyHop(h) {
    const p = S.p; if (!pv('hop') || S.hopCd > 0 || p.body !== 'main' || p.jump) return false;
    for (const n of [p.o + 1, p.o - 1]) {
      if (n < 0 || n > OUT) continue;
      const tx = cx + Math.cos(p.th) * R[n], ty = cy + Math.sin(p.th) * R[n]; let clear = true;
      for (const o of S.hz) { if (o === h || o.dead || o.warn > 0) continue; const [hx, hy] = hpos(o); if (Math.hypot(hx - tx, hy - ty) < 34 * u) { clear = false; break; } }
      if (!clear || beamsCover(n, p.th)) continue;
      const [x0, y0] = playerXY(); shockwave(x0, y0, '#8affb0', 110 * u, 0.5);
      p.o = n; p.r = R[n]; p.dr = 0; p.wx = tx; p.wy = ty; p.inv = Math.max(p.inv, 1.1 + 0.5 * pv('afterglow')); S.hopCd = [0, 50, 40, 30][pv('hop')];
      hitFeedback('138,255,176', 0.6, 0.04); shockwave(tx, ty, '#ffffff', 80 * u, 0.4); text('SAFETY HOP', tx, ty - 26 * u, '#8affb0', 19); OD.audio.sfx('slingshot'); OD.haptic('heavy'); shake(3);
      introduce('ab_hop', true);
      return true;
    }
    return false;
  }
  const beamsCover = (n, th) => S.hz.some(o => !o.dead && o.warn <= 0 && (o.k === 'beam' || o.k === 'ring') && (o.k === 'ring' || Math.abs(((th - o.a + Math.PI) % TAU + TAU) % TAU - Math.PI) < 0.3));
  function absorb(h) {
    const p = S.p;
    if (safetyHop(h)) return true;
    if (p.zap > 0 && (h.k === 'rock' || h.k === 'comet' || h.k === 'mine' || h.k === 'spinner' || h.k === 'cinder') && !h.dead) {
      p.zap--; p.inv = Math.max(p.inv, 0.4);
      const [x, y] = playerXY(), [hx, hy] = hpos(h);
      S.beams.push(makeBolt(x, y, hx, hy)); S.flash = Math.max(S.flash, 0.25); shake(3);
      S.flashes = S.flashes || []; S.flashes.push({ x: hx, y: hy, t: 0, r: 70 * u, c: OD.POWERS.zap.color });
      destroy(h, true, 'zap'); addMult(0.1);
      text('ZAPPED' + (p.zap ? '  ×' + p.zap + ' left' : ''), x, y - 24 * u, OD.POWERS.zap.color, 17);
      OD.audio.sfx('slingshot'); OD.haptic('heavy'); shake(4);
      return true;
    }
    if (p.shield) { shieldBreak(h); return true; }
    if (p.aegis > 0) { aegisBlast(); return true; }
    if (S.lives > 0) {
      S.lives--; S.phoenixT = 0;
      p.inv = 2.4 + 0.5 * pv('afterglow'); S.mult = Math.max(1, S.mult * 0.6);
      const [x, y] = playerXY();
      shockwave(x, y, OD.POWERS.life.color, 240 * u, 0.9); burst(x, y, 40, 300 * u, OD.POWERS.life.color, 3, 0.9);
      for (const o of S.hz) { if (o.k === 'beam' || o.k === 'ring') continue; const [hx, hy] = hpos(o); if (Math.hypot(hx - x, hy - y) < (170 + 60 * pv('tough')) * u) destroy(o, false); }
      OD.audio.sfx('shield'); OD.haptic('heavy'); shake(9); S.flash = 0.6; hitFeedback('255,60,90', 1);   // a heart is lost: red
      return true;
    }
    return false;
  }
  function shieldBreak(h) {
    const p = S.p; p.shield = p.shield > 1 ? p.shield - 1 : false; p.inv = 1.4 + 0.5 * pv('afterglow'); if (pv('hull') >= 2 && !S.hullCd) S.hullCd = pv('hull') === 2 ? 90 : 60; S.stats.shields++; S.mult = Math.max(1, S.mult * 0.7);
    const [x, y] = playerXY();
    shockwave(x, y, OD.POWERS.shield.color, 150 * u, 0.6);
    burst(x, y, 30, 260 * u, OD.POWERS.shield.color, 3, 0.8);
    for (const o of S.hz) {
      if (o.k === 'rock' || o.k === 'mine' || o.k === 'comet' || o.k === 'spinner') {
        const [hx, hy] = hpos(o);
        if (Math.hypot(hx - x, hy - y) < (150 + 60 * pv('tough')) * u) destroy(o, false);
      }
    }
    OD.audio.sfx('shield'); OD.haptic('heavy'); shake(9); S.flash = 0.5; hitFeedback('90,170,255', 0.75);   // a shield breaks: blue
    text('SHIELD!', x, y - 24 * u, OD.POWERS.shield.color, 22);
  }
  // Anything the player breaks (shield blast, zapper, bombs, nova, reaper) falls apart into shards cut from its own outline,
  // in its own material, with a white-hot flash and a puff of grit. The zapper strikes first and the rock cracks a moment later.
  const SHARD_COL = { rock: ['#4f4845', '#b0a396'], lava: ['#2a110d', '#ff8a3a'], ice: ['#9fd4ee', '#f2fcff'], ocean: ['#2a5f9c', '#a6e0ff'], void: ['#140a29', '#a05cff'], toxic: ['#2a4710', '#bcff5e'], crystal: ['#1fb39d', '#d8fff8'], storm: ['#57497e', '#d8baff'], garden: ['#3c5c25', '#a8ea93'], aurora: ['#0e3d4a', '#8ff0ff'], dust: ['#5a3118', '#e6a45f'], ember: ['#1a0b08', '#ff7a3a'], glacier: ['#4a8fb5', '#f2fcff'], pulsar: ['#1d1a45', '#c0a8ff'], abyss: ['#0a0418', '#a98aff'], mine: ['#434b59', '#ced8ec'], orb: ['#7a3df0', '#ffffff'] };
  const SHARD_GLOW = { lava: '#ff7a2a', ice: '#9fe6ff', ocean: '#5ad2ff', void: '#8a3dff', toxic: '#b4ff5a', crystal: '#59f0d6', storm: '#c9a0ff', garden: '#7be08a', aurora: '#58ffc4', dust: '#ffb35a', ember: '#ff6a24', glacier: '#9fe6ff', pulsar: '#ff5ad8', abyss: '#8a3dff', mine: '#ff4d5e' };
  const BREAKABLE = new Set(['rock', 'mine', 'comet', 'spinner']);
  function shatter(h, o = {}) {
    const [x, y] = hpos(h);
    const style = h.k === 'mine' ? 'mine' : h.k === 'comet' ? 'lava' : (SHARD_COL[h.style] ? h.style : 'rock');
    const size = (h.k === 'spinner' ? 20 : h.k === 'comet' ? 12 : h.s || 15) * u, shape = h.shape && h.shape.length ? h.shape : null, n = shape ? shape.length : 8;
    const heavy = S.frags.length > 110, pieces = heavy ? 4 : 7 + ((Math.random() * 4) | 0);
    const bx = o.fromX == null ? cx : o.fromX, by = o.fromY == null ? cy : o.fromY, blast = Math.atan2(y - by, x - bx);
    const radius = a => size * (shape ? shape[((Math.floor(((a % TAU + TAU) % TAU) / TAU * n)) % n)] : 1);
    const rot0 = h.rot || 0;
    for (let i = 0; i < pieces; i++) {
      const a0 = (i / pieces) * TAU + rand(-0.12, 0.12) + rot0, a1 = ((i + 1) / pieces) * TAU + rot0, am = (a0 + a1) / 2;
      const r0 = radius(a0 - rot0), r1 = radius(a1 - rot0), rm = radius(am - rot0) * rand(0.8, 1);
      const pts = [[rand(-0.2, 0.2) * size * 0.5, rand(-0.2, 0.2) * size * 0.5], [Math.cos(a0) * r0, Math.sin(a0) * r0], [Math.cos(am) * rm * 1.05, Math.sin(am) * rm * 1.05], [Math.cos(a1) * r1, Math.sin(a1) * r1]];
      const sp = rand(70, 210) * u, bias = rand(0.5, 1) * 110 * u;
      S.frags.push({ x: x + Math.cos(am) * size * 0.25, y: y + Math.sin(am) * size * 0.25, vx: Math.cos(am) * sp + Math.cos(blast) * bias, vy: Math.sin(am) * sp + Math.sin(blast) * bias, rot: rand(0, TAU), vr: rand(-7, 7), pts, style, life: 0, max: rand(0.95, 1.6), size, hot: style === 'lava' || style === 'mine' ? 1 : 0 });
    }
    const gl = SHARD_GLOW[style] || '#ffe2b0';
    burst(x, y, heavy ? 6 : 14, 150 * u, SHARD_COL[style][1], 2.2, 0.8, { sq: true, drag: 2.2 });
    burst(x, y, heavy ? 3 : 8, 230 * u, gl, 1.6, 0.5, { drag: 2.6 });
    S.flashes = S.flashes || []; S.flashes.push({ x, y, t: 0, r: size * 3.4, c: gl });
    shockwave(x, y, '#ffffff', size * 2.6, 0.22);
    OD.audio.sfx('click');
  }
  function destroy(h, score = true, how) {
    if (h.dead) return;
    h.dead = true;
    const [x, y] = hpos(h);
    if (BREAKABLE.has(h.k)) {
      const [px, py] = playerXY();
      if (how === 'zap') { h.fo = -0.17; h.zapT0 = S.clock; S.delayed.push({ t: 0.17, fn: () => { shatter(h, { fromX: px, fromY: py }); h.hidden = true; } }); }
      else { shatter(h, { fromX: px, fromY: py }); h.hidden = true; }
    } else burst(x, y, 16, 190 * u, world.danger, 3, 0.7);
    if (score) {
      const pts = 30 * S.mult;
      addScore(pts); text('+' + pts, x, y - 14 * u, '#fff', 18);
      OD.haptic('light');
    }
  }
  // a jagged bolt that strikes instantly: a bright main path, a couple of forks, a flash where it lands
  function makeBolt(x1, y1, x2, y2) {
    const segs = 10, dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, pts = [[x1, y1]];
    for (let i = 1; i < segs; i++) { const k = i / segs, j = rand(-1, 1) * 13 * u * Math.sin(k * Math.PI); pts.push([x1 + dx * k + nx * j, y1 + dy * k + ny * j]); }
    pts.push([x2, y2]);
    const forks = [];
    for (let f = 0; f < 3; f++) { const i = 2 + ((Math.random() * (segs - 4)) | 0), [bx, by] = pts[i], a = Math.atan2(dy, dx) + rand(-1, 1) * 1.1, len = rand(22, 46) * u; forks.push([[bx, by], [bx + Math.cos(a) * len * 0.5 + rand(-5, 5) * u, by + Math.sin(a) * len * 0.5 + rand(-5, 5) * u], [bx + Math.cos(a) * len, by + Math.sin(a) * len]]); }
    return { pts, forks, x1, y1, x2, y2, t: 0 };
  }
  function hpos(h) {
    if (h.k === 'devil') return devilPos(h);
    if (h.k === 'comet' || h.free) return [h.x, h.y];
    if (h.o != null) return pos(h.o, h.a);
    return [cx, cy];
  }
  function mineArmed(h) {
    const beat = S.clock * OD.audio.bpm(S.musicWorld || world) / 60, b = Math.floor(beat), f = beat - b;
    return (b % 2 === 0 && f < 0.22) || (b % 2 === 1 && f > 0.9);
  }
  function addScore(x) { if (S.intro) return; S.score += x * S.scoreMul * S.traitMul * (S.p.double > 0 ? 2 : 1) ; }
  const MULT_CAP = 5, multCap = () => MULT_CAP;
  const MULT_UP = 0.5, MULT_HOLD = 2.4, MULT_DRAIN = 0.55;   // the multiplier climbs a little slower (x0.5), holds for 2.4 s, then drains much faster than before: it hovers at x1.5 to x3 instead of sitting at the top
  // Every good action nudges the multiplier up a little; it holds for a few seconds, then drains back toward x1.
  function addMult(a = 0.1) {
    S.mult = Math.min(multCap(), Math.round((S.mult + a * MULT_UP) * 100) / 100);
    if (S.mult > S.stats.maxCombo) S.stats.maxCombo = S.mult;
    if (S.mult >= 1.5) introduce('combo', true);
    S.multT = MULT_HOLD;
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
    if (pv('weaver') && !(S.focusCd > 0) && !S.dying) { S.focusT = [0, 1.0, 1.6, 2.3][pv('weaver')]; S.focusCd = 5; const [fx, fy] = playerXY(); shockwave(fx, fy, '#7be8ff', 70 * u, 0.4); }
    if (tier === 2) S.stats.razors++;
    const label = ['GRAZE', 'CLOSE CALL', 'RAZOR THIN'][tier], pts = Math.round([20, 35, 60][tier] * S.mult * (1 + 0.25 * perk('daredevil')) * (S.p.prism > 0 ? 2 : 1) * (eraIs('prism') ? 2 : 1) * (S.p.stasis > 0 ? 2 : 1));
    addScore(pts);
    if (eraIs('prism')) { const [hx, hy] = h.k === 'comet' ? [h.x, h.y] : (h.o != null ? hpos(h) : playerXY()); S.pk.push({ k: 'dust', free: true, life: 7, t: 0, x: hx, y: hy, pull: true }); burst(hx, hy, 8, 120 * u, '#8affea', 2, 0.5); }
    const [x, y] = playerXY();
    text(label + ' +' + pts, x, y - 20 * u, tier === 0 ? world.accent2 : tier === 1 ? '#fff' : '#ffd95a', 15 + tier * 2);
    burst(x, y, 9 + tier * 5, 120 * u, tier === 2 ? '#ffd95a' : world.accent2, 2, 0.5);
    OD.audio.sfx('graze', S.mult + tier * 2); OD.haptic(tier ? 'medium' : 'light'); shake(2 + tier * 2);
    // several clean passes in a row pay a growing bonus
    S.chain = S.chainT > 0 ? S.chain + 1 : 1; S.chainT = 4.5;
    if (S.chain >= 2) {
      const bonus = 25 * S.chain * S.mult;
      feat(S.chain < CHAIN_NAMES.length ? CHAIN_NAMES[S.chain] : 'CHAIN ×' + S.chain, 'Clean passes in a row', '#ffd95a', bonus); addMult(0.1);
      OD.audio.sfx('power'); if (S.chain >= 4) shake(3);
    }
    introduce('graze', true);
    if (S.od <= 0) {
      S.gm += [0.2, 0.28, 0.4][tier];
      if (S.gm >= 1) startOverdrive();
    }
  }
  function startOverdrive() {
    S.odMax = 5; S.od = S.odMax; S.gm = 0; S.stats.overdrives++; S.novaT = 0;   // novaT: seconds since Nova began, for the white glow on the orb
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
      S.stats.dust += (fz > 1 ? 2 : 1);
      if (pv('forge')) { const cut = [0, 0.4, 0.7, 1.0][pv('forge')] * (fz > 1 ? 2 : 1); for (const k2 of ['shockCd', 'drawCd', 'hopCd', 'hullCd']) if (S[k2] > 0) S[k2] = Math.max(0.001, S[k2] - cut); }   // Star Forge: stardust shortens the recharges
      S.dustStreak = S.time - S.dustT < 0.9 ? S.dustStreak + 1 : 1; S.dustT = S.time;
      if (S.dustStreak > 0 && S.dustStreak % 5 === 0) addMult(0.1);
      if (S.dustStreak > 0 && S.dustStreak % 5 === 0) feat('STARDUST ×' + S.dustStreak, 'Sweep it up', '#ffe48a', 5 * S.dustStreak * S.mult);
      addScore(3 * S.mult * fz);
      S.multT = Math.max(S.multT, 2.2);
      OD.audio.sfx('dust', 7 + (S.stats.dust % 5) * 2);
      // a gentle pickup: a soft bloom, a thin ring that opens and fades, and a few slow sparkles drifting off
      S.flashes = S.flashes || []; S.flashes.push({ x: k.x, y: k.y, t: 0, r: 15 * u, c: '#ffe9a0' });
      shockwave(k.x, k.y, 'rgba(255,240,190,0.55)', (S.dustStreak % 5 === 0 ? 30 : 21) * u, 0.4);
      for (let i = 0; i < 4; i++) { const a = Math.random() * TAU, sp = (22 + Math.random() * 26) * u; particle(k.x, k.y, Math.cos(a) * sp, Math.sin(a) * sp - 8 * u, 0.7 + Math.random() * 0.35, 1.1 + Math.random() * 1.1, Math.random() < 0.5 ? '#fff6d6' : '#ffdf8a', { drag: 2.6 }); }
      OD.haptic('light');
    } else {
      const P = OD.POWERS[k.type];
      S.stats.powerups++; addScore(25); addMult(0.1);
      if (S.time - S.powT < 6 && S.powT > 0) feat('POWER COMBO', 'Two power-ups close together', '#ff9ae6', 60 * S.mult);
      S.powT = S.time;
      introduce('cat_' + P.cat, true);
      if (k.type !== 'shield' && k.type !== 'life') {   // the pickup streaks from where you caught it to its place in the corner stack (or up to the score, for one-shot powers)
        const hk = P.cat === 'perk' ? 'perk:' + k.type : (k.type === 'shield' || P.cat === 'timed' || k.type === 'zap' || k.type === 'boost' || k.type === 'aegis') ? k.type : null;
        const z = S.camZ || 1, sx = cx + (k.x - cx) * z, sy = cy + (k.y - (cy + (S.camY || 0))) * z;
        (S.flyers = S.flyers || []).push({ x: sx, y: sy, type: k.type, color: P.color, key: hk, t: 0, dur: 0.42, side: Math.random() < 0.5 ? -1 : 1, trail: [] });
      }
      if (P.cat === 'perk') perkGain(k, P);
      else if (k.type === 'shield') { S.p.shield = Math.min(pth('guard') ? 3 : 2, (+S.p.shield || 0) + 1); { const z = S.camZ || 1; S.shieldFrom = { x: cx + (k.x - cx) * z, y: cy + (k.y - (cy + (S.camY || 0))) * z }; } }   // up to two shields (three on the Guard path)
      else if (k.type === 'amp') { addMult(1.0 / MULT_UP); S.p.amp = Math.min(2 * P.dur * (1 + 0.2 * pv('fuse')), (S.p.amp || 0) + P.dur * (1 + 0.2 * pv('fuse'))); S.multT = S.p.amp; text('MULTIPLIER +1', k.x, k.y - 28 * u, P.color, 20); }
      else if (k.type === 'alchemy') {
        let n = 0;
        for (const h of S.hz) {
          if (h.dead || h.warn > 0 || UNHARMED.has(h.k)) continue;
          const [hx, hy] = hpos(h);
          S.pk.push(h.o != null ? { k: 'dust', o: h.o, a: h.a, life: 9, t: 0, x: hx, y: hy, pull: false } : { k: 'dust', free: true, life: 7, t: 0, x: hx, y: hy, pull: false });
          burst(hx, hy, 10, 140 * u, P.color, 2.6, 0.8); h.dead = true; n++;
        }
        shockwave(k.x, k.y, P.color, 380 * u, 0.9); shake(5);
        text(n ? 'ALCHEMY ×' + n : 'ALCHEMY', k.x, k.y - 28 * u, P.color, 21);
      }
      else if (k.type === 'boost') { S.p.boostJ = Math.min(6, S.p.boostJ + 3); text('BOOSTED JUMPS ×' + S.p.boostJ, k.x, k.y - 28 * u, P.color, 20); }
      else if (k.type === 'jackpot') {
        for (let o = 0; o < NO; o++) for (let i = 0; i < 10; i++) S.pk.push({ k: 'dust', o, a: i * TAU / 10 + o * 0.35, life: 9, t: -(o * 10 + i) * 0.03, x: 0, y: 0, pull: false });
        const pts = Math.round(200 * S.mult); addScore(pts); shockwave(k.x, k.y, P.color, 400 * u, 1); shake(4);
        text('JACKPOT +' + pts, k.x, k.y - 28 * u, P.color, 22);
      }
      else if (k.type === 'pulse') {
        let n = 0;
        for (const h of S.hz) {
          if (h.dead || h.warn > 0 || UNHARMED.has(h.k)) continue;
          const [hx, hy] = hpos(h);
          if (Math.hypot(hx - x, hy - y) < 260 * u) { destroy(h, true); n++; }
        }
        shockwave(x, y, P.color, 300 * u, 0.8); shockwave(x, y, '#ffffff', 190 * u, 0.55); shake(5);
        text(n ? 'PULSE ×' + n : 'PULSE', k.x, k.y - 28 * u, P.color, 21);
      }
      else if (k.type === 'aegis') { S.p.aegis = Math.min(2, (S.p.aegis || 0) + 1); }
      else if (k.type === 'vortex') { spawnWell(k.x, k.y); }
      else if (k.type === 'life') { if (S.lives < maxLives()) { S.lives++; const z = S.camZ || 1; S.lifeFrom = { x: cx + (k.x - cx) * z, y: cy + (k.y - (cy + (S.camY || 0))) * z }; } text('+1 HEART', k.x, k.y - 28 * u, OD.POWERS.life.color, 21); }
      else if (k.type === 'zap') { S.p.zap = Math.min(4, S.p.zap + 2); text('GUARDIAN  ×' + S.p.zap, k.x, k.y - 28 * u, OD.POWERS.zap.color, 20); }
      else if (k.type === 'overload') { startOverdrive(); S.od = S.odMax = 6.5; }
      else if (k.type === 'bomb') {
        let n = 0;
        for (const h of S.hz) if (!h.dead && h.warn <= 0 && h.k !== 'hole') { const [hx, hy] = hpos(h); burst(hx, hy, 8, 160 * u, '#ff9a3d', 2.6, 0.7); h.dead = true; n++; }
        addScore(10 * n * S.mult); shockwave(k.x, k.y, '#ff9a3d', 420 * u, 0.9); shake(8); S.flash = Math.max(S.flash, 0.5);
        if (n) text('BOOM  ×' + n, k.x, k.y - 28 * u, '#ffb36b', 22);
      } else { if (k.type === 'twin') S.p.twinN = Math.min(5, (S.p.twin > 0 ? S.p.twinN || 1 : 0) + 1);   // every Wingman you pick up adds another one
        const d1 = P.dur * (1 + 0.2 * pv('fuse')); S.p[k.type] = Math.min(2 * d1, (S.p[k.type] || 0) + d1); }   // timed power-ups stack: another one adds time, up to double
      if (k.type === 'reaper') text(P.name.toUpperCase(), x, y - 26 * u, P.color, 20); else if (k.type !== 'amp' && k.type !== 'alchemy' && P.cat !== 'perk' && k.type !== 'boost' && k.type !== 'jackpot' && k.type !== 'pulse') text(P.name.toUpperCase(), x, y - 26 * u, P.color, 20);
      shockwave(k.x, k.y, P.color, 110 * u, 0.55); setTimeout(() => { if (S) shockwave(k.x, k.y, '#ffffff', 70 * u, 0.4); }, 90);
      burst(k.x, k.y, 26, 200 * u, P.color, 3, 0.8); burst(k.x, k.y, 10, 120 * u, '#ffffff', 2, 0.6);
      OD.audio.sfx('power'); OD.haptic('medium');
    }
    k.dead = true;
  }

  // ------------------------------------------------------------- newer power-ups: Surge, Wingman, Stasis, Vortex, Aegis
  function surgeDust() {
    const [x, y] = playerXY();
    S.stats.dust++; addScore(5 * S.mult);
    S.flashes = S.flashes || []; S.flashes.push({ x, y, t: 0, r: 11 * u, c: '#bffff0' });
    for (let i = 0; i < 2; i++) particle(x, y, rand(-24, 24) * u, rand(-24, 24) * u, 0.6, rand(1.2, 2.2), Math.random() < 0.5 ? '#fff6d6' : '#7dffd2', { drag: 2.6 });
    OD.audio.sfx('dust', 6 + (S.stats.dust % 5) * 2);
  }
  // the Wingman: the opposite point of your orbit
  // the Wingmen: with one, it flies opposite you; with two, the three of you sit 120 degrees apart; and so on, evenly round the orbit
  const twinCount = () => { const p = S.p; return p.twin > 0 ? Math.max(1, p.twinN || 1) : 0; };
  const twinList = () => { const p = S.p, n = twinCount(); if (!n || p.body !== 'main' || (p.jump && p.jump.cross)) return []; const re = p.r + p.dr, out = []; for (let i = 1; i <= n; i++) { const a = p.th + TAU * i / (n + 1); out.push([cx + Math.cos(a) * re, cy + Math.sin(a) * re]); } return out; };
  function twinBreak(h, pos) {
    const p = S.p, c = OD.POWERS.twin.color, [tx, ty] = pos || playerXY();
    p.twinN = Math.max(0, (p.twinN || 1) - 1); if (!p.twinN) p.twin = 0; destroy(h, true);
    burst(tx, ty, 26, 220 * u, c, 3, 0.8); shockwave(tx, ty, c, 110 * u, 0.6); shockwave(tx, ty, '#ffffff', 60 * u, 0.4);
    text('WINGMAN TOOK THE HIT', tx, ty - 24 * u, c, 15); OD.audio.sfx('shield'); OD.haptic('heavy'); shake(5); S.flash = Math.max(S.flash, 0.2);
  }
  function twinCheck() {
    const list = twinList(); if (!list.length) return;
    const pr = 4.2 * u;
    for (const h of S.hz) {
      if (h.dead || h.warn > 0 || exitQ(h) > 0.4) continue;
      for (const [tx, ty] of list) {
        let d = null;
        switch (h.k) {
          case 'rock': { const [x, y] = hpos(h); d = Math.hypot(tx - x, ty - y) - (h.s * 0.82 + pr); break; }
          case 'comet': d = Math.hypot(tx - h.x, ty - h.y) - (6.5 * u + pr); break;
          case 'mine': { const [x, y] = hpos(h); d = Math.hypot(tx - x, ty - y) - ((mineArmed(h) ? 20 * u : 5.5 * u) + pr); break; }
          case 'strike': { const [x, y] = hpos(h); d = Math.hypot(tx - x, ty - y) - (h.s + pr); break; }
          case 'spinner': { const [x, y] = hpos(h), ax = Math.cos(h.rot) * h.len, ay = Math.sin(h.rot) * h.len, vx = tx - x, vy = ty - y, t = clamp((vx * ax + vy * ay) / (ax * ax + ay * ay), -1, 1); d = Math.hypot(vx - ax * t, vy - ay * t) - (3.6 * u + pr); break; }
        }
        if (d !== null && d < 0) { twinBreak(h, [tx, ty]); return; }
      }
    }
  }
  function drawTwin() {
    const c = OD.POWERS.twin.color, low = S.p.twin < 3 ? 0.68 + 0.32 * Math.sin(S.p.twin * 11) : 1;   // the last few seconds: a soft pulse, not an on-off blink
    for (const [tx, ty] of twinList()) {
      ctx.save(); ctx.globalAlpha = low;
      ctx.globalCompositeOperation = 'lighter'; G.glow(ctx, tx, ty, 24 * u, c, 0.85); ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = OD.rgba(c, 0.9); ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(tx, ty, 8.5 * u, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(tx, ty, 3.2 * u, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }
  // the Vortex: a gravity well that eats hazards and draws in stardust for a few seconds
  function spawnWell(x, y) {
    (S.wells = S.wells || []).push({ x, y, t: 0, life: 6 });
    shockwave(x, y, OD.POWERS.vortex.color, 150 * u, 0.9); burst(x, y, 24, 160 * u, OD.POWERS.vortex.color, 2.6, 0.8); OD.audio.sfx('warn');
  }
  function wellStrength(w) { return clamp(Math.min(w.t / 0.5, (w.life - w.t) / 0.7, 1), 0, 1); }
  function wellsTick(dt) {
    if (!S.wells || !S.wells.length) return;
    for (const w of S.wells) {
      w.t += dt; const k = wellStrength(w);
      if (w.t > 0.35 && w.life - w.t > 0.3) {
        for (const h of S.hz) {
          if (h.dead || h.warn > 0 || !(h.k === 'rock' || h.k === 'comet' || h.k === 'mine' || h.k === 'spinner' || h.k === 'cinder')) continue;
          const [hx, hy] = h.k === 'comet' ? [h.x, h.y] : hpos(h);
          if (Math.hypot(hx - w.x, hy - w.y) < 62 * u * k) { destroy(h, true); for (let i = 0; i < 5; i++) particle(hx, hy, (w.x - hx) * 2.2, (w.y - hy) * 2.2, 0.4, 2, OD.POWERS.vortex.color, { drag: 0 }); }
        }
        for (const q of S.pk) if (q.k === 'dust' && !q.dead && !q.vac && !q.vis && q.t > 0 && Math.hypot(q.x - w.x, q.y - w.y) < 170 * u * k) q.vac = { w, t: 0, x0: q.x, y0: q.y };
      }
    }
    for (const q of S.pk) if (q.vac && !q.dead) {
      q.vac.t += dt; const e = Math.pow(Math.min(1, q.vac.t / 0.42), 2);
      q.x = lerp(q.vac.x0, q.vac.w.x, e); q.y = lerp(q.vac.y0, q.vac.w.y, e);
      if (q.vac.t >= 0.42) collect(q);
    }
    S.wells = S.wells.filter(w => w.t < w.life);
  }
  function drawWells() {
    if (!S.wells) return;
    const c = OD.POWERS.vortex.color;
    for (const w of S.wells) {
      const k = wellStrength(w), R0 = 46 * u * k;
      ctx.save(); ctx.translate(w.x, w.y);
      ctx.globalCompositeOperation = 'lighter'; G.glow(ctx, 0, 0, R0 * 2.2, c, 0.5 * k);
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = OD.rgba(i % 2 ? '#ffffff' : c, 0.5 * k); ctx.lineWidth = 2 * u; ctx.beginPath();
        for (let th = 0; th <= 2.6; th += 0.13) { const r = R0 * (0.12 + th / 2.6 * 0.95), a = -th * 2.1 + i * TAU / 4 + w.t * 3.4; th ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R0 * 0.45); g.addColorStop(0, 'rgba(2,0,10,0.95)'); g.addColorStop(1, 'rgba(2,0,10,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R0 * 0.45, 0, TAU); ctx.fill();
      ctx.strokeStyle = OD.rgba(c, 0.55 * k); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, R0 * 1.05, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }
  // the Aegis: instead of dying, you are shielded and a blast clears the area
  function aegisBlast() {
    const p = S.p, c = OD.POWERS.aegis.color, [x, y] = playerXY();
    p.aegis--; p.inv = Math.max(p.inv, 1.8); let n = 0;
    for (const h of S.hz) {
      if (h.dead || h.warn > 0 || !(h.k === 'rock' || h.k === 'comet' || h.k === 'mine' || h.k === 'spinner' || h.k === 'strike' || h.k === 'cinder')) continue;
      const [hx, hy] = h.k === 'comet' ? [h.x, h.y] : hpos(h);
      if (Math.hypot(hx - x, hy - y) < 340 * u) { destroy(h, true); n++; }
    }
    shockwave(x, y, c, 300 * u, 0.8); shockwave(x, y, '#ffffff', 190 * u, 0.55); shockwave(x, y, c, 120 * u, 0.4);
    burst(x, y, 40, 300 * u, c, 3.2, 1); S.flash = Math.max(S.flash, 0.55); shake(10);
    text(n ? 'AEGIS ×' + n : 'AEGIS', x, y - 28 * u, c, 22); OD.audio.sfx('shield'); OD.audio.sfx('slingshot'); OD.haptic('heavy');
  }
  // a side-effect-free copy of the hit geometry above, for the test bot (tools/bot.mjs): how far the point (px, py) is from lethal contact with h
  // (negative = a hit); null when h cannot hurt there
  function gapAt(h, px, py) {
    if (h.dead || h.warn > 0 || exitQ(h) > 0.4) return null;
    const pr = 4.6 * u; let d = null;
    switch (h.k) {
      case 'rock': { const [x, y] = hpos(h); return Math.hypot(px - x, py - y) - (h.s * 0.82 + pr); }
      case 'comet': return Math.hypot(px - h.x, py - h.y) - (6.5 * u + pr);
      case 'spinner': { const [x, y] = hpos(h), ax = Math.cos(h.rot) * h.len, ay = Math.sin(h.rot) * h.len, vx = px - x, vy = py - y, t = clamp((vx * ax + vy * ay) / (ax * ax + ay * ay), -1, 1); return Math.hypot(vx - ax * t, vy - ay * t) - (3.6 * u + pr); }
      case 'mine': { const [x, y] = hpos(h); return Math.hypot(px - x, py - y) - ((mineArmed(h) ? 20 * u : 5.5 * u) + pr); }
      case 'strike': { const [x, y] = hpos(h); return Math.hypot(px - x, py - y) - (h.s + pr); }
      case 'hole': { const [x, y] = hpos(h), kk = holeK(h); return Math.hypot(px - x, py - y) - (h.s * 0.9 * kk + pr + 10 * u); }
      case 'ribbon': { const ang = Math.atan2(py - cy, px - cx), rr = Math.hypot(px - cx, py - cy), sq = ribbonS(h, ang); return sq > 0.05 && sq < 0.95 && h.life > 0.6 ? Math.abs(rr - ribbonR(h, ang)) - (4.4 * u + pr) : null; }
      case 'tether': { const [x1, y1, x2, y2] = tetherEnds(h); return Math.min(Math.hypot(px - x1, py - y1) - (h.s * 0.85 + pr), Math.hypot(px - x2, py - y2) - (h.s * 0.85 + pr), segDist(px, py, x1, y1, x2, y2) - (2.8 * u + pr)); }
      case 'cinder': return Math.hypot(px - h.x, py - h.y) - (6.4 * u + pr);
      case 'spear': { if (!(h.thr > 0 && h.life > 0.8)) return null; const [tx, ty] = spearTip(h); return Math.min(segDist(px, py, cx + Math.cos(h.a) * spearOuter(), cy + Math.sin(h.a) * spearOuter(), tx, ty) - (2.6 * u + pr), Math.hypot(px - tx, py - ty) - (8 * u + pr)); }
      case 'pylon': { const ph = pylonPhase(h); if (!(ph >= 1.9 && ph < 3.0)) return null; const [x1, y1, x2, y2] = pylonEnds(h); return segDist(px, py, x1, y1, x2, y2) - (3 * u + pr); }
      case 'shade': return h.t - h.warn0 > 0.35 && h.life > 0.5 && shadeLethal(h) ? Math.hypot(px - h.x, py - h.y) - (6.4 * u + pr) : null;
      case 'shoal': { if (!(h.t - h.warn0 > 0.3 && h.fish)) return null; for (const f of h.fish) { const dd = Math.hypot(px - f[0], py - f[1]) - (4.4 * u + pr); if (d === null || dd < d) d = dd; } return d; }
      case 'devil': { if (!(h.t - h.warn0 > 0.4 && h.life > 0.5)) return null; const [x, y] = devilPos(h); return Math.hypot(px - x, py - y) - (5.4 * u + pr); }
      case 'bloom': { const tau = h.t - h.warn0; if (tau > 0.3 && !h.fired) { const [bx, by] = pos(h.o, h.a); d = Math.hypot(px - bx, py - by) - (5.6 * u + pr); } if (h.balls) for (const b of h.balls) { const dd = Math.hypot(px - b.x, py - b.y) - (4.6 * u + pr); if (d === null || dd < d) d = dd; } return d; }
      case 'hail': { const tau = h.t - h.warn0; for (const l of h.lanes) { if (tau < l.at || l.done) continue; const dd = segDist(px, py, l.x, l.y - HAIL_LEN * u, l.x, l.y) - (3.2 * u + pr); if (d === null || dd < d) d = dd; } return d; }
      case 'serpent': { if (!(h.t - h.warn0 > 0.3 && h.pts && h.pts.length)) return null; for (let i = 0; i + 1 < h.pts.length; i++) { const dd = segDist(px, py, h.pts[i][0], h.pts[i][1], h.pts[i + 1][0], h.pts[i + 1][1]) - ((3.8 - i * 0.1) * u + pr); if (d === null || dd < d) d = dd; } return d; }
      case 'ring': { const rr = Math.hypot(px - cx, py - cy), th = Math.atan2(py - cy, px - cx); return Math.abs(rr - R[h.o]) < h.thick / 2 + pr * 0.85 && Math.abs(angDiff(th, h.a)) >= h.g ? -1 : 20 * u; }
      case 'beam': { const rr = Math.hypot(px - cx, py - cy), r0 = R[h.o0] - 16 * u, r1 = R[h.o1] + 16 * u; if (rr < r0 || rr > r1) return null; const da = angDiff(Math.atan2(py - cy, px - cx), h.a); return Math.abs(da) < Math.PI / 2 ? Math.abs(Math.sin(da)) * rr - (3.2 * u + pr) : null; }
    }
    return null;
  }
  function collideAll(dt) {
    const p = S.p, [px, py] = playerXY();
    const pr = 4.6 * u, gz = (18 + 5 * perk('daredevil') + (p.prism > 0 ? 14 : 0)) * u;
    const safe = S.od > 0 || p.phase > 0 || p.surge > 0 || S.mode === 'zen' || p.inv > 0 || S.dying > 0;
    p.holeSlow = 1; S.holeAmt = 0;
    S.inCloud = false;
    if (p.body === 'main' && !p.jump) for (const h of S.hz) if (h.k === 'cloud' && !h.dead && h.warn <= 0 && h.o === p.o && Math.abs(angDiff(p.th, h.a)) < h.arc / 2) { S.inCloud = true; break; }
    if (S.inCloud && !safe) {
      p.holeSlow = 0.75; S.mult = Math.max(1, S.mult - dt * 0.7);
      if (!S.wasCloud) { text('POISONED', px, py - 24 * u, '#b4ff5a', 14); OD.haptic('light'); }
      if (Math.random() < 0.5) particle(px + rand(-8, 8) * u, py + rand(-8, 8) * u, rand(-20, 20), rand(-40, -10), 0.7, rand(1.5, 3), '#b4ff5a', { drag: 0.8 });
    }
    S.wasCloud = S.inCloud;
    const jumping = p.jump && p.jump.t / p.jump.dur;
    for (const h of S.hz) {
      if (h.dead || h.warn > 0 || exitQ(h) > 0.4) continue;
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
        case 'strike': { const [x, y] = hpos(h); d = Math.hypot(px - x, py - y) - (h.s + pr); break; }
        case 'hole': {
          const [x, y] = hpos(h), dist = Math.hypot(px - x, py - y), kk = holeK(h), fld = h.field * kk;
          if (dist < fld) { p.holeSlow = Math.min(p.holeSlow, 0.35 + 0.65 * (dist / fld)); S.holeAmt = Math.max(S.holeAmt, 1 - dist / fld); }
          d = dist - (h.s * 0.9 * kk + pr); break;
        }
        case 'ribbon': {
          const ang = Math.atan2(py - cy, px - cx), rr = Math.hypot(px - cx, py - cy), sq = ribbonS(h, ang);
          if (sq > 0.05 && sq < 0.95 && h.life > 0.6) d = Math.abs(rr - ribbonR(h, ang)) - (4.4 * u + pr);
          break;
        }
        case 'tether': {
          const [x1, y1, x2, y2] = tetherEnds(h);
          d = Math.min(Math.hypot(px - x1, py - y1) - (h.s * 0.85 + pr), Math.hypot(px - x2, py - y2) - (h.s * 0.85 + pr), segDist(px, py, x1, y1, x2, y2) - (2.8 * u + pr));
          break;
        }
        case 'cinder': d = Math.hypot(px - h.x, py - h.y) - (6.4 * u + pr); break;
        case 'spear': {
          if (h.thr > 0 && h.life > 0.8) { const [tx, ty] = spearTip(h); d = Math.min(segDist(px, py, cx + Math.cos(h.a) * spearOuter(), cy + Math.sin(h.a) * spearOuter(), tx, ty) - (2.6 * u + pr), Math.hypot(px - tx, py - ty) - (5.4 * u + pr)); }
          break;
        }
        case 'pylon': {
          const ph = pylonPhase(h);
          if (ph >= 2.04 && ph < 2.96) { const [x1, y1, x2, y2] = pylonEnds(h); d = segDist(px, py, x1, y1, x2, y2) - (3 * u + pr); }
          break;
        }
        case 'shade': {
          if (h.t - h.warn0 > 0.35 && h.life > 0.5 && shadeLethal(h)) d = Math.hypot(px - h.x, py - h.y) - (6.4 * u + pr);
          break;
        }
        case 'shoal': {
          if (h.t - h.warn0 > 0.3 && h.fish) for (const f of h.fish) { const dd = Math.hypot(px - f[0], py - f[1]) - (4.4 * u + pr); if (d === null || dd < d) d = dd; }
          break;
        }
        case 'devil': {
          if (h.t - h.warn0 > 0.4 && h.life > 0.5) {
            const [x, y] = devilPos(h), dist = Math.hypot(px - x, py - y);
            d = dist - (5.4 * u + pr);
            if (d >= 0 && dist < 25 * u + pr && (S.devilCd || 0) <= 0 && p.body === 'main' && !p.jump) {   // the wind: you are spun round and sent back the way you came
              S.devilCd = 1.3; p.dir *= -1; S.lastFlipT = S.time; S.lapAcc = 0;
              burst(px, py, 12, 110 * u, '#e0b070', 2.2, 0.6); shockwave(px, py, '#e0b070', 56 * u, 0.5); text('WHIRLED', px, py - 22 * u, '#f2d6a2', 16); OD.audio.sfx('flip', 1); OD.haptic('medium');
            }
          }
          break;
        }
        case 'bloom': {
          const tau = h.t - h.warn0;
          if (tau > 0.3 && !h.fired) { const [bx, by] = pos(h.o, h.a); d = Math.hypot(px - bx, py - by) - (5.6 * u + pr); }
          if (h.balls) for (const b of h.balls) { const dd = Math.hypot(px - b.x, py - b.y) - (4.6 * u + pr); if (d === null || dd < d) d = dd; }
          break;
        }
        case 'hail': {
          const tau = h.t - h.warn0;
          for (const l of h.lanes) { if (tau < l.at || l.done) continue; const dd = segDist(px, py, l.x, l.y - HAIL_LEN * u, l.x, l.y) - (3.2 * u + pr); if (d === null || dd < d) d = dd; }
          break;
        }
        case 'serpent': {
          if (h.t - h.warn0 > 0.3 && h.pts && h.pts.length) for (let i = 0; i + 1 < h.pts.length; i++) { const dd = segDist(px, py, h.pts[i][0], h.pts[i][1], h.pts[i + 1][0], h.pts[i + 1][1]) - ((3.8 - i * 0.1) * u + pr); if (d === null || dd < d) d = dd; }
          break;
        }
        case 'rift': {
          if (h.t - h.warn0 > 0.5 && h.life > 0.6 && p.body === 'main' && !p.jump && (S.riftCd || 0) <= 0) {
            const [e1, e2] = riftEnds(h), r = 9 * u + pr, hit = Math.hypot(px - e1[0], py - e1[1]) < r ? 1 : Math.hypot(px - e2[0], py - e2[1]) < r ? 2 : 0;
            if (hit) riftJump(h, hit === 1 ? 2 : 1);
          }
          break;
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
        if (S.od > 0) { if (h.k === 'rock' || h.k === 'comet' || h.k === 'mine' || h.k === 'spinner' || h.k === 'cinder') destroy(h); }
        else if (safe) { /* ghosting through */ }
        else if (!absorb(h)) die(h);
      } else if (h.k !== 'hole' && !safe) {
        const g = trackGraze(h, d, gz);
        if (g >= 0) onGraze(h, g);
      }
    }
    if (!safe) twinCheck();
    if (p.reaper > 0) {   // anything destroyable that touches the aura is destroyed
      for (const h of S.hz) {
        if (h.dead || h.warn > 0 || (h.k !== 'rock' && h.k !== 'comet' && h.k !== 'mine' && h.k !== 'spinner' && h.k !== 'cinder')) continue;
        const [hx, hy] = hpos(h);
        if (Math.hypot(hx - px, hy - py) < (h.k === 'spinner' ? 62 : 46) * u) { destroy(h, true); addMult(0.05); }
      }
    }
    evtCollide(px, py, pr, gz);
    // pickups
    const twins = twinList();
    for (const k of S.pk) {
      if (k.dead || k.t < 0.2) continue;
      const dist = Math.hypot(px - k.x, py - k.y);
      if (k.k === 'dust' && ((p.magnet > 0 && dist < 150 * u) || (pth('fortune') && dist < 70 * u) || (perk('sense') && dist < (24 + 24 * perk('sense')) * u) )) k.pull = true;
      if (k.k === 'dust' && twins.some(t => Math.hypot(t[0] - k.x, t[1] - k.y) < 12 * u + pr)) { collect(k); continue; }   // the Wingman collects stardust too
      if (dist < (k.k === 'power' ? 17 : 12) * u + pr) collect(k);
    }
  }

  function update(dt) {
    const p = S.p;
    if (S.hitStop > 0) { S.hitStop -= dt; dt *= 0.12; }   // a hit stops the world for a breath, so it lands
    S.real += dt;
    // clock: audio clock when available, otherwise accumulated frame time
    if (S.useAudio) {
      const at = OD.audio.time(), ep = OD.audio.epoch();
      if (S.ep !== ep) {   // the music re-anchored (a new biome's song came in): keep the clock running and land on its beat grid
        if (S.musicNext) { S.musicWorld = S.musicNext; S.musicNext = null; }
        if (S.ep != null && at !== null) { const bl = 60 / OD.audio.bpm(S.musicWorld || world); S.clockOff = Math.ceil(S.clock / bl) * bl - at; resyncBeat(); }
        S.ep = ep;
      }
      S.clock = at === null ? S.clock + dt : Math.max(S.clock, at + (S.clockOff || 0));
    }
    else S.clock += dt;
    S.time = Math.max(0, S.clock);
    if (S.tour && state === 'play' && !S.over && !S.dying && S.tut < 0) {   // testing: every sky for 20 s, then the black hole
      const T = S.tour; T.t += dt;
      if (!T.pre && T.t > 11 && T.i < 6) { T.pre = true; if (T.i < 5) { OD.audio.preload(OD.WORLDS[T.i + 1]); OD.biomes.prepare(OD.WORLDS[T.i + 1], W, H); } else OD.audio.preload({ id: 6 }); }
      if (T.t >= 20 && T.i < 6) {
        T.t = 0; T.pre = false; T.i++;
        if (T.i <= 5) { S.forceBiome = T.i; S.nextBiome = null; enterBiome(S.driftDir || 1); } else if (!S.dir.boss) spawnBoss();
      }
    }
    if (S.flareAfter) {   // the afterglow of a solar flare
      const f = S.flareAfter; f.t += dt;
      if (Math.random() < 1.4 * fxScale() && f.t < f.life * 0.75) { const a = f.lanes[(Math.random() * f.lanes.length) | 0], d = Math.hypot(W, H) * (0.1 + 0.8 * Math.random()); particle(f.x + Math.cos(a) * d + rand(-8, 8) * u, f.y + Math.sin(a) * d + rand(-8, 8) * u, rand(-12, 12) * u, rand(-34, -12) * u, 1.3, rand(1, 2.2), Math.random() < 0.5 ? '#ffb347' : '#ff7a2a', { drag: 1.2 }); }
      if (f.t >= f.life) S.flareAfter = null;
    }

    applyBreath();
    // camera: pull back when a second planet or a big event is on screen
    {
      let tz = 1, ty = 0;
      const v = S.vis, ev = S.evt, hb = S.dir.boss && S.dir.boss.kind === 'singularity';
      if (v) { const pres = visPresence(v); tz = 1 - 0.22 * pres; ty = v.side * v.D * 0.5 * pres; }
      if (ev) { if (ev.type === 'nova') tz = Math.min(tz, 0.88); else if (ev.type === 'hole' || ev.type === 'giant') tz = Math.min(tz, 1 - 0.1 * ev.ramp); }
      if (hb) { tz = 1; ty = 0; }
      S.camZ += (tz - S.camZ) * Math.min(1, dt * 2.5); S.camY += (ty - S.camY) * Math.min(1, dt * 2.5);
    }
    // time scale
    let tsT = 1;
    if (S.vis && S.vis.phase === 'settle') tsT = 0.62;   // slow, cinematic move to the new planet
    if (S.dying) tsT = 0.22;
    else {
      if (p.charging) tsT = p.ct > 2.5 + pv('focus') ? 1 : (p.dragging ? 0.4 : 0.55) * (1 - (pth('control') ? 0.15 * 0.55 : 0));   // aiming slows time, but not forever
      if (p.slow > 0) tsT *= 0.62;
      if (S.focusT > 0) { tsT *= 0.55; S.focusT -= dt; }
      if (S.intro) { tsT = 0.05; S.intro.t += dt; if (S.intro.t > 30) endIntro(); }
    }
    if (S.rampT > 0) S.rampT -= dt;
    S.ts += (tsT - S.ts) * Math.min(1, dt * (S.intro ? 12 : S.rampT > 0 ? 3.2 : (S.vis && S.vis.phase === 'settle') || S.settleTail > 0 ? 2.4 : 12));
    const gdt = dt * S.ts;

    if (!S.dying && !S.over) {
      // charge
      // Retro Thrust / Afterburner (one of them is equipped): press and hold without moving and only your own dot slows down or speeds up, for at most
      // two seconds; the meter takes about thirty seconds to fill again
      { const eq = OD.equippedMove(), lv2 = !!eq && OD.perkLevel(eq) >= 2;   // level 2: once it is on, dragging the finger hops between orbits
        const want = !!eq && p.holding && !S.intro && S.aE > 0.05 && (S.aOn && lv2 ? true : p.holdT > AB_T && !p.moved && !p.swiped);
        if (want && !S.aOn) { p.abStarted = true; OD.audio.sfx('charge'); OD.haptic('light'); p.slowed = true; abX = ptrX; abY = ptrY; introduce(eq === 'retro' ? 'ab_retro' : 'ab_after', true); }
        S.aOn = want; S.aEq = eq; S.aE = clamp(S.aE + (want ? -dt : dt * (2 / 30)), 0, 2);
        S.aFx = (S.aFx || 0) + ((want ? 1 : 0) - (S.aFx || 0)) * Math.min(1, dt * (want ? 9 : 5)); if (want) S.aFxEq = eq;
        if (want && p.body === 'main') for (let n = 0; n < (eq === 'retro' ? 1 : 3); n++) if (Math.random() < 0.9 * fxScale() * Math.min(1, dt * 60)) {   // cold flakes drift off a braking dot, orange sparks stream behind a boosting one
          const [x, y] = playerXY(), tx = -Math.sin(p.th) * p.dir, ty = Math.cos(p.th) * p.dir;
          if (eq === 'retro') { const a = Math.random() * TAU, sp = rand(14, 46) * u; particle(x + Math.cos(a) * 6 * u, y + Math.sin(a) * 6 * u, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.5, 0.9), rand(1.2, 2.4), Math.random() < 0.5 ? '#bfe8ff' : '#7fc4ff', { drag: 2.2 }); }
          else particle(x - tx * 5 * u, y - ty * 5 * u, -tx * rand(70, 150) * u + rand(-24, 24) * u, -ty * rand(70, 150) * u + rand(-24, 24) * u, rand(0.3, 0.6), rand(1.8, 3.6), Math.random() < 0.4 ? '#ffd27a' : '#ff6a1a', { drag: 1.4 });
        } }
      if (!S.aOn) p.abDir = 0;
      else if (p.abDir && !p.jump && !S.intro) { p.abWait = (p.abWait || 0) + dt; if (p.abWait >= HOLD_CHAIN) abChain(); }
      if (S.shockCd > 0) S.shockCd = Math.max(0, S.shockCd - dt);
      if (S.drawCd > 0) S.drawCd = Math.max(0, S.drawCd - dt);
      if (S.hopCd > 0) S.hopCd = Math.max(0, S.hopCd - dt);
      if (S.shockFx > 0) S.shockFx = Math.max(0, S.shockFx - dt);
      if (p.holding) {
        p.holdT += dt;
        if (p.swiped && p.swipeDir && !S.intro && OD.ability('cascade') && !(p.abStarted && OD.perkLevel(OD.equippedMove()) < 2)) {   // (a touch that began Retro Thrust or Afterburner has no Cascade until those reach level 2)
          p.holdAfter += dt; if (!p.jump && p.holdAfter >= HOLD_CHAIN) chainHop(); }   // the wait is counted from the swipe, so the next hop starts the moment you land
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
        S.spd += (speedFor(S.level, S.mode) * modSpeed() * (S.uniSpd || 1) - S.spd) * Math.min(1, dt * 0.8);
        if (S.time >= S.nextTick) {                         // small reward for every stretch survived
          const sec = Math.round(S.nextTick);
          feat(sec + ' SECONDS', 'Still flying', '#9fe6ff', 25 * Math.ceil(sec / 15));
          S.nextTick += S.nextTick < 60 ? 15 : 30;
        }
      }
      if (!S.steerTip && S.time > 6 && S.tut < 0 && !S.evt && !S.vis && canUse('swipe')) { S.steerTip = true; introduce('swipe'); }
      if (!S.swipeTip && S.time > 24 && S.tut < 0 && !S.evt && !S.vis && OD.intro.seen('swipe') && OD.ability('cascade') && canUse('steer')) { S.swipeTip = true; introduce('steer'); }
      visTick(S.intro ? 0 : dt);   // a passing planet waits while it is being explained
      evtTick(dt, gdt);
      S.chainT -= dt; if (S.chainT <= 0) S.chain = 0;
      if (S.clutchT > 0) S.clutchT -= dt;
      if (S.feats.length) { S.feats[0].t += dt; if (S.feats[0].t > 1.6) S.feats.shift(); }

      // power timers
      for (const k of TIMED) if (p[k] > 0) p[k] = Math.max(0, p[k] - dt);
      if (p.surge > 0) {   // surging: a stream of stardust behind you, the multiplier held up, and a light wake
        S.surgeT = (S.surgeT || 0) + dt; S.multT = Math.max(S.multT, 1.6); S.wasSurge = true;
        while (S.surgeT > 0.11) { S.surgeT -= 0.11; surgeDust(); }
        if (Math.random() < 0.9 * fxScale()) { const [sx, sy] = playerXY(); particle(sx + rand(-4, 4) * u, sy + rand(-4, 4) * u, rand(-30, 30) * u, rand(-30, 30) * u, 0.45, rand(1.5, 3), '#bffff0', { drag: 3 }); }
      } else if (S.wasSurge) { S.wasSurge = false; p.inv = Math.max(p.inv, 0.9); const [sx, sy] = playerXY(); shockwave(sx, sy, OD.POWERS.surge.color, 60 * u, 0.4); }
      if (p.inv > 0) p.inv -= dt;
      if (S.hullCd > 0) { S.hullCd -= dt; if (S.hullCd <= 0) { S.hullCd = 0; if (!p.shield) { p.shield = true; const [sx, sy] = playerXY(); shockwave(sx, sy, OD.POWERS.shield.color, 120 * u, 0.6); text('SHIELD READY', sx, sy - 26 * u, OD.POWERS.shield.color, 16); OD.audio.sfx('power'); } } }
      if (pv('phoenix') && !S.dying) {   // Phoenix: hearts grow back after a stretch with no heart lost
        if (S.lives < maxLives()) { S.phoenixT += dt; if (S.phoenixT >= [0, 150, 110, 80][pv('phoenix')]) { S.phoenixT = 0; S.lives++; const [hx, hy] = playerXY(); S.lifeFrom = { x: hx, y: hy }; shockwave(hx, hy, '#ffb347', 130 * u, 0.7); text('HEART RESTORED', hx, hy - 26 * u, OD.POWERS.life.color, 16); OD.audio.sfx('power'); OD.haptic('medium'); } } else S.phoenixT = 0;
      }
      if (S.focusCd > 0) S.focusCd -= dt;
      if (pv('gift') && !S.giftDone && S.time > 1.2 && !S.intro && S.tut < 0) {   // Fortune's Gift: a few power-ups already working for you
        S.giftDone = true; const bag = ['shield', 'shield', 'zap', 'zap', 'aegis', 'magnet', 'slow', 'double'].sort(() => Math.random() - 0.5).slice(0, [0, 1, 1, 2][pv('gift')] + (pv('gift') > 1 && Math.random() < 0.5 ? 1 : 0)), [gx, gy] = playerXY();
        for (const type of bag) collect({ k: 'power', type, x: gx, y: gy, o: p.o, a: p.th, t: 1 });
      }
      if (pv('windfall') && S.time > 5 && !S.intro && S.tut < 0) { S.windT += dt; if (S.windT >= [0, 80, 60, 42][pv('windfall')]) { S.windT = 0; spawnPower(true); } }
      if (p.boost > 0) p.boost = Math.max(0, p.boost - dt);
      if (S.od > 0) { S.novaT = (S.novaT || 0) + dt; S.od -= dt; if (S.od <= 0) { S.od = 0; OD.audio.setIntensity(Math.min(3, Math.floor((S.mult - 1) * 1.2))); } }
      if (S.intro) { /* the multiplier waits while something is being explained */ } else if (S.multT > 0) S.multT -= dt; else if (S.mult > 1 && !(S.p.amp > 0)) S.mult = Math.max(1, S.mult - dt * MULT_DRAIN * (1 - 0.25 * perk('momentum')));

      // score
      const rate = (6 + 10 * lv()) * S.mult * (S.od > 0 ? 2 : 1) * (S.mode === 'hardcore' ? 2 : 1);
      if (S.mode !== 'zen' && S.tut < 0) addScore(rate * dt);
      if (p.o === 0 && !p.jump && p.body === 'main') S.stats.innerTime += dt;
      if (S.mode === 'zen') S.calm += dt;
    }

    // player motion
    if (S.win) winTick(dt);
    else if (!p.dead) {
      p.vd += (p.dir - p.vd) * Math.min(1, dt * (eraIs('frozen') ? 7 : 80));
      const surge = eraIs('storm') ? 1 + 0.15 * Math.sin(S.clock * 1.1) * Math.min(1, S.era.mix) : 1;
      const v = base * 0.62 * speedMul() * surge * (p.brake > 0 ? 0.55 : 1) * (1 + 0.55 * Math.min(1, p.boost)) * p.holeSlow * (S.od > 0 ? 1.12 : 1) * (p.surge > 0 ? 1.75 : 1) * (S.aOn ? (S.aEq === 'retro' ? 0.38 : 1.7) : 1);
      if (p.jump && p.jump.cross) {
        p.dr = 0; p.pull = 0;
        const j = p.jump;
        j.t += gdt;
        const k = clamp(j.t / j.dur, 0, 1), e = smooth(k);
        let tx, ty;
        if (j.body === 'vis' && S.vis) { tx = S.vis.x + Math.cos(j.a) * S.vis.rho; ty = S.vis.y + Math.sin(j.a) * S.vis.rho; }
        else { const rr = j.n >= 0 ? R[j.n] : R[1]; tx = cx + Math.cos(j.a) * rr; ty = cy + Math.sin(j.a) * rr; }
        {   // not a straight line with a sharp turn: a smooth arc that leaves along the orbit you were on and arrives along the new one
          const ch = Math.hypot(tx - j.fx, ty - j.fy), L = ch * 0.5, ex0 = -Math.sin(j.a), ey0 = Math.cos(j.a), sg = Math.sign(ex0 * (tx - j.fx) + ey0 * (ty - j.fy)) || (p.dir || 1), ex = ex0 * sg, ey = ey0 * sg;
          const x1 = j.fx + j.vx * L, y1 = j.fy + j.vy * L, x2 = tx - ex * L, y2 = ty - ey * L, ee = lerp(k, e, 0.5), q = 1 - ee;
          p.wx = q * q * q * j.fx + 3 * q * q * ee * x1 + 3 * q * ee * ee * x2 + ee * ee * ee * tx; p.wy = q * q * q * j.fy + 3 * q * q * ee * y1 + 3 * q * ee * ee * y2 + ee * ee * ee * ty;
        }
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
          if (k >= 1) {
            p.o = j.n; p.r = R[p.o]; p.jump = null; S.lastLand = S.time; if (pv('glide')) p.inv = Math.max(p.inv, [0, 0.6, 1.0, 1.4][pv('glide')]); if (pth('control')) addMult(0.03); if (j.near) trick('dodgej', 'DODGE JUMP', 14, '#ffe48a');
            if (p.queue && p.queue.length) {   // next hop of a multi-orbit jump, a little quicker each time
              const nx = p.queue.shift(); p.od = nx > p.o ? 1 : -1;
              p.jump = { t: 0, dur: JUMP_DUR * 0.62 * (1 - 0.18 * pv('swift')), from: p.r, to: R[nx], n: nx };
              const [qx, qy] = playerXY(); burst(qx, qy, 5, 80 * u, '#fff', 1.6, 0.3); OD.audio.sfx('jump');
            }
          }
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
      const maxT = T().fx ? OD.Q().trail : Math.min(18, OD.Q().trail);
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
      if (false) {
        S.ghostAcc -= 0.1;
        S.ghostRec.push(+p.th.toFixed(2), +p.r.toFixed(1));
      }
    }

    // a full lap on one orbit with no flip or jump in between
    if (!p.dead && p.body === 'main' && !p.jump && !S.intro && S.tut < 0) {
      S.lapAcc = (S.lapAcc || 0) + (S.lapPrev == null ? 0 : Math.abs(angDiff(p.th, S.lapPrev)));
      S.lapPrev = p.th;
      if (S.lapAcc > TAU * 1.05) { S.lapAcc = 0; trick('lap', 'CLEAN LAP', 9, '#cfe6ff'); }
    } else S.lapPrev = null;
    // where you have been (the Shade follows it)
    S.histT = (S.histT || 0) + gdt;
    if (gdt > 0 && !S.over) { const L = S.hist || (S.hist = []); L.push([S.histT, p.wx, p.wy]); while (L.length > 2 && L[0][0] < S.histT - 7) L.shift(); }
    // hazards
    for (const h of S.hz) {
      h.t += gdt;
      if (h.gcd > 0) h.gcd -= gdt;
      if (h.warn > 0) {
        h.warn -= gdt;
        if (h.k === 'hole') {   // the warning draws light in towards the spot, and as it ends the hole opens with a soft ring
          const [hx, hy] = hpos(h);
          if (h.warn > 0 && Math.random() < 1.4 * fxScale()) { const a = Math.random() * TAU, d = h.field * (0.9 + 0.5 * Math.random()), life = 0.55; particle(hx + Math.cos(a) * d, hy + Math.sin(a) * d, -Math.cos(a) * d / life, -Math.sin(a) * d / life, life, rand(1, 2.2), Math.random() < 0.5 ? '#c9a2ff' : '#ffffff', { drag: 0 }); }
          if (h.warn <= 0) { shockwave(hx, hy, '#b57bff', 56 * u, 0.6); burst(hx, hy, 10, 70 * u, '#d9b3ff', 2, 0.6); }
        }
        continue;
      }
      if (h.k === 'strike' && !h.fired) {
        h.fired = true; const [sx, sy] = hpos(h);
        S.flash = Math.max(S.flash, 0.5); shake(6); burst(sx, sy, 20, 220 * u, '#fff6c8', 2.5, 0.6); shockwave(sx, sy, '#cfe6ff', 70 * u, 0.4);
        OD.audio.sfx('warn'); OD.haptic('medium');
      }
      h.life -= gdt;
      const mg = p.stasis > 0 ? 0.03 : 1;   // Stasis: the field is frozen
      if (h.k === 'comet') { h.x += h.vx * gdt * mg; h.y += h.vy * gdt * mg; }
      else if (h.w) h.a += h.w * gdt * mg / (S.rs || 1) * (0.55 + 0.45 * S.spd) * (eraIs('frozen') ? 0.6 : 1);
      if (h.k === 'rock') h.rot += gdt * 1.3 * mg;
      else if (h.k === 'spinner') h.rot += h.rv * gdt * mg;
      if (BIOME_HAZ_SET.has(h.k)) tickBiomeHazard(h, gdt, mg);
      if (h.k === 'hole' && h.life < 1.7 && h.life > 0) {   // evaporating: light streams out of it
        const [hx, hy] = hpos(h), ev = 1 - h.life / 1.7;
        if (Math.random() < (0.55 + 0.9 * ev) * fxScale()) { const a = Math.random() * TAU, sp = (40 + 110 * Math.random()) * u * (0.6 + ev); particle(hx + Math.cos(a) * h.s * 0.8, hy + Math.sin(a) * h.s * 0.8, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.5, 0.9), rand(1.4, 3), ['#e6ccff', '#ffffff', '#b57bff'][(Math.random() * 3) | 0], { drag: 1.5 }); }
      }
      if (h.life <= 0) { if (h.k === 'hole' && !h.dead) holePop(h); h.dead = true; if (DRIFT.has(h.k)) h.fo = 9; }
    }
    // pickups
    for (const k of S.pk) {
      k.t += gdt; k.life -= gdt;
      if (k.k === 'power') {
        k.a += k.w * gdt;
        if (!S.intro && Math.random() < 0.28 * fxScale()) {
          const col = OD.POWERS[k.type].color, a = Math.random() * TAU;
          if (k.type === 'magnet') particle(k.x + Math.cos(a) * 30 * u, k.y + Math.sin(a) * 30 * u, -Math.cos(a) * 50 * u, -Math.sin(a) * 50 * u, 0.6, 1.6, col, { drag: 0 });
          else if (k.type === 'amp') particle(k.x + rand(-8, 8) * u, k.y, rand(-6, 6), (k.type === 'amp' ? -1 : -0.6) * rand(30, 60) * u, 0.8, rand(1.2, 2.2), col, { drag: 0.6 });
          else if (k.type === 'alchemy') particle(k.x + Math.cos(a) * 14 * u, k.y + Math.sin(a) * 14 * u, Math.cos(a) * 24 * u, Math.sin(a) * 24 * u, 0.9, 2, OD.hsl(Math.random() * 360, 100, 66), { sq: true });
          else particle(k.x + Math.cos(a) * 14 * u, k.y + Math.sin(a) * 14 * u, Math.cos(a) * 22 * u, Math.sin(a) * 22 * u, 0.9, rand(1.2, 2.4), col, { drag: 1.2 });
        }
      }
      const [bx, by] = k.free ? [k.x, k.y] : k.vis ? (S.vis ? [S.vis.x + Math.cos(k.a) * S.vis.R[k.ri == null ? S.vis.no - 1 : k.ri], S.vis.y + Math.sin(k.a) * S.vis.R[k.ri == null ? S.vis.no - 1 : k.ri]] : [k.x, k.y]) : pos(k.o, k.a);
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
    S.hz = S.hz.filter(h => !h.dead || h.fo < (h.exit ? DRIFT_T : FADE_OUT));
    S.pk = S.pk.filter(k => !k.dead || k.fo < FADE_OUT);

    // each planet type has its own air: pollen, glittering shards, poison spores
    if (S.mode !== 'zen' && S.tut < 0) {
      if (eraIs('verdant') && Math.random() < 0.22 * fxScale()) particle(rand(0, W), H + 8, rand(-14, 14), rand(-46, -20) * u, 5, rand(1.2, 2.6), Math.random() < 0.5 ? '#ffb7d5' : '#c9ff9a', { drag: 0.2 });
      else if (eraIs('toxic') && Math.random() < 0.25 * fxScale()) particle(rand(0, W), H + 8, rand(-12, 12), rand(-52, -26) * u, 5, rand(1.4, 3), '#b4ff5a', { drag: 0.2 });
      else if (eraIs('prism') && Math.random() < 0.18 * fxScale()) particle(rand(0, W), rand(0, H), 0, 0, 0.7, rand(1.4, 2.6), Math.random() < 0.5 ? '#8affea' : '#ffffff', { drag: 0, sq: true });
    }
    // cosmetic systems
    for (const q of S.parts) {
      q.life -= gdt; q.x += q.vx * gdt; q.y += q.vy * gdt;
      const dr = Math.exp(-q.drag * gdt); q.vx *= dr; q.vy *= dr;
    }
    S.parts = S.parts.filter(q => q.life > 0);
    for (const t of S.texts) { t.t += dt; t.y -= 22 * dt; }
    S.texts = S.texts.filter(t => t.t < t.life);
    for (const w of S.waves) w.t += dt;
    wellsTick(gdt);
    S.waves = S.waves.filter(w => w.t < w.life);
    S.shake *= Math.exp(-dt * 9); S.flash *= Math.exp(-dt * 4.5);
    S.beatPulse *= Math.exp(-dt * 6);
    if (S.hopBloom > 0) S.hopBloom = Math.max(0, S.hopBloom - dt / 1.8);
    if (S.homePop > 0) S.homePop = Math.max(0, S.homePop - dt / 1.5);
    if (S.dock) { S.dock.t += dt; if (S.dock.t > 2.1) S.dock = null; }
    if (S.pendingBanner) { S.pendingBanner.t -= dt; if (S.pendingBanner.t <= 0) { banner(S.pendingBanner.str, S.pendingBanner.sub); S.pendingBanner = null; } }
    if (S.settleTail > 0) S.settleTail = Math.max(0, S.settleTail - dt);
    if (S.orbIn != null && S.orbIn < 1) S.orbIn = Math.min(1, S.orbIn + dt / 1.1);
    if (S.ringTrail) { S.ringTrail.t += dt; if (S.ringTrail.t > 1.1) S.ringTrail = null; }
    S.bass = OD.audio.level();
    S.kick = OD.audio.kick();
    if (S.bannerT > 0) S.bannerT -= dt;
    if (S.feats.length && S.dying) S.feats.length = 0;
    if (S.bgT < 1) S.bgT = Math.min(1, S.bgT + dt / (S.bgDur || 3.5));
    S.slowV = (S.slowV || 0) + ((S.dying || S.over ? 0 : S.holeAmt || 0) - (S.slowV || 0)) * Math.min(1, dt * 7);   // how deep in a gravity well you are, smoothed
    if (state === 'play' && !S.dying && !S.over) { const m = 0.55 * S.slowV; if (m > 0.02 || S.slowMuf) { OD.audio.setMuffle(m > 0.02 ? m : 0); S.slowMuf = m > 0.02; } }   // time thickens: the music dulls with you
    if (S.bspd) S.bspd += (world.speed - S.bspd) * Math.min(1, dt * 0.3);
    if (S.beams.length) { for (const b of S.beams) b.t += dt; S.beams = S.beams.filter(b => b.t < 0.3); }
    if (S.flyers && S.flyers.length) { for (const f of S.flyers) { f.t += dt; if (!f.done && f.t >= f.dur) { f.done = true; S.hudPulse = S.hudPulse || {}; if (f.key) S.hudPulse[f.key] = 1; } } S.flyers = S.flyers.filter(f => f.t < f.dur + 0.05); }
    if (S.hudPulse) for (const k in S.hudPulse) { S.hudPulse[k] *= Math.exp(-dt * 6); if (S.hudPulse[k] < 0.02) delete S.hudPulse[k]; }
    if (S.tpops && S.tpops.length) { for (const q of S.tpops) { q.t += dt; q.sy += (q.slot * 12 * u - q.sy) * Math.min(1, dt * 22); } S.tpops = S.tpops.filter(q => q.t < q.life); }
    if (S.delayed.length) { for (const d of S.delayed) d.t -= dt; const due = S.delayed.filter(d => d.t <= 0); S.delayed = S.delayed.filter(d => d.t > 0); for (const d of due) d.fn(); }
    if (S.frags.length) { for (const f of S.frags) { f.life += dt; const k = Math.exp(-1.3 * dt); f.vx *= k; f.vy *= k; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt; f.vr *= Math.exp(-0.8 * dt); } S.frags = S.frags.filter(f => f.life < f.max); }
    if (S.flashes && S.flashes.length) { for (const f of S.flashes) f.t += dt; S.flashes = S.flashes.filter(f => f.t < 0.35); }
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
    state = 'ended'; if (S) { S.intro = null; S.introQ = []; } OD.ui.hideTile();   // nothing explained is left hanging over the results
    OD.audio.stopMusic(); OD.audio.fxStop('blackhole', 0.5); OD.audio.fxStop('boss', 0.5);
    const sv = OD.save, st = sv.stats, rs = S.stats;
    const score = Math.floor(S.score);
    const before = OD.PLANETS.map(p => OD.planetUnlocked(p.skin));
    const res = {
      reason, mode: S.mode, world: world.id, score, planets: S.stats.hops + 1, time: Math.max(0, S.time - S.introTotal), demo: S.demo, gate: S.gateWorld, cause: S.endCause,
      powerups: rs.powerups, biomes: Object.keys(S.seenBiomes || {}).map(Number), biomeCount: Object.keys(S.seenBiomes || {}).length || 1, tricks: rs.tricks, tcombo: rs.tcombo, grazes: rs.grazes, perfects: rs.perfects, innerTime: rs.innerTime, maxCombo: rs.maxCombo, dust: rs.dust, jumps: rs.jumps,
      newBest: false, best: 0, stardust: 0, newAch: [], worldUnlocked: -1, newPlanets: [], dailyInfo: null, bonus: 0,
    };
    if (reason === 'win') { res.win = true; res.universe = S.uni || 1; sv.universe = (sv.universe || 1) + 1; res.cleared = sv.wins || 1; res.bonus = 0; }
    if (reason === 'dead' && !S.demo) trackDeath(S.endCause, res);
    // stardust
    let sd = rs.dust + Math.floor(score / 150);
    if (S.mode === 'zen') sd = rs.dust + Math.floor(S.calm / 12);
    sd = Math.round(sd * (1 + (pth('fortune') ? 0.15 : 0) + (S.dustBonus || 0)));
    if (reason === 'win') sd += 400 + 150 * ((S.uni || 1) - 1);
    st.runs++; st.time += S.time; st.grazes += rs.grazes; st.dust += rs.dust; st.jumps += rs.jumps; st.flips += rs.flips || S.stats.flips;
    st.perfects += rs.perfects; st.deaths += reason === 'dead' ? 1 : 0; st.overdrives += rs.overdrives; st.powerups += rs.powerups;
    st.tricks += rs.tricks; st.weaves += rs.weaves; st.zigs += rs.zigs; st.laps += rs.laps; st.tcombo = Math.max(st.tcombo, rs.tcombo);
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
          res.bonus = Math.round((25 + Math.min(d.streak, 7) * 5) * 1); sd += res.bonus;
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
      sv.bestAny = Math.max(sv.bestAny || 0, score);
    }
    // ghost
    // challenges
    sv.stardust += sd;
    res.stardust = sd;
    res.newAch = checkChallenges(res);
    OD.PLANETS.forEach((p, i) => { if (OD.planetUnlocked(p.skin) && !before[i]) res.newPlanets.push(p.skin); });
    OD.persist();
    setTimeout(() => OD.ui.onRunEnd(res), reason === 'demo' ? 1300 : 120);
  }

  const perkLvl = id => OD.perkLevel(id);
  function checkChallenges(run) {
    const sv = OD.save, done = [];
    for (const c of OD.CHALLENGES) {
      if (sv.ach[c.id]) continue;
      let ok = false;
      try { ok = !!c.test(sv.stats, run, sv); } catch (e) { ok = false; }
      if (ok) { sv.ach[c.id] = Date.now(); c.paid = Math.round(c.reward * 1); sv.stardust += c.paid; done.push(c); }
    }
    return done;
  }
  OD.checkChallenges = () => { const d = checkChallenges(null); if (d.length) OD.persist(); return d; };

  // ------------------------------------------------------------- rendering
  function drawBolt(b) {
    const a = 1 - b.t / 0.3, fl = b.t < 0.1 ? 1 : 0.55 + 0.45 * Math.sin(b.t * 90);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const path = pts => { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); };
    ctx.globalAlpha = a * 0.5 * fl; ctx.strokeStyle = OD.POWERS.zap.color; ctx.lineWidth = 14 * u; path(b.pts);
    ctx.globalAlpha = a * fl; ctx.lineWidth = 5 * u; path(b.pts); for (const f of b.forks) { ctx.lineWidth = 2.4 * u; path(f); }
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 * u; path(b.pts);
    ctx.restore();
  }
  function drawFrags() {
    if (S.flashes) for (const f of S.flashes) { const k = f.t / 0.35; ctx.save(); ctx.globalCompositeOperation = 'lighter'; G.glow(ctx, f.x, f.y, f.r * (0.6 + 0.6 * k), '#ffffff', 0.9 * (1 - k)); G.glow(ctx, f.x, f.y, f.r * (0.9 + 0.8 * k), f.c, 0.7 * (1 - k)); ctx.restore(); }
    for (const f of S.frags) {
      const k = f.life / f.max, al = k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45, col = SHARD_COL[f.style], gl = SHARD_GLOW[f.style];
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.globalAlpha = al;
      const s = f.size, g = ctx.createLinearGradient(-s * 0.6, -s * 0.6, s * 0.6, s * 0.6); g.addColorStop(0, col[0]); g.addColorStop(1, col[1]);
      if (gl && f.hot) { ctx.globalCompositeOperation = 'lighter'; G.glow(ctx, 0, 0, s * 1.5, gl, 0.5 * (1 - k) * al); ctx.globalCompositeOperation = 'source-over'; }
      ctx.beginPath(); f.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = f.style === 'ice' || f.style === 'crystal' || f.style === 'glacier' ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1; ctx.stroke();
      if (f.hot && k < 0.8) { ctx.strokeStyle = OD.rgba(gl || '#ff8a3a', 0.9 * (1 - k)); ctx.lineWidth = 1.6; ctx.stroke(); }
      ctx.restore();
    }
  }
  // the black hole's orbits: bright, clear lanes (the one you are on is lit), pulling in a little as time runs out
  function drawVis(v, eligible, charging, target) {
    ctx.save();
    for (let i = 0; i < v.no; i++) {
      ctx.strokeStyle = OD.rgba(v.skinColor, i === v.no - 1 ? 0.4 : 0.2); ctx.lineWidth = i === v.no - 1 ? 1.8 : 1.2;
      ctx.beginPath(); ctx.arc(v.x, v.y, v.R[i], 0, TAU); ctx.stroke();
    }
    if (v.phase === 'pass') {   // the outer ring glows gold when a jump across is possible
      ctx.setLineDash([6 * u, 8 * u]); ctx.lineDashOffset = -tAnim * 40;
      ctx.strokeStyle = eligible ? `rgba(255,217,90,${charging ? 0.95 : 0.6 + 0.25 * Math.sin(tAnim * 8)})` : 'rgba(255,255,255,0.14)';
      ctx.lineWidth = eligible ? (charging ? 3.2 : 2.2) : 1.2;
      ctx.beginPath(); ctx.arc(v.x, v.y, v.rho, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
    planetDraw(v.x, v.y, v.rad * (1 + 0.06 * (S.kick || 0)), v.skin, tAnim, v.skinColor, OD.save.equipped.aura);
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
      if (e.type === 'flare') {   // the sun rises into view over 1.6 s, flares at each volley, and its warmth washes over the sky
        const rise = OD.smooth(clamp(e.t / 1.6, 0, 1)), fall = OD.smooth(clamp((e.end - e.t) / 1.2, 0, 1)), kk = rise * fall;
        let pk = 0; for (const v of e.volleys) { const q = e.t - v.at; pk = Math.max(pk, q < 0 ? clamp(1 + q / 0.4, 0, 1) * 0.6 : clamp(1 - q / (v.dur + 0.5), 0, 1)); }
        ctx.globalCompositeOperation = 'lighter';
        G.glow(ctx, e.x, e.y, Math.max(W, H) * (0.55 + 0.25 * pk) * kk + 1, '#ff7a2a', (0.13 + 0.14 * pk) * kk);
        G.glow(ctx, e.x, e.y, (40 + 55 * rise + 35 * pk) * u, '#ffb347', 0.9 * kk);
        G.glow(ctx, e.x, e.y, (18 + 20 * rise + 14 * pk) * u, '#fff3c0', kk);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#fff'; ctx.globalAlpha = kk; ctx.beginPath(); ctx.arc(e.x, e.y, 7 * u * rise, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      } else {
      ctx.globalCompositeOperation = 'lighter';
      G.glow(ctx, e.x, e.y, (40 + 140 * k * k + Math.sin(tAnim * 20) * 8) * u, '#fff2c8', 0.9);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(e.x, e.y, (8 + 8 * k) * u, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }
  function shadowPoly(e, k) {
    const sx = cx - e.x, sy = cy - e.y, L = Math.hypot(sx, sy), ux = sx / L, uy = sy / L, nx = -uy, ny = ux, w = PR * 1.3, far = Math.hypot(W, H) * 1.6;
    return [[cx + nx * w, cy + ny * w], [cx + ux * far + nx * w, cy + uy * far + ny * w], [cx + ux * far - nx * w, cy + uy * far - ny * w], [cx - nx * w, cy - ny * w]];
  }
  // what a flare leaves behind: the lanes glow like cooling metal, embers rise from them and the warmth of the sun slowly drains from the sky
  function drawFlareAfter() {
    const f = S.flareAfter;
    if (!f) return;
    const k = f.t / f.life, fade = (1 - k) * (1 - k), far = Math.hypot(W, H) * 1.7;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    G.glow(ctx, f.x, f.y, Math.max(W, H) * 0.55 * (1 - 0.3 * k), '#ff7a2a', 0.13 * fade);
    for (const a of f.lanes) {
      const x2 = f.x + Math.cos(a) * far, y2 = f.y + Math.sin(a) * far, g = ctx.createLinearGradient(f.x, f.y, x2, y2);
      g.addColorStop(0, `rgba(255,120,40,${0.4 * fade})`); g.addColorStop(0.55, `rgba(255,90,30,${0.16 * fade})`); g.addColorStop(1, 'rgba(255,90,30,0)');
      ctx.strokeStyle = g; ctx.lineWidth = (14 - 8 * k) * u; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = `rgba(255,214,150,${0.35 * fade})`; ctx.lineWidth = 2 * u; ctx.stroke();
    }
    ctx.restore();
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
            const f = 1 - (e.t - v.at) / v.dur, wi = OD.smooth(clamp((e.t - v.at) / 0.12, 0, 1)) * (0.85 + 0.15 * f);   // the beam opens quickly but not instantly, and narrows as it dies
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = `rgba(255,110,40,${0.25 * f + 0.1})`; ctx.lineWidth = 34 * u * wi; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(x2, y2); ctx.stroke();
            ctx.strokeStyle = `rgba(255,150,50,${0.5 * f + 0.2})`; ctx.lineWidth = 17 * u * wi; ctx.stroke();
            ctx.strokeStyle = '#ffd24d'; ctx.lineWidth = 7.5 * u * wi; ctx.stroke();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 * u * wi; ctx.stroke();
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
    for (let i = 0; i < NO; i++) {
      let a = 0.13;
      if (p && !p.dead && p.body === 'main') { if (i === p.o) a = 0.24; }
      G.drawOrbitRing(ctx, cx, cy, R[i], OD.save.equipped.orbit, tAnim, world.accent, (a + (S && state !== 'menu' ? 0.1 * S.beatPulse : 0)) * (S && S.orbIn != null ? smoother(S.orbIn) : 1), u);
    }
    if (S && S.ringTrail) {   // the arriving planet's plain rings melt away as the real orbits fade in
      const gh = S.ringTrail, ga = 1 - smoother(clamp(gh.t / 1.1, 0, 1));
      ctx.save(); for (let i = 0; i < gh.no; i++) { ctx.strokeStyle = OD.rgba(gh.color, (i === gh.no - 1 ? 0.4 : 0.2) * ga); ctx.lineWidth = i === gh.no - 1 ? 1.8 : 1.2; ctx.beginPath(); ctx.arc(cx, cy, gh.R[i], 0, TAU); ctx.stroke(); } ctx.restore();
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

  let ghostDraw = false;
  // in the black hole fight a coming obstacle is marked by a short red glow on the stretch of orbit where it will appear
  function drawArcWarn(h, prog) {
    const r = R[h.o], half = clamp(((h.s || 9 * u) * 1.5 + 6 * u) / r, 0.018, 0.09), bl = 0.55 + 0.45 * Math.sin(tAnim * 14);
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(255,60,60,${0.18 + 0.3 * prog})`; ctx.lineWidth = 15 * u; ctx.beginPath(); ctx.arc(cx, cy, r, h.a - half, h.a + half); ctx.stroke();
    ctx.strokeStyle = `rgba(255,110,90,${(0.4 + 0.5 * prog) * (0.6 + 0.4 * bl)})`; ctx.lineWidth = 5 * u; ctx.beginPath(); ctx.arc(cx, cy, r, h.a - half * (0.4 + 0.6 * prog), h.a + half * (0.4 + 0.6 * prog)); ctx.stroke();
    ctx.restore();
  }
  const CAN_FILTER = (() => { try { return 'filter' in CanvasRenderingContext2D.prototype; } catch (e) { return false; } })();
  // in the black hole fight every hazard, from any sky, is reddened
  function drawHaz(h) {
    if (!bossCap() || h.warn > 0) { drawHazard(h); return; }
    ctx.save(); if (CAN_FILTER) ctx.filter = 'sepia(1) saturate(5) hue-rotate(-38deg)'; drawHazard(h); ctx.restore();
  }
  function drawHazard(h) {
    const dc = ghostDraw ? '#aeb4c6' : world.danger;   // something dissolving into space turns a pale grey
    const warn = h.warn > 0;
    if (warn && h.dead) return;
    if (warn && bossCap() && h.o != null && h.a != null && (h.k === 'rock' || h.k === 'mine' || h.k === 'spinner')) { drawArcWarn(h, 1 - h.warn / h.warn0); return; }
    const dq = exitQ(h);
    const fm = (warn || h.k === 'strike' ? 1 : OD.smooth(clamp((h.t - h.warn0) / 0.45, 0, 1))) * (h.dead && !h.exit ? 1 - OD.smooth(clamp((h.fo || 0) / FADE_OUT, 0, 1)) : 1) * (1 - OD.smooth(clamp((dq - 0.45) / 0.55, 0, 1)));
    if (fm < 0.01) return;
    const prog = warn ? 1 - h.warn / h.warn0 : 1;
    const fadeOut = DRIFT.has(h.k) ? 1 : lifeFade(h);
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
        const armed = mineArmed(h), beat = S.clock * OD.audio.bpm(S.musicWorld || world) / 60, f = beat - Math.floor(beat);
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
      case 'strike': {
        const [x, y] = hpos(h);
        if (warn) {
          ctx.save(); ctx.globalAlpha = 0.18 + 0.3 * prog; ctx.strokeStyle = '#cfe6ff'; ctx.setLineDash([4 * u, 8 * u]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, y); ctx.stroke(); ctx.restore();
          ringPulse(x, y, h.s * (3.6 - 2.6 * prog), '#fff2a8', 0.25 + 0.65 * prog); break;
        }
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const rr = OD.makeRng(Math.floor(tAnim * 40)); let bx = x, by = 0; const pts = [[bx, by]];
        for (let i = 1; i <= 7; i++) { bx = lerp(x, x, 1) + (i < 7 ? (rr() - 0.5) * 34 * u : 0); by = y * i / 7; pts.push([bx, by]); }
        for (const [w, col, a] of [[14 * u, '#8fb4ff', 0.35], [5 * u, '#cfe6ff', 0.8], [2 * u, '#ffffff', 1]]) { ctx.globalAlpha = a * fm; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); pts.forEach(([px2, py2], i) => i ? ctx.lineTo(px2, py2) : ctx.moveTo(px2, py2)); ctx.stroke(); }
        ctx.globalAlpha = fm; G.glow(ctx, x, y, h.s * 2.6, '#cfe6ff', 0.9); ctx.restore(); break;
      }
      case 'cloud': {
        const R0 = R[h.o], a0 = h.a - h.arc / 2, a1 = h.a + h.arc / 2;
        if (warn) { ctx.save(); ctx.globalAlpha = 0.25 + 0.4 * prog; ctx.strokeStyle = '#b4ff5a'; ctx.setLineDash([6 * u, 8 * u]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, R0, a0, a1); ctx.stroke(); ctx.restore(); break; }
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        const pulse = 0.85 + 0.15 * Math.sin(tAnim * 2.4 + h.a);
        for (const [w, a] of [[34 * u, 0.07], [22 * u, 0.12], [11 * u, 0.2]]) { ctx.globalAlpha = a * pulse * fm * fadeOut; ctx.strokeStyle = '#a6f040'; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(cx, cy, R0, a0, a1); ctx.stroke(); }
        const rr = OD.makeRng(Math.floor(h.a * 0 + 7));
        for (let i = 0; i < 9; i++) { const aa = a0 + (i + 0.5) / 9 * h.arc + Math.sin(tAnim * 0.9 + i) * 0.05, rd = R0 + Math.sin(tAnim * 1.3 + i * 2) * 9 * u; ctx.globalAlpha = 0.35 * fm * fadeOut; ctx.fillStyle = '#d6ff8a'; ctx.beginPath(); ctx.arc(cx + Math.cos(aa) * rd, cy + Math.sin(aa) * rd, (1.5 + rr() * 2) * u, 0, TAU); ctx.fill(); }
        ctx.restore(); break;
      }
      case 'hole': {
        const [x, y] = hpos(h), kk = holeK(h), ev = 1 - holeEvap(h);   // kk: how open it is (it swells in and shrinks out); ev: how far it has evaporated
        if (warn) { ringPulse(x, y, h.field * (1.4 - 0.4 * prog), '#b57bff', 0.2 + 0.5 * prog); break; }
        ctx.save(); ctx.globalAlpha = fm * (0.35 + 0.65 * kk);
        ctx.globalCompositeOperation = 'lighter';
        G.glow(ctx, x, y, h.field * 1.1 * (0.55 + 0.45 * kk), '#8a3dff', 0.55 * (0.4 + 0.6 * kk));
        if (ev > 0) G.glow(ctx, x, y, h.s * (2 + 3.5 * ev), '#ffffff', 0.6 * ev);   // white-hot as it burns off
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(190,140,255,0.35)'; ctx.lineWidth = 1.5; ctx.setLineDash([5 * u, 7 * u]);
        ctx.beginPath(); ctx.arc(x, y, Math.max(1, h.field * kk), 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        for (let i = 0; i < 3; i++) {   // the rings spin faster and drift outward as it lets go
          const a = tAnim * 2.4 * (1 + 5 * ev) + i * TAU / 3;
          ctx.strokeStyle = `rgba(210,170,255,${(0.7 - i * 0.15) * (1 - 0.6 * ev)})`; ctx.lineWidth = 2.2;
          ctx.beginPath(); ctx.arc(x, y, h.s * (1.5 + i * 0.55) * (1 + 1.6 * ev), a, a + 1.7 * (1 - 0.4 * ev)); ctx.stroke();
        }
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, h.s * kk), 0, TAU); ctx.fill();
        ctx.strokeStyle = '#d9b3ff'; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
        break;
      }
      case 'ribbon': {
        const dir = Math.sign(h.w) || 1, N = 34, pts = [];
        for (let i = 0; i <= N; i++) { const th = h.a - dir * h.arc * i / N, r = ribbonR(h, th); pts.push([cx + Math.cos(th) * r, cy + Math.sin(th) * r]); }
        if (warn) {
          ctx.save(); ctx.globalAlpha = 0.15 + 0.4 * prog; ctx.strokeStyle = world.accent; ctx.setLineDash([5 * u, 7 * u]); ctx.lineWidth = 1.5; ctx.beginPath();
          pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); ctx.restore(); break;
        }
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        for (const [lw, al, col] of [[20 * u, 0.1, world.accent], [10 * u, 0.26, world.accent], [4.4 * u, 0.55, world.accent2], [2.2 * u, 0.95, '#ffffff']]) {
          ctx.lineWidth = lw;
          for (let i = 0; i < N; i++) {
            const e = Math.pow(Math.sin(Math.PI * (i + 0.5) / N), 0.7);
            ctx.globalAlpha = al * e * fm * fadeOut; ctx.strokeStyle = col;
            ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); ctx.stroke();
          }
        }
        ctx.globalAlpha = fm * fadeOut; G.glow(ctx, pts[1][0], pts[1][1], 16 * u, '#ffffff', 0.55);   // a bright head
        ctx.restore(); break;
      }
      case 'tether': {
        const [x1, y1, x2, y2] = tetherEnds(h);
        if (warn) {
          ringPulse(x1, y1, h.s * (2.8 - 1.6 * prog), '#ffb347', 0.3 + 0.6 * prog); ringPulse(x2, y2, h.s * (2.8 - 1.6 * prog), '#ffb347', 0.3 + 0.6 * prog);
          ctx.save(); ctx.globalAlpha = 0.2 + 0.4 * prog; ctx.strokeStyle = '#ffb347'; ctx.setLineDash([4 * u, 7 * u]); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore(); break;
        }
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, len = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / len, ny = (x2 - x1) / len, sag = Math.sin(tAnim * 3.1 + h.a) * 3 * u;
        const cable = () => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx + nx * sag, my + ny * sag, x2, y2); ctx.stroke(); };
        ctx.save(); ctx.globalAlpha = fm * fadeOut; ctx.lineCap = 'round';
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = OD.rgba('#ffa53d', 0.18); ctx.lineWidth = 12 * u; cable();
        ctx.strokeStyle = OD.rgba('#ffb347', 0.55); ctx.lineWidth = 4.4 * u; cable();
        ctx.strokeStyle = '#fff3d6'; ctx.lineWidth = 1.7 * u; cable();
        ctx.setLineDash([3 * u, 11 * u]); ctx.lineDashOffset = -tAnim * 80; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3 * u; cable(); ctx.setLineDash([]);   // energy running along it
        G.glow(ctx, x1, y1, 24 * u, '#ffa53d', 0.5); G.glow(ctx, x2, y2, 24 * u, '#ffa53d', 0.5);
        ctx.globalCompositeOperation = 'source-over';
        G.drawDebris(ctx, h.style, x1, y1, h.s, h.rot + tAnim * 0.3, dc, h.shape, fm * fadeOut);
        G.drawDebris(ctx, h.style, x2, y2, h.s * 0.9, h.rot - tAnim * 0.25, dc, h.shape2 || h.shape, fm * fadeOut);
        ctx.restore(); break;
      }
      case 'cinder': {
        if (warn) {   // an arrow at the edge of the sky, pointing in from where it will come
          const ca = Math.cos(h.sa), sa = Math.sin(h.sa), tx = ca > 0 ? (W - 22 - cx) / ca : ca < 0 ? (22 - cx) / ca : 1e9, ty = sa > 0 ? (H - 80 - cy) / sa : sa < 0 ? (safeTop + 90 - cy) / sa : 1e9;
          const t = Math.min(Math.abs(tx), Math.abs(ty)), ex = cx + ca * t, ey = cy + sa * t, pl = 0.6 + 0.4 * Math.sin(tAnim * 16);
          ctx.save(); ctx.translate(ex, ey); ctx.rotate(h.sa + Math.PI); ctx.globalCompositeOperation = 'lighter';
          G.glow(ctx, 0, 0, 30 * u, '#ff6a2a', 0.5 * pl * (0.4 + prog));
          ctx.fillStyle = OD.rgba('#ffb347', (0.5 + 0.5 * prog) * pl); ctx.beginPath(); ctx.moveTo(13 * u, 0); ctx.lineTo(-7 * u, -8 * u); ctx.lineTo(-3 * u, 0); ctx.lineTo(-7 * u, 8 * u); ctx.closePath(); ctx.fill();
          ctx.restore(); break;
        }
        const f = fm * fadeOut, bx = -Math.cos(h.ang), by = -Math.sin(h.ang);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        G.glow(ctx, h.x, h.y, 38 * u, '#ff5a1f', 0.5 * f); G.glow(ctx, h.x, h.y, 19 * u, '#ffb347', 0.9 * f);
        for (let i = 0; i < 3; i++) {   // a licking tail of flame
          const len = (24 + 11 * i + Math.sin(tAnim * 19 + i * 2) * 5) * u, g2 = ctx.createLinearGradient(h.x, h.y, h.x + bx * len, h.y + by * len);
          g2.addColorStop(0, OD.rgba('#ffd27a', 0.9 * f)); g2.addColorStop(1, OD.rgba('#ff3d10', 0));
          ctx.strokeStyle = g2; ctx.lineWidth = (10 - 3 * i) * u; ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(h.x + bx * len + Math.sin(tAnim * 14 + i) * 2 * u, h.y + by * len + Math.cos(tAnim * 13 + i) * 2 * u); ctx.stroke();
        }
        ctx.globalAlpha = f; ctx.strokeStyle = '#ff7a2a'; ctx.lineWidth = 1.6 * u;
        for (let i = 0; i < 6; i++) { const a = tAnim * 4 + i * TAU / 6, r0 = 7.5 * u, r1 = (11 + 3 * Math.sin(tAnim * 21 + i * 3)) * u; ctx.beginPath(); ctx.moveTo(h.x + Math.cos(a) * r0, h.y + Math.sin(a) * r0); ctx.lineTo(h.x + Math.cos(a) * r1, h.y + Math.sin(a) * r1); ctx.stroke(); }
        ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#fff4d0'; ctx.beginPath(); ctx.arc(h.x, h.y, 4.4 * u, 0, TAU); ctx.fill();
        ctx.restore(); break;
      }
      case 'shoal': {
        if (warn) { edgeArrow(h.sa, world.accent, prog); break; }
        const f = fm * fadeOut, fish = h.fish || [];
        ctx.save(); ctx.lineCap = 'round';
        for (let i = fish.length - 1; i >= 0; i--) {
          const [x, y] = fish[i], nx = i > 0 ? fish[i - 1] : [x + Math.cos(h.dir), y + Math.sin(h.dir)], ang = Math.atan2(nx[1] - y, nx[0] - x) + (i === 0 ? 0 : 0), sc = (1 - i * 0.055) * f, hue = i % 2 ? world.accent : world.accent2;
          ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.globalCompositeOperation = 'lighter';
          G.glow(ctx, 0, 0, 20 * u * sc, hue, 0.5 * f);
          const wag = Math.sin(tAnim * 9 + i * 0.9) * 2.2 * u;
          ctx.fillStyle = OD.rgba(hue, 0.55 * f); ctx.beginPath(); ctx.moveTo(-6 * u, 0); ctx.lineTo(-13 * u * sc, -5 * u + wag); ctx.lineTo(-11 * u * sc, 0); ctx.lineTo(-13 * u * sc, 5 * u + wag); ctx.closePath(); ctx.fill();   // the tail
          ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = OD.rgba('#ffffff', 0.95 * f); ctx.beginPath(); ctx.ellipse(0, 0, 7 * u * sc, 3.6 * u * sc, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = OD.rgba(hue, 0.9 * f); ctx.beginPath(); ctx.ellipse(-1.5 * u, 0, 4.5 * u * sc, 2 * u * sc, 0, 0, TAU); ctx.fill();
          ctx.restore();
        }
        ctx.restore(); break;
      }
      case 'devil': {
        const [x, y] = devilPos(h);
        if (warn) { ringPulse(x, y, 30 * u * (1.6 - 0.6 * prog), '#e0b070', 0.3 + 0.5 * prog); break; }
        const f = fm * fadeOut, grow = OD.smooth(clamp((h.t - h.warn0) / 0.8, 0, 1)), out = OD.smooth(clamp(h.life / 0.9, 0, 1)), k = grow * out;
        ctx.save(); ctx.translate(x, y);
        ctx.globalAlpha = f; ctx.strokeStyle = OD.rgba('#f2d6a2', 0.22 * k); ctx.setLineDash([4 * u, 6 * u]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, 25 * u * k, 0, TAU); ctx.stroke(); ctx.setLineDash([]);   // the reach of its wind
        ctx.globalCompositeOperation = 'lighter'; G.glow(ctx, 0, 0, 36 * u * k, '#c9954f', 0.4 * f);
        ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'round';
        // seen from above: three spiral arms of sand wind into a dark eye, with grains flung round it
        for (let j = 0; j < 3; j++) {
          const base = tAnim * 3.2 + j * TAU / 3, col = j % 2 ? '#e8c48a' : '#c4975a';
          for (let pass = 0; pass < 2; pass++) {
            ctx.strokeStyle = OD.rgba(pass ? '#fff0cf' : col, (pass ? 0.4 : 0.55) * f * k); ctx.lineWidth = (pass ? 1.1 : 3.6) * u;
            ctx.beginPath();
            for (let i = 0; i <= 14; i++) { const q = i / 14, r = (4 + 21 * q) * u * k, a2 = base + q * 2.7; i ? ctx.lineTo(Math.cos(a2) * r, Math.sin(a2) * r) : ctx.moveTo(Math.cos(a2) * r, Math.sin(a2) * r); }
            ctx.stroke();
          }
        }
        ctx.fillStyle = OD.rgba('#f2d6a2', 0.85 * f);
        for (let i = 0; i < 12; i++) { const q = hash1(i * 3.7 + h.a), r = (8 + 20 * q) * u * k, a2 = tAnim * (4.5 - 2.6 * q) + i * 2.1; ctx.beginPath(); ctx.arc(Math.cos(a2) * r, Math.sin(a2) * r, (0.9 + 1.1 * q) * u, 0, TAU); ctx.fill(); }
        ctx.fillStyle = OD.rgba('#2e1a0c', 0.92 * f); ctx.beginPath(); ctx.arc(0, 0, 5.4 * u * k, 0, TAU); ctx.fill();   // its deadly core
        ctx.strokeStyle = OD.rgba('#ffd9a0', 0.9 * f); ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore(); break;
      }
      case 'bloom': {
        const [bx, by] = pos(h.o, h.a), tau = h.t - h.warn0;
        if (warn) { ringPulse(bx, by, 22 * u * (1.5 - 0.5 * prog), '#ff9a4a', 0.3 + 0.5 * prog); break; }
        const f = fm * fadeOut, bud = h.fired ? Math.max(0, 1 - (tau - BLOOM_FIRE) / 0.5) : OD.smooth(clamp(tau / 0.7, 0, 1)), open = clamp((tau - 1.0) / (BLOOM_FIRE - 1.0), 0, 1);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        if (!h.fired) for (let i = 0; i < 6; i++) {   // faint spokes: where the fire will go
          const a = h.ph + i * TAU / 6, al = 0.5 * open * f; if (al < 0.02) continue;
          ctx.strokeStyle = OD.rgba('#ffb347', al * 0.5); ctx.setLineDash([3 * u, 7 * u]); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(bx + Math.cos(a) * 12 * u, by + Math.sin(a) * 12 * u); ctx.lineTo(bx + Math.cos(a) * 120 * u * open, by + Math.sin(a) * 120 * u * open); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = OD.rgba('#ffd27a', al); ctx.beginPath(); ctx.arc(bx + Math.cos(a) * 17 * u, by + Math.sin(a) * 17 * u, 2.2 * u, 0, TAU); ctx.fill();
        }
        if (bud > 0.01) {
          const pl = 0.8 + 0.2 * Math.sin(tAnim * (8 + 10 * open));
          G.glow(ctx, bx, by, (24 + 22 * open) * u * bud * pl, '#ff5a1f', 0.55 * f * bud); G.glow(ctx, bx, by, 13 * u * bud, '#ffd27a', 0.9 * f * bud);
          for (let i = 0; i < 6; i++) { const a = h.ph + i * TAU / 6, r = (4 + 7 * open) * u * bud; ctx.fillStyle = OD.rgba('#ff8a3a', (0.7 + 0.3 * open) * f * bud); ctx.beginPath(); ctx.ellipse(bx + Math.cos(a) * r, by + Math.sin(a) * r, 5.4 * u * bud, 2.3 * u * bud, a, 0, TAU); ctx.fill(); }   // petals opening
          ctx.fillStyle = OD.rgba('#fff4d0', f * bud); ctx.beginPath(); ctx.arc(bx, by, 3.4 * u * bud, 0, TAU); ctx.fill();
        }
        for (const b of h.balls) {   // the thrown fire
          const bf = f * (b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30 ? 0 : 1), ang = Math.atan2(b.vy, b.vx), tl = 28 * u;
          const g2 = ctx.createLinearGradient(b.x, b.y, b.x - Math.cos(ang) * tl, b.y - Math.sin(ang) * tl); g2.addColorStop(0, OD.rgba('#ffd27a', 0.9 * bf)); g2.addColorStop(1, OD.rgba('#ff3d10', 0));
          ctx.strokeStyle = g2; ctx.lineWidth = 7 * u; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - Math.cos(ang) * tl, b.y - Math.sin(ang) * tl); ctx.stroke();
          G.glow(ctx, b.x, b.y, 22 * u, '#ff5a1f', 0.55 * bf); ctx.fillStyle = OD.rgba('#fff4d0', bf); ctx.beginPath(); ctx.arc(b.x, b.y, 3.6 * u, 0, TAU); ctx.fill();
        }
        ctx.restore(); break;
      }
      case 'hail': {
        const tau = h.t - h.warn0, lanes = h.lanes || [];
        ctx.save(); ctx.lineCap = 'round';
        for (const l of lanes) {
          const pre = warn ? prog : 1, until = l.at - tau;
          if (!l.done && (warn || until > -0.05)) {   // the lane is marked from the top of the sky to the floor, brighter the nearer its shard is to falling
            const near = warn ? 0 : clamp(1 - until / 0.8, 0, 1), a = (0.12 + 0.4 * near) * pre * fm;
            ctx.setLineDash([8 * u, 10 * u]); ctx.lineDashOffset = -tAnim * 90; ctx.strokeStyle = OD.rgba('#bfeaff', a); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(l.x, safeTop + 70 * u); ctx.lineTo(l.x, H - 70 * u); ctx.stroke(); ctx.setLineDash([]);
            ctx.globalCompositeOperation = 'lighter'; G.glow(ctx, l.x, safeTop + 66 * u, (16 + 10 * near) * u, '#cfeeff', 0.5 * pre * fm * (0.4 + near)); ctx.globalCompositeOperation = 'source-over';
          }
          if (warn || tau < l.at || l.done) continue;
          const f = fm * fadeOut, x = l.x, y = l.y, L = HAIL_LEN * u;   // the falling shard: a long, thin crystal with a white-hot tip
          ctx.globalCompositeOperation = 'lighter'; G.glow(ctx, x, y, 24 * u, '#9fe6ff', 0.55 * f);
          const g2 = ctx.createLinearGradient(x, y - L * 1.6, x, y); g2.addColorStop(0, OD.rgba('#9fe6ff', 0)); g2.addColorStop(1, OD.rgba('#e8fbff', 0.8 * f)); ctx.strokeStyle = g2; ctx.lineWidth = 7 * u; ctx.beginPath(); ctx.moveTo(x, y - L * 1.6); ctx.lineTo(x, y); ctx.stroke();
          ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = OD.rgba('#f4fdff', f); ctx.beginPath(); ctx.moveTo(x, y + 6 * u); ctx.lineTo(x + 3.6 * u, y - L * 0.5); ctx.lineTo(x, y - L); ctx.lineTo(x - 3.6 * u, y - L * 0.5); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = OD.rgba('#9fe6ff', 0.9 * f); ctx.lineWidth = 1.2; ctx.stroke();
        }
        ctx.restore(); break;
      }
      case 'serpent': {
        if (warn) { edgeArrow(h.th0, '#b9a6ff', prog); break; }
        const f = fm * fadeOut, pts = h.pts || [], n = pts.length;
        if (n < 3) break;
        ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalCompositeOperation = 'lighter';
        for (const [lw, al, col] of [[16, 0.12, '#7a5cff'], [8, 0.35, '#9d86ff'], [3.6, 0.9, '#e8dcff']]) {   // the body: a glow, a core and a hot white thread
          ctx.strokeStyle = OD.rgba(col, al * f); ctx.lineWidth = lw * u;
          for (let i = 0; i + 1 < n; i++) { ctx.globalAlpha = (1 - i / n) ** 0.8; ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); ctx.stroke(); }
        }
        ctx.globalAlpha = 1; ctx.strokeStyle = OD.rgba('#ffffff', 0.85 * f); ctx.lineWidth = 1.3;
        for (let i = 1; i + 2 < n; i += 3) {   // little arcs of lightning jumping between the scales
          const a = pts[i], b = pts[i + 2], jx = Math.sin(tAnim * 26 + i) * 6 * u, jy = Math.cos(tAnim * 23 + i) * 6 * u; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo((a[0] + b[0]) / 2 + jx, (a[1] + b[1]) / 2 + jy); ctx.lineTo(b[0], b[1]); ctx.stroke();
        }
        const hd = pts[0], nx = pts[1], ang = Math.atan2(hd[1] - nx[1], hd[0] - nx[0]);
        G.glow(ctx, hd[0], hd[1], 30 * u, '#9d86ff', 0.7 * f); ctx.globalCompositeOperation = 'source-over';
        ctx.save(); ctx.translate(hd[0], hd[1]); ctx.rotate(ang); ctx.fillStyle = OD.rgba('#f1eaff', f); ctx.beginPath(); ctx.moveTo(9 * u, 0); ctx.lineTo(-4 * u, -6.5 * u); ctx.lineTo(-1 * u, 0); ctx.lineTo(-4 * u, 6.5 * u); ctx.closePath(); ctx.fill();
        ctx.fillStyle = OD.rgba('#3a1f9a', f); for (const s2 of [-1, 1]) { ctx.beginPath(); ctx.arc(1.5 * u, s2 * 2.3 * u, 1.1 * u, 0, TAU); ctx.fill(); } ctx.restore();
        ctx.restore(); break;
      }
      case 'rift': {
        const ends = riftEnds(h);
        if (warn) { for (const [x, y] of ends) ringPulse(x, y, 26 * u * (1.6 - 0.6 * prog), '#c9a6ff', 0.3 + 0.5 * prog); break; }
        const f = fm * fadeOut, k = OD.smooth(clamp((h.t - h.warn0) / 0.7, 0, 1)) * OD.smooth(clamp(h.life / 0.9, 0, 1)), cd = clamp((S.riftCd || 0) / 1.2, 0, 1);
        ctx.save();
        ctx.globalAlpha = 0.16 * f * k; ctx.strokeStyle = '#d9c4ff'; ctx.setLineDash([2 * u, 7 * u]); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(ends[0][0], ends[0][1]); ctx.lineTo(ends[1][0], ends[1][1]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;   // a thread between the doors
        ends.forEach(([x, y], e) => {
          ctx.save(); ctx.translate(x, y); ctx.globalCompositeOperation = 'lighter'; G.glow(ctx, 0, 0, 46 * u * k, e ? '#7a5cff' : '#c77dff', 0.65 * f * (1 - 0.6 * cd));
          ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = OD.rgba('#06020f', 0.92 * f); ctx.beginPath(); ctx.ellipse(0, 0, 11 * u * k, 16 * u * k, tAnim * 0.2, 0, TAU); ctx.fill();   // the doorway: an upright oval of darkness
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 3; i++) { const a = tAnim * (e ? -2.2 : 2.2) + i * TAU / 3; ctx.strokeStyle = OD.rgba(i % 2 ? '#ffffff' : '#c9a6ff', (0.85 - 0.5 * cd) * f); ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(0, 0, (12 + i * 3.2) * u * k, (17 + i * 3.2) * u * k, tAnim * 0.2, a, a + 1.6); ctx.stroke(); }
          ctx.restore();
        });
        ctx.restore(); break;
      }
      case 'spear': {
        const ux = Math.cos(h.a), uy = Math.sin(h.a), nx = -uy, ny = ux, outer = spearOuter(), ox = cx + ux * outer, oy = cy + uy * outer, tipR = spearTipR(h);
        if (warn) {
          const tx = cx + ux * tipR, ty = cy + uy * tipR;
          ctx.save(); ctx.globalAlpha = 0.2 + 0.5 * prog; ctx.strokeStyle = '#bfeaff'; ctx.setLineDash([4 * u, 8 * u]); ctx.lineDashOffset = -tAnim * 50; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
          ringPulse(tx, ty, 22 * u * (1.5 - 0.7 * prog), '#bfeaff', 0.3 + 0.6 * prog);
          for (let i = 0; i < 4; i++) { const q = (tAnim * 0.9 + i / 4) % 1, r = lerp(outer * 0.9, tipR, q); ctx.fillStyle = OD.rgba('#ffffff', 0.5 * (1 - q)); ctx.beginPath(); ctx.arc(cx + ux * r + nx * Math.sin(i * 9) * 6 * u, cy + uy * r + ny * Math.sin(i * 9) * 6 * u, 1.6 * u, 0, TAU); ctx.fill(); }
          ctx.restore(); break;
        }
        const e = OD.easeOut(clamp(h.thr, 0, 1)), [tx, ty] = spearTip(h), f = fm * fadeOut;
        ctx.save(); ctx.globalAlpha = f;
        if (h.thr < 1) { ctx.strokeStyle = OD.rgba('#ffffff', 0.5 * (1 - e)); ctx.lineWidth = 1.2; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(tx + ux * 60 * u + nx * i * 5 * u, ty + uy * 60 * u + ny * i * 5 * u); ctx.lineTo(tx + ux * 160 * u + nx * i * 5 * u, ty + uy * 160 * u + ny * i * 5 * u); ctx.stroke(); } }   // speed streaks while it falls
        // the lance: a long, faceted crystal. Its two halves are lit differently so it reads as a solid cut gem, with ice barbs along the shaft
        const L = Math.hypot(ox - tx, oy - ty), P = (s, w) => [tx + ux * s + nx * w, ty + uy * s + ny * w];
        const prof = s => s < 30 * u ? 9 * u * Math.pow(s / (30 * u), 0.8) : 9 * u - 5.5 * u * clamp((s - 30 * u) / (L - 30 * u), 0, 1);   // half-width along the shaft
        const NS = 16, side = sg => { const pts = [P(0, 0)]; for (let i = 1; i <= NS; i++) { const s = (i <= 5 ? i / 5 * 36 * u : 36 * u + (i - 5) / (NS - 5) * (L - 36 * u)); pts.push(P(s, sg * prof(s))); } pts.push(P(L, 0)); return pts; };
        const fillSide = (pts, c0, c1, c2) => { const g2 = ctx.createLinearGradient(tx, ty, ox, oy); g2.addColorStop(0, c0); g2.addColorStop(0.35, c1); g2.addColorStop(1, c2); ctx.fillStyle = g2; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill(); };
        fillSide(side(1), 'rgba(255,255,255,0.98)', 'rgba(170,232,255,0.82)', 'rgba(110,190,255,0.06)');      // lit facet
        fillSide(side(-1), 'rgba(190,236,255,0.95)', 'rgba(70,150,230,0.7)', 'rgba(40,100,200,0.05)');       // shaded facet
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.2; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(...P(36 * u, 9 * u)); ctx.moveTo(tx, ty); ctx.lineTo(...P(36 * u, -9 * u)); ctx.stroke();   // the cut of the head
        ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(...P(L * 0.55, 0)); ctx.stroke();               // the ridge down the middle
        ctx.strokeStyle = 'rgba(210,244,255,0.45)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(...P(36 * u, 9 * u)); ctx.lineTo(...P(36 * u + 70 * u, 6.8 * u)); ctx.moveTo(...P(36 * u, -9 * u)); ctx.lineTo(...P(36 * u + 70 * u, -6.8 * u)); ctx.stroke();
        for (let i = 0; i < 6; i++) {   // ice barbs, alternating sides, swept back
          const sg = i % 2 ? 1 : -1, s0 = (52 + i * 34 + hash1(h.a * 7 + i) * 10) * u, w0 = prof(s0), bl = (16 - i * 1.6) * u;
          const A = P(s0, sg * w0), B = P(s0 + 11 * u, sg * (w0 + 1.5 * u)), C = P(s0 + 20 * u, sg * (w0 + bl * 0.55));
          ctx.fillStyle = sg > 0 ? 'rgba(235,250,255,0.9)' : 'rgba(150,210,255,0.8)'; ctx.beginPath(); ctx.moveTo(...A); ctx.lineTo(...C); ctx.lineTo(...B); ctx.closePath(); ctx.fill();
        }
        ctx.globalCompositeOperation = 'lighter';
        G.glow(ctx, tx, ty, (28 + 4 * Math.sin(tAnim * 5)) * u, '#9fe6ff', 0.5);
        for (let i = 0; i < 3; i++) { const q = (tAnim * 0.5 + i / 3) % 1, s = 30 * u + q * Math.min(L * 0.6, 220 * u), tw = Math.sin(q * Math.PI); G.glow(ctx, ...P(s, Math.sin(i * 4 + 1) * 3 * u), 5 * u, '#ffffff', 0.7 * tw); }   // glints running along the facets
        if (h.thr >= 1) {   // the strike: frost spreads from the tip as a snowflake of ice, with a cracking ring round it
          const fq = clamp((h.t - h.warn0 - 0.26) / 0.9, 0, 1), fe = OD.easeOut(fq), al = 1 - 0.25 * fq;
          ctx.strokeStyle = OD.rgba('#dff6ff', 0.55 * al); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(tx, ty, 22 * u * fe, 0, TAU); ctx.stroke();
          ctx.strokeStyle = OD.rgba('#9fe6ff', 0.3 * al); ctx.setLineDash([3 * u, 5 * u]); ctx.beginPath(); ctx.arc(tx, ty, 32 * u * fe, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
          ctx.lineCap = 'round';
          for (let i = 0; i < 6; i++) {   // six arms, each with two pairs of side twigs
            const a = h.a + Math.PI / 6 + i * TAU / 6, l = (20 + hash1(i + 3) * 8) * u * fe, ca = Math.cos(a), sa = Math.sin(a);
            ctx.strokeStyle = OD.rgba('#ffffff', 0.85 * al); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + ca * l, ty + sa * l); ctx.stroke();
            ctx.strokeStyle = OD.rgba('#cfeeff', 0.7 * al); ctx.lineWidth = 1.1;
            for (const [k, tl] of [[0.45, 0.34], [0.75, 0.24]]) for (const sg of [-1, 1]) { const bx = tx + ca * l * k, by = ty + sa * l * k, ta = a + sg * 0.85; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(ta) * l * tl, by + Math.sin(ta) * l * tl); ctx.stroke(); }
            ctx.fillStyle = OD.rgba('#ffffff', 0.9 * al); ctx.beginPath(); ctx.arc(tx + ca * l, ty + sa * l, 1.8 * u * fe, 0, TAU); ctx.fill();
          }
          for (let i = 0; i < 7; i++) { const a = i * 2.4 + h.a, rr = (26 + hash1(i * 5 + 1) * 22) * u * fe, tw = 0.5 + 0.5 * Math.sin(tAnim * 6 + i * 2); G.glow(ctx, tx + Math.cos(a) * rr, ty + Math.sin(a) * rr, 4 * u, '#ffffff', 0.55 * tw * al); }   // flakes hanging in the air
        }
        ctx.restore(); break;
      }
      case 'pylon': {
        const [x1, y1, x2, y2] = pylonEnds(h), VI = '#b79bff';
        if (warn) { ringPulse(x1, y1, 16 * u * (1.6 - 0.6 * prog), VI, 0.3 + 0.6 * prog); ringPulse(x2, y2, 16 * u * (1.6 - 0.6 * prog), VI, 0.3 + 0.6 * prog); break; }
        const ph = pylonPhase(h), stage = ph < 0 ? 0 : Math.floor(ph), fr = ph < 0 ? 0 : ph - Math.floor(ph), seed = Math.floor(tAnim * 28) + h.a * 100;
        const lvl = stage === 1 ? fr : stage === 2 ? 1 : stage === 3 ? 1 - fr : 0.12;
        const jag = (amp, n, sd) => { const pts = [[x1, y1]], len = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / len, ny = (x2 - x1) / len; for (let i = 1; i < n; i++) { const t = i / n, o = (hash1(sd + i * 7.1) - 0.5) * 2 * amp * Math.sin(Math.PI * t); pts.push([x1 + (x2 - x1) * t + nx * o, y1 + (y2 - y1) * t + ny * o]); } pts.push([x2, y2]); return pts; };
        const stroke = pts => { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); };
        ctx.save(); ctx.globalAlpha = fm * fadeOut; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalCompositeOperation = 'lighter';
        if (stage === 2) {   // the lightning itself, redrawn crooked about thirty times a second
          const b = jag(11 * u, 9, seed), b2 = jag(7 * u, 7, seed + 40);
          ctx.strokeStyle = OD.rgba(VI, 0.18); ctx.lineWidth = 17 * u; stroke(b); ctx.strokeStyle = OD.rgba('#b9a4ff', 0.5); ctx.lineWidth = 7 * u; stroke(b);
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.6 * u; stroke(b); ctx.strokeStyle = OD.rgba('#ffffff', 0.55); ctx.lineWidth = 1.2 * u; stroke(b2);
        } else if (stage === 1) {   // charging: a thread that thickens and shivers
          ctx.strokeStyle = OD.rgba('#cfc0ff', 0.2 + 0.6 * fr); ctx.lineWidth = (0.8 + 2 * fr) * u; stroke(jag((1 + 5 * fr) * u, 8, seed));
        } else if (stage === 3) {   // afterglow
          ctx.strokeStyle = OD.rgba(VI, 0.5 * (1 - fr)); ctx.lineWidth = 4 * (1 - fr) * u + 0.6; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        } else { ctx.setLineDash([2 * u, 8 * u]); ctx.strokeStyle = OD.rgba(VI, 0.28); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]); }
        for (const [x, y, k] of [[x1, y1, 0], [x2, y2, 1]]) {   // the pylons: a small crystal with a ring that spins up as the charge builds
          G.glow(ctx, x, y, (14 + 22 * lvl) * u, VI, 0.25 + 0.55 * lvl);
          ctx.strokeStyle = OD.rgba('#e2d8ff', 0.5 + 0.5 * lvl); ctx.lineWidth = 1.6 * u; const ra = tAnim * (1.5 + 6 * lvl) * (k ? -1 : 1);
          ctx.beginPath(); ctx.arc(x, y, 9.5 * u, ra, ra + 2.2); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, 9.5 * u, ra + Math.PI, ra + Math.PI + 2.2); ctx.stroke();
          ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#0c0a24'; ctx.strokeStyle = OD.rgba('#e2d8ff', 0.9); ctx.lineWidth = 1.6 * u;
          ctx.beginPath(); ctx.moveTo(x, y - 6.5 * u); ctx.lineTo(x + 3.8 * u, y); ctx.lineTo(x, y + 6.5 * u); ctx.lineTo(x - 3.8 * u, y); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = OD.rgba('#ffffff', 0.4 + 0.6 * lvl); ctx.beginPath(); ctx.arc(x, y, 1.9 * u, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'lighter';
        }
        ctx.restore(); break;
      }
      case 'shade': {
        const q = histAt(S.histT - h.D); if (!q) break;
        const [x, y] = q, [px, py] = playerXY(), a = (warn ? 0.3 + 0.7 * prog : fm * fadeOut), lethal = warn ? true : shadeLethal(h);
        ctx.save();
        // the path it will follow is your own: a faint wake of where you have been, from it up to you
        ctx.globalAlpha = a * 0.5; ctx.strokeStyle = '#8a4fd0'; ctx.setLineDash([3 * u, 8 * u]); ctx.lineWidth = 1.3; ctx.beginPath();
        for (let t = S.histT - h.D, first = true; t <= S.histT; t += 0.14) { const w = histAt(t); if (!w) continue; if (first) { ctx.moveTo(w[0], w[1]); first = false; } else ctx.lineTo(w[0], w[1]); }
        ctx.stroke(); ctx.setLineDash([]);
        for (let i = 6; i >= 1; i--) { const w = histAt(S.histT - h.D - 0.09 * i); if (!w) continue; ctx.globalAlpha = a * 0.3 * (1 - i / 7); ctx.fillStyle = '#2a0f55'; ctx.beginPath(); ctx.arc(w[0], w[1], 7 * u * (1 - i / 8), 0, TAU); ctx.fill(); }   // smoky afterimages
        const body = (warn ? 0.4 + 0.6 * prog : 1) * 8.6 * u;
        ctx.globalAlpha = a; const gr = ctx.createRadialGradient(x, y, 0, x, y, body * 3); gr.addColorStop(0, 'rgba(4,0,12,0.9)'); gr.addColorStop(1, 'rgba(4,0,12,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, body * 3, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'lighter'; G.glow(ctx, x, y, body * 2.6, '#7a2fd0', 0.35 * (lethal ? 1 : 0.5));
        ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#05000d'; ctx.beginPath(); ctx.arc(x, y, body, 0, TAU); ctx.fill();
        ctx.strokeStyle = OD.rgba('#c77dff', lethal ? 0.85 : 0.4); ctx.lineWidth = 1.7 * u; ctx.stroke();
        // two pale lights that look back at you
        const dx = px - x, dy = py - y, dl = Math.hypot(dx, dy) || 1, ex = dx / dl, ey = dy / dl, perpx = -ey, perpy = ex;
        ctx.globalCompositeOperation = 'lighter';
        for (const sgn of [-1, 1]) { const exx = x + ex * 3.4 * u + perpx * sgn * 3.3 * u, eyy = y + ey * 3.4 * u + perpy * sgn * 3.3 * u; G.glow(ctx, exx, eyy, 7 * u, '#ffffff', (lethal ? 0.9 : 0.4) * Math.min(1, prog * 1.4)); ctx.fillStyle = OD.rgba('#f6efff', (lethal ? 1 : 0.55) * Math.min(1, prog * 1.4)); ctx.beginPath(); ctx.ellipse(exx, eyy, 1.7 * u, 2.5 * u, Math.atan2(ey, ex) + Math.PI / 2, 0, TAU); ctx.fill(); }
        ctx.restore(); break;
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
      case 'reaper': ctx.strokeStyle = OD.rgba(col, 0.8); ctx.lineWidth = 1.6; for (let i = 0; i < 3; i++) { const a = -t * 2.2 + i * TAU / 3; ctx.beginPath(); ctx.arc(x, y, 18 * u, a, a + 0.7); ctx.stroke(); } break;
      case 'amp': for (let i = 0; i < 3; i++) { const qq = (t * 0.9 + i / 3) % 1; ctx.fillStyle = OD.rgba(col, 0.9 * (1 - qq)); ctx.fillRect(x + (i - 1) * 7 * u - 1, y - (8 + 22 * qq) * u, 2, 4 * u); } break;
      default:
    }
    ctx.restore();
    ctx.save();
    drawPowerIcon(ctx, k.type, x, y, 10 * u * (1 + 0.06 * Math.sin(t * 5)), c2);
    ctx.restore();
  }
  // One consistent icon language for power-ups and perks: 1.8 px round-cap outlines on a shared grid, one small filled accent each.
  function drawPowerIcon(c, type, x, y, r, color) {
    c.save(); c.translate(x, y); c.strokeStyle = color; c.fillStyle = color; c.lineWidth = Math.max(1.5, r * 0.15); c.lineCap = 'round'; c.lineJoin = 'round';
    const P = (...p) => { c.beginPath(); for (let i = 0; i < p.length; i += 2) i ? c.lineTo(p[i] * r, p[i + 1] * r) : c.moveTo(p[0] * r, p[1] * r); c.stroke(); };   // open polyline
    const Z = (...p) => { c.beginPath(); for (let i = 0; i < p.length; i += 2) i ? c.lineTo(p[i] * r, p[i + 1] * r) : c.moveTo(p[0] * r, p[1] * r); c.closePath(); c.stroke(); };  // closed
    const O = (cx, cy, rad, fill) => { c.beginPath(); c.arc(cx * r, cy * r, rad * r, 0, TAU); fill ? c.fill() : c.stroke(); };
    const spark = (cx, cy, s, fill) => { c.beginPath(); c.moveTo(cx * r, (cy - s) * r); c.quadraticCurveTo(cx * r, cy * r, (cx + s) * r, cy * r); c.quadraticCurveTo(cx * r, cy * r, cx * r, (cy + s) * r); c.quadraticCurveTo(cx * r, cy * r, (cx - s) * r, cy * r); c.quadraticCurveTo(cx * r, cy * r, cx * r, (cy - s) * r); c.closePath(); fill ? c.fill() : c.stroke(); };
    const star = (n, ro, ri, rot = -Math.PI / 2, fill) => { c.beginPath(); for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, rr = (i % 2 ? ri : ro) * r; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); fill ? c.fill() : c.stroke(); };
    const heart = (s, fill) => { c.beginPath(); c.moveTo(0, 0.68 * s * r); c.bezierCorner = 0; c.bezierCurveTo(-1.0 * s * r, -0.05 * s * r, -0.62 * s * r, -0.78 * s * r, 0, -0.3 * s * r); c.bezierCurveTo(0.62 * s * r, -0.78 * s * r, 1.0 * s * r, -0.05 * s * r, 0, 0.68 * s * r); c.closePath(); fill ? c.fill() : c.stroke(); };
    const shield = (s) => { c.beginPath(); c.moveTo(0, -0.8 * s * r); c.lineTo(0.62 * s * r, -0.5 * s * r); c.lineTo(0.62 * s * r, 0.1 * s * r); c.bezierCurveTo(0.62 * s * r, 0.5 * s * r, 0.3 * s * r, 0.7 * s * r, 0, 0.85 * s * r); c.bezierCurveTo(-0.3 * s * r, 0.7 * s * r, -0.62 * s * r, 0.5 * s * r, -0.62 * s * r, 0.1 * s * r); c.lineTo(-0.62 * s * r, -0.5 * s * r); c.closePath(); c.stroke(); };
    switch (type) {
      case 'shield': shield(1); P(-0.25, 0.02, -0.05, 0.26, 0.3, -0.2); break;
      case 'slow': P(-0.42, -0.74, 0.42, -0.74); P(-0.42, 0.74, 0.42, 0.74); c.beginPath(); c.moveTo(-0.32 * r, -0.74 * r); c.quadraticCurveTo(-0.32 * r, -0.1 * r, 0, 0); c.quadraticCurveTo(-0.32 * r, 0.1 * r, -0.32 * r, 0.74 * r); c.moveTo(0.32 * r, -0.74 * r); c.quadraticCurveTo(0.32 * r, -0.1 * r, 0, 0); c.quadraticCurveTo(0.32 * r, 0.1 * r, 0.32 * r, 0.74 * r); c.stroke(); P(-0.14, 0.58, 0.14, 0.58); break;
      case 'leap': P(-0.55, 0.5, 0, -0.05, 0.55, 0.5); P(-0.55, -0.1, 0, -0.65, 0.55, -0.1); break;
      case 'reaper': O(0, 0, 0.42); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; P(Math.cos(a) * 0.58, Math.sin(a) * 0.58, Math.cos(a) * 0.86, Math.sin(a) * 0.86); } O(0, 0, 0.12, true); break;
      case 'amp': Z(0, -0.78, 0.52, -0.12, 0.2, -0.12, 0.2, 0.74, -0.2, 0.74, -0.2, -0.12, -0.52, -0.12); break;
      case 'alchemy': Z(-0.62, -0.2, -0.32, -0.72, 0.32, -0.72, 0.62, -0.2, 0, 0.8); P(-0.62, -0.2, 0.62, -0.2); P(-0.32, -0.72, -0.16, -0.2, 0, 0.8, 0.16, -0.2, 0.32, -0.72); break;
      case 'life': heart(1.05); break;
      case 'zap': Z(0.2, -0.82, -0.46, 0.1, -0.02, 0.1, -0.2, 0.82, 0.46, -0.14, 0.02, -0.14); break;
      case 'brake': O(0, 0, 0.72); P(-0.2, -0.26, -0.2, 0.26); P(0.2, -0.26, 0.2, 0.26); break;
      case 'overload': star(8, 0.82, 0.34, -Math.PI / 2); O(0, 0, 0.1, true); break;
      case 'surge': P(-0.8, -0.5, -0.4, 0, -0.8, 0.5); P(-0.25, -0.5, 0.15, 0, -0.25, 0.5); P(0.3, -0.5, 0.7, 0, 0.3, 0.5); break;
      case 'twin': O(-0.45, 0, 0.3, true); O(0.45, 0, 0.3, false); P(-0.12, 0, 0.12, 0); break;
      case 'stasis': for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; P(-Math.cos(a) * 0.82, -Math.sin(a) * 0.82, Math.cos(a) * 0.82, Math.sin(a) * 0.82); } O(0, 0, 0.14, true); break;
      case 'vortex': c.beginPath(); for (let th = 0; th <= 4.4; th += 0.2) { const rr = (0.08 + th * 0.17) * r, a = -th * 1.55; th ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.stroke(); O(0, 0, 0.09, true); break;
      case 'aegis': shield(0.72); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.62; P(Math.cos(a) * 0.86, Math.sin(a) * 0.86, Math.cos(a) * 1.12, Math.sin(a) * 1.12); } break;
      case 'bomb': O(-0.06, 0.16, 0.5); c.beginPath(); c.moveTo(0.22 * r, -0.26 * r); c.quadraticCurveTo(0.4 * r, -0.55 * r, 0.62 * r, -0.5 * r); c.stroke(); P(0.7, -0.84, 0.7, -0.68); P(0.86, -0.62, 1.0, -0.56); P(0.5, -0.78, 0.4, -0.9); break;
      case 'double': c.font = `700 ${r * 1.15}px Outfit, system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('×2', 0, r * 0.05); break;
      case 'magnet': c.beginPath(); c.moveTo(-0.52 * r, 0.7 * r); c.lineTo(-0.52 * r, -0.04 * r); c.arc(0, -0.04 * r, 0.52 * r, Math.PI, 0); c.lineTo(0.52 * r, 0.7 * r); c.stroke(); P(-0.52, 0.34, -0.2, 0.34); P(0.2, 0.34, 0.52, 0.34); break;
      case 'prism': Z(0, -0.72, 0.66, 0.5, -0.66, 0.5); P(-0.95, 0.04, -0.28, 0.04); c.save(); c.globalAlpha *= 0.9; P(0.26, 0.04, 0.95, -0.22); P(0.3, 0.2, 0.95, 0.2); P(0.2, 0.34, 0.9, 0.62); c.restore(); break;
      case 'fortune': O(0, 0, 0.72); spark(0, 0, 0.42, true); break;
      case 'boost': P(-0.62, -0.5, -0.12, 0, -0.62, 0.5); P(0.04, -0.5, 0.54, 0, 0.04, 0.5); break;
      case 'jackpot': spark(-0.12, 0.08, 0.62, false); spark(0.56, -0.56, 0.24, true); spark(0.5, 0.58, 0.18, true); break;
      case 'pulse': O(0, 0, 0.78); O(0, 0, 0.42); O(0, 0, 0.1, true); break;
      case 'calm': O(0, 0, 0.26, true); c.save(); c.rotate(-0.45); c.beginPath(); c.ellipse(0, 0, 0.85 * r, 0.34 * r, 0, 0, TAU); c.stroke(); c.restore(); break;
      case 'sense': spark(0, 0, 0.44, true); [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => P(sx * 0.82, sy * 0.46, sx * 0.82, sy * 0.82, sx * 0.46, sy * 0.82)); break;
      case 'daredevil': O(-0.3, 0, 0.42); P(0.1, -0.5, 0.64, 0, 0.1, 0.5); break;
      case 'lucky_star': star(5, 0.82, 0.36, -Math.PI / 2); break;
      case 'momentum': P(-0.6, 0.6, -0.6, 0.2); P(-0.2, 0.6, -0.2, -0.1); P(0.2, 0.6, 0.2, -0.4); P(0.6, 0.6, 0.6, -0.7); break;
      case 'showtime': c.beginPath(); c.arc(0, 0, 0.62 * r, -2.5, 2.2); c.stroke(); P(-0.42, -0.98, -0.62, -0.7, -0.28, -0.62); spark(0.04, 0.02, 0.26, true); break;
      case 'phoenix': c.beginPath(); c.moveTo(0, 0.78 * r); c.bezierCurveTo(-0.7 * r, 0.6 * r, -0.62 * r, -0.1 * r, -0.1 * r, -0.5 * r); c.bezierCurveTo(-0.08 * r, -0.28 * r, 0.1 * r, -0.2 * r, 0.14 * r, -0.86 * r); c.bezierCurveTo(0.7 * r, -0.4 * r, 0.8 * r, 0.5 * r, 0, 0.78 * r); c.closePath(); c.stroke(); c.beginPath(); c.moveTo(0, 0.5 * r); c.quadraticCurveTo(-0.24 * r, 0.3 * r, 0, -0.04 * r); c.quadraticCurveTo(0.24 * r, 0.3 * r, 0, 0.5 * r); c.stroke(); break;
      case 'tough': shield(0.62); c.save(); c.setLineDash([r * 0.18, r * 0.2]); O(0, 0, 0.88); c.restore(); break;
      case 'afterglow': O(0, 0, 0.26, true); c.save(); c.setLineDash([r * 0.2, r * 0.22]); O(0, 0, 0.58); O(0, 0, 0.88); c.restore(); break;
      case 'bulwark': shield(1); heart(0.34, true); break;
      case 'zenith': O(0, 0, 0.34); for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, l0 = 0.54, l1 = i % 2 ? 0.74 : 0.9; P(Math.cos(a) * l0, Math.sin(a) * l0, Math.cos(a) * l1, Math.sin(a) * l1); } break;
      case 'weaver': O(0, 0, 0.7); P(0, -0.38, 0, 0, 0.28, 0.18); c.beginPath(); c.arc(0, 0, 0.9 * r, -2.2, -0.9); c.stroke(); P(0.36, -0.96, 0.52, -0.72, 0.26, -0.66); break;
      case 'windfall': [[-0.1, 0.55], [-0.1, 0.2], [-0.1, -0.15]].forEach(([cx, cy]) => { c.beginPath(); c.ellipse(cx * r, cy * r, 0.56 * r, 0.2 * r, 0, 0, TAU); c.stroke(); }); P(-0.66, -0.15, -0.66, 0.55); P(0.46, -0.15, 0.46, 0.55); spark(0.7, -0.62, 0.22, true); break;
      case 'scholar': P(-0.5, 0.82, -0.5, -0.78); Z(-0.5, -0.78, 0.56, -0.5, -0.5, -0.14); O(-0.5, 0.82, 0.06, true); break;
      case 'cascade': P(-0.7, 0.55, -0.1, 0.05, -0.7, -0.45); P(0.0, 0.55, 0.6, 0.05, 0.0, -0.45); c.save(); c.globalAlpha *= 0.55; P(0.5, 0.55, 0.95, 0.05, 0.5, -0.45); c.restore(); break;
      case 'retro': P(-0.7, -0.5, -0.1, 0, -0.7, 0.5); c.save(); c.globalAlpha *= 0.55; P(0.0, -0.5, 0.6, 0, 0.0, 0.5); c.restore(); P(0.9, -0.55, 0.9, 0.55); break;
      case 'afterburner': c.beginPath(); c.moveTo(-0.2 * r, 0.55 * r); c.quadraticCurveTo(-0.9 * r, 0.1 * r, -0.1 * r, -0.75 * r); c.quadraticCurveTo(0.7 * r, 0.1 * r, -0.2 * r, 0.55 * r); c.stroke(); P(0.35, -0.5, 0.85, 0, 0.35, 0.5); break;
      case 'path_guard': Z(-0.78, 0.72, -0.78, -0.1, -0.52, -0.1, -0.52, -0.46, -0.26, -0.46, -0.26, -0.1, 0.26, -0.1, 0.26, -0.46, 0.52, -0.46, 0.52, -0.1, 0.78, -0.1, 0.78, 0.72); c.beginPath(); c.arc(0, 0.72 * r, 0.28 * r, Math.PI, 0); c.stroke(); break;
      case 'path_score': P(-0.78, 0.74, -0.78, 0.38); P(-0.38, 0.74, -0.38, 0.1); P(0.02, 0.74, 0.02, -0.2); P(0.42, 0.74, 0.42, -0.5); spark(0.62, -0.62, 0.34, true); break;
      case 'path_control': O(0, 0, 0.74); Z(0, -0.62, 0.2, 0, 0, 0.62, -0.2, 0); P(0, -0.98, 0, -0.78); P(0, 0.78, 0, 0.98); P(-0.98, 0, -0.78, 0); P(0.78, 0, 0.98, 0); break;
      case 'path_fortune': O(0, 0, 0.78); O(0, 0, 0.56); spark(0, 0, 0.36, true); break;

      case 'shock': O(0, 0, 0.2, true); c.save(); c.globalAlpha *= 0.9; O(0, 0, 0.5); c.globalAlpha *= 0.7; O(0, 0, 0.82); c.restore(); for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; P(Math.cos(a) * 0.9, Math.sin(a) * 0.9, Math.cos(a) * 1.12, Math.sin(a) * 1.12); } break;
      case 'hop': c.beginPath(); c.arc(0, 0.38 * r, 0.3 * r, 0, TAU); c.stroke(); c.beginPath(); c.arc(0, -0.42 * r, 0.3 * r, 0, TAU); c.fill(); P(0.0, -0.06, 0.0, 0.06); c.save(); c.setLineDash([r * 0.12, r * 0.16]); P(0.52, -0.2, 0.78, 0.0, 0.52, 0.2); c.restore(); break;
      case 'early': Z(0, -0.78, 0.78, 0.62, -0.78, 0.62); P(0, -0.2, 0, 0.2); O(0, 0.42, 0.05, true); break;
      case 'fuse': O(0, 0.1, 0.62); P(0, -0.52, 0, -0.78); P(-0.16, -0.78, 0.16, -0.78); P(0, 0.1, 0, -0.26); P(0.5, -0.4, 0.62, -0.52); break;
      case 'encore': star(5, 0.5, 0.22, -Math.PI / 2); c.beginPath(); c.arc(0, 0, 0.86 * r, -0.2, Math.PI * 1.55); c.stroke(); P(0.72, -0.62, 0.9, -0.32, 0.55, -0.3); break;
      case 'glide': O(0.38, 0, 0.27, true); P(-0.2, -0.34, -0.95, -0.34); P(-0.4, 0, -1.0, 0); P(-0.2, 0.34, -0.95, 0.34); c.beginPath(); c.arc(0.38 * r, 0, 0.6 * r, -0.9, 0.9); c.stroke(); break;
      case 'mirage': O(-0.2, 0, 0.52); c.save(); c.setLineDash([r * 0.15, r * 0.17]); O(0.24, 0, 0.52); c.restore(); O(0.02, 0, 0.1, true); break;
      case 'gift': Z(-0.62, -0.08, 0.62, -0.08, 0.62, 0.74, -0.62, 0.74); Z(-0.74, -0.38, 0.74, -0.38, 0.74, -0.08, -0.74, -0.08); P(0, -0.38, 0, 0.74); P(0, -0.38, -0.34, -0.74, -0.06, -0.78, 0, -0.38, 0.06, -0.78, 0.34, -0.74, 0, -0.38); break;
      case 'armour': shield(0.95); spark(0, 0.02, 0.3, true); break;
      case 'draw': star(5, 0.62, 0.27, -Math.PI / 2); O(-0.62, 0.78, 0.13, true); O(0.62, 0.78, 0.13, true); break;
      case 'forge': spark(0, 0, 0.42, true); c.beginPath(); c.arc(0, 0, 0.86 * r, -2.5, 1.0); c.stroke(); P(0.5, 0.74, 0.62, 0.42, 0.9, 0.62); break;
      case 'providence': c.beginPath(); c.moveTo(-0.92 * r, 0.06 * r); c.quadraticCurveTo(0, -0.7 * r, 0.92 * r, 0.06 * r); c.quadraticCurveTo(0, 0.82 * r, -0.92 * r, 0.06 * r); c.stroke(); O(0, 0.04, 0.27, true); spark(0, -0.8, 0.2, true); break;
      case 'veins': Z(-0.7, 0.3, -0.42, -0.3, 0.1, -0.7, 0.62, -0.1, 0.5, 0.5, -0.2, 0.7); P(-0.42, -0.3, 0.1, -0.1, 0.62, -0.1); P(0.1, -0.1, -0.2, 0.7); break;
      default: c.setLineDash([r * 0.22, r * 0.24]); O(0, 0, 0.66);   // phase
    }
    c.restore();
  }

  function drawPlayer(p, x, y, alpha = 1, ghost = false) {
    const tr = OD.save.equipped.trail;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (!ghost || p.trail) {
      const tw = (S && S.od > 0 ? 9 : 6.5) * u, pts = p.trail, n = pts.length;
      if (n > 2) {   // a dark under-stroke so the glowing tail stands out from light or colourful skies, then a pale core on top
        ctx.save(); ctx.lineCap = 'round';
        for (let i = 0; i < n - 1; i++) { const k = i / (n - 1); ctx.strokeStyle = `rgba(6,10,30,${0.12 * (1 - k)})`; ctx.lineWidth = tw * (1 - k) * 1.5 + 1.5 * u; ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[i + 1].x, pts[i + 1].y); ctx.stroke(); }
        ctx.restore();
      }
      G.drawTrail(ctx, p.trail, tr, world.accent, tAnim, tw);
      if (n > 2) {
        ctx.save(); ctx.lineCap = 'round';
        for (let i = 0; i < n - 1; i++) { const k = i / (n - 1); ctx.strokeStyle = `rgba(255,255,255,${0.42 * (1 - k) * (1 - k)})`; ctx.lineWidth = Math.max(0.7, tw * 0.24 * (1 - k)); ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[i + 1].x, pts[i + 1].y); ctx.stroke(); }
        ctx.restore();
      }
    }
    if (p.surge > 0) { ctx.globalCompositeOperation = 'lighter'; G.glow(ctx, x, y, 54 * u, OD.POWERS.surge.color, 0.8); ctx.globalCompositeOperation = 'source-over'; }
    if (!ghost && S && S.aFx > 0.02) {   // Retro Thrust: a cold blue halo with a ring drawing in; Afterburner: a hot orange one, flickering, with a ring pushing out
      const k = S.aFx, cold = S.aFxEq === 'retro', c1 = cold ? '#7fc4ff' : '#ff8a3a', c2 = cold ? '#e6f6ff' : '#ffd27a', fl = cold ? 1 : 0.85 + 0.15 * Math.sin(tAnim * 40);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; G.glow(ctx, x, y, (cold ? 40 : 52) * u * fl, c1, (cold ? 0.7 : 1) * k); G.glow(ctx, x, y, (cold ? 17 : 24) * u, c2, (cold ? 0.55 : 0.9) * k); if (!cold) G.glow(ctx, x, y, 30 * u, '#ff5a1a', 0.7 * k);
      const q = (tAnim * (cold ? 1.1 : 1.8)) % 1, rr = (cold ? 30 - 20 * q : 12 + 24 * q) * u; ctx.strokeStyle = OD.rgba(c2, 0.5 * k * (1 - q)); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.stroke();
      if (cold) { ctx.strokeStyle = OD.rgba('#cfeeff', 0.5 * k); ctx.lineWidth = 1.1; ctx.setLineDash([3 * u, 5 * u]); ctx.lineDashOffset = -tAnim * 18; ctx.beginPath(); ctx.arc(x, y, 15 * u, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'lighter';
    G.glow(ctx, x, y, (S && S.od > 0 ? 40 : 26) * u, ghost ? '#ffffff' : (S && S.od > 0 ? '#fff6c8' : world.accent), 1);
    const nk = !ghost && S && S.od > 0 ? Math.max(0, 1 - (S.novaT || 0) / 1.5) : 0;   // Nova has just begun: the orb burns white, then settles
    if (nk > 0.01) { const e = nk * nk * (3 - 2 * nk); G.glow(ctx, x, y, (30 + 40 * e) * u, '#ffffff', 0.55 + 0.45 * e); G.glow(ctx, x, y, (12 + 10 * e) * u, '#ffffff', 1); }
    ctx.globalCompositeOperation = 'source-over';
    if (nk > 0.01) { ctx.fillStyle = `rgba(255,255,255,${Math.min(1, nk * 1.6)})`; ctx.beginPath(); ctx.arc(x, y, 6.2 * u, 0, TAU); ctx.fill(); }
    if (ghost) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 4.6 * u, 0, TAU); ctx.fill(); }
    else {
      G.drawCore(ctx, x, y, u, OD.save.equipped.core, tAnim, world.accent);
      if (p.reaper > 0) { ctx.save(); ctx.setLineDash([5 * u, 5 * u]); ctx.lineDashOffset = -tAnim * 60; ctx.strokeStyle = OD.rgba(OD.POWERS.reaper.color, 0.8); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 46 * u, 0, TAU); ctx.stroke(); ctx.fillStyle = OD.rgba(OD.POWERS.reaper.color, 0.08); ctx.fill(); ctx.restore(); }
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
  function drawLanding(p, t, charging, px, py, dim, glyph, soft) {
    let mx, my;
    if (t.body === 'vis' && S.vis) { mx = S.vis.x + Math.cos(t.a) * S.vis.rho; my = S.vis.y + Math.sin(t.a) * S.vis.rho; }
    else { mx = cx + Math.cos(t.a) * R[t.n]; my = cy + Math.sin(t.a) * R[t.n]; }
    const a = (charging ? 1 : 0.5) * (dim ? 0.45 : 1) * (soft || 1);
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
      ctx.strokeStyle = p.dragging ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
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
  let starKey = '', starCache = stars;   // the drifting stars, thinned out on lighter graphics levels
  function starSet() { const f = OD.Q().stars; if (starKey !== f) { starKey = f; starCache = stars.map(a => a.slice(0, Math.ceil(a.length * f))); } return starCache; }
  // the biome's living sky (see js/biomes.js). During a biome change the new sky sweeps in over the old one from the side the new planet came
  // from: along a wide soft front both skies show through each other, and the new sky's layers glide into place at their own speeds,
  // so it feels like flying over into a new place rather than a fade.
  const skyDrift = () => skyX;   // the sky drifts the way the planets do; while a new biome sweeps in it flows faster, as if the ship were picking up speed
  // hyperspace streaks while the camera glides to the new planet
  function homePopScale() {
    if (!S || !(S.homePop > 0)) return 1;
    const t = 1 - S.homePop;   // starts exactly at the size the drifting planet had, swells a little and settles
    return 1 + 0.07 * Math.exp(-t * 3.4) * Math.sin(t * Math.PI * 2.3);
  }
  // Whole-screen light (the flash, the arrival bloom, the glow of a planet change, the gravity-well vignette) is made of page elements above the
  // canvas: the graphics chip fades and scales them for almost nothing, where painting them into a phone's canvas costs tens of milliseconds each.
  const fxCache = {};
  function fxLayer(name, css) {
    let e = fxCache[name];
    if (e === undefined) { const host = document.getElementById('fx'); e = fxCache[name] = host ? Object.assign(host.appendChild(document.createElement('div')), { className: 'fxl ' + name }) : null; if (e) { e.style.cssText = css; e._v = ''; } }
    return e;
  }
  function fxSet(name, css, opacity, transform, color) {
    const e = fxLayer(name, css); if (!e) return;
    if (color && e._c !== color) { e._c = color; e.style.background = 'radial-gradient(circle, ' + OD.rgba(color, 1) + ' 0%, ' + OD.rgba(color, 0.33) + ' 55%, ' + OD.rgba(color, 0) + ' 100%)'; }
    const key = opacity.toFixed(3) + '|' + (transform || '');
    if (e._v !== key) { e._v = key; e.style.opacity = opacity; if (transform) e.style.transform = transform; }
  }
  function fxOff(name) { const e = fxCache[name]; if (e && e._v !== '0') { e._v = '0'; e.style.opacity = 0; } }
  function drawHopFx() {
    if (S && S.hopBloom > 0 && state !== 'menu') {
      const k = S.hopBloom, e = 1 - k, big = Math.max(W, H);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const ri = OD.smooth(Math.min(1, e * 5)), Rmax = 60 + big * 0.95, Rr = 60 + big * 0.95 * OD.easeOut(Math.min(1, e * 1.4));
      fxSet('bloom', 'width:' + (2 * Rmax) + 'px;height:' + (2 * Rmax) + 'px;left:0;top:0;', Math.min(1, 0.45 * k * k * ri + 0.1 * k * ri), 'translate3d(' + (cx - Rmax) + 'px,' + (cy - Rmax) + 'px,0) scale(' + (Rr / Rmax).toFixed(3) + ')', S.hopColor);
      for (const [dl, w] of [[0, 4], [0.14, 2.5]]) { const q = clamp((e - dl) / (1 - dl), 0, 1); if (q <= 0) continue; ctx.strokeStyle = OD.rgba(q < 0.15 ? '#ffffff' : S.hopColor, 0.85 * (1 - q)); ctx.lineWidth = w * (1 - q) + 0.5; ctx.beginPath(); ctx.arc(cx, cy, R[OUT] * 0.3 + big * 0.8 * OD.easeOut(q), 0, TAU); ctx.stroke(); }
      ctx.restore();
    }
    else fxOff('bloom');
    const v = S && S.vis;
    if (!v || v.phase !== 'settle') { fxOff('settle'); return; }
    const q = clamp(v.st / SETTLE, 0, 1), k = Math.sin(q * Math.PI);
    const dx = cx - v.sx, dy = cy - v.sy, d = Math.hypot(dx, dy) || 1, ux = -dx / d, uy = -dy / d;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const a of ambient) {
      const x = a.x * W, y = ((a.y + tAnim * 0.2 * a.z) % 1) * H, len = (40 + a.z * 150) * u * k;
      ctx.strokeStyle = OD.rgba(v.skinColor, 0.55 * k * a.z + 0.1 * k); ctx.lineWidth = 0.8 + a.z * 1.6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + ux * len, y + uy * len); ctx.stroke();
    }
    ctx.restore();
    { const Rg = Math.max(W, H) * 0.7; fxSet('settle', 'width:' + (2 * Rg) + 'px;height:' + (2 * Rg) + 'px;left:0;top:0;', 0.28 * k, 'translate3d(' + (cx - Rg) + 'px,' + (cy - Rg) + 'px,0)', v.skinColor); }
  }
  // deep in a gravity well time itself thickens: ripples run inwards to your dot, a slow clock face turns around it, and the edges of the sky go violet
  function drawSlowWorld() {
    const k = S.slowV || 0; if (k < 0.03 || S.p.dead) return;
    const [px, py] = playerXY();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) { const q = (tAnim * 0.8 + i / 3) % 1, r = (44 - 32 * q) * u; ctx.strokeStyle = OD.rgba('#cdb2ff', Math.sin(Math.PI * q) * 0.5 * k); ctx.lineWidth = 1.6 * u; ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.stroke(); }
    ctx.lineWidth = 1.2 * u; ctx.strokeStyle = OD.rgba('#efe4ff', 0.55 * k);
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU - Math.PI / 2, r0 = 19 * u, r1 = (i % 3 === 0 ? 24 : 22) * u; ctx.beginPath(); ctx.moveTo(px + Math.cos(a) * r0, py + Math.sin(a) * r0); ctx.lineTo(px + Math.cos(a) * r1, py + Math.sin(a) * r1); ctx.stroke(); }
    const ha = tAnim * 0.9; ctx.strokeStyle = OD.rgba('#ffffff', 0.8 * k); ctx.lineWidth = 1.6 * u; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(ha) * 17 * u, py + Math.sin(ha) * 17 * u); ctx.stroke();
    ctx.restore();
  }
  function drawSlowVignette() {
    const k = S && state !== 'menu' ? (S.slowV || 0) : 0;
    if (k < 0.03) { fxOff('slowvig'); return; }
    const e = fxLayer('slowvig', 'left:0;top:0;width:100%;height:100%;background:radial-gradient(ellipse at 50% 47%, rgba(70,25,140,0) 30%, rgba(70,25,140,1) 100%);');
    if (e) { const o = (0.42 * k).toFixed(3); if (e._v !== o) { e._v = o; e.style.opacity = o; } }
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
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.letterSpacing = '0px'; ctx.setLineDash([]);   // a frame always starts from clean canvas state
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);   // the canvas is clear: the sky is made of page elements behind it (biomes.js dom)
    const sweeping = !!(S && S.bgFrom && S.bgT < 1), Q = OD.Q(), D = OD.biomes.dom, inRun = !!(S && state !== 'menu');
    const tint = inRun && S.tintA > 0.005 ? [OD.rgba(S.era.id === 'genesis' ? world.accent : ERAS[S.era.id].tint, 1), S.tintA] : null;
    D.frame({ W, H, t: tAnim, drift: skyDrift(), dpr, u, low: !T().fx, q: Q.liveQ, step: Q.liveStep, world, from: sweeping ? S.bgFrom : null, p: sweeping ? OD.smooth(S.bgT) : 1, dir: (S && S.bgDir) || 1, accent: world.accent, tint });
    const sc = D.stars(cv.width, cv.height, W, H);   // the drifting stars, on a clear canvas of their own under the veil
    if (sc) { sc.setTransform(1, 0, 0, 1, 0, 0); sc.clearRect(0, 0, cv.width, cv.height); sc.setTransform(dpr, 0, 0, dpr, 0, 0); G.drawSky(sc, OD.save.equipped.sky, starSet(), W, H, tAnim, 1, skyDrift()); }
    D.veil(world, W, H, inRun ? 0.42 : 0, sweeping ? S.bgFrom : null, sweeping ? OD.smooth(S.bgT) : 1);   // in a run the far sky and the drifting specks are pushed back a layer, so they do not compete with stardust
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    OD.glr.begin();   // the graphics-chip layer (planets, glows, stardust, particles) starts clear too
  }

  // a planet through the graphics chip when it can (its glow, then the lit sphere); false -> the caller draws it on the canvas as before
  function planetAt(x, y, r, skin, t, accent, aura, alpha) {
    if (!OD.glr.ok || skin === 'ringed' || !OD.planets.info(skin)) return false;
    const ac = G.auraColor(aura, t), rim = skin === 'void' && aura === 'azure' ? accent : ac;
    OD.glr.glow(x, y, r * 2.1, rim, (skin === 'void' ? 0.5 : 0.35) * alpha, false);
    return OD.glr.planet(x, y, r, skin, t, alpha);
  }
  function planetDraw(x, y, r, skin, t, accent, aura, alpha = 1) {
    if (planetAt(x, y, r, skin, t, accent, aura, alpha)) return;
    ctx.save(); ctx.globalAlpha = alpha; G.drawPlanet(ctx, x, y, r, skin, t, accent, dpr, aura); ctx.restore();
  }

  // the home screen's backdrop: a breathing bloom behind the planet, slow light rays turning through it, drifting motes and now and then a shooting star
  let menuStar = null, menuStarAt = 3;
  let epicK = 1, epicT = 0;   // how much of the backdrop is showing: it dissolves over about 1.8 s when a run starts and returns when you come back
  function menuEpic(pr, inRun) {
    const dtE = Math.min(0.1, Math.max(0, tAnim - epicT)); epicT = tAnim;
    epicK += ((inRun ? 0 : 1) - epicK) * Math.min(1, dtE * (inRun ? 2.4 : 1.6));
    const K = epicK < 0.01 ? 0 : epicK; if (!K) { menuStar = null; return; }
    const t = tAnim, a = world.accent, a2 = world.accent2, g = OD.glr, L = Math.max(W, H);
    if (!g.ok) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; G.glow(ctx, cx, cy, pr * 6, a, (0.2 + 0.04 * Math.sin(t * 0.6)) * K); G.glow(ctx, cx, cy, pr * 3.4, a2, 0.14 * K); ctx.restore(); return;
    }
    g.glow(cx, cy, pr * 8, a, (0.34 + 0.07 * Math.sin(t * 0.6)) * K);
    g.glow(cx, cy, pr * 4, a2, (0.26 + 0.05 * Math.sin(t * 0.9 + 1)) * K);
    for (let i = 0; i < 7; i++) {
      const rot = t * 0.03 + i * Math.PI / 7, al = 0.1 * K * (0.55 + 0.45 * Math.sin(t * 0.35 + i * 1.7));
      g.ray(cx, cy, L * 0.62, pr * (0.5 + 0.25 * Math.sin(i * 2.3)), rot, i % 2 ? a : a2, al);
    }
    for (let i = 0; i < 16; i++) {   // motes of light drifting slowly upward
      const sp = 0.006 + 0.004 * (i % 4), x = W * (0.5 + 0.48 * Math.sin(i * 12.9 + t * 0.05 * (1 + (i % 3) * 0.4))), y = H * (1 - ((i * 0.37 + t * sp) % 1)), tw = 0.5 + 0.5 * Math.sin(t * (0.8 + (i % 5) * 0.3) + i);
      g.glow(x, y, (6 + (i % 3) * 3) * u, i % 3 ? '#cfe6ff' : a2, (0.1 + 0.2 * tw) * K);
    }
    if (!menuStar && t > menuStarAt && !inRun) { const d = Math.random() < 0.5 ? 1 : -1; menuStar = { x: W * (d > 0 ? 0.1 + 0.4 * Math.random() : 0.5 + 0.4 * Math.random()), y: H * (0.06 + 0.25 * Math.random()), vx: d * 380 * u, vy: 150 * u, t: 0 }; }
    if (menuStar) {
      const m = menuStar; m.t += 1 / 60; m.x += m.vx / 60; m.y += m.vy / 60;
      const k = m.t / 1.1, al = Math.sin(Math.PI * Math.min(1, k)), ang = Math.atan2(m.vy, m.vx);
      g.ray(m.x - Math.cos(ang) * 60 * u, m.y - Math.sin(ang) * 60 * u, 62 * u, 2.2 * u, ang, '#ffffff', 0.85 * al * K);
      g.glow(m.x, m.y, 9 * u, '#ffffff', 0.9 * al * K);
      if (k >= 1) { menuStar = null; menuStarAt = t + 4 + Math.random() * 5; }
    }
  }

  let dotsK = 0;
  function drawMenuDots(k, leaving) {
    for (const [i, d] of menuDots.entries()) {
      let x, y;
      if (leaving) {   // a run begins: each dot keeps circling for a moment, then spirals out in a smooth, widening curve, speeding up as it goes
        if (!d.fly) d.fly = { r: R[d.o], th: d.th, w: d.dir * d.v / R[d.o] * 0.016 * 60, rv: 8 * u, t: 0, acc: (170 + 55 * i) * u, damp: 0.55 + 0.12 * i };
        const f = d.fly, dt = 1 / 60; f.t += dt; f.rv += f.acc * (0.25 + 2.6 * f.t) * dt; f.r += f.rv * dt; f.th += f.w * dt; f.w *= 1 - f.damp * dt * 1.6;
        x = cx + Math.cos(f.th) * f.r; y = cy + Math.sin(f.th) * f.r;
      } else { d.fly = null; d.th += d.dir * d.v / R[d.o] * 0.016; x = cx + Math.cos(d.th) * R[d.o]; y = cy + Math.sin(d.th) * R[d.o]; }
      d.trail.unshift({ x, y }); if (d.trail.length > (leaving ? 40 : 28)) d.trail.length = leaving ? 40 : 28;
      drawPlayer({ trail: d.trail, shield: false, phase: 0, magnet: 0, inv: 0 }, x, y, d.a * Math.min(1, k * 1.5));
    }
  }

  function drawWorld() {
    const inRun = S && state !== 'menu';
    const sh = inRun ? S.shake : 0;
    ctx.save();
    const shx = sh > 0.1 ? (Math.random() - 0.5) * sh : 0, shy = sh > 0.1 ? (Math.random() - 0.5) * sh : 0;
    let gz = 1, gy = 0;
    if (shx || shy) ctx.translate(shx, shy);
    if (Math.abs(vz - 1) > 0.001) { ctx.translate(cx, cy); ctx.scale(vz, vz); ctx.translate(-cx, -cy); gz = vz; }
    if (inRun && (S.camZ < 0.999 || Math.abs(S.camY) > 0.5)) {   // camera zoom + pan
      ctx.translate(cx, cy); ctx.scale(S.camZ, S.camZ); ctx.translate(-cx, -(cy + S.camY)); gz *= S.camZ; gy = S.camY;
    }
    OD.glr.setMatrix(gz, cx + shx - gz * cx, cy + shy - gz * (cy + gy));   // the graphics-chip layer follows the same shake, zoom and pan
    pmark('w_setup'); const target = inRun && !S.p.dead && !S.over ? jumpTarget() : null;
    const cands = inRun && !S.p.dead && !S.over ? jumpCandidates() : null;
    const charging = inRun && S.p.charging;
    pmark('w_aim'); if (inRun && bossCap()) drawBossOrbits(S.dir.boss); else if (!(inRun && S.old)) drawOrbits(charging ? target : null); pmark('w_orbits');
    const pulse = OD.audio.kick();   // the planet beats only with the kick drum, exactly when it is heard
    const pr = PR * (1 + pulse * 0.06);
    menuEpic(pr, inRun);
    if (inRun && S.old) {   // the planet you left drifts away, orbits and all
      const q0 = clamp(S.old.t / SETTLE, 0, 1), q = smoother(q0), k = 1 - 0.55 * q, ox = cx + S.old.vx * q * base * 1.2, oy = cy + S.old.vy * q * base * 1.2, fo = 1 - smoother(clamp((q0 - 0.35) / 0.65, 0, 1));
      ctx.save(); ctx.globalAlpha = fo;
      pmark('w_x1'); for (let i = 0; i < NO; i++) G.drawOrbitRing(ctx, ox, oy, Rb[i] * k, OD.save.equipped.orbit, tAnim, world.accent, 0.2, u); pmark('w_oldrings');
      ctx.restore();
      planetDraw(ox, oy, pr * k, S.old.skin, tAnim, world.accent, OD.save.equipped.aura, fo);
    } else if (inRun && S.bhPlanet && S.bhPlanet.ghosts) {   // your planet is torn up and swallowed by the black hole
      const bp = S.bhPlanet, skin = S.homeSkin || baseSkin();
      const one = (x, y, al, sc) => { ctx.save(); ctx.globalAlpha = Math.max(0, al); ctx.translate(x, y); ctx.rotate(bp.ang); ctx.scale(bp.stretch * bp.s * sc, bp.s * sc); G.drawPlanet(ctx, 0, 0, pr, skin, tAnim, world.accent, dpr, OD.save.equipped.aura); ctx.restore(); };
      bp.ghosts.forEach(([gx, gy], j) => one(gx, gy, bp.a * (0.2 - j * 0.035) * Math.min(1, bp.heat * 3), 1 - j * 0.05));   // a smear of afterimages
      one(bp.x, bp.y, bp.a, 1);
      if (bp.heat > 0.05) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, bp.heat * 1.2) * bp.a; ctx.translate(bp.x, bp.y); ctx.rotate(bp.ang); ctx.scale(bp.stretch * bp.s, bp.s); G.glow(ctx, 0, 0, pr * 1.9, '#ff7a30', 0.9); G.glow(ctx, 0, 0, pr * 1.1, '#fff0c0', 0.6 * bp.heat); ctx.restore(); }
    } else if (inRun && bossCap()) { /* the planet is gone: only the hole is there */ } else planetDraw(cx, cy, pr * homePopScale(), (inRun && S.homeSkin) || baseSkin(), tAnim, world.accent, OD.save.equipped.aura);
    pmark('w_planet');
    if (inRun && S.dir.boss && S.dir.boss.kind === 'singularity') drawSingularity(S.dir.boss);
    if (inRun && pulse > 0.05) {
      ctx.strokeStyle = OD.rgba(world.accent, 0.16 * pulse); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, pr * (1.4 + 2.6 * (1 - pulse)), 0, TAU); ctx.stroke();
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
      pmark('w_vis'); // pickups
      for (const k of S.pk) {
        if (k.t < 0) continue;       // not yet appeared (stardust unrolls along its orbit)
        const inQ = OD.smooth(clamp(k.t / 0.7, 0, 1)), outQ = k.dead ? 1 - OD.smooth(clamp((k.fo || 0) / (k.k === 'dust' ? 0.14 : FADE_OUT), 0, 1)) : 1;   // a collected star is gone almost at once
        let lifeQ = 1, alphaMul = 1, lift = 0;
        if (k.k === 'power') {
          // about to vanish: a gentle, quickening pulse for the last few seconds, then a soft fade
          if (k.life < 3.6) alphaMul = 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(k.life * (6 + (3.6 - k.life) * 2.4)));
          lifeQ = k.life < 0.7 ? OD.smooth(clamp(k.life / 0.7, 0, 1)) : 1;
        } else if (!k.dead) {
          // stardust about to time out: it blinks, faster and faster, so it is obvious it is going
          if (k.life < 4.6) { const f = 4.6 - k.life, ph = 0.5 + 0.5 * Math.sin(k.life * (5 + f * f * 0.75)); alphaMul = 0.62 + 0.38 * ph; }   // a soft pulse that quickens as time runs out
          lifeQ = OD.smooth(clamp(k.life / 0.45, 0, 1));
        }
        const sc = (0.5 + 0.5 * inQ) * (k.dead ? 1 + (k.k === 'dust' ? 0.04 : 0.7) * (1 - outQ) : 0.7 + 0.3 * lifeQ) * (k.k === 'power' && k.life < 3.6 ? 1 + 0.05 * Math.sin(k.life * 9) : 1);
        if (k.k === 'dust' && OD.glr.ok) {   // stardust through the graphics chip
          const ga = inQ * lifeQ * outQ * alphaMul, tw = 0.65 + 0.35 * Math.sin(k.t * 5 + k.a * 3), dq = k.dead ? 1 - outQ : 0, g = OD.glr;
          g.glow(k.x, k.y, 13 * u * sc, '#04081c', 0.28, false);
          g.glow(k.x, k.y, (15 + 3 * dq) * u * sc, '#ffe9a0', ga * 0.9 * (1 - 0.3 * dq));
          g.glow(k.x, k.y, 7 * u * sc, '#ffffff', ga * (0.65 * tw + 0.12 * dq));
          g.star(k.x, k.y - 3 * u * dq * sc, 5.6 * u * sc * (1 - 0.35 * dq), k.t * 1.4 + k.a, '#fffbe6', ga);
          continue;
        }
        ctx.save(); ctx.globalAlpha = inQ * lifeQ * outQ * alphaMul; ctx.translate(k.x, k.y - lift); ctx.scale(sc, sc); ctx.translate(-k.x, -k.y);
        if (k.k === 'dust') {
          // a clean, near-white star with a warm glow and a little twinkling flare, on a faint dark halo so it also reads on pale skies
          const tw = 0.65 + 0.35 * Math.sin(k.t * 5 + k.a * 3), dq = k.dead ? 1 - outQ : 0;   // dq: how far through the pickup it is
          const ga = ctx.globalAlpha;
          G.glow(ctx, k.x, k.y, 13 * u, '#04081c', 0.28);
          ctx.globalCompositeOperation = 'lighter';
          G.glow(ctx, k.x, k.y, (15 + 3 * dq) * u, '#ffe9a0', ga * 0.9 * (1 - 0.3 * dq)); ctx.globalAlpha = ga;
          G.glow(ctx, k.x, k.y, 7 * u, '#ffffff', ga * (0.65 * tw + 0.12 * dq)); ctx.globalAlpha = ga;
          ctx.globalCompositeOperation = 'source-over';
          ctx.translate(k.x, k.y - 3 * u * dq);
          ctx.rotate(k.t * 1.4 + k.a); ctx.scale(1 - 0.35 * dq, 1 - 0.35 * dq);
          ctx.beginPath();
          for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i / 10 * TAU, r = (i % 2 ? 2.2 : 3.9) * u; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
          ctx.closePath(); ctx.fillStyle = ctx.strokeStyle = '#fffbe6'; ctx.lineJoin = 'round'; ctx.lineWidth = 1.8 * u; ctx.fill(); ctx.stroke();   // (no shadowBlur: it is slow on phones, and the two glows around it do the same job)
        } else {
          drawPowerPickup(k);
        }
        ctx.restore();
      }
      drawWells();
      pmark('w_pickups'); // hazards: rings first (behind), then others
      for (const h of S.hz) if (h.k === 'ring' || h.k === 'beam') drawHaz(h);
      for (const h of S.hz) {
        if (h.k === 'ring' || h.k === 'beam') continue;
        if (h.hidden) continue;
        if (h.warn > 0 || DIRECT.has(h.k)) { drawHaz(h); continue; }
        const q = OD.smooth(clamp((h.t - h.warn0) / 0.45, 0, 1)), o = h.dead && !h.exit ? OD.smooth(clamp((h.fo || 0) / FADE_OUT, 0, 1)) : 0, dq = exitQ(h);
        const sc = (0.6 + 0.4 * q) * (1 + 0.35 * o) * (1 - 0.5 * dq * dq);
        const [hx, hy] = h.k === 'comet' ? [h.x, h.y] : hpos(h);
        // once something can no longer hurt you (the last second of its life) it turns into a pale, grey ghost that dissolves in place
        const ghost = dq > 0.4 || (h.dead && h.exit);
        ctx.save();
        if (ghost) { ctx.globalAlpha = 0.5; if (Math.random() < 0.35 * fxScale()) particle(hx + rand(-14, 14) * u, hy + rand(-14, 14) * u, rand(-8, 8), rand(-8, 8), 0.7, rand(1, 2), '#cfd6e6', { drag: 1 }); }
        const zt = h.zapT0 != null ? S.clock - h.zapT0 : -1;
        if (zt >= 0 && zt < 0.2) ctx.translate(rand(-2.5, 2.5) * u, rand(-2.5, 2.5) * u);   // the zap rattles it
        ctx.translate(hx, hy); ctx.scale(sc, sc); ctx.translate(-hx, -hy); ghostDraw = ghost; drawHaz(h); ghostDraw = false;
        if (zt >= 0 && zt < 0.2) { ctx.globalCompositeOperation = 'lighter'; G.glow(ctx, hx, hy, 30 * u, '#ffffff', 0.9); G.glow(ctx, hx, hy, 46 * u, OD.POWERS.zap.color, 0.8); }
        ctx.restore();
      }
      drawEvtFront(); drawFlareAfter();
      for (const b of S.beams) drawBolt(b);
      drawSlowWorld();
      // shock waves
      for (const w of S.waves) {
        const k = w.t / w.life;
        ctx.save(); ctx.globalAlpha = (1 - k) * 0.9; ctx.strokeStyle = w.color; ctx.lineWidth = 3 * (1 - k) + 1;
        ctx.beginPath(); ctx.arc(w.x, w.y, w.maxR * OD.easeOut(k), 0, TAU); ctx.stroke(); ctx.restore();
      }
      pmark('w_particles'); // player
      if (!S.p.dead) {
        const [px, py] = playerXY();
        if (S.p.charging) drawCharge(S.p, px, py);
        if (charging && S.p.body === 'main') {
          // every orbit you could pick, dim; the ones you are about to cross lit; a gentle arrow shows which way the slide counts
          const tgt = target && target.body === 'main' ? target : null;
          for (let i = 0; i < NO; i++) {
            if (i === S.p.o) continue;
            const inPath = tgt && (tgt.d > 0 ? i > S.p.o && i <= tgt.n : i < S.p.o && i >= tgt.n);
            if (inPath && i !== tgt.n) drawLanding(S.p, { body: 'main', n: i, a: S.p.th }, true, px, py, false, null, 0.55);
            else if (!inPath) drawLanding(S.p, { body: 'main', n: i, a: S.p.th }, true, px, py, true, null);
          }
          if (cands && cands.vis && !(target && target.body === 'vis')) drawLanding(S.p, cands.vis, true, px, py, true, null);
          const [rx, ry] = radialDir(), st = S.p.dragging ? dragSteps() : 0, pulse = 0.5 + 0.5 * Math.sin(tAnim * 7);
          for (const dir of [1, -1]) {   // + = away from the planet (bigger orbit), - = towards it (tighter)
            if (dir > 0 ? S.p.o >= OUT && !(cands && cands.vis) : S.p.o <= 0) continue;
            const room = dir > 0 ? OUT - S.p.o + (cands && cands.vis ? 1 : 0) : S.p.o, want = st * dir > 0 ? Math.abs(st) : 0;
            const nch = Math.max(1, Math.min(room, 3));
            for (let k = 0; k < nch; k++) {
              const on = k < Math.max(1, want) && want > 0, d0 = (26 + k * 11) * u, ax = rx * dir, ay = ry * dir;
              ctx.save(); ctx.translate(px + ax * d0, py + ay * d0); ctx.rotate(Math.atan2(ay, ax));
              ctx.globalAlpha = on ? 0.95 : (S.p.dragging ? 0.18 : 0.3 + 0.2 * pulse) * (1 - k * 0.25);
              ctx.strokeStyle = on ? '#ffd95a' : '#ffffff'; ctx.lineWidth = (on ? 2.8 : 2) * u; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
              ctx.beginPath(); ctx.moveTo(-4 * u, -6 * u); ctx.lineTo(3 * u, 0); ctx.lineTo(-4 * u, 6 * u); ctx.stroke(); ctx.restore();
            }
          }
          if (!S.p.dragging && OD.save.stats.runs < 12 && !target) {
            ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,217,90,0.9)'; ctx.font = `800 ${11 * u}px Outfit, system-ui, sans-serif`; ctx.letterSpacing = '2px';
            ctx.fillText('SLIDE ALONG THE ORBITS', px, py - 34 * u); ctx.restore();
          }
        }
        if (target) drawLanding(S.p, target, charging, px, py, false, null);
        drawPlayer(S.p, px, py, S.intro ? 0.55 : 1);
        drawTwin();
        if (trickMode() === 'dot') drawTrickPops(px, py);
        if (px < 8 || px > W - 8 || py < 8 || py > H - 8) {   // off screen (in the black hole's grip): show where the dot is and which way to look
          const mx = clamp(px, 22 * u, W - 22 * u), my = clamp(py, safeTop + 40 * u, H - 30 * u), an = Math.atan2(py - my, px - mx), pu = 0.6 + 0.4 * Math.sin(tAnim * 8);
          ctx.save(); ctx.translate(mx, my); ctx.globalAlpha = 0.9;
          G.glow(ctx, 0, 0, 22 * u, '#7be0ff', 0.7 * pu);
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 5 * u, 0, TAU); ctx.fill();
          ctx.rotate(an); ctx.fillStyle = '#7be0ff'; ctx.beginPath(); ctx.moveTo(17 * u, 0); ctx.lineTo(10 * u, -5 * u); ctx.lineTo(10 * u, 5 * u); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      }
      pmark('w_hazards'); drawFrags(); pmark('w_frags');
      // particles
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const q of S.parts) {
        const k = q.life / q.max;
        if (OD.glr.ok) {
          const s = q.size * (0.4 + 0.6 * k + q.grow * (1 - k)), a = Math.min(1, k * 1.4);
          if (q.sq) OD.glr.block(q.x, q.y, s, s, q.rot + q.life * 6, q.color, a, true); else OD.glr.disc(q.x, q.y, s, q.color, a, true);
          continue;
        }
        ctx.globalAlpha = Math.min(1, k * 1.4); ctx.fillStyle = q.color;
        const s = q.size * (0.4 + 0.6 * k + q.grow * (1 - k));
        if (q.sq) { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot + q.life * 6); ctx.fillRect(-s, -s, s * 2, s * 2); ctx.restore(); }
        else { ctx.beginPath(); ctx.arc(q.x, q.y, s, 0, TAU); ctx.fill(); }
      }
      ctx.restore(); pmark('w_parts');
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
      dotsK = 1; drawMenuDots(1);   // ambient menu dots
    }
    if (inRun && dotsK > 0.02) { dotsK = Math.max(0, dotsK - 1 / 80); drawMenuDots(dotsK, true); }   // when a run starts they do not vanish: they fade out as your own dot arrives
    ctx.restore();
    OD.glr.end();
  }

  function fmtTime(s) { const m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ':' + (r < 10 ? '0' : '') + r; }

  // The hearts, top left: one per life. A lost heart cracks in two and falls away; a new one flies in from where you caught it.
  function heartPath(x, y, s, c = ctx) {   // a full, round heart (the classic curve), s = about half its width
    const k = s * 1.04 / 16; c.beginPath();
    for (let i = 0; i <= 48; i++) { const t = i / 48 * TAU, hx = 16 * Math.pow(Math.sin(t), 3), hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); const px = x + hx * k, py = y - (hy + 2.2) * k; i ? c.lineTo(px, py) : c.moveTo(px, py); }
    c.closePath();
  }
  // The hearts and shields are drawn like the icons on the skills screen: the same tinted, glowing glyph (built once and kept), with no disc round it
  const hudSprites = {};
  function hudSprite(type, col) {
    const k = type + col; let c = hudSprites[k];
    if (!c) { c = document.createElement('canvas'); c.width = c.height = 96; c.dataset.picon = type + ':' + col + ':max'; c.dataset.bare = '1'; try { OD.ui.internals.drawPerkIcon(c); } catch (e) { /* the sprite stays empty */ } hudSprites[k] = c; }
    return c;
  }
  function glyph(type, col, x, y, s, al) { const z = s * 3.4; ctx.save(); ctx.globalAlpha *= al; ctx.drawImage(hudSprite(type, col), x - z / 2, y - z / 2, z, z); ctx.restore(); }
  // the heart: drawn like the shield: a glowing outline round a faint tinted fill, built once (also what shatters when a heart is lost)
  let heartImg = null;
  function heartSprite() {
    if (heartImg) return heartImg;
    const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d'), s = 96 / 3.4 * 0.98;
    g.lineJoin = 'round'; g.lineCap = 'round';
    heartPath(48, 48, s, g); g.shadowColor = 'rgba(255, 70, 100, 0.9)'; g.shadowBlur = 12; g.lineWidth = 4.2; g.strokeStyle = '#ff5a78'; g.stroke(); g.shadowBlur = 0;
    const f = g.createLinearGradient(0, 48 - s, 0, 48 + s); f.addColorStop(0, 'rgba(255, 120, 150, 0.42)'); f.addColorStop(1, 'rgba(255, 40, 80, 0.2)');
    heartPath(48, 48, s, g); g.fillStyle = f; g.fill();
    heartPath(48, 48, s, g); g.lineWidth = 1.6; g.strokeStyle = '#ffd3dc'; g.stroke();
    g.beginPath(); g.arc(48 - s * 0.38, 48 - s * 0.28, s * 0.42, Math.PI * 1.05, Math.PI * 1.45); g.lineWidth = 2.6; g.strokeStyle = 'rgba(255, 255, 255, 0.75)'; g.stroke();   // a small glint on the left lobe
    return (heartImg = c);
  }
  const heartBody = (x, y, s, al) => { const z = s * 3.4; ctx.save(); ctx.globalAlpha *= al; ctx.drawImage(heartSprite(), x - z / 2, y - z / 2, z, z); ctx.restore(); };
  const shieldBody = (x, y, s, al) => glyph('shield', '#5ab8ff', x, y, s, al);
  const heartSlot = (x, y, s) => heartPath(x, y, s * 0.98);
  const shieldSlot = (x, y, s) => shieldPath(x, y, s * 0.9);
  function shieldPath(x, y, r) { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.86, y - r * 0.62); ctx.lineTo(x + r * 0.86, y + r * 0.1); ctx.bezierCurveTo(x + r * 0.86, y + r * 0.62, x + r * 0.4, y + r * 0.92, x, y + r * 1.1); ctx.bezierCurveTo(x - r * 0.4, y + r * 0.92, x - r * 0.86, y + r * 0.62, x - r * 0.86, y + r * 0.1); ctx.lineTo(x - r * 0.86, y - r * 0.62); ctx.closePath(); }
  // A row of small icons, one per point of a stock (hearts on the left, shields on the right). The first place is the one nearest the multiplier: what you hold fills from there outwards. There are always three outlines; each one you hold is
  // filled in. Past three the new ones are drawn next to the others, and the whole row slowly tightens to make room. A spent one breaks apart like an
  // asteroid (shards fly off, spinning, with a puff of dust); a new one flies in from where it was gained and pops into its place.
  function iconRow(H, count, c) {
    const n = Math.max(3, count, H.prev), dt = 1 / 60;
    const want = n <= 3 ? c.sp : Math.max(c.sp * 0.34, c.sp * 2 / (n - 1));   // the spacing the row should have for this many
    H.sp = H.sp == null ? c.sp : H.sp + (want - H.sp) * 0.07;
    const X = i => c.x0 + c.dir * i * H.sp;
    if (H.prev < 0) { for (let i = 0; i < count; i++) H.pop[i] = -0.25 - i * 0.14; }   // a new run: they pop in one after another
    else if (count < H.prev) for (let i = count; i < H.prev; i++) {
      delete H.fly[i]; delete H.pop[i];
      const N = 7, base = Math.random() * TAU, ang = Array.from({ length: N }, (_, q) => base + (q + (Math.random() - 0.5) * 0.5) / N * TAU), sh = [];
      for (let q = 0; q < N; q++) { const a0 = ang[q], a1 = ang[(q + 1) % N] + (q === N - 1 ? TAU : 0), am = (a0 + a1) / 2, R0 = 1.9 * c.s, j0 = 0.75 + Math.random() * 0.5, j1 = 0.75 + Math.random() * 0.5;
        sh.push({ pts: [[0, 0], [Math.cos(a0) * R0 * j0, Math.sin(a0) * R0 * j0], [Math.cos(am) * R0 * (0.9 + Math.random() * 0.3), Math.sin(am) * R0 * (0.9 + Math.random() * 0.3)], [Math.cos(a1) * R0 * j1, Math.sin(a1) * R0 * j1]], dir: am + (Math.random() - 0.5) * 0.5, v: (12 + Math.random() * 26) * u, spin: (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 3), cen: [Math.cos(am) * R0 * 0.5, Math.sin(am) * R0 * 0.5] }); }
      (H.rp = H.rp || []).push({ x: X(i), t: 0 }, { x: X(i), t: -0.12 });   // ripples spreading from the place, easy to see from the corner of the eye
      H.br.push({ i, t: 0, sh, dust: Array.from({ length: 9 }, () => ({ a: Math.random() * TAU, v: (14 + Math.random() * 26) * u, r: (0.6 + Math.random() * 1.1) * u })), x: X(i) });
    }
    else if (count > H.prev) for (let i = H.prev; i < count; i++) { const f = c.from() || { x: W / 2, y: c.y }; H.fly[i] = { t: 0, x: f.x, y: f.y, tr: [] }; }
    H.prev = count;
    ctx.save();
    for (let i = 0; i < n; i++) { const x = X(i); if (i >= count || H.fly[i]) { ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1.4; c.outline(x, c.y, c.s); ctx.stroke(); } }   // the empty places
    for (let i = 0; i < n; i++) {
      const x = X(i);
      if (i < count && !H.fly[i]) {
        const pt = H.pop[i] == null ? 1 : (H.pop[i] += dt) < 0 ? 0 : Math.min(1, H.pop[i] / 0.35), sc = pt < 1 ? OD.easeOut(pt) * 1.25 - 0.25 * pt : 1;
        if (H.pop[i] != null && pt >= 1) delete H.pop[i];
        if (sc > 0.01) c.body(x, c.y, c.s * sc, 1);
      }
    }
    for (const i of Object.keys(H.fly)) {   // in flight: along a soft curve from where it was gained to its place
      const f = H.fly[i]; f.t += dt; const k = Math.min(1, f.t / 0.75), e = OD.smooth(k), x1 = X(+i), mx = (f.x + x1) / 2 + 30 * u * c.dir, my = Math.min(f.y, c.y) - 40 * u;
      const qx = (1 - e) * (1 - e) * f.x + 2 * (1 - e) * e * mx + e * e * x1, qy = (1 - e) * (1 - e) * f.y + 2 * (1 - e) * e * my + e * e * c.y;
      f.tr.unshift([qx, qy]); if (f.tr.length > 12) f.tr.pop();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; f.tr.forEach(([tx, ty], j) => G.glow(ctx, tx, ty, (7 - j * 0.5) * u, c.glow, 0.5 * (1 - j / 12))); ctx.restore();
      c.body(qx, c.y + (qy - c.y), c.s * (1.5 - 0.5 * e), 1);
      if (k >= 1) { delete H.fly[i]; H.pop[i] = 0.2; }
    }
    for (let j = H.br.length - 1; j >= 0; j--) {   // a spent one: it shatters like a rock, shards spinning away, a little dust, and fades
      const b = H.br[j]; b.t += dt; const k = b.t / 0.85; if (k >= 1) { H.br.splice(j, 1); continue; }
      const x = X(b.i), e = OD.easeOut(Math.min(1, k * 1.2)), al = Math.pow(1 - k, 1.3), z = c.s * 3.4;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; G.glow(ctx, x, c.y, c.s * 2.4, c.glow, 0.45 * (1 - k) * (k < 0.2 ? 1 + (0.2 - k) * 4 : 1)); ctx.restore();
      for (const sh of b.sh) {
        const ox = Math.cos(sh.dir) * sh.v * e * 0.9, oy = Math.sin(sh.dir) * sh.v * e * 0.9 + 18 * u * k * k;
        ctx.save(); ctx.translate(x + sh.cen[0] + ox, c.y + sh.cen[1] + oy); ctx.rotate(sh.spin * e); ctx.translate(-sh.cen[0], -sh.cen[1]);
        ctx.beginPath(); sh.pts.forEach(([px, py], q) => q ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); ctx.clip();
        ctx.globalAlpha *= al; ctx.drawImage(c.sprite(), -z / 2, -z / 2, z, z); ctx.restore();
      }
      ctx.save(); ctx.fillStyle = c.dust; for (const d of b.dust) { ctx.globalAlpha = 0.7 * (1 - k); ctx.beginPath(); ctx.arc(x + Math.cos(d.a) * d.v * e, c.y + Math.sin(d.a) * d.v * e + 6 * u * k, d.r * (1 - 0.6 * k), 0, TAU); ctx.fill(); } ctx.restore();
    }
    if (H.rp) for (let j = H.rp.length - 1; j >= 0; j--) {   // the ripples: thin rings that open and fade
      const r = H.rp[j]; r.t += dt; if (r.t > 0.9) { H.rp.splice(j, 1); continue; } if (r.t < 0) continue;
      const k = r.t / 0.9, e = OD.easeOut(k);
      ctx.save(); ctx.strokeStyle = c.glow; ctx.globalAlpha = 0.75 * (1 - k) * (1 - k); ctx.lineWidth = (2.6 - 1.8 * k) * u; ctx.beginPath(); ctx.arc(r.x, c.y, (c.s * 0.6 + e * c.s * 4.6), 0, TAU); ctx.stroke(); ctx.restore();
    }
    ctx.restore();
  }
  function drawHearts(y0, sz) {
    const H0 = S.hearts || (S.hearts = { prev: -1, br: [], fly: {}, pop: {} }), y = y0 + sz * 1.43;   // level with the multiplier pill
    iconRow(H0, S.lives, { x0: 124 * u, dir: -1, sp: 25 * u, y, s: 9.4 * u, body: heartBody, outline: heartSlot, sprite: heartSprite, dust: '#ff6a5a', glow: '#ff4a3a', from: () => S.lifeFrom });
    // shields, mirrored on the right (to the left of the pause button)
    const Hs = S.shieldsHud || (S.shieldsHud = { prev: -1, br: [], fly: {}, pop: {} }), cnt = +S.p.shield || 0;
    if (cnt > (Hs.prev < 0 ? 99 : Hs.prev) && !S.shieldFrom) { const [px, py] = playerXY(), z = S.camZ || 1; S.shieldFrom = { x: cx + (px - cx) * z, y: cy + (py - (cy + (S.camY || 0))) * z }; }
    iconRow(Hs, cnt, { x0: W - 124 * u, dir: 1, sp: 25 * u, y, s: 9.4 * u, body: shieldBody, outline: shieldSlot, sprite: () => hudSprite('shield', '#5ab8ff'), dust: '#8ac8ff', glow: '#6ab8ff', from: () => { const f = S.shieldFrom; S.shieldFrom = null; return f; } });
  }
  function drawHUD() {
    const cx = W / 2;   // the HUD stays centred on the screen, even when the world is centred on a black hole off to the left
    const sz = Math.min(58, W * 0.14), hk = OD.smooth(clamp(S.hudIn == null ? 1 : S.hudIn, 0, 1)), hs = 1 - hk;   // hs: how far the HUD is slid away
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.translate(0, -hs * 150 * u);   // the top of the HUD drifts up and away
    const y0 = safeTop + (S.demo ? 16 : 6);
    if (S.mode !== 'zen' && S.tut < 0) drawHearts(y0, sz);
    if (S.mode === 'zen') {
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = `300 ${sz * 0.7}px Outfit, system-ui, sans-serif`;
      ctx.fillText(fmtTime(S.calm), cx, y0 + sz * 0.8);
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `500 ${sz * 0.26}px Outfit, system-ui, sans-serif`;
      ctx.fillText('ZEN  ·  ' + S.stats.dust + ' stardust', cx, y0 + sz * 1.15);
    } else {
      ctx.fillStyle = '#fff'; ctx.font = `800 ${sz}px Outfit, system-ui, sans-serif`;
      if (T().fx && OD.Q().shadow) { ctx.shadowColor = OD.rgba(world.accent, 0.6); ctx.shadowBlur = 14; }
      ctx.fillText(OD.fmt(S.dispScore), cx, y0 + sz * 0.85);
      ctx.shadowBlur = 0;
      if (S.homeType && !S.intro) {   // what the planet and the biome you are in change
        ctx.save(); ctx.translate(0, hs * 300 * u);   // the pills drift down and away, always in view at the bottom as two pills
        const ty = S.homeType, fade = 1 - 0.45 * (S.hopBloom || 0), fs = Math.max(8.5, Math.min(sz * 0.2, W * 0.03)), ph = fs * 2.1, by = H - Math.max(14, safeTop * 0.4) - ph;
        const bonusPct = m => m > 1.001 ? '+' + Math.round((m - 1) * 100) + '%' : '';
        const row = (y, dot, title, sub, gold, dots, am) => {
          ctx.save(); ctx.globalAlpha = 0.9 * fade * (am == null ? 1 : am); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
          const pad = fs * 0.9, gap = fs * 0.55, dr = fs * 0.32;
          const meas = k => { ctx.font = `800 ${fs * k}px Outfit, system-ui, sans-serif`; ctx.letterSpacing = (1.4 * k) + 'px'; const a = ctx.measureText(title).width; ctx.font = `500 ${fs * k}px Outfit, system-ui, sans-serif`; ctx.letterSpacing = '0px'; const b2 = ctx.measureText(sub).width; ctx.font = `800 ${fs * k}px Outfit, system-ui, sans-serif`; const c2 = gold ? ctx.measureText(gold).width : 0; const dw = dots ? dots[1] * dr * 2.6 : 0; return [a, b2, c2, pad * 2 + dr * 2 + gap + a + gap + b2 + (gold ? gap + c2 : 0) + (dots ? gap + dw : 0), dw]; };
          let k = 1, m = meas(1); if (m[3] > W - 16) { k = (W - 16) / m[3]; m = meas(k); }
          const pw = m[3] * (k < 1 ? 1 : 1), x0 = cx - pw / 2, r = ph / 2;
          ctx.beginPath(); ctx.moveTo(x0 + r, y); ctx.arcTo(x0 + pw, y, x0 + pw, y + ph, r); ctx.arcTo(x0 + pw, y + ph, x0, y + ph, r); ctx.arcTo(x0, y + ph, x0, y, r); ctx.arcTo(x0, y, x0 + pw, y, r); ctx.closePath();
          ctx.fillStyle = 'rgba(6,10,30,0.5)'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = OD.rgba(dot, 0.42); ctx.stroke();
          let x = x0 + pad; ctx.fillStyle = dot; ctx.beginPath(); ctx.arc(x + dr, y + ph / 2, dr, 0, TAU); ctx.fill(); x += dr * 2 + gap;
          ctx.font = `800 ${fs * k}px Outfit, system-ui, sans-serif`; ctx.letterSpacing = (1.4 * k) + 'px'; ctx.fillStyle = '#fff'; ctx.fillText(title, x, y + ph / 2 + 0.5); x += m[0] + gap;
          ctx.font = `500 ${fs * k}px Outfit, system-ui, sans-serif`; ctx.letterSpacing = '0px'; ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillText(sub, x, y + ph / 2 + 0.5); x += m[1] + gap;
          if (gold) { ctx.font = `800 ${fs * k}px Outfit, system-ui, sans-serif`; ctx.fillStyle = '#ffd95a'; ctx.fillText(gold, x, y + ph / 2 + 0.5); x += m[2] + gap; }
          if (dots) for (let i = 0; i < dots[1]; i++) { ctx.beginPath(); ctx.arc(x + dr + i * dr * 2.6, y + ph / 2, dr * 0.8, 0, TAU); if (i < dots[0]) { ctx.fillStyle = dot; ctx.fill(); } else { ctx.strokeStyle = OD.rgba(dot, 0.6); ctx.lineWidth = 1; ctx.stroke(); } }   // planets to switch before the next biome
          ctx.restore();
        };
        // the planet pill: when you leave a planet its pill is taken away with it, in the direction it drifts; the new planet's name and
        // modifiers arrive as a title that glides down into the pill's place (S.dock)
        let pa = 1, pdx = 0, pdy = 0; const sv = S.vis, dk = S.dock;
        if (sv && sv.phase === 'settle' && S.old) { const e = Math.pow(clamp(sv.st / 0.75, 0, 1), 1.7); pa = 1 - e; pdx = S.old.vx * e * 220 * u; pdy = S.old.vy * e * 220 * u; }
        else if (dk) pa = OD.smooth(clamp((dk.t - 1.55) / 0.35, 0, 1));
        if (pa > 0.01) { ctx.save(); ctx.translate(pdx, pdy); row(by, ty.color, ty.name, ty.pill || ty.bonus || '', bonusPct(planetMul(ty)), null, pa); ctx.restore(); }
        if (dk) {
          const q = clamp((dk.t - 0.85) / 1.0, 0, 1), e = smoother(q), a0 = OD.smooth(clamp(dk.t / 0.3, 0, 1)), a = a0 * (1 - OD.smooth(clamp((dk.t - 1.55) / 0.35, 0, 1)));
          const x0 = cx, y0 = cy + R[OUT] + 46 * u, x1 = cx, y1 = by + ph / 2, X = lerp(x0, x1, e), Y = lerp(y0, y1, e), k1 = lerp(1, 0.5, e);
          ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = a;
          if (T().fx && OD.Q().shadow) { ctx.shadowColor = OD.rgba(dk.type.color, 0.7); ctx.shadowBlur = 12 * (1 - e); }
          ctx.font = `800 ${21 * u * k1}px Outfit, system-ui, sans-serif`; ctx.letterSpacing = (3 * k1) + 'px'; ctx.fillStyle = '#fff'; ctx.fillText(dk.type.name, X, Y);
          ctx.shadowBlur = 0; ctx.globalAlpha = a * (1 - OD.smooth(clamp(q * 1.6, 0, 1)));   // the modifiers line folds away as the title settles into the pill
          ctx.font = `500 ${11.5 * u * k1}px Outfit, system-ui, sans-serif`; ctx.letterSpacing = '0px'; ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.fillText(dk.type.bonus || '', X, Y + 19 * u * k1 * (1 - e));
          ctx.restore(); ctx.letterSpacing = '0px';
        }
        row(by - ph - 5 * u, world.accent, world.short.toUpperCase(), world.pill || '', bonusPct((world.mods && world.mods.scoreMul) || 1), [clamp(S.stats.hops - (S.biomeAt - OD.biomeStay(S.biomeN)), 0, 9), OD.biomeStay(S.biomeN)]);
        ctx.restore();
      }
      { const bs = S.dir.boss;   // the black hole: how many orbits are left, and how long the fight has run
        if (bs && bs.kind === 'singularity' && !S.win) {
          const ty = y0 + sz * 2.2, left = OUT - bs.minO + 1, hot = bs.warnQ > 0 && !bs.eat, bl = hot ? 0.55 + 0.45 * Math.sin(tAnim * (9 + 12 * bs.warnQ)) : 1;
          ctx.save(); ctx.textAlign = 'center'; ctx.globalAlpha = clamp(bs.e * 1.2, 0, 1);
          ctx.fillStyle = hot ? '#ff9ab0' : 'rgba(255,255,255,0.8)'; ctx.font = `800 ${sz * 0.2}px Outfit, system-ui, sans-serif`; ctx.letterSpacing = '3px';
          ctx.fillText(left === 1 ? 'ONE ORBIT LEFT' : 'THE BLACK HOLE', cx, ty - sz * 0.42);
          ctx.letterSpacing = '0px';
          const n = NB, gap = sz * 0.32, x0 = cx - (n - 1) * gap / 2;
          for (let i = 0; i < n; i++) {
            const alive = i >= bs.minO, going = i === bs.minO && hot, eating = bs.eat && i === bs.eat.o, x = x0 + i * gap;
            ctx.fillStyle = eating ? '#ffd9a0' : going ? `rgba(255,106,138,${bl})` : alive ? '#fff' : 'rgba(255,255,255,0.14)';
            ctx.beginPath(); ctx.arc(x, ty, sz * (going ? 0.1 : 0.075), 0, TAU); ctx.fill();
          }
          const bw = sz * 2.4, total = BH.EAT[BH.EAT.length - 1] + BH.EATD + BH.LAST; ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(cx - bw / 2, ty + sz * 0.2, bw, 3);
          ctx.fillStyle = hot ? '#ff6a8a' : '#c9a0ff'; ctx.fillRect(cx - bw / 2, ty + sz * 0.2, bw * clamp(bs.t / total, 0, 1), 3);
          ctx.restore();
        } }
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
        const k = S.multT > 0 ? clamp(S.multT / MULT_HOLD, 0, 1) : clamp((S.mult - 1) / 1.5, 0, 0.3);
        ctx.save(); rr(); ctx.clip(); ctx.fillStyle = OD.rgba(world.accent2, 0.28); ctx.fillRect(px, py, pw * k, ph); ctx.restore();
      }
      rr(); ctx.lineWidth = 1.5; ctx.strokeStyle = hot ? OD.rgba(world.accent2, 0.8) : 'rgba(255,255,255,0.18)'; ctx.stroke();
      ctx.textBaseline = 'middle'; ctx.fillStyle = hot ? '#fff' : 'rgba(255,255,255,0.45)';
      ctx.fillText(label, cx, my + 1);
      ctx.restore(); ctx.letterSpacing = '0px'; ctx.textBaseline = 'alphabetic';
      const fy = py + ph + sz * 0.42;
      if (trickBelow()) {   // the player's choice: tricks sit below the outermost orbit, clear of the dot, centred in the gap above the bottom pills
        const fs2 = Math.max(8.5, Math.min(sz * 0.2, W * 0.03)), ph2 = fs2 * 2.1, pillsTop = H - Math.max(14, safeTop * 0.4) - ph2 - ph2 - 5 * u, orbitEnd = cy + R[OUT] * vz;
        drawTrickPops(cx, (orbitEnd + pillsTop) / 2 - 8 * u, true);
      }   // the player's choice: tricks sit under the multiplier, away from the dot
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
    // what you are carrying: a stack in the bottom-left corner, each row an icon with its timer ring, a short name and a count. Rows slide in and out.
    // three kinds, three looks: TIMED (a ring that drains, with the seconds left; picking up another adds time), CHARGES (a full ring and ×N: shields,
    // guardian zaps, extra lives, boost jumps) and PERKS (a dashed ring and the level, for the whole run). One-shot powers have no row.
    const p = S.p, live = {};
    for (const k of TIMED) if (p[k] > 0) { const d1 = OD.POWERS[k].dur * (1 + 0.2 * pv('fuse')); live[k] = [Math.min(1, p[k] / d1), 0, 't', Math.ceil(p[k]) + 's']; }
    if (p.zap > 0) live.zap = [1, p.zap, 'c', '×' + p.zap];
    if (p.boostJ > 0) live.boost = [1, p.boostJ, 'c', '×' + p.boostJ];
    if (p.aegis > 0) live.aegis = [1, p.aegis, 'c', '×' + p.aegis];
    if (S.od > 0) live.nova = [S.od / S.odMax, 0, 't', Math.ceil(S.od) + 's'];
    for (const k in S.perks) if (S.perks[k] > 0) live['perk:' + k] = [1, S.perks[k], 'p', 'Lv ' + S.perks[k]];
    { const eq = OD.equippedMove(); if (eq) live['ab:' + eq] = [S.aE / 2, 0, 'a', S.aOn ? (eq === 'retro' ? 'SLOW' : 'BOOST') : S.aE < 1.97 ? Math.round(S.aE / 2 * 100) + '%' : 'READY']; }
    if (OD.ability('shock')) live['ab:shock'] = [1 - S.shockCd / 24, 0, 'a', S.shockCd > 0 ? Math.ceil(S.shockCd) + 's' : 'READY'];
    if (OD.ability('draw')) live['ab:draw'] = [1 - S.drawCd / 45, 0, 'a', S.drawCd > 0 ? Math.ceil(S.drawCd) + 's' : 'READY'];
    if (pv('hop')) live['ab:hop'] = [1 - S.hopCd / [0, 50, 40, 30][pv('hop')], 0, 'a', S.hopCd > 0 ? Math.ceil(S.hopCd) + 's' : 'READY'];
    for (const k in live) { S.hudLast[k] = live[k]; if (S.hudA[k] == null) { S.hudA[k] = 0; S.hudX[k] = null; } }
    const keys = Object.keys(S.hudA);
    for (const k of keys) { S.hudA[k] += ((live[k] ? 1 : 0) - S.hudA[k]) * 0.18; if (!live[k] && S.hudA[k] < 0.02) { delete S.hudA[k]; delete S.hudX[k]; delete S.hudLast[k]; } }
    const grp = k => { const l = S.hudLast[k]; return l ? { c: 0, t: 1, p: 2, a: 3 }[l[2]] : 1; };
    // The stack adapts to how much you carry. Up to five: one column of full rows (icon, name, count). More: it grows into compact cells (icon and
    // count only), two and then three across, so it never climbs far up the screen or reaches the middle where the trick text sits.
    const vis = Object.keys(S.hudA).sort((a, b) => grp(a) - grp(b)), n = vis.length, rowH = 27 * u, lx = 14 * u, base = H - Math.max(14, safeTop * 0.4) - 2 * (Math.max(8.5, Math.min(sz * 0.2, W * 0.03)) * 2.1) - 28 * u;
    const maxRows = clamp(Math.floor((base - (cy + R[OUT] * vz * 0.45)) / rowH) + 1, 3, 6);
    const cols = n <= Math.min(5, maxRows) ? 1 : Math.min(3, Math.ceil(n / Math.min(maxRows, 4))), compact = cols > 1, cellW = (cols === 2 ? 54 : 46) * u, rh = compact ? 25 * u : rowH;
    const top = base - 4 * rowH;   // the list starts at a fixed top and grows downward, so the first pickup always sits at the top
    const slot = i => compact ? [lx + (i % cols) * cellW, top + Math.floor(i / cols) * rh] : [lx, top + i * rowH];
    const r0 = 9.5 * u; { const [nx, ny] = slot(n); S.hudNext = [nx + r0, ny]; }
    ctx.save(); ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.translate(-hs * 220 * u, hs * 150 * u);   // the stack drifts off to the left
    vis.forEach((k, i) => {
      const [tx, ty] = slot(i), cur = S.hudX[k];
      S.hudX[k] = cur == null ? [tx, ty] : [cur[0] + (tx - cur[0]) * 0.22, cur[1] + (ty - cur[1]) * 0.22];   // when the layout changes, cells glide to their new places
      const y = S.hudX[k][1], bx = S.hudX[k][0];
      S.hudPos = S.hudPos || {}; S.hudPos[k] = [bx + r0, y];
      const [f, cnt, kind, lab] = S.hudLast[k], isPerk = kind === 'p', isAb = kind === 'a', a = S.hudA[k], pk = isPerk ? k.slice(5) : isAb ? k.slice(3) : k, pw = OD.POWERS[pk] || (isAb && OD.PERK_BY_ID[pk]) || {}, col = k === 'nova' ? '#fff6c8' : (pw.color || '#fff');
      const SHORT = { nova: 'Overload', life: 'Lives', boost: 'Boost', zap: 'Guard', amp: 'Amp', sense: 'Sense', calm: 'Steady', lucky_star: 'Lucky', daredevil: 'Dare', momentum: 'Moment', alchemy: 'Alchemy' }, name = SHORT[k] || SHORT[pk] || pw.short || pw.name || pk;
      const low = live[k] && kind === 't' && f < 0.25, bl = low ? 0.68 + 0.32 * Math.sin(tAnim * 11) : 1, x = bx + (1 - a) * -26 * u, r = (compact ? 8.8 : 9.5) * u, fs = (compact ? 8.2 : 8.6) * u;
      ctx.save(); ctx.globalAlpha = bl * a;
      const nw = compact ? 0 : (ctx.font = `700 ${fs}px Outfit, system-ui, sans-serif`, ctx.letterSpacing = '0.6px', ctx.measureText(name).width);
      const pu = (S.hudPulse && S.hudPulse[k]) || 0, cx2 = x + r;
      const rr = (x0, y0, w0, h0, r0) => { ctx.beginPath(); ctx.moveTo(x0 + r0, y0); ctx.arcTo(x0 + w0, y0, x0 + w0, y0 + h0, r0); ctx.arcTo(x0 + w0, y0 + h0, x0, y0 + h0, r0); ctx.arcTo(x0, y0 + h0, x0, y0, r0); ctx.arcTo(x0, y0, x0 + w0, y0, r0); ctx.closePath(); };
      ctx.font = `800 ${fs}px Outfit, system-ui, sans-serif`; ctx.letterSpacing = '0px';
      const lw = lab ? ctx.measureText(lab).width : 0, chipW = lab ? lw + 9 * u : 0, pillW = compact ? r * 2 + 4 * u : r * 2 + 8 * u + nw + (lab ? 6 * u + chipW : 0) + 4 * u;
      if (!compact) {   // a soft glass pill behind the row, tinted with the power's colour and fading out to the right
        const pg = ctx.createLinearGradient(x - 3 * u, y, x - 3 * u + pillW, y); pg.addColorStop(0, OD.rgba(col, 0.2)); pg.addColorStop(0.6, 'rgba(8,14,40,0.45)'); pg.addColorStop(1, 'rgba(8,14,40,0)');
        rr(x - 3 * u, y - r - 2.5 * u, pillW, r * 2 + 5 * u, r + 2.5 * u); ctx.fillStyle = pg; ctx.fill();
        ctx.strokeStyle = OD.rgba(col, 0.28); ctx.lineWidth = 1; ctx.stroke();
      }
      // the icon sits in a dark glass disc with a glow, wrapped by its ring (a timer, a full ring for charges, a dashed ring for perks)
      ctx.globalCompositeOperation = 'lighter'; G.glow(ctx, cx2, y, r * 2.2, col, 0.22 + 0.2 * pu); ctx.globalCompositeOperation = 'source-over';
      const dg = ctx.createRadialGradient(cx2, y - r * 0.3, 0, cx2, y, r); dg.addColorStop(0, OD.rgba(col, 0.28)); dg.addColorStop(1, 'rgba(6,10,32,0.85)');
      ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(cx2, y, r, 0, TAU); ctx.fill();
      ctx.lineCap = 'round'; ctx.lineWidth = 2.2 * u; ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.beginPath(); ctx.arc(cx2, y, r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = col; if (isPerk) ctx.setLineDash([2.2 * u, 2.2 * u]); ctx.beginPath(); ctx.arc(cx2, y, r, -Math.PI / 2, -Math.PI / 2 + (live[k] ? f : 0) * TAU); ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = 'butt';
      drawPowerIcon(ctx, k === 'nova' ? 'overload' : pk, cx2, y, (compact ? 5.6 : 6.0) * u * (1 + 0.5 * pu), '#ffffff'); drawPowerIcon(ctx, k === 'nova' ? 'overload' : pk, cx2, y, (compact ? 5.6 : 6.0) * u * (1 + 0.5 * pu), OD.rgba(col, 0.55));
      if (pu > 0.02) { ctx.globalCompositeOperation = 'lighter'; G.glow(ctx, cx2, y, (14 + 14 * pu) * u, col, 0.8 * pu); ctx.globalCompositeOperation = 'source-over'; }
      ctx.shadowColor = 'rgba(2,4,18,0.8)'; ctx.shadowBlur = 4 * u;
      if (!compact) { ctx.font = `700 ${fs}px Outfit, system-ui, sans-serif`; ctx.letterSpacing = '0.6px'; ctx.fillStyle = '#fff'; ctx.fillText(name, x + r * 2 + 6 * u, y + 0.5); }
      if (lab) {   // the count or the time, in a small tinted chip
        const lc = kind === 't' ? (low ? '#ff9a8a' : '#ffffff') : kind === 'a' ? (lab === 'READY' ? '#8affb0' : lab === 'SLOW' || lab === 'BOOST' ? '#ffd95a' : 'rgba(255,255,255,0.75)') : '#ffd95a', cxp = compact ? x + r * 2 + 3 * u : x + r * 2 + 6 * u + nw + 6 * u;
        ctx.shadowBlur = 0;
        if (!compact) { rr(cxp, y - fs * 0.85, chipW, fs * 1.7, fs * 0.85); ctx.fillStyle = OD.rgba(lc.startsWith('rgba') ? '#ffffff' : lc, 0.16); ctx.fill(); }
        ctx.font = `800 ${fs}px Outfit, system-ui, sans-serif`; ctx.letterSpacing = '0px'; ctx.fillStyle = lc; ctx.shadowBlur = compact ? 4 * u : 0; ctx.fillText(lab, compact ? cxp : cxp + 4.5 * u, y + 0.5);
      }
      ctx.restore();
    });
    ctx.restore(); ctx.letterSpacing = '0px';
    if (S.flyers && S.flyers.length) {   // pickups in flight, from where you caught them to their place in the corner
      ctx.save();
      for (const f of S.flyers) {
        const tgt = (f.key && S.hudPos && S.hudPos[f.key]) || (f.key && S.hudNext) || [cx, safeTop + 40 * u], q = clamp(f.t / f.dur, 0, 1);
        const ee = 1 - Math.pow(1 - q, 2.2), mx = (f.x + tgt[0]) / 2 + f.side * 50 * u, my = (f.y + tgt[1]) / 2 - 40 * u;   // quick off the mark along a short arc
        const px = (1 - ee) * (1 - ee) * f.x + 2 * (1 - ee) * ee * mx + ee * ee * tgt[0], py = (1 - ee) * (1 - ee) * f.y + 2 * (1 - ee) * ee * my + ee * ee * tgt[1];
        f.trail.push([px, py]); if (f.trail.length > 7) f.trail.shift();
        ctx.globalCompositeOperation = 'lighter';
        f.trail.forEach(([tx, ty], j) => { const a = (j + 1) / f.trail.length; G.glow(ctx, tx, ty, (6 + 12 * a) * u, f.color, 0.5 * a * (1 - q * 0.5)); });
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1 - 0.25 * q;
        drawPowerIcon(ctx, f.type === "nova" ? "overload" : f.type, px, py, (12 - 4 * q) * u, f.color);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
    ctx.restore();

    // banner / tutorial text
    ctx.save(); ctx.textAlign = 'center';
    if (S.bannerT > 0 && S.banner && !S.intro) {
      const k = S.bannerT / 2.2, a = Math.min(1, (1 - k) * 8, k * 3), maxW = Math.min(W * 0.66, 300 * Math.max(1, u * 0.9)), bx = W / 2;   // a narrow column in the middle, never out towards the sides
      // long titles and subtitles wrap onto at most three lines, shrinking if they still do not fit
      const fit = (str, base, weight, spacing, maxLines) => {
        let size = base, lines;
        for (let i = 0; i < 12; i++) {
          ctx.font = `${weight} ${size}px Outfit, system-ui, sans-serif`; ctx.letterSpacing = (spacing * size) + 'px';
          const words = str.split(' '); lines = []; let cur = '';
          for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
          if (cur) lines.push(cur);
          if (lines.length <= maxLines && lines.every(l => ctx.measureText(l).width <= maxW)) break;
          size *= 0.92;
        }
        return { lines, size };
      };
      // where it goes: below the orbits if there is room, otherwise the nearest free place, never over the stack of power-ups in the corner, the bottom
      // information, the score and its notes at the top, the planet in the middle or a planet drifting in. If nothing is free it is set a little smaller.
      let T, Sb, tlh, slh, blockH, y = 0;
      for (const sc of [1, 0.86, 0.74]) {
        T = fit(S.banner.str, sz * 0.4 * sc, 600, 0.26, 2); Sb = fit(S.banner.sub || '', sz * 0.27 * sc, 400, 0.04, 2);
        tlh = T.size * 1.25; slh = Sb.size * 1.35; blockH = T.lines.length * tlh + 22 + (S.banner.sub ? Sb.lines.length * slh : 0);
        const widest = Math.max(...T.lines.map(l => (ctx.font = `600 ${T.size}px Outfit, system-ui, sans-serif`, ctx.letterSpacing = (0.26 * T.size) + 'px', ctx.measureText(l).width)), ...Sb.lines.map(l => (ctx.font = `400 ${Sb.size}px Outfit, system-ui, sans-serif`, ctx.letterSpacing = (0.04 * Sb.size) + 'px', ctx.measureText(l).width)), 10) + 14 * u;
        const bl0 = bx - widest / 2, bl1 = bx + widest / 2, hit = yy => {   // does a block whose first baseline is yy touch something?
          const t0 = yy - T.size, t1 = yy - T.size + blockH + 4;
          if (t1 > H - 112 * u || t0 < safeTop + sz * 1.1 + 104 * u) return true;
          if (n > 0 && bl0 < lx + (compact ? cols * cellW : 168 * u) + 6 * u && t1 > top - 8 * u && t0 < top + n * rowH + 8 * u) return true;
          if (!bossCap()) { const dx = Math.max(bl0 - cx, 0, cx - bl1), dy = Math.max(t0 - cy, 0, cy - t1); if (Math.hypot(dx, dy) < PR * 1.3 + 8 * u) return true; }   // the planet in the middle
          if (S.vis && S.vis.rho) { const dx = Math.max(bl0 - S.vis.x, 0, S.vis.x - bl1), dy = Math.max(t0 - S.vis.y, 0, S.vis.y - t1); if (Math.hypot(dx, dy) < S.vis.rho * 1.15 + 16 * u) return true; }
          return false;
        };
        const y0b = Math.min(cy + R[OUT] + sz * 1.7, H - 120 * u - blockH); y = y0b; let found = !hit(y);
        if (S.bannerTgt != null && S.bannerSc === sc && !hit(S.bannerTgt)) { y = S.bannerTgt; found = true; }   // keep the place it has, while it is still free: no hopping between candidates
        for (let d = 12 * u; d < H && !found; d += 12 * u) for (const yy of [y0b - d, y0b + d]) if (!hit(yy)) { y = yy; found = true; break; }
        S.bannerSc = sc;
        if (found) break;
        y = y0b;
      }
      S.bannerTgt = y;   // where it wants to be; what is drawn glides there, so a moving planet or a changing stack never makes it jump
      S.bannerY = S.bannerY == null ? y : S.bannerY + (y - S.bannerY) * Math.min(1, 7 * Math.min(0.05, fpsDt || 1 / 60));
      const ein = OD.smooth(clamp((1 - k) / 0.22, 0, 1)), accent = world.accent || '#9fe8ff';   // it rises a little as it fades in
      y = S.bannerY + (1 - ein) * 7 * u;
      ctx.globalAlpha = a; ctx.textBaseline = 'alphabetic';
      ctx.save(); ctx.shadowColor = 'rgba(160,220,255,0.5)'; ctx.shadowBlur = 14 * u; ctx.fillStyle = '#fff';
      ctx.font = `600 ${T.size}px Outfit, system-ui, sans-serif`; ctx.letterSpacing = (0.26 * T.size) + 'px';
      T.lines.forEach((l, i) => ctx.fillText(l, bx + 0.13 * T.size, y + i * tlh));   // (the spacing trails after the last letter, so it is nudged back to the middle)
      ctx.restore();
      y += (T.lines.length - 1) * tlh + 15 * u;
      if (S.banner.sub) {
        const lw = 26 * u * ein; ctx.globalAlpha = a * 0.7; ctx.fillStyle = accent; ctx.fillRect(bx - lw, y - 5 * u, lw * 2, 1.2 * u);   // a thin line that opens from the middle
        y += 13 * u; ctx.globalAlpha = a;
        ctx.letterSpacing = (0.04 * Sb.size) + 'px'; ctx.fillStyle = 'rgba(214,232,255,0.78)'; ctx.font = `400 ${Sb.size}px Outfit, system-ui, sans-serif`;
        Sb.lines.forEach((l, i) => ctx.fillText(l, bx + 0.02 * Sb.size, y + i * slh));
      }
      ctx.letterSpacing = '0px';
    }
    if (S.tut >= 0) {
      const msgs = [['TAP', 'to flip direction', 3 - S.stats.flips > 0 ? `${Math.max(0, 3 - S.stats.flips)} more` : ''],
        ['SWIPE', 'away from the planet = bigger orbit, towards it = tighter', ''],
        ['GRAZE', 'skim close to debris to build your combo', '']];
      const m = msgs[S.tut];
      ctx.globalAlpha = 0.75 + 0.25 * Math.sin(tAnim * 5);
      ctx.fillStyle = '#fff'; ctx.font = `600 ${sz * 0.52}px Outfit, system-ui, sans-serif`; ctx.letterSpacing = '0.3em';
      ctx.fillText(m[0], cx, cy + R[OUT] + sz * 1.7); ctx.letterSpacing = '0px';
      ctx.globalAlpha = 0.85; ctx.fillStyle = world.accent; ctx.font = `500 ${Math.min(17, W * 0.044)}px Outfit, system-ui, sans-serif`;
      ctx.fillText(m[1] + (m[2] ? '  ·  ' + m[2] : ''), cx, cy + R[OUT] + sz * 2.15);
      // animated finger hint
      const fy = Math.min(H - 70, cy + R[OUT] + sz * 3.2), ph = (tAnim * 1.2) % 1;
      ctx.globalAlpha = 0.9; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.4;
      if (S.tut === 0) { ctx.beginPath(); ctx.arc(cx, fy, 14 + ph * 22, 0, TAU); ctx.globalAlpha = 0.8 * (1 - ph); ctx.stroke(); ctx.globalAlpha = 0.9; }
      else if (S.tut === 1) { const hold = Math.min(1, ph * 1.6), sl = ph > 0.55 ? Math.sin((ph - 0.55) / 0.45 * Math.PI) * -26 : 0; ctx.beginPath(); ctx.arc(cx, fy + sl, 15, -Math.PI / 2, -Math.PI / 2 + hold * TAU); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(cx, fy + sl, 15, 0, TAU); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(cx, fy + (S.tut === 1 && ph > 0.55 ? Math.sin((ph - 0.55) / 0.45 * Math.PI) * -26 : 0), 6, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawOverlayFX() {
    if (!S) return;
    const fl = S.flash > 0.02 ? Math.min(0.55, S.flash * 0.5) : 0, fe = fxLayer('flash', 'left:0;top:0;width:100%;height:100%;background:#fff;');
    if (fe) { const o = fl.toFixed(3); if (fe._v !== o) { fe._v = o; fe.style.opacity = o; } }
    if (S.hitFx) {   // the edge pulse of a hit
      const f = S.hitFx; f.t += Math.min(0.05, fpsDt || 1 / 60); const k = 1 - f.t / 0.65;
      if (k <= 0) S.hitFx = null; else { const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.max(W, H) * 0.72), a = 0.5 * f.k * k * k; g.addColorStop(0, `rgba(${f.rgb},0)`); g.addColorStop(1, `rgba(${f.rgb},${Math.min(0.75, a)})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    }
    if (S.aFx > 0.02) {   // a slight cold or hot light creeps in from the edges while Retro Thrust or Afterburner is on
      const cold = S.aFxEq === 'retro', g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.78), al = (cold ? 0.16 : 0.24) * S.aFx * (cold ? 1 : 0.88 + 0.12 * Math.sin(tAnim * 30));
      g.addColorStop(0, cold ? 'rgba(120,190,255,0)' : 'rgba(255,130,50,0)'); g.addColorStop(1, cold ? `rgba(120,190,255,${al})` : `rgba(255,130,50,${al})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (S.p.stasis > 0) {   // time is frozen: a cold light creeps in from the edges
      const k = Math.min(1, S.p.stasis * 2, (OD.POWERS.stasis.dur - S.p.stasis) * 3 + 0.2), g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(140,210,255,0)'); g.addColorStop(1, `rgba(140,210,255,${0.24 * k})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
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
      if (OD.Q().adapt && avg > 0.026 && state === 'play' && Math.min(dprCap, OD.Q().dprCap) > 1) { dprCap = Math.min(dprCap, OD.Q().dprCap) > 2.2 ? 2 : Math.min(dprCap, OD.Q().dprCap) > 1.5 ? 1.5 : 1; resize(); }   // (Ultra never does this)
      else if (OD.Q().adapt && avg > 0.04 && state === 'play' && dprCap <= 1 && T().fx && !perfFxOff) { perfFxOff = true; T().fx = false; OD.persist(); }   // still slow at the lowest resolution: the fancy effects go too
      perfAcc = 0; perfN = 0; perfT = 0;
    }
    dt = Math.min(dt, 0.05);
    tAnim += dt;
    { const inRunNow = S && state !== 'menu', flow = inRunNow && S.bgFrom && S.bgT < 1 ? 1 + 2.4 * Math.sin(Math.PI * S.bgT) : 1;
      skyV += (((inRunNow ? (S.driftDir || 1) : 1) * (inRunNow ? 12 : 8) * u * flow * (1 - 0.55 * (inRunNow ? S.slowV || 0 : 0))) - skyV) * Math.min(1, dt * 1.2); skyX += skyV * dt; }
    const jt0 = performance.now();
    try {
      if (S && (state === 'pausing' || state === 'play') && S.pz < 1 || state === 'pausing') {
        // pausing eases time down in a third of a second; resuming eases it back up over about a second, no countdown
        if (state === 'pausing') { S.pz = Math.max(0, S.pz - dt / 0.35); if (S.pz <= 0) { state = 'paused'; S.pauseAt = S.useAudio ? OD.audio.time() : null; OD.ui.show('pause'); } }   // the music keeps playing, muffled
        else S.pz = Math.min(1, S.pz + dt / 1.0);
      }
      if (state === 'play' || state === 'pausing' || state === 'dying' || state === 'ended') { if (S) pf('update', () => update(dt * (S.pz < 1 ? S.pz * S.pz * (3 - 2 * S.pz) : 1))); }
      { const want = state === 'menu' ? MENU_Z : state === 'pausing' || state === 'paused' || state === 'ended' ? PAUSE_Z : 1; vz += (want - vz) * (1 - Math.exp(-dt * (want > vz ? 4.2 : 5.5))); if (Math.abs(want - vz) < 0.0008) vz = want; }
      if (S && state !== 'menu') { const want = state === 'pausing' || state === 'paused' ? 0 : 1; if (S.hudIn == null) S.hudIn = 0; S.hudIn += (want - S.hudIn) * (1 - Math.exp(-dt * (want ? (S.real > 0.3 ? 4.5 : 0) : 8))); }
      pf('scene', drawScene);
      pf('world', drawWorld);
      pf('hopfx', drawHopFx);
      pf('fog', drawFog);
      pf('slowvig', drawSlowVignette);
      if (S && state !== 'menu') { if (state !== 'ended') pf('hud', drawHUD); pf('overlay', drawOverlayFX); if (S.win) drawWinOverlay(); }
    } catch (e) {
      console.error(e);
      if (OD.debug) throw e;
      cv.width = cv.width; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);   // a failed frame must never leave stray canvas state behind
    }
    // ?fps shows the frame rate and how long the game's own JavaScript took per frame
    if (SHOW_FPS_Q || T().fps) {
      fpsJs += ((performance.now() - jt0) - fpsJs) * 0.1; fpsDt += (dt - fpsDt) * 0.1;
      ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(6, H - 62, 250, 56);
      const E = k => ((profAcc[k] && profAcc[k].ema) || 0).toFixed(1);
      ctx.fillStyle = '#9fffd0'; ctx.font = '600 11px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('update ' + E('update') + '  scene ' + E('scene') + '  world ' + E('world') + '  hud ' + E('hud') + ' ms', 12, H - 58);
      ctx.fillStyle = '#9fffd0'; ctx.font = '600 12px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(Math.round(1 / fpsDt) + ' fps  ' + (fpsDt * 1000).toFixed(0) + ' ms/frame  ' + fpsJs.toFixed(1) + ' ms JS', 12, H - 42); ctx.fillText((T().quality || 'high') + '  dpr ' + dpr.toFixed(2) + (dpr < (window.devicePixelRatio || 1) - 0.01 ? ' of ' + (window.devicePixelRatio || 1).toFixed(2) + (OD.Q().adapt && dprCap < OD.Q().dprCap ? ' (lowered by itself)' : '') : ' (full)'), 12, H - 24); ctx.restore();
    }
  }

  // ------------------------------------------------------------- public api
  function bindInput() {
    cv.addEventListener('pointerdown', e => {
      if (state !== 'play') return;
      e.preventDefault();
      if (pointerId !== null && e.isPrimary && e.pointerId !== pointerId) { pointerId = null; inputUp(); }   // the last touch ended without telling us (a system gesture, the edge of the screen): this is a new one
      if (pointerId !== null) { if (e.pointerId !== pointerId) { e.preventDefault(); const nt = performance.now(); if (nt - downT0 < 160) fireDraw(); } return; }
      downT0 = performance.now(); pointerId = e.pointerId; downY = e.clientY; downX = e.clientX; ptrX = e.clientX; ptrY = e.clientY;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
      inputDown();
    });
    cv.addEventListener('pointermove', e => {
      if (e.pointerId !== pointerId || state !== 'play' || !S) return;
      ptrX = e.clientX; ptrY = e.clientY;
      trySwipe(); abDrag();
      if (Math.hypot(ptrX - downX, ptrY - downY) > DRAG_PX && S.p.holding && S.p.charging) S.p.dragging = true;   // sliding while aiming picks the orbit
    });
    const up = e => { if (e.pointerId !== pointerId) return; pointerId = null; inputUp(); };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('lostpointercapture', up);
    window.addEventListener('blur', () => { if (pointerId !== null) { pointerId = null; inputUp(); } });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => {
      if (e.code === 'Space' && !e.repeat && state === 'play') { e.preventDefault(); keyDown = true; inputDown(); }
      else if ((e.code === 'ArrowUp' || e.code === 'KeyW') && state === 'play') { e.preventDefault(); keyHop(1); }
      else if ((e.code === 'ArrowDown' || e.code === 'KeyS') && state === 'play') { e.preventDefault(); keyHop(-1); }
      else if ((e.code === 'Escape' || e.code === 'KeyP') && state === 'play') OD.ui.pause();
    });
    window.addEventListener('keyup', e => {
      if (e.code === 'Space' && keyDown) { keyDown = false; inputUp(); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') OD.ui.pause(); });
    window.addEventListener('blur', () => { if (state === 'play') OD.ui.pause(); });
  }

  function initMenuDots() {
    menuDots = [0, 1, 2, 1].map((o, i) => ({ o: Math.min(o, OUT), th: i * 1.7, dir: i % 2 ? -1 : 1, v: 55 + i * 12, trail: [], a: 0.95 }));
  }

  const api = {
    init(canvas) {
      cv = canvas; ctx = cv.getContext('2d');
      if (!/[?&]nogl\b/.test(location.search)) OD.glr.init(document.getElementById('gl'));
      resize(); window.addEventListener('resize', resize);
      bindInput(); initMenuDots();
      lastT = performance.now(); requestAnimationFrame(frame);
    },
    setWorld() {},
    get world() { return world; },
    get state() { return state; },
    get run() { return S; },
    menu() {
      state = 'menu'; S = null;
      const pool0 = planetPool(0, null);
      nextMusic = world = OD.WORLDS[0];   // the game always opens in Aurora Reach, and so does every run
      menuSkin = 'terra'; setOrbits(menuSkin); cx = W / 2; void pool0;
      OD.audio.stopMusic();
      if (OD.audio.ready() || OD.audio.init()) OD.audio.startMusic(nextMusic, { menu: true });
      OD.audio.setMuffle(0);
    },
    speedTest() {   // how fast this phone really draws, for the Settings > Speed test report
      const dp = Math.min(window.devicePixelRatio || 1, 2), w = Math.round(innerWidth * dp), h = Math.round(innerHeight * dp), mk = (a, b) => { const c = document.createElement('canvas'); c.width = a; c.height = b; return c; };
      const out = {}, c = mk(w, h), g = c.getContext('2d'), src = mk(w, h), sg = src.getContext('2d'), gr = sg.createLinearGradient(0, 0, w, h);
      gr.addColorStop(0, '#46f'); gr.addColorStop(1, '#f4a'); sg.fillStyle = gr; sg.fillRect(0, 0, w, h);
      const time = f => { const t = performance.now(); f(); g.getImageData(0, 0, 1, 1); return +(performance.now() - t).toFixed(1); };
      out['12 full-screen layers'] = time(() => { for (let i = 0; i < 12; i++) { g.globalCompositeOperation = i % 2 ? 'lighter' : 'source-over'; g.globalAlpha = 0.5; g.drawImage(src, 0, 0); } g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; });
      out['300 small images'] = time(() => { for (let i = 0; i < 300; i++) g.drawImage(src, (i * 37) % (w - 60), (i * 91) % (h - 60), 48, 48, (i * 53) % (w - 60), (i * 29) % (h - 60), 48, 48); });
      out['120 soft glows'] = time(() => { for (let i = 0; i < 120; i++) { const x = (i * 61) % w, y = (i * 43) % h, rg = g.createRadialGradient(x, y, 0, x, y, 60); rg.addColorStop(0, 'rgba(255,255,255,.4)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(x - 60, y - 60, 120, 120); } });
      out['60 shadowed shapes'] = time(() => { g.shadowColor = '#fff'; g.shadowBlur = 8; g.fillStyle = '#fc6'; for (let i = 0; i < 60; i++) { g.beginPath(); g.arc((i * 71) % w, (i * 53) % h, 10, 0, 6.3); g.fill(); } g.shadowBlur = 0; });
      out['80 texts'] = time(() => { g.font = '700 16px sans-serif'; g.fillStyle = '#fff'; for (let i = 0; i < 80; i++) g.fillText('Close call +35', (i * 17) % w, (i * 29) % h); });
      out.screen = innerWidth + 'x' + innerHeight + ' @' + (window.devicePixelRatio || 1);
      out.cores = navigator.hardwareConcurrency || '?'; out.memory = navigator.deviceMemory || '?';
      out.engine = (navigator.userAgent.match(/Chrome\/[\d.]+/) || ['?'])[0] + (/; wv\)/.test(navigator.userAgent) ? ' (WebView)' : '');
      out.native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
      out.audio = OD.audio && OD.audio.ready && OD.audio.ready() ? 'running' : 'off';
      return out;
    },
    applyQuality() { dprCap = 4; perfFxOff = false; if (cv) resize(); },
    start: startRun,
    restart() { startRun(S ? S.mode : mode); },
    pause() {
      if (state !== 'play' || S.over) return false;
      state = 'pausing';
      if (S.p.charging) { S.p.charging = false; S.p.holding = false; }
      pointerId = null; OD.audio.setMuffle(0.96);
      return true;
    },
    resume() {
      if (state !== 'paused' && state !== 'pausing') return;
      if (state === 'paused' && S && S.pauseAt != null) {   // the music ran on while paused: move the clock back by whole bars so the beat grid stays on the music
        const at = OD.audio.time();
        if (at !== null) { const bar = 240 / OD.audio.bpm(S.musicWorld || world); S.clockOff = (S.clockOff || 0) - Math.floor(Math.max(0, at - S.pauseAt) / bar) * bar; }
        S.pauseAt = null; resyncBeat();
      }
      state = 'play'; OD.audio.resume(); OD.audio.setMuffle(0);   // time speeds back up from where it stopped
    },
    quit() { state = 'menu'; S = null; OD.ui.hideTile(); OD.audio.resume(); api.menu(); },
    drawPowerIcon,
    endIntro,
    resize,
    _profLast: () => Object.fromEntries(Object.entries(profAcc).map(([k, v]) => [k, +(v.last || 0).toFixed(1)])),
    _prof: () => Object.fromEntries(Object.entries(profAcc).map(([k, v]) => [k, +(v.ms / Math.max(1, v.n)).toFixed(2)])),
    _dbg: { endRun, banner, enterBiome, pickBiome, gapAt, U: () => u, flip, keyHop, fireShock, fireDraw, hpos, R: () => R, OUTN: () => OUT, lowO: () => lowO(), spawnPower, spawnSpear, spawnDevil, radial: radialDir, playerXY, startSettle, get world() { return world; }, get S() { return S; }, set S(v) { S = v; }, update, die: () => die(null, 'debug'), jump: () => doJump(false, true), target: () => jumpTarget(), cands: () => jumpCandidates(), setTrait: t => { setTrait(t); S.era.mix = 1; }, introduce, setOrbits, trick, destroy, absorb, hz: () => S.hz, spawn: { shoal: spawnShoal, devil: spawnDevil, blossom: spawnBloom, hail: spawnHail, serpent: spawnSerpent, rift: spawnRift, smallhole: spawnHole, ribbon: spawnRibbon, tether: spawnTether, cinder: spawnCinder, spear: spawnSpear, pylon: spawnPylon, shade: spawnShade, singularity: spawnSingularity, strike: spawnStrike, cloud: spawnCloud, rocks: spawnRocks, comets: spawnComets, mines: spawnMines, ring: spawnRing, beam: spawnBeam, hole: spawnHole, boss: spawnBoss, dust: spawnDust, power: spawnPower, vis: spawnVis, shower: evShower, bloom: evBloom, flare: evFlare, hole: evHole, nova: evNova, event: spawnEvent, overdrive: startOverdrive } },
    mode: () => mode,
  };
  return api;
})();
