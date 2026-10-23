'use strict';
// Shared helpers + persistence. Everything hangs off the OD namespace.
const OD = {};
OD.TAU = Math.PI * 2;
OD.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
OD.lerp = (a, b, t) => a + (b - a) * t;
OD.smooth = t => t * t * (3 - 2 * t);
OD.easeOut = t => 1 - Math.pow(1 - t, 3);
OD.angDiff = (a, b) => {
  let d = (a - b) % OD.TAU;
  if (d > Math.PI) d -= OD.TAU;
  if (d < -Math.PI) d += OD.TAU;
  return d;
};
OD.fmt = n => Math.floor(n).toLocaleString('en-US');

// Small fast seeded PRNG (mulberry32) for the daily run and wave layout.
OD.makeRng = seed => {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (a2, b) => a2 + f() * (b - a2);
  f.int = (a2, b) => Math.floor(a2 + f() * (b - a2 + 1));
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  f.sign = () => (f() < 0.5 ? -1 : 1);
  return f;
};

OD.hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
OD.hexRgb = hex => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
OD.rgba = (hex, a) => {
  const [r, g, b] = OD.hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

OD.todayKey = () => {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
};
OD.dayNumber = key => {
  const y = Math.floor(key / 10000), m = Math.floor(key / 100) % 100, d = key % 100;
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
};

// ---------------------------------------------------------------- save data
OD.SAVE_KEY = 'orbit-dodger.save.v1';
OD.defaultSave = () => ({
  stardust: 0,
  owned: { trail: ['classic'], core: ['orb'], aura: ['azure'], orbit: ['classic'], debris: ['rock'], sky: ['stars'], burst: ['classic'] },
  equipped: { trail: 'classic', core: 'orb', aura: 'azure', orbit: 'classic', debris: 'rock', sky: 'stars', burst: 'classic' },
  best: { endless: 0, hardcore: 0, timeattack: 0, zen: 0 },
  bestWorld: {},
  bestAny: 0,
  seenPlanets: {},
  world: 0,
  mode: 'endless',
  stats: {
    runs: 0, clutch: 0, razors: 0, transfers: 0, events: 0, holes: 0, novas: 0, assists: 0, time: 0, grazes: 0, dust: 0, jumps: 0, flips: 0, perfects: 0,
    deaths: 0, overdrives: 0, powerups: 0, bosses: 0, maxCombo: 0, zenTime: 0,
    dailies: 0, shares: 0, demoRuns: 0, tricks: 0, weaves: 0, zigs: 0, laps: 0, tcombo: 0,
  },
  ach: {},
  daily: { streak: 0, last: 0, bestDay: 0, bestScore: 0 },
  settings: { music: 0.8, sfx: 1, haptics: true, shake: true, clip: false, fx: true, fps: false, quality: 'high', aim: 'drag', tips: 'all', trickPos: 'dot' },
  aimAsked: false,
  tutorialDone: false,
  onboarded: false,
  bhPreview2: false,
  intro: {},
  mods: [],
  full: false,
  ghost: {},
  perks: {},
  sp: { bought: 0 },        // skill points bought with stardust
  path: null,               // the one skill path you committed to (until you reset)
  skillsV2: false,
  boosters: {},
  boosterOff: {},
  reshow: {}, lastReshow: {}, deathLog: [],
});
OD.save = (() => {
  let data = OD.defaultSave();
  try {
    const raw = localStorage.getItem(OD.SAVE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      const d = OD.defaultSave();
      data = Object.assign(d, p);
      for (const k of ['owned', 'equipped', 'best', 'stats', 'daily', 'settings', 'perks', 'sp', 'boosters', 'boosterOff']) data[k] = Object.assign(d[k], p[k] || {});
      for (const k of Object.keys(d.owned)) if (!Array.isArray(data.owned[k])) data.owned[k] = d.owned[k];
      delete data.owned.planet; delete data.equipped.planet;
      if (data.settings.trickPos === 'top') data.settings.trickPos = 'below';   // the old name of this choice
    }
  } catch (e) { /* corrupt save: start fresh */ }
  return data;
})();
OD.persist = () => {
  try { localStorage.setItem(OD.SAVE_KEY, JSON.stringify(OD.save)); } catch (e) { /* storage full or blocked */ }
};

// Free version: a fixed number of complete runs, then the paywall.
// TESTING: everything unlocked (full game, all planets, all cosmetics). Set to false before publishing.
// The black hole boss is switched off for now (add ?bh to the address to bring it back for testing).
OD.BLACK_HOLE = /[?&]bh\b/.test(location.search);
OD.TEST_BH = OD.BLACK_HOLE && !/[?&]nobh/.test(location.search);   // with ?bh, one arrives 3 seconds into every run
OD.TEST_DUST_AT = 5;   // testing: seconds into a run when the sky switches to Dust Belt (set to null before publishing)
// Graphics presets. High is the full look (the sky at full sharpness, sixty times a second); Balanced and Low trade some of it for speed.
OD.QUALITY = {
  high:     { dprCap: 2,   liveQ: 0.6,  liveStep: 1 / 40,     planetStep: 0.2, planetDiv: 3.0, planetMax: 90, auroraStep: 8,  auroraW: 24 },
  balanced: { dprCap: 1.5, liveQ: 0.45, liveStep: 1 / 30, planetStep: 0.12,  planetDiv: 2.8, planetMax: 80,  auroraStep: 10, auroraW: 30 },
  low:      { dprCap: 1,   liveQ: 0.35, liveStep: 1 / 20, planetStep: 0.18,  planetDiv: 3.6, planetMax: 56,  auroraStep: 14, auroraW: 40 },
};
OD.Q = () => OD.QUALITY[(OD.save && OD.save.settings && OD.save.settings.quality)] || OD.QUALITY.high;
OD.TEST_UNLOCK = !/[?&]nounlock/.test(location.search);
OD.FREE_RUNS = 5;
OD.freeLeft = () => (OD.save.full ? Infinity : Math.max(0, OD.FREE_RUNS - OD.save.stats.demoRuns));
