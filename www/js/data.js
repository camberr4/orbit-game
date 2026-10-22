'use strict';
// Static game content: worlds, modes, cosmetics, power-ups, challenges.

// Sectors of space, ordered from peaceful to deadly. Each has its own rules, bonuses and dangers.
//   risk: 1-5 stars     rules: world-wide rule ids (see eraIs in game.js)     mods: gameplay multipliers
OD.WORLDS = [
  {
    id: 0, name: 'Aurora Reach', short: 'Aurora', sub: 'A calm nursery of light', risk: 1, bpm: 108, root: 57, scale: [0, 3, 5, 7, 10],
    bg: ['#04091c', '#0a1a45'], accent: '#4df3ff', accent2: '#b36bff', danger: '#ff4d7a', neb: ['#2a63ff', '#8a3dff'], amb: 'ribbons',
    speed: 0.92, hazards: ['rock', 'comet', 'mine'], unlockScore: 0, planet: 'terra', rules: [],
    mods: { scoreMul: 1, dustMul: 1.6, evW: { bloom: 2.5 } },
    bonus: ['Plentiful stardust', 'More Stardust Blooms'], dangers: ['Asteroids', 'Comets', 'Pulse mines'],
  },
  {
    id: 1, name: 'Dust Belt', short: 'Dust Belt', sub: 'Rock fields and spinning blades', risk: 2, bpm: 112, root: 53, scale: [0, 2, 3, 7, 9],
    bg: ['#140d06', '#3a2410'], accent: '#ffcf7a', accent2: '#ff9a4d', danger: '#ff4d5e', neb: ['#c47a2a', '#7a3a12'], amb: 'dust',
    speed: 0.97, hazards: ['rock', 'comet', 'mine', 'spinner'], unlockScore: 1500, planet: 'moon', rules: [],
    mods: { scoreMul: 1.15, dustMul: 1.2, rockMul: 1.7, evW: { shower: 2.5 } },
    bonus: ['+15% score'], dangers: ['Crowded asteroid fields', 'Spinners: rotating blades', 'Meteor showers'],
  },
  {
    id: 2, name: 'Ember Rift', short: 'Ember Rift', sub: 'A star on its last breath', risk: 3, bpm: 118, root: 55, scale: [0, 3, 5, 6, 7, 10],
    bg: ['#150403', '#40100a'], accent: '#ffc24d', accent2: '#ff6a3d', danger: '#ff2f6a', neb: ['#ff5a1f', '#a3123a'], amb: 'embers',
    speed: 1.03, hazards: ['rock', 'comet', 'mine', 'ring', 'beam'], unlockScore: 2800, planet: 'lava', rules: ['molten'],
    mods: { scoreMul: 1.3, dustMul: 1.2, evW: { flare: 2.5 } },
    bonus: ['+30% score', 'Solar flares are common'], dangers: ['Pulse mines everywhere', 'Laser sweeps', 'Wall rings'],
  },
  {
    id: 3, name: 'Glacier Drift', short: 'Glacier', sub: 'Silent, sharp and slippery', risk: 3, bpm: 114, root: 60, scale: [0, 2, 4, 7, 9],
    bg: ['#021821', '#06404f'], accent: '#aef4ff', accent2: '#ffffff', danger: '#ff6fb5', neb: ['#18c7d9', '#3a7dff'], amb: 'snow',
    speed: 1.09, hazards: ['rock', 'comet', 'mine', 'ring', 'spinner', 'hole'], unlockScore: 4500, planet: 'ice', rules: ['frozen'],
    mods: { scoreMul: 1.35, dustMul: 1.3, evW: { giant: 2.5 } },
    bonus: ['+35% score', 'Gas giants drift past more often'], dangers: ['Slippery turns', 'Gravity wells', 'Ice blades'],
  },
  {
    id: 4, name: 'Pulsar Storm', short: 'Pulsar', sub: 'Lightning on a spinning star', risk: 4, bpm: 126, root: 50, scale: [0, 2, 3, 5, 7, 9, 10],
    bg: ['#0a0420', '#2a0a55'], accent: '#ff6ad5', accent2: '#5ad2ff', danger: '#ffd24d', neb: ['#ff2dd1', '#2d6bff'], amb: 'sparks',
    speed: 1.14, hazards: ['rock', 'comet', 'ring', 'beam', 'spinner'], unlockScore: 6500, planet: 'gas', rules: ['storm'],
    mods: { scoreMul: 1.6, dustMul: 1.2, cometMul: 1.4, evW: { flare: 3, shower: 2.5 } },
    bonus: ['+60% score'], dangers: ['Speed surges', 'Constant comets', 'Solar flares and meteor showers'],
  },
  {
    id: 5, name: 'Void Maw', short: 'Void Maw', sub: 'Where light goes to disappear', risk: 5, bpm: 124, root: 52, scale: [0, 2, 3, 5, 7, 8, 10],
    bg: ['#08000f', '#230638'], accent: '#c77dff', accent2: '#4dffb8', danger: '#ff3d81', neb: ['#9b2dff', '#ff2d9a'], amb: 'motes',
    speed: 1.2, hazards: ['rock', 'comet', 'mine', 'ring', 'beam', 'spinner', 'hole'], unlockScore: 9000, planet: 'void', rules: ['eclipse'],
    mods: { scoreMul: 2.0, dustMul: 2, evW: { hole: 4, nova: 3 } },
    bonus: ['x2 score', 'x2 stardust'], dangers: ['Night: you only see near yourself', 'Black holes', 'Supernovas'],
  },
];

// One continuous run: the planet you are orbiting decides the environment (colours, dangers, speed, rules). A pool of planets
// drifts past in a random order that gets bolder the deeper you go. tier = how deep before it can show up, unlock = the best score
// needed before it joins your pool. The first six reuse the old sector looks; the other four are new.
(() => {
  const W = OD.WORLDS, mk = (id, o) => Object.assign({}, W[0], { id }, o);
  OD.ENVS = {
    terra: W[0], moon: W[1], lava: W[2], ice: W[3], gas: W[4], void: W[5],
    garden: mk(11, { name: 'Verdant Reach', short: 'Verdant', bg: ['#04160a', '#0d3a1c'], neb: ['#2fd06a', '#b8ff7a'], accent: '#7be08a', accent2: '#d6ff9a', danger: '#ff5a7a', amb: 'motes', speed: 0.93, planet: 'garden', hazards: ['rock', 'comet', 'mine'], rules: [], mods: { scoreMul: 1, dustMul: 1.5, evW: { bloom: 2 } } }),
    ocean: mk(10, { name: 'Tidal Sea', short: 'Tidal', bg: ['#021a2e', '#06406a'], neb: ['#1f9dff', '#2a63ff'], accent: '#7fe8ff', accent2: '#5aa8ff', danger: '#ff6a8a', amb: 'motes', speed: 0.97, planet: 'ocean', hazards: ['rock', 'comet', 'mine', 'ring'], rules: [], mods: { scoreMul: 1, dustMul: 1.3, evW: { shower: 1.5 } } }),
    crystal: mk(12, { name: 'Prism Fields', short: 'Prism', bg: ['#021a1a', '#0a3a3d'], neb: ['#2affd6', '#a0f0ff'], accent: '#8affea', accent2: '#ffffff', danger: '#ff6fb5', amb: 'snow', speed: 1.04, planet: 'crystal', hazards: ['rock', 'comet', 'mine', 'spinner', 'ring'], rules: [], mods: { scoreMul: 1, dustMul: 1.4, evW: { shower: 2 } } }),
    toxic: mk(13, { name: 'Spore Haze', short: 'Spore', bg: ['#0c1402', '#243a06'], neb: ['#9bff2a', '#3a8a1a'], accent: '#b4ff5a', accent2: '#e8ff9a', danger: '#ff5a3a', amb: 'motes', speed: 1.08, planet: 'toxic', hazards: ['rock', 'comet', 'mine', 'spinner', 'ring'], rules: [], mods: { scoreMul: 1, dustMul: 1.2, evW: { flare: 1.5 } } }),
  };
  OD.ENVS.moon = Object.assign({}, W[1], { name: 'Dust Fields', mods: Object.assign({}, W[1].mods, { rockMul: 1.4 }) });
  OD.PLANETS = [   // pool order: calm to bold
    { skin: 'terra', label: 'Home world', bonus: 'Calm skies, plenty of stardust', tier: 0, unlock: 0 },
    { skin: 'garden', label: 'Garden world', bonus: 'Calm skies, more stardust and power-ups', tier: 0, unlock: 0 },
    { skin: 'moon', label: 'Moon', bonus: 'Crowded asteroid fields, +15% score', tier: 1, unlock: 800 },
    { skin: 'ocean', label: 'Ocean world', bonus: 'Orbits breathe, whirlpools form', tier: 1, unlock: 1500 },
    { skin: 'lava', label: 'Lava world', bonus: 'Mines and fiery comets', tier: 2, unlock: 2800 },
    { skin: 'crystal', label: 'Crystal world', bonus: 'Grazes pay double and shatter into stardust', tier: 2, unlock: 3500 },
    { skin: 'ice', label: 'Ice world', bonus: 'Slippery turns, ice blades', tier: 3, unlock: 4500 },
    { skin: 'toxic', label: 'Toxic world', bonus: 'Poison clouds drain your multiplier', tier: 3, unlock: 5500 },
    { skin: 'gas', label: 'Storm giant', bonus: 'Speed surges, lightning strikes', tier: 4, unlock: 6500 },
    { skin: 'void', label: 'Dark world', bonus: 'Night falls, walls close in', tier: 5, unlock: 9000 },
  ];
  OD.PLANET_BY_SKIN = {}; OD.PLANETS.forEach(p => { OD.PLANET_BY_SKIN[p.skin] = p; });
  // is this planet in your pool? The best score you have ever reached decides (the free demo only has the first few)
  OD.planetUnlocked = skin => {
    const p = OD.PLANET_BY_SKIN[skin]; if (!p) return false;
    if (OD.TEST_UNLOCK) return true;
    if (!OD.save.full) return p.unlock <= 800;
    return p.unlock === 0 || (OD.save.bestAny || 0) >= p.unlock;
  };
})();

// Pre-run modifiers (full game). Pick up to two; each changes the run and the score multiplier.
OD.MODIFIERS = {
  swift:    { name: 'Swift',     desc: 'Everything moves 25% faster', mul: 1.35 },
  fog:      { name: 'Night Run', desc: 'You only see near yourself', mul: 1.3 },
  heavy:    { name: 'Heavy',     desc: 'More debris, more often', mul: 1.5 },
  volatile: { name: 'Volatile',  desc: 'Cosmic events and passing planets twice as often', mul: 1.25 },
  lucky:    { name: 'Lucky',     desc: 'More stardust and power-ups', mul: 0.85 },
  chill:    { name: 'Chill',     desc: 'Slower start and you begin with a shield', mul: 0.7 },
  glass:    { name: 'Glass',     desc: 'No power-ups at all', mul: 2.0 },
};
OD.MOD_ORDER = ['swift', 'fog', 'heavy', 'volatile', 'lucky', 'chill', 'glass'];
OD.MODES = {
  endless:    { name: 'Endless',     desc: 'Survive as long as you can. A black hole every two planet switches.', free: true },
  daily:      { name: 'Daily',       desc: 'One shared layout per day. Build a streak.' },
  zen:        { name: 'Zen',         desc: 'No danger. Just orbit, breathe, and drift.' },
  hardcore:   { name: 'Hardcore',    desc: 'No pickups to save you. Faster. Double score.' },
  timeattack: { name: 'Time Attack', desc: '60 seconds. Dense debris. Score as much as you can.' },
};
OD.MODE_ORDER = ['endless', 'daily', 'timeattack', 'hardcore', 'zen'];

OD.POWERS = {
  shield: { cat: 'charge', name: 'Shield', color: '#5ab8ff', dur: 0, desc: 'Absorbs one hit' },
  reaper: { cat: 'timed', name: 'Reaper', color: '#ff7a5a', dur: 6, desc: 'Destroys debris that touches you' },
  amp:    { cat: 'timed', name: 'Amplifier', color: '#f5ff5a', dur: 10, desc: 'Multiplier +1 and it will not drain' },
  alchemy: { cat: 'instant', name: 'Alchemy', color: '#e08aff', dur: 0, desc: 'Turns hazards into stardust' },
  zap:    { cat: 'charge', name: 'Guardian', color: '#b9ff5a', dur: 0, desc: 'Destroys what would kill you' },
  life:   { cat: 'charge', name: 'Extra Life', color: '#ff5a7a', dur: 0, desc: 'A second chance' },
  brake:  { cat: 'timed', name: 'Brake', color: '#c9a0ff', dur: 6, desc: 'Slows only you' },
  overload: { cat: 'instant', name: 'Overload', color: '#ffffff', dur: 0, desc: 'Instant Nova' },
  bomb:   { cat: 'instant', name: 'Bomb', color: '#ff9a3d', dur: 0, desc: 'Clears the field' },
  double: { cat: 'timed', name: 'Double', color: '#ffe45a', dur: 8, desc: 'Score x2' },
  slow:   { cat: 'timed', name: 'Slow-Mo', color: '#ffd95a', dur: 5, desc: 'Bends time around you' },
  magnet: { cat: 'timed', name: 'Magnet', color: '#ff7ad9', dur: 7, desc: 'Pulls in stardust' },
  phase:  { cat: 'timed', name: 'Phase', color: '#7affc4', dur: 4, desc: 'Pass through debris' },
  prism:  { cat: 'timed', name: 'Prism', color: '#a0b8ff', dur: 10, desc: 'Wider grazes, graze points x2' },
  fortune: { cat: 'timed', name: 'Fortune', color: '#ffc247', dur: 12, desc: 'Stardust is worth triple' },
  boost:  { cat: 'charge', name: 'Boost Jumps', color: '#58ffb4', dur: 0, desc: 'Your next jumps are all boosted' },
  jackpot: { cat: 'instant', name: 'Jackpot', color: '#ffe9a0', dur: 0, desc: 'A burst of stardust and points' },
  pulse:  { cat: 'instant', name: 'Pulse', color: '#6ad8ff', dur: 0, desc: 'Destroys everything near you' },
  calm:   { cat: 'perk', name: 'Steady Orbit', color: '#8ab4ff', dur: 0, desc: 'Hazards drift 6% slower, for the whole run' },
  sense:  { cat: 'perk', name: 'Stardust Sense', color: '#ffd36a', dur: 0, desc: 'Nearby stardust leans towards you, for the whole run' },
  daredevil: { cat: 'perk', name: 'Daredevil', color: '#ff8ab4', dur: 0, desc: 'Bigger graze zone and +25% graze points, for the whole run' },
  lucky_star: { cat: 'perk', name: 'Lucky Star', color: '#9dff8a', dur: 0, desc: 'Power-ups appear more often, for the whole run' },
  momentum: { cat: 'perk', name: 'Momentum', color: '#c59aff', dur: 0, desc: 'Your multiplier drains slower, for the whole run' },
};

// how power-ups behave: timed ones run out, charges are stored and used up, instant ones fire on pickup, perks last the whole run
OD.POWER_CATS = {
  timed: { name: 'Timed', color: '#ffd95a' }, charge: { name: 'Charge', color: '#5ab8ff' },
  instant: { name: 'Instant', color: '#ff9a3d' }, perk: { name: 'Perk', color: '#c59aff' },
};

OD.COSMETICS = {
  trail: [
    { id: 'classic', name: 'Classic', price: 0 },
    { id: 'comet', name: 'Comet', price: 150 },
    { id: 'stardust', name: 'Stardust', price: 300 },
    { id: 'ember', name: 'Cinder', price: 450 },
    { id: 'ice', name: 'Frostbite', price: 450 },
    { id: 'pixel', name: 'Pixel', price: 600 },
    { id: 'rainbow', name: 'Prism', price: 800 },
    { id: 'aurora', name: 'Aurora', price: 1100 },
    { id: 'glitch', name: 'Glitch', price: 1400 },
    { id: 'plasma', name: 'Plasma', price: 1800 },
    { id: 'ribbon', name: 'Silk Ribbon', price: 2200 },
    { id: 'petals', name: 'Blossom', price: 2600 },
    { id: 'bubbles', name: 'Bubbles', price: 3000 },
    { id: 'ghost', name: 'Afterimage', price: 3600 },
    { id: 'helix', name: 'Double Helix', price: 4200 },
    { id: 'matrix', name: 'Digital Rain', price: 5000 },
    { id: 'lightning', name: 'Lightning', price: 6000 },
    { id: 'inferno', name: 'Inferno', price: 7000 },
    { id: 'nebula', name: 'Nebula', price: 9000 },
  ],
  core: [
    { id: 'orb', name: 'Orb', price: 0 },
    { id: 'ring', name: 'Ring', price: 150 },
    { id: 'diamond', name: 'Diamond', price: 250 },
    { id: 'star', name: 'Nova Star', price: 400 },
    { id: 'pulse', name: 'Heartbeat', price: 500 },
    { id: 'halo', name: 'Halo', price: 700 },
    { id: 'prism', name: 'Prism Orb', price: 900 },
    { id: 'atom', name: 'Atom', price: 1200 },
    { id: 'crystal', name: 'Crystal', price: 1600 },
    { id: 'ringed', name: 'Ringed World', price: 2000 },
    { id: 'spirit', name: 'Spirit', price: 2400 },
    { id: 'plasmaball', name: 'Plasma Ball', price: 3000 },
    { id: 'sun', name: 'Mini Sun', price: 3800 },
    { id: 'galaxy', name: 'Galaxy', price: 4800 },
    { id: 'eclipse', name: 'Eclipse', price: 6000 },
    { id: 'singularity', name: 'Singularity', price: 8000 },
  ],
  aura: [
    { id: 'azure', name: 'Azure', price: 0 },
    { id: 'sunrise', name: 'Sunrise', price: 200 },
    { id: 'toxic', name: 'Toxic', price: 300 },
    { id: 'violet', name: 'Violet', price: 300 },
    { id: 'neon', name: 'Neon', price: 450 },
    { id: 'prism', name: 'Prism', price: 650 },
  ],
  orbit: [
    { id: 'classic', name: 'Classic', price: 0 },
    { id: 'dotted', name: 'Dotted', price: 150 },
    { id: 'dashed', name: 'Spinning', price: 250 },
    { id: 'double', name: 'Double', price: 300 },
    { id: 'glow', name: 'Neon Glow', price: 450 },
  ],
  debris: [
    { id: 'rock', name: 'Asteroid', price: 0 },
    { id: 'scrap', name: 'Scrap', price: 300 },
    { id: 'gear', name: 'Gear', price: 350 },
    { id: 'crystal', name: 'Crystal', price: 400 },
    { id: 'orb', name: 'Plasma', price: 450 },
    { id: 'star', name: 'Starburst', price: 550 },
  ],
  sky: [
    { id: 'stars', name: 'Deep Space', price: 0 },
    { id: 'snow', name: 'Snowfall', price: 250 },
    { id: 'warp', name: 'Warp', price: 350 },
    { id: 'fireflies', name: 'Fireflies', price: 400 },
    { id: 'grid', name: 'Synth Grid', price: 500 },
  ],
  burst: [
    { id: 'classic', name: 'Classic', price: 0 },
    { id: 'rings', name: 'Ripples', price: 200 },
    { id: 'confetti', name: 'Confetti', price: 300 },
    { id: 'implode', name: 'Implosion', price: 350 },
    { id: 'stars', name: 'Stardust', price: 450 },
  ],
};
OD.COSMETIC_LABEL = { trail: 'Tails', core: 'Dots', aura: 'Aura', orbit: 'Orbits', debris: 'Debris', sky: 'Sky', burst: 'Burst' };

// ---------------------------------------------------------------- perk tree
// Passive perks, three levels each. A perk needs its parent owned (level 1+). Positions are on a 300 x 330 canvas per branch.
const PC = [[120, 360, 900], [260, 700, 1600], [450, 1200, 2800]];     // stardust per level for tier 0 / 1 / 2
const pct = (a, b, c) => [a, b, c];
OD.PERK_BRANCHES = [
  { id: 'guard', name: 'Guard', color: '#5ab8ff', blurb: 'Survive more mistakes' },
  { id: 'score', name: 'Score', color: '#ffd95a', blurb: 'Make every point count' },
  { id: 'control', name: 'Control', color: '#4df3ff', blurb: 'Master your orbit' },
  { id: 'fortune', name: 'Fortune', color: '#ff8ad9', blurb: 'Earn more, find more' },
];
OD.PERKS = [
  { id: 'hull', branch: 'guard', tier: 0, req: null, pos: [150, 40], icon: 'shield', name: 'Reinforced Hull',
    d: ['Start every run with a shield.', 'Also: a broken starting shield recharges after 70 seconds.', 'Recharges after only 40 seconds.'] },
  { id: 'afterglow', branch: 'guard', tier: 1, req: 'hull', pos: [75, 135], icon: 'afterglow', name: 'Afterglow',
    d: ['Stay invulnerable 0.5 s longer after a shield or life saves you.', '1.0 s longer.', '1.5 s longer.'] },
  { id: 'tough', branch: 'guard', tier: 1, req: 'hull', pos: [225, 135], icon: 'tough', name: 'Shockwave Shield',
    d: ['A breaking shield or life blasts a wider area clear (+60).', 'Wider still (+120).', 'Widest blast (+180).'] },
  { id: 'lifeline', branch: 'guard', tier: 2, req: 'afterglow', pos: [75, 235], icon: 'life', name: 'Lifeline',
    d: ['15% chance that a life you spend is refunded.', '30% chance.', '45% chance.'] },
  { id: 'phoenix', branch: 'guard', tier: 2, req: 'tough', pos: [225, 235], icon: 'phoenix', name: 'Phoenix',
    d: ['Once per run, a deadly hit is survived after 75 seconds of flying.', 'Ready after 40 seconds.', 'Ready from the very start.'] },

  { id: 'spark', branch: 'score', tier: 0, req: null, pos: [150, 40], icon: 'double', name: 'Bright Start',
    d: ['All points +8%.', 'All points +16%.', 'All points +24%.'] },
  { id: 'ceiling', branch: 'score', tier: 1, req: 'spark', pos: [75, 135], icon: 'amp', name: 'Combo Ceiling',
    d: ['Multiplier cap +0.5 (x5.5).', 'Cap +1.0 (x6).', 'Cap +1.5 (x6.5).'] },
  { id: 'razor', branch: 'score', tier: 1, req: 'spark', pos: [225, 135], icon: 'daredevil', name: 'Razor Instinct',
    d: ['Grazes pay +20% and the graze zone grows a little.', '+40% and a wider zone.', '+60% and the widest zone.'] },
  { id: 'hang', branch: 'score', tier: 2, req: 'ceiling', pos: [75, 235], icon: 'momentum', name: 'Hang Time',
    d: ['The multiplier drains 20% slower.', '35% slower.', '50% slower.'] },
  { id: 'chain', branch: 'score', tier: 2, req: 'razor', pos: [225, 235], icon: 'prism', name: 'Chain Reaction',
    d: ['Chain bonuses +30%.', '+60%.', '+100%.'] },

  { id: 'steady', branch: 'control', tier: 0, req: null, pos: [150, 40], icon: 'brake', name: 'Steady Hands',
    d: ['Aiming slows time a little more.', 'Slows time even more.', 'Maximum aim slow-motion.'] },
  { id: 'swift', branch: 'control', tier: 1, req: 'steady', pos: [75, 135], icon: 'leap', name: 'Quick Jump',
    d: ['Jumps between orbits are 8% faster.', '16% faster.', '24% faster.'] },
  { id: 'early', branch: 'control', tier: 1, req: 'steady', pos: [225, 135], icon: 'early', name: 'Early Warning',
    d: ['Hazards show their warning 15% longer.', '30% longer.', '45% longer.'] },
  { id: 'pull', branch: 'control', tier: 2, req: 'swift', pos: [75, 235], icon: 'magnet', name: 'Gentle Pull',
    d: ['Stardust within a short reach drifts towards you.', 'Longer reach.', 'Longest reach.'] },
  { id: 'calmorbit', branch: 'control', tier: 2, req: 'early', pos: [225, 235], icon: 'calm', name: 'Calm Orbit',
    d: ['All hazards move 3% slower.', '6% slower.', '9% slower.'] },

  { id: 'prospect', branch: 'fortune', tier: 0, req: null, pos: [150, 40], icon: 'fortune', name: 'Prospector',
    d: ['+10% stardust from every run.', '+20% stardust.', '+30% stardust.'] },
  { id: 'charm', branch: 'fortune', tier: 1, req: 'prospect', pos: [75, 135], icon: 'lucky_star', name: 'Lucky Charm',
    d: ['Power-ups appear 15% more often.', '30% more often.', '45% more often.'] },
  { id: 'veins', branch: 'fortune', tier: 1, req: 'prospect', pos: [225, 135], icon: 'veins', name: 'Rich Veins',
    d: ['10% of stardust orbs count double.', '20% count double.', '30% count double.'] },
  { id: 'fuse', branch: 'fortune', tier: 2, req: 'charm', pos: [75, 235], icon: 'fuse', name: 'Long Fuse',
    d: ['Timed power-ups last 15% longer.', '30% longer.', '45% longer.'] },
  { id: 'scholar', branch: 'fortune', tier: 2, req: 'veins', pos: [225, 235], icon: 'scholar', name: 'Goal Getter',
    d: ['Goal and daily rewards +20%.', '+40%.', '+60%.'] },
];
OD.PERKS.push(
  { id: 'showtime', branch: 'score', tier: 4, req: ['zenith'], icon: 'showtime', name: 'Showtime',
    d: ['Trick bonuses pay 50% more.', 'Trick bonuses pay double, and each adds a little more multiplier.', 'Trick bonuses pay 2.5x, and Trick Combos pay double.'] },
  { id: 'bulwark', branch: 'guard', tier: 3, req: ['lifeline', 'phoenix'], icon: 'bulwark', name: 'Bulwark',
    d: ['Start every run with an extra life.', 'You can also hold a fourth life.', 'Start every run with two extra lives.'] },
  { id: 'zenith', branch: 'score', tier: 3, req: ['hang', 'chain'], icon: 'zenith', name: 'Nova Mastery',
    d: ['Nova lasts 1 s longer and charges 10% faster.', '2 s longer, 20% faster.', '3 s longer, 30% faster.'] },
  { id: 'weaver', branch: 'control', tier: 3, req: ['pull', 'calmorbit'], icon: 'weaver', name: 'Time Weaver',
    d: ['Boosted jumps keep their speed 0.4 s longer.', '0.8 s longer.', '1.2 s longer, and each one adds a little multiplier.'] },
  { id: 'windfall', branch: 'fortune', tier: 3, req: ['fuse', 'scholar'], icon: 'windfall', name: 'Windfall',
    d: ['+25 bonus stardust at the end of every run.', '+50 bonus stardust.', '+100 bonus stardust.'] },
);
// The perks live on one big map (860 x 1000): a seed at the bottom, four limbs that fork, and a capstone above each limb
// that opens from either of its two upper perks. Positions are set here so the shape is easy to tune.
OD.TREE = { w: 860, h: 860, origin: [430, 815] };
{
  const LAY = { guard: [120, 690], score: [320, 650], control: [540, 650], fortune: [740, 690] };
  const SLOT = [[0, 0], [-62, -120], [66, -135], [-70, -260], [72, -290], [0, -420], [0, -550]];
  for (const br of Object.keys(LAY)) {
    const ids = OD.PERKS.filter(p => p.branch === br).sort((a, b) => a.tier - b.tier);
    ids.forEach((p, i) => { p.pos = [LAY[br][0] + SLOT[i][0], LAY[br][1] + SLOT[i][1]]; });
  }
}
const PC3 = [700, 1800, 4200], PC4 = [900, 2200, 5000];
OD.PERKS.forEach(p => { p.cost = p.tier === 4 ? PC4 : p.tier === 3 ? PC3 : PC[p.tier]; p.max = 3; p.reqs = p.req ? [].concat(p.req) : []; });
OD.PERK_BY_ID = {}; OD.PERKS.forEach(p => { OD.PERK_BY_ID[p.id] = p; });
// one-time boosters: bought in stacks, one of each armed booster is used up at the start of a run
OD.BOOSTERS = [
  { id: 'b_shield', name: 'Head Start', icon: 'shield', color: '#5ab8ff', price: 60, desc: 'Start the run with a shield.' },
  { id: 'b_mult', name: 'Warm Start', icon: 'amp', color: '#f5ff5a', price: 90, desc: 'Start the run at a x2.0 multiplier.' },
  { id: 'b_dust', name: 'Dust Rush', icon: 'fortune', color: '#ffc247', price: 110, desc: '+50% stardust from this run.' },
  { id: 'b_life', name: 'Spare Life', icon: 'life', color: '#ff5a7a', price: 150, desc: 'Start the run with an extra life.' },
];
OD.BOOSTER_MAX = 9;
OD.perkLevel = id => (OD.save.perks && OD.save.perks[id]) || 0;
// a perk is open when it has no parent, or when any parent is learned
OD.perkOpen = p => !p.reqs.length || p.reqs.some(r => OD.perkLevel(r) > 0);

// Challenges: test(stats, run, save) -> bool, prog(stats, save) -> [cur, goal]
const cnt = (v, goal) => [Math.min(v, goal), goal];
OD.CHALLENGES = [
  { id: 'first', name: 'First Orbit', desc: 'Finish your first run', reward: 10, test: s => s.runs >= 1, prog: s => cnt(s.runs, 1) },
  { id: 'runs50', name: 'Frequent Flyer', desc: 'Complete 50 runs', reward: 60, test: s => s.runs >= 50, prog: s => cnt(s.runs, 50) },
  { id: 'graze10', name: 'Close Shave', desc: 'Graze 10 hazards in one run', reward: 15, test: (s, r) => r && r.grazes >= 10 },
  { id: 'graze25', name: 'Razor\'s Edge', desc: 'Graze 25 hazards in one run', reward: 40, test: (s, r) => r && r.grazes >= 25 },
  { id: 'trick25', name: 'Showoff', desc: 'Land 25 tricks in total', reward: 25, test: s => s.tricks >= 25, prog: s => cnt(s.tricks, 25) },
  { id: 'trick250', name: 'Street Style', desc: 'Land 250 tricks in total', reward: 80, test: s => s.tricks >= 250, prog: s => cnt(s.tricks, 250) },
  { id: 'trickrun12', name: 'On Fire', desc: 'Land 12 tricks in one run', reward: 40, test: (s, r) => r && r.tricks >= 12 },
  { id: 'tcombo5', name: 'Combo Artist', desc: 'Reach a x5 Trick Combo', reward: 45, test: (s, r) => s.tcombo >= 5, prog: s => cnt(s.tcombo, 5) },
  { id: 'weave10', name: 'Weaver', desc: 'Land 10 Weaves in total', reward: 35, test: s => s.weaves >= 10, prog: s => cnt(s.weaves, 10) },
  { id: 'zig10', name: 'Zigzagger', desc: 'Land 10 Zigzags in total', reward: 35, test: s => s.zigs >= 10, prog: s => cnt(s.zigs, 10) },
  { id: 'lap25', name: 'Smooth Operator', desc: 'Fly 25 Clean Laps in total', reward: 30, test: s => s.laps >= 25, prog: s => cnt(s.laps, 25) },
  { id: 'graze500', name: 'Daredevil', desc: 'Graze 500 hazards in total', reward: 60, test: s => s.grazes >= 500, prog: s => cnt(s.grazes, 500) },
  { id: 'combo5', name: 'On a Roll', desc: 'Reach a x2.0 multiplier', reward: 20, test: s => s.maxCombo >= 2, prog: s => cnt(Math.round(s.maxCombo * 10) / 10, 2) },
  { id: 'combo8', name: 'Maximum Overdrive', desc: 'Reach the x5.0 multiplier cap', reward: 50, test: s => s.maxCombo >= 5, prog: s => cnt(Math.round(s.maxCombo * 10) / 10, 5) },
  { id: 'score1k', name: 'Warming Up', desc: 'Score 1,000 in a run', reward: 15, test: (s, r) => r && r.score >= 1000 },
  { id: 'score2500', name: 'Gravity Well', desc: 'Score 2,500 in a run', reward: 30, test: (s, r) => r && r.score >= 2500 },
  { id: 'score5k', name: 'Escape Velocity', desc: 'Score 5,000 in a run', reward: 60, test: (s, r) => r && r.score >= 5000 },
  { id: 'score10k', name: 'Event Horizon', desc: 'Score 10,000 in a run', reward: 120, test: (s, r) => r && r.score >= 10000 },
  { id: 'time60', name: 'Minute Man', desc: 'Survive 60 seconds', reward: 15, test: (s, r) => r && r.time >= 60 },
  { id: 'time120', name: 'Long Haul', desc: 'Survive 2 minutes', reward: 35, test: (s, r) => r && r.time >= 120 },
  { id: 'time240', name: 'Lifer', desc: 'Survive 4 minutes', reward: 80, test: (s, r) => r && r.time >= 240 },
  { id: 'perfect5', name: 'Sling Shot', desc: '5 boosted jumps in one run (golden-glow release or quick drag)', reward: 30, test: (s, r) => r && r.perfects >= 5 },
  { id: 'perfect100', name: 'Sharpshooter', desc: '100 boosted jumps in total', reward: 70, test: s => s.perfects >= 100, prog: s => cnt(s.perfects, 100) },
  { id: 'dust1k', name: 'Stardust Hoarder', desc: 'Collect 1,000 stardust orbs', reward: 60, test: s => s.dust >= 1000, prog: s => cnt(s.dust, 1000) },
  { id: 'overdrive', name: 'Supernova', desc: 'Trigger Overdrive', reward: 20, test: s => s.overdrives >= 1, prog: s => cnt(s.overdrives, 1) },
  { id: 'overdrive10', name: 'Burning Bright', desc: 'Trigger Overdrive 10 times', reward: 50, test: s => s.overdrives >= 10, prog: s => cnt(s.overdrives, 10) },
  { id: 'boss1', name: 'Event Horizon', desc: 'Escape a black hole', reward: 30, test: s => s.bosses >= 1, prog: s => cnt(s.bosses, 1) },
  { id: 'boss10', name: 'Horizon Walker', desc: 'Escape 10 black holes', reward: 90, test: s => s.bosses >= 10, prog: s => cnt(s.bosses, 10) },
  { id: 'inner', name: 'Inner Circle', desc: '30 seconds on the innermost orbit in one run', reward: 40, test: (s, r) => r && r.innerTime >= 30 },
  { id: 'twin1', name: 'Hop Skip', desc: 'Jump to a twin planet', reward: 25, test: s => s.transfers >= 1, prog: s => cnt(s.transfers, 1) },
  { id: 'twin25', name: 'Binary Star', desc: 'Make 25 twin-planet jumps', reward: 70, test: s => s.transfers >= 25, prog: s => cnt(s.transfers, 25) },
  { id: 'stargazer', name: 'Stargazer', desc: 'Survive a cosmic event', reward: 30, test: s => s.events >= 1, prog: s => cnt(s.events, 1) },
  { id: 'assist5', name: 'Slingshot Pilot', desc: 'Make 5 gravity assists', reward: 40, test: s => s.assists >= 5, prog: s => cnt(s.assists, 5) },
  { id: 'hole1', name: 'Horizon Walker', desc: 'Survive a black hole', reward: 60, test: s => s.holes >= 1, prog: s => cnt(s.holes, 1) },
  { id: 'nova1', name: 'Sun Dodger', desc: 'Survive a supernova', reward: 100, test: s => s.novas >= 1, prog: s => cnt(s.novas, 1) },
  { id: 'razor10', name: 'Razor Thin', desc: 'Make 10 razor-thin near misses', reward: 50, test: s => s.razors >= 10, prog: s => cnt(s.razors, 10) },
  { id: 'clutch25', name: 'Clutch Player', desc: 'Make 25 clutch flips', reward: 40, test: s => s.clutch >= 25, prog: s => cnt(s.clutch, 25) },
  { id: 'power25', name: 'Power Player', desc: 'Collect 25 power-ups', reward: 40, test: s => s.powerups >= 25, prog: s => cnt(s.powerups, 25) },
  { id: 'daily1', name: 'Daily Driver', desc: 'Finish a Daily run', reward: 20, test: s => s.dailies >= 1, prog: s => cnt(s.dailies, 1) },
  { id: 'streak7', name: 'Seven Suns', desc: 'Reach a 7-day Daily streak', reward: 100, test: (s, r, sv) => sv.daily.streak >= 7, prog: (s, sv) => cnt(sv.daily.streak, 7) },
  { id: 'hard1500', name: 'No Safety Net', desc: 'Score 1,500 in Hardcore', reward: 60, test: (s, r) => r && r.mode === 'hardcore' && r.score >= 1500 },
  { id: 'ta1500', name: 'Speed Runner', desc: 'Score 1,500 in Time Attack', reward: 50, test: (s, r) => r && r.mode === 'timeattack' && r.score >= 1500 },
  { id: 'zen10', name: 'Inner Peace', desc: 'Spend 10 minutes in Zen mode', reward: 40, test: s => s.zenTime >= 600, prog: s => cnt(Math.floor(s.zenTime / 60), 10) },
  { id: 'worlds', name: 'Grand Tour', desc: 'Visit 8 different planets', reward: 80, test: (s, r, sv) => Object.keys(sv.seenPlanets || {}).length >= 8, prog: (s, sv) => cnt(Object.keys(sv.seenPlanets || {}).length, 8) },
  { id: 'shop5', name: 'Fashionista', desc: 'Unlock 6 cosmetics', reward: 30, test: (s, r, sv) => OD.ownedExtra() >= 6, prog: (s, sv) => cnt(OD.ownedExtra(), 6) },
  { id: 'share', name: 'Show Off', desc: 'Share a clip', reward: 10, test: s => s.shares >= 1, prog: s => cnt(s.shares, 1) },
];
OD.ownedCount = () => Object.values(OD.save.owned).reduce((a, l) => a + l.length, 0);
OD.ownedExtra = () => OD.ownedCount() - Object.keys(OD.COSMETICS).length;
OD.ownedTotal = () => Object.values(OD.COSMETICS).reduce((a, l) => a + l.length, 0) - Object.keys(OD.COSMETICS).length;

// Short advice shown after a run, picked by what ended it.
OD.TIPS = {
  rock: ['Asteroids drift slowly. Flip direction early instead of at the last moment.', 'Jump to another orbit to skip a rock entirely.'],
  comet: ['The dashed line shows where a comet will cross. Leave that spot before it fires.', 'Comets cross all orbits at once, so jumping does not help. Move along the orbit.'],
  mine: ['A mine is only dangerous in its big flashing circle. Pass while it is small.', 'Mines flash on every second beat. Count them.'],
  ring: ['Wall rings always have a gap. The gap edges glow.', 'Jumping to another orbit lets you slip across a wall.'],
  beam: ['A laser covers two orbits. Be on the third, or time your jump.', 'Watch the flickering line before the beam turns solid.'],
  hole: ['A gravity well slows you down. Do not linger in its dotted field.'],
  spinner: ['The whole blade is deadly. Pass when it points away from your orbit.'],
  flare: ['Dashed lines show where the flare lanes will fire. Stand between them.'],
  nova: ['Hide in the dark shadow behind the planet when a supernova goes off.'],
  general: ['Swipe away from the planet to go out one orbit, towards it to go in one. Keep your finger down after a swipe to keep jumping.', 'Only a tap turns you around. Swiping never does.', 'Close passes (grazes) build your combo and charge Nova.', 'Collect stardust in a row for streak bonuses.', 'A power-up shield also blasts nearby debris away.', 'When a planet drifts in, a jump from your outer orbit can take you to a new home.'],
};
