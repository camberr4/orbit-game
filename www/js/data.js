'use strict';
// Static game content: worlds, modes, cosmetics, power-ups, challenges.

// Sectors of space, ordered from peaceful to deadly. Each has its own rules, bonuses and dangers.
//   risk: 1-5 stars     rules: world-wide rule ids (see eraIs in game.js)     mods: gameplay multipliers
OD.WORLDS = [
  {
    id: 0, name: 'Aurora Reach', short: 'Aurora', pill: 'Plentiful stardust', sub: 'A calm nursery of light', risk: 1, bpm: 119, root: 57, scale: [0, 3, 5, 7, 10],
    bg: ['#04091c', '#0a1a45'], accent: '#4df3ff', accent2: '#b36bff', danger: '#ff4d7a', neb: ['#2a63ff', '#8a3dff'], amb: 'ribbons',
    speed: 0.92, hazards: ['rock', 'comet', 'mine', 'ribbon', 'shoal'], unlockScore: 0, planet: 'terra', rules: [],
    mods: { scoreMul: 1, dustMul: 1.6, evW: { bloom: 2.5 } },
    bonus: ['Plentiful stardust', 'More Stardust Blooms'], dangers: ['Asteroids', 'Comets', 'Pulse mines'],
  },
  {
    id: 1, name: 'Dust Belt', short: 'Dust Belt', pill: 'Dense rocks, meteor showers', sub: 'Rock fields and spinning blades', risk: 2, bpm: 112, root: 53, scale: [0, 2, 3, 7, 9],
    bg: ['#140d06', '#3a2410'], accent: '#ffcf7a', accent2: '#ff9a4d', danger: '#ff4d5e', neb: ['#c47a2a', '#7a3a12'], amb: 'dust',
    speed: 0.97, hazards: ['rock', 'comet', 'mine', 'spinner', 'tether', 'devil'], unlockScore: 400, planet: 'moon', rules: [],
    mods: { scoreMul: 1.1, dustMul: 1.2, rockMul: 1.7, evW: { shower: 2.5 } },
    bonus: ['+10% score'], dangers: ['Crowded asteroid fields', 'Spinners: rotating blades', 'Meteor showers'],
  },
  {
    id: 2, name: 'Ember Rift', short: 'Ember Rift', pill: 'Solar flares, laser sweeps', sub: 'A star on its last breath', risk: 3, bpm: 118, root: 55, scale: [0, 3, 5, 6, 7, 10],
    bg: ['#150403', '#40100a'], accent: '#ffc24d', accent2: '#ff6a3d', danger: '#ff2f6a', neb: ['#ff5a1f', '#a3123a'], amb: 'embers',
    speed: 1.03, hazards: ['rock', 'comet', 'mine', 'ring', 'beam', 'cinder', 'bloom'], unlockScore: 1200, planet: 'lava', rules: [],
    mods: { scoreMul: 1.2, dustMul: 1.2, evW: { flare: 2.5 } },
    bonus: ['+20% score', 'Solar flares are common'], dangers: ['Pulse mines everywhere', 'Laser sweeps', 'Wall rings'],
  },
  {
    id: 3, name: 'Glacier Drift', short: 'Glacier', pill: 'Gravity wells, ice blades', sub: 'Silent, sharp and slippery', risk: 3, bpm: 113, root: 60, scale: [0, 2, 4, 7, 9],
    bg: ['#021821', '#06404f'], accent: '#aef4ff', accent2: '#ffffff', danger: '#ff6fb5', neb: ['#18c7d9', '#3a7dff'], amb: 'snow',
    speed: 1.09, hazards: ['rock', 'comet', 'mine', 'ring', 'spinner', 'hole', 'spear', 'hail'], unlockScore: 2500, planet: 'ice', rules: [],
    mods: { scoreMul: 1.3, dustMul: 1.3 },
    bonus: ['+30% score', '+30% stardust'], dangers: ['Slippery turns', 'Gravity wells', 'Ice blades'],
  },
  {
    id: 4, name: 'Pulsar Storm', short: 'Pulsar', pill: 'Fast comets, flares and showers', sub: 'Lightning on a spinning star', risk: 4, bpm: 132, root: 50, scale: [0, 2, 3, 5, 7, 9, 10],
    bg: ['#0a0420', '#2a0a55'], accent: '#ff6ad5', accent2: '#5ad2ff', danger: '#ffd24d', neb: ['#ff2dd1', '#2d6bff'], amb: 'sparks',
    speed: 1.14, hazards: ['rock', 'comet', 'ring', 'beam', 'spinner', 'pylon', 'serpent'], unlockScore: 4500, planet: 'gas', rules: [],
    mods: { scoreMul: 1.45, dustMul: 1.2, cometMul: 1.4, evW: { flare: 3, shower: 2.5 } },
    bonus: ['+45% score'], dangers: ['Speed surges', 'Constant comets', 'Solar flares and meteor showers'],
  },
  {
    id: 5, name: 'Void Maw', short: 'Void Maw', pill: 'Gravity wells and supernovas', sub: 'Where light goes to disappear', risk: 5, bpm: 128, root: 52, scale: [0, 2, 3, 5, 7, 8, 10],
    bg: ['#08000f', '#230638'], accent: '#c77dff', accent2: '#4dffb8', danger: '#ff3d81', neb: ['#9b2dff', '#ff2d9a'], amb: 'motes',
    speed: 1.2, hazards: ['rock', 'comet', 'mine', 'ring', 'beam', 'spinner', 'hole', 'shade', 'rift'], unlockScore: 7000, planet: 'void', rules: [],
    mods: { scoreMul: 1.6, dustMul: 1.6, evW: { hole: 4, nova: 3 } },
    bonus: ['+60% score', 'More stardust'], dangers: ['Night: you only see near yourself', 'Black holes', 'Supernovas'],
  },
];

// BIOMES are OD.WORLDS: each has its own sky (js/biomes.js), its own songs and its own sounds. A run moves through them: after
// biomeStay(n) planet switches the sky changes, and every stay is longer than the last. Planets are separate: random, and they
// only bring rules (see PLANET_TYPES in game.js), never a sky or a song.
OD.biomeStay = n => 3;   // planets to visit in each biome: the skies come in order and each stays for three planets
// The score of THIS run decides when the next planet drifts in: 20,000 for the first switch, then 70,000, 140,000, 230,000, 340,000 ... (each
// gap bigger than the last). Nothing is locked by your best score any more; the free demo only has the first biomes and planets.
OD.SCORE_SCALE = (() => { const m = /[?&]pscale=([0-9.]+)/.exec(location.search); return m ? +m[1] : 1; })();   // ?pscale=0.05 makes it quick to test
OD.planetScoreAt = n => Math.round((4500 + 3000 * n + 1100 * n * n) * 1.3 * OD.SCORE_SCALE);   // x1.3: each new planet takes a bit longer to appear
OD.biomeUnlocked = i => !!OD.WORLDS[i] && (OD.save.full || i <= 1);

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
    { skin: 'terra', label: 'Home world', bonus: 'More stardust', tier: 0, unlock: 0 },
    { skin: 'garden', label: 'Garden world', bonus: 'More stardust and power-ups', tier: 0, unlock: 0 },
    { skin: 'moon', label: 'Moon', bonus: 'A quiet, cratered rock', tier: 1, unlock: 800 },
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
  OD.planetUnlocked = skin => { const p = OD.PLANET_BY_SKIN[skin]; return !!p && (OD.save.full || p.unlock <= 800); };
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
  endless:    { name: 'Endless',     desc: 'Survive as long as you can.', free: true },
};
OD.MODE_ORDER = ['endless'];

OD.POWERS = {
  shield: { cat: 'charge', name: 'Shield', color: '#5ab8ff', dur: 0, desc: 'Absorbs one hit' },
  reaper: { cat: 'timed', name: 'Reaper', color: '#ff7a5a', dur: 6, desc: 'Destroys debris that touches you' },
  amp:    { cat: 'timed', name: 'Amplifier', color: '#f5ff5a', dur: 10, desc: 'Multiplier +1 and it will not drain' },
  alchemy: { cat: 'instant', name: 'Alchemy', color: '#e08aff', dur: 0, desc: 'Turns hazards into stardust' },
  zap:    { cat: 'charge', name: 'Guardian', color: '#b9ff5a', dur: 0, desc: 'Destroys what would kill you' },
  life:   { cat: 'charge', name: 'Extra Life', color: '#ff5a7a', dur: 0, desc: 'A second chance' },
  overload: { cat: 'instant', name: 'Overload', color: '#ffffff', dur: 0, desc: 'Instant Nova' },
  bomb:   { cat: 'instant', name: 'Bomb', color: '#ff9a3d', dur: 0, desc: 'Clears the field' },
  double: { cat: 'timed', name: 'Double', color: '#ffe45a', dur: 8, desc: 'Score x2' },
  slow:   { cat: 'timed', name: 'Slow-Mo', color: '#ffd95a', dur: 5, desc: 'Bends time around you' },
  magnet: { cat: 'timed', name: 'Magnet', color: '#ff7ad9', dur: 7, desc: 'Pulls in stardust' },
  phase:  { cat: 'timed', name: 'Phase', color: '#7affc4', dur: 4, desc: 'Pass through debris' },
  prism:  { cat: 'timed', name: 'Prism', color: '#a0b8ff', dur: 10, desc: 'Wider grazes, graze points x2' },
  fortune: { cat: 'timed', name: 'Fortune', color: '#ffc247', dur: 12, desc: 'Stardust is worth triple' },
  jackpot: { cat: 'instant', name: 'Jackpot', color: '#ffe9a0', dur: 0, desc: 'A burst of stardust and points' },
  pulse:  { cat: 'instant', name: 'Pulse', color: '#6ad8ff', dur: 0, desc: 'Destroys everything near you' },
  surge:  { cat: 'timed', name: 'Surge', color: '#7dffd2', dur: 3.5, desc: 'Dash through everything at double speed, dropping stardust as you go' },
  twin:   { cat: 'timed', name: 'Wingman', color: '#b69cff', dur: 14, desc: 'A second dot flies opposite you: it gathers stardust and takes one hit for you' },
  stasis: { cat: 'timed', name: 'Stasis', color: '#8fd4ff', dur: 4.5, desc: 'Hazards freeze in place, and grazes pay double' },
  vortex: { cat: 'instant', name: 'Vortex', color: '#c27dff', dur: 0, desc: 'Drops a gravity well that eats hazards and gathers stardust for six seconds' },
  aegis:  { cat: 'charge', name: 'Aegis', color: '#ffd27a', dur: 0, desc: 'A deadly hit is blocked, and the blast clears everything around you' },
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
  { id: 'guard', name: 'Bastion', color: '#5ab8ff', blurb: 'Survive more mistakes' },
  { id: 'score', name: 'Crescendo', color: '#ffd95a', blurb: 'Play well, be protected' },
  { id: 'control', name: 'Meridian', color: '#4df3ff', blurb: 'Slip every danger' },
  { id: 'fortune', name: 'Fortuna', color: '#ff8ad9', blurb: 'Luck is your armour' },
];
OD.PERKS = [
  { id: 'hull', branch: 'guard', tier: 0, req: null, pos: [150, 40], icon: 'shield', name: 'Reinforced Hull',
    d: ['Start every run with a shield.', 'Also: a broken starting shield recharges after 90 seconds.', 'Recharges after 60 seconds.'] },
  { id: 'afterglow', branch: 'guard', tier: 1, req: 'hull', pos: [75, 135], icon: 'afterglow', name: 'Afterglow',
    d: ['Stay invulnerable 0.5 s longer after a shield or life saves you.', '1.0 s longer.', '1.5 s longer.'] },
  { id: 'tough', branch: 'guard', tier: 1, req: 'hull', pos: [225, 135], icon: 'tough', name: 'Shockwave Shield',
    d: ['A breaking shield or life blasts a wider area clear (+60).', 'Wider still (+120).', 'Widest blast (+180).'] },
  { id: 'lifeline', branch: 'guard', tier: 2, req: 'afterglow', pos: [75, 235], icon: 'life', name: 'Lifeline',
    d: ['10% chance that a life you spend is refunded.', '20% chance.', '30% chance.'] },
  { id: 'phoenix', branch: 'guard', tier: 2, req: 'tough', pos: [225, 235], icon: 'phoenix', name: 'Phoenix',
    d: ['Once per run, a deadly hit is survived after 100 seconds of flying.', 'Ready after 60 seconds.', 'Ready after 30 seconds.'] },

  { id: 'encore', branch: 'score', tier: 0, req: null, pos: [150, 40], icon: 'encore', name: 'Encore',
    d: ['A deadly hit is survived while your multiplier is x2 or more; it costs the multiplier. Ready again after 45 seconds.', 'From x1.6 up, ready again after 32 seconds.', 'From x1.3 up, ready again after 22 seconds.'] },
  { id: 'ceiling', branch: 'score', tier: 1, req: 'encore', pos: [75, 135], icon: 'amp', name: 'Combo Ceiling',
    d: ['Multiplier cap +1.0 (x6).', 'Cap +2.0 (x7).', 'Cap +3.0 (x8).'] },
  { id: 'razor', branch: 'score', tier: 1, req: 'encore', pos: [225, 135], icon: 'daredevil', name: 'Razor Instinct',
    d: ['Grazes pay +30%, the zone grows, and every graze fills the Nova gauge 25% more.', '+60%, a wider zone, 50% more gauge.', '+90%, the widest zone, 75% more gauge.'] },
  { id: 'hang', branch: 'score', tier: 2, req: 'ceiling', pos: [75, 235], icon: 'momentum', name: 'Hang Time',
    d: ['The multiplier drains 30% slower.', '50% slower.', '70% slower.'] },
  { id: 'chain', branch: 'score', tier: 2, req: 'razor', pos: [225, 235], icon: 'prism', name: 'Chain Reaction',
    d: ['Chain bonuses +40%.', '+80%.', '+130%.'] },

  { id: 'glide', branch: 'control', tier: 0, req: null, pos: [150, 40], icon: 'glide', name: 'Glide',
    d: ['After every hop you are untouchable for 0.3 seconds.', 'Untouchable for 0.5 seconds.', 'Untouchable for 0.7 seconds.'] },
  { id: 'swift', branch: 'control', tier: 1, req: 'glide', pos: [75, 135], icon: 'leap', name: 'Slipstream',
    d: ['Jumps between orbits are 12% faster.', '24% faster.', '36% faster.'] },
  { id: 'early', branch: 'control', tier: 1, req: 'glide', pos: [225, 135], icon: 'early', name: 'Foresight',
    d: ['Hazards show their warning 25% longer.', '50% longer.', '75% longer.'] },
  { id: 'mirage', branch: 'control', tier: 2, req: 'swift', pos: [75, 235], icon: 'mirage', name: 'Mirage',
    d: ['A deadly hit passes straight through you, once every 40 seconds.', 'Once every 28 seconds.', 'Once every 16 seconds.'] },
  { id: 'undertow', branch: 'control', tier: 2, req: 'early', pos: [225, 235], icon: 'calm', name: 'Undertow',
    d: ['The whole sky runs 8% slower.', '16% slower.', '24% slower.'] },

  { id: 'gift', branch: 'fortune', tier: 0, req: null, pos: [150, 40], icon: 'gift', name: 'Fortune\'s Gift',
    d: ['Start every run with a random power-up already working for you.', 'Start with one, and maybe a second.', 'Start with two, and maybe a third.'] },
  { id: 'charm', branch: 'fortune', tier: 1, req: 'gift', pos: [75, 135], icon: 'lucky_star', name: 'Lucky Charm',
    d: ['Power-ups appear 10% more often.', '20% more often.', '30% more often.'] },
  { id: 'armour', branch: 'fortune', tier: 1, req: 'gift', pos: [225, 135], icon: 'armour', name: 'Stardust Armour',
    d: ['Every 50 stardust you gather forges a shield (up to two held).', 'Every 38 stardust.', 'Every 26 stardust.'] },
  { id: 'fuse', branch: 'fortune', tier: 2, req: 'charm', pos: [75, 235], icon: 'fuse', name: 'Long Fuse',
    d: ['Timed power-ups last 25% longer.', '50% longer.', '75% longer.'] },
  { id: 'providence', branch: 'fortune', tier: 2, req: 'armour', pos: [225, 235], icon: 'providence', name: 'Providence',
    d: ['When you hold no protection (shield, guardian, aegis or life), the next power-up is always a defensive one.', 'Also when you hold just one protection.', 'Also when you hold just one, and defensive power-ups appear sooner.'] },
];
OD.PERKS.push(
  { id: 'bulwark', branch: 'guard', tier: 3, req: ['lifeline', 'phoenix'], icon: 'bulwark', name: 'Bulwark',
    d: ['Start every run with a fourth heart.', 'A fifth heart.', 'A sixth heart.'] },
  { id: 'zenith', branch: 'score', tier: 3, req: ['hang', 'chain'], icon: 'zenith', name: 'Nova Mastery',
    d: ['The Nova gauge fills 80% faster and a Nova lasts 1.5 s longer.', '160% faster, 3 s longer.', '240% faster, 4.5 s longer.'] },
  { id: 'weaver', branch: 'control', tier: 3, req: ['mirage', 'undertow'], icon: 'weaver', name: 'Time Weaver',
    d: ['A near miss bends time for 0.7 seconds (every 5 s).', '1.0 seconds.', '1.4 seconds.'] },
  { id: 'windfall', branch: 'fortune', tier: 3, req: ['fuse', 'providence'], icon: 'windfall', name: 'Windfall',
    d: ['Every 80 seconds a power-up drops right onto your orbit.', 'Every 60 seconds.', 'Every 42 seconds.'] },
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
// ---- skills: a path of perks you commit to, paid for with skill points, which you buy with stardust
// Skill points: each costs more than the last (55, 59, 63 ... about 920 for the 40th), so the first perks come within a run or two and a
// whole path is a few weeks of play. A perk's levels cost skill points by how much they change the run.
const SPT = [[1, 1, 2], [1, 2, 2], [2, 2, 3], [2, 3, 4], [3, 4, 5]];
OD.PERKS.forEach(p => { p.legacyCost = p.cost; p.sp = SPT[p.tier]; });
OD.SP_MAX = Infinity;   // no cap: every skill point just costs a little more than the last
OD.spCost = n => Math.round(55 * Math.pow(1.075, n) / 5) * 5;
OD.spSpent = () => OD.PERKS.concat(OD.ABILITIES || []).reduce((a, p) => { const lv = OD.perkLevel(p.id); return a + p.sp.slice(0, lv).reduce((x, y) => x + y, 0); }, 0);
OD.spFree = () => (OD.save.sp.bought || 0) - OD.spSpent();
OD.respecCost = () => { const sp = OD.spSpent(); return sp ? 150 + 25 * sp : 0; };
// what committing to a path gives for free, before you learn anything (see pathBonus in game.js)
OD.PATH_INFO = {
  guard: { name: 'Bastion', who: 'The Fortress', color: '#5ab8ff', innate: ['Shield pick-ups stack to three', 'Shields appear 30% more often', 'A broken shield protects you 0.6 s longer'], play: 'Forgiving: you survive mistakes, then punish the field.' },
  score: { name: 'Crescendo', who: 'The Virtuoso', color: '#ffd95a', innate: ['Every multiplier gain is 25% bigger', 'Tricks pay 25% more'], play: 'Risky: stay close to danger and ride a huge multiplier, and the show pays you back in protection.' },
  control: { name: 'Meridian', who: 'The Pilot', color: '#4df3ff', innate: ['Jumps are 8% quicker', 'Hazards warn you 10% longer'], play: 'Slippery: glide through danger, see it coming, and bend time when it gets close.' },
  fortune: { name: 'Fortuna', who: 'The Prospector', color: '#ff8ad9', innate: ['+15% stardust from every run', 'Power-ups appear 15% more often', 'Timed power-ups last 10% longer'], play: 'Lucky: power-ups find you, and the stardust you gather turns into armour.' },
};
// Every path is open to you, but its free bonus (the big passive under its name) only switches on when the whole path is done: every skill in it is
// fully unlocked, every level.
OD.PATH_FINAL = { guard: 'bulwark', score: 'zenith', control: 'weaver', fortune: 'windfall' };
OD.pathProgress = id => {   // a path is complete once every skill in it is fully unlocked (all levels), whichever one is the last to go
  const list = OD.PERKS.filter(p => p.branch === id), maxed = list.filter(p => OD.perkLevel(p.id) >= p.sp.length), left = list.filter(p => OD.perkLevel(p.id) < p.sp.length);
  return { learned: maxed.length, total: list.length, left: left.map(p => p.name), done: left.length === 0 };
};
OD.pathDone = id => OD.pathProgress(id).done;
OD.pathSpent = () => { const o = {}; for (const p of OD.PERKS) { const lv = OD.perkLevel(p.id); if (lv) o[p.branch] = (o[p.branch] || 0) + p.sp.slice(0, lv).reduce((x, y) => x + y, 0); } return o; };
OD.pathIs = id => OD.pathDone(id);
OD.perkLevel = id => (OD.save.perks && OD.save.perks[id]) || 0;
// the old stardust-priced perk tree: refund what was spent, once
OD.migrateSkills = () => {
  const sv = OD.save; if (sv.skillsV2) return;
  let refund = 0;
  for (const p of OD.PERKS) { const lv = (sv.perks && sv.perks[p.id]) || 0; for (let i = 0; i < lv; i++) refund += p.legacyCost[i]; }
  for (const b of OD.BOOSTERS) refund += (sv.boosters && sv.boosters[b.id] || 0) * b.price;
  sv.stardust = (sv.stardust || 0) + refund; sv.perks = {}; sv.boosters = {}; sv.sp = { bought: 0 }; sv.path = null; sv.skillsV2 = true; OD.persist();
};
// Abilities: things you DO, not things you have. The core game is tap to turn and swipe to jump one orbit; each of these is learned with skill points
// (hold it to learn it) and then used in a run. They live in the same save slot as perks (level 1 = learned).
OD.ABILITIES = [
  { id: 'cascade', name: 'Cascade', short: 'Cascade', color: '#7be8ff', icon: 'cascade', sp: [5], reqs: ['chain'], path: 'score', how: 'Swipe, keep your finger down',
    d: ['After a swipe, keep your finger down and you keep hopping, orbit after orbit, in the same direction. Let go to stop.'] },
  { id: 'retro', name: 'Retro Thrust', short: 'Retro', color: '#c9a0ff', icon: 'retro', sp: [4, 5], reqs: ['undertow'], path: 'control', how: 'Press and hold',
    d: ['Press and hold anywhere without moving and only YOUR dot slows right down, for up to 2 seconds. The meter takes about 30 seconds to fill again.', 'While it is on, slide your finger away from the planet or towards it to hop to the next orbit that way. One slide is enough: you keep hopping that way, like Cascade, and slide the other way to turn back. It lasts only as long as the brake does.'] },
  { id: 'afterburner', name: 'Afterburner', short: 'Burner', color: '#ffb36b', icon: 'afterburner', sp: [4, 5], reqs: ['mirage'], path: 'control', how: 'Press and hold',
    d: ['The opposite of Retro Thrust: press and hold and only YOUR dot speeds up, for up to 2 seconds, with the same slow recharge. You can learn both, but only one is equipped at a time.', 'While it is on, slide your finger away from the planet or towards it to hop to the next orbit that way. One slide is enough: you keep hopping that way, like Cascade, and slide the other way to turn back. It lasts only as long as the boost does.'] },
  { id: 'hop', name: 'Safety Hop', short: 'Hop', color: '#8affb0', icon: 'hop', sp: [4], reqs: ['phoenix'], path: 'guard', how: 'Happens by itself',
    d: ['When a hit would end your run, you hop to the nearest free orbit instead and are safe for a moment. Recharges in 35 seconds.'] },
  { id: 'shock', name: 'Shockwave', short: 'Shock', color: '#ff9a5a', icon: 'shock', sp: [5], reqs: ['providence'], path: 'fortune', how: 'Double-tap',
    d: ['Tap twice, quickly, anywhere on the screen, to blast away every hazard close to you. It works whether or not another finger is down. Recharges in 24 seconds.'] },
];
// retro thrust and afterburner are two ends of one slot: both can be learned, one is equipped
OD.equippedMove = () => { const sv = OD.save, r = OD.ability('retro'), b = OD.ability('afterburner'); if (r && b) return sv.equip === 'afterburner' ? 'afterburner' : 'retro'; return r ? 'retro' : b ? 'afterburner' : null; };
OD.ABILITIES.forEach(a => { a.branch = 'ability'; a.tier = 0; a.max = a.sp.length; });
OD.PERK_BY_ID = {}; OD.PERKS.forEach(p => { OD.PERK_BY_ID[p.id] = p; }); OD.ABILITIES.forEach(a => { OD.PERK_BY_ID[a.id] = a; });
// one-time boosters: bought in stacks, one of each armed booster is used up at the start of a run
OD.BOOSTERS = [
  { id: 'b_shield', name: 'Head Start', icon: 'shield', color: '#5ab8ff', price: 60, desc: 'Start the run with a shield.' },
  { id: 'b_mult', name: 'Warm Start', icon: 'amp', color: '#f5ff5a', price: 90, desc: 'Start the run at a x2.0 multiplier.' },
  { id: 'b_dust', name: 'Dust Rush', icon: 'fortune', color: '#ffc247', price: 110, desc: '+50% stardust from this run.' },
  { id: 'b_life', name: 'Spare Life', icon: 'life', color: '#ff5a7a', price: 150, desc: 'Start the run with an extra life.' },
];
OD.BOOSTER_MAX = 9;
OD.perkLevel = id => (OD.save.perks && OD.save.perks[id]) || 0;
OD.ability = id => OD.perkLevel(id) > 0;
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
  { id: 'win1', name: 'Beyond the Horizon', desc: 'Defeat the black hole and clear a universe', reward: 150, test: (s, r, sv) => (sv.wins || 0) >= 1, prog: (s, sv) => cnt(sv.wins || 0, 1) },
  { id: 'win3', name: 'Multiversal', desc: 'Clear 3 universes', reward: 300, test: (s, r, sv) => (sv.wins || 0) >= 3, prog: (s, sv) => cnt(sv.wins || 0, 3) },
  { id: 'win10', name: 'Cosmic Cycle', desc: 'Clear 10 universes', reward: 1000, test: (s, r, sv) => (sv.wins || 0) >= 10, prog: (s, sv) => cnt(sv.wins || 0, 10) },
  { id: 'inner', name: 'Inner Circle', desc: '30 seconds on the innermost orbit in one run', reward: 40, test: (s, r) => r && r.innerTime >= 30 },
  { id: 'twin1', name: 'Hop Skip', desc: 'Jump to a twin planet', reward: 25, test: s => s.transfers >= 1, prog: s => cnt(s.transfers, 1) },
  { id: 'twin25', name: 'Binary Star', desc: 'Make 25 twin-planet jumps', reward: 70, test: s => s.transfers >= 25, prog: s => cnt(s.transfers, 25) },
  { id: 'stargazer', name: 'Stargazer', desc: 'Survive a cosmic event', reward: 30, test: s => s.events >= 1, prog: s => cnt(s.events, 1) },
  { id: 'hole1', name: 'Horizon Walker', desc: 'Survive a black hole', reward: 60, test: s => s.holes >= 1, prog: s => cnt(s.holes, 1) },
  { id: 'nova1', name: 'Sun Dodger', desc: 'Survive a supernova', reward: 100, test: s => s.novas >= 1, prog: s => cnt(s.novas, 1) },
  { id: 'razor10', name: 'Razor Thin', desc: 'Make 10 razor-thin near misses', reward: 50, test: s => s.razors >= 10, prog: s => cnt(s.razors, 10) },
  { id: 'clutch25', name: 'Clutch Player', desc: 'Make 25 clutch flips', reward: 40, test: s => s.clutch >= 25, prog: s => cnt(s.clutch, 25) },
  { id: 'power25', name: 'Power Player', desc: 'Collect 25 power-ups', reward: 40, test: s => s.powerups >= 25, prog: s => cnt(s.powerups, 25) },
  { id: 'worlds', name: 'Grand Tour', desc: 'Visit 8 different planets', reward: 80, test: (s, r, sv) => Object.keys(sv.seenPlanets || {}).length >= 8, prog: (s, sv) => cnt(Object.keys(sv.seenPlanets || {}).length, 8) },
  { id: 'skill1', name: 'Pathfinder', desc: 'Learn your first skill', reward: 20, test: (s, r, sv) => OD.spSpent() >= 1, prog: (s, sv) => cnt(OD.spSpent(), 1) },
  { id: 'skill12', name: 'Specialist', desc: 'Spend 12 skill points', reward: 60, test: (s, r, sv) => OD.spSpent() >= 12, prog: (s, sv) => cnt(OD.spSpent(), 12) },
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
  singularity: ['The innermost orbit blinks red before it is eaten: swipe outward as soon as it starts.', 'Stay on the outer orbits while the black hole eats its way out, and keep an eye on the dots under the score.'],
  ribbon: ['Only the bright core of the ribbon hurts, and it swings across two orbits as it ripples. Slip in behind its tail.', 'A calm orbit away from the ribbon is always safe: jump while it is far.'],
  tether: ['The cable is as deadly as the boulders. Its gap swings like a gate: pass behind it, not through it.', 'The cable only spans a couple of orbits. Hop outside them.'],
  cinder: ['A cinder cannot turn sharply. Flip or jump at the last moment and it flies past.', 'A shield, a zap or a Pulse destroys it.'],
  spear: ['A lance walls off every orbit from its tip outward. The orbits inside the tip stay open.', 'The ring closing on the tip shows where it will land.'],
  pylon: ['The lightning fires on the third beat: quiet, charging, FIRE, afterglow. Cross during the quiet beat.', 'The thread brightening means the strike is next.'],
  shoal: ['The shoal weaves as it swims. Each fish is small: find the gap between two of them, or stay out of its lane.', 'The arrow at the edge of the sky shows where it comes in.'],
  devil: ['The core of a dust devil is deadly. The wind around it only spins you the other way round.', 'It wanders between orbits: read where it is heading, not where it is.'],
  bloom: ['The spokes show where the fire will go. Leave the line of a spoke before the blossom opens.', 'The bud itself is deadly too, but only until it opens.'],
  hail: ['Each dotted lane is a shard about to fall. The brighter the lane, the sooner it comes.', 'They fall in turn, not all at once.'],
  serpent: ['The coil spirals in towards the planet and out again. Its whole body is deadly.', 'Pass behind its tail, or jump to an orbit it has already crossed.'],
  rift: ['A rift moves you to its twin. It never hurts, but it can drop you into a hazard.', 'Walk around a doorway to skip it.'],
  shade: ['The shade follows your old path. It cannot hurt you from behind, but turning round into it can.', 'Its dotted wake shows exactly where it will go.'],
  spinner: ['The whole blade is deadly. Pass when it points away from your orbit.'],
  flare: ['Dashed lines show where the flare lanes will fire. Stand between them.'],
  nova: ['Hide in the dark shadow behind the planet when a supernova goes off.'],
  general: ['Swipe away from the planet to go out one orbit, towards it to go in one. Keep your finger down after a swipe to keep jumping.', 'Only a tap turns you around. Swiping never does.', 'Close passes (grazes) build your combo and charge Nova.', 'Collect stardust in a row for streak bonuses.', 'A power-up shield also blasts nearby debris away.', 'When a planet drifts in, a jump from your outer orbit can take you to a new home.'],
};
OD.migrateSkills();
