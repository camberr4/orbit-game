'use strict';
// Static game content: worlds, modes, cosmetics, power-ups, challenges.

// Sectors of space, ordered from peaceful to deadly. Each has its own rules, bonuses and dangers.
//   risk: 1-5 stars     rules: world-wide rule ids (see eraIs in game.js)     mods: gameplay multipliers
OD.WORLDS = [
  {
    id: 0, name: 'Aurora Reach', short: 'Aurora', sub: 'A calm nursery of light', risk: 1, bpm: 108, root: 57, scale: [0, 3, 5, 7, 10],
    bg: ['#04091c', '#0a1a45'], accent: '#4df3ff', accent2: '#b36bff', danger: '#ff4d7a', neb: ['#2a63ff', '#8a3dff'], amb: 'ribbons',
    speed: 0.95, hazards: ['rock', 'comet', 'mine'], unlockScore: 0, planet: 'terra', rules: [],
    mods: { scoreMul: 1, dustMul: 1.6, evW: { bloom: 2.5 } },
    bonus: ['Plentiful stardust', 'More Stardust Blooms'], dangers: ['Asteroids', 'Comets', 'Pulse mines'],
  },
  {
    id: 1, name: 'Dust Belt', short: 'Dust Belt', sub: 'Rock fields and spinning blades', risk: 2, bpm: 112, root: 53, scale: [0, 2, 3, 7, 9],
    bg: ['#140d06', '#3a2410'], accent: '#ffcf7a', accent2: '#ff9a4d', danger: '#ff4d5e', neb: ['#c47a2a', '#7a3a12'], amb: 'dust',
    speed: 1.0, hazards: ['rock', 'comet', 'mine', 'spinner'], unlockScore: 1500, planet: 'moon', rules: [],
    mods: { scoreMul: 1.15, dustMul: 1.2, rockMul: 1.7, evW: { shower: 2.5 } },
    bonus: ['+15% score'], dangers: ['Crowded asteroid fields', 'Spinners: rotating blades', 'Meteor showers'],
  },
  {
    id: 2, name: 'Ember Rift', short: 'Ember Rift', sub: 'A star on its last breath', risk: 3, bpm: 118, root: 55, scale: [0, 3, 5, 6, 7, 10],
    bg: ['#150403', '#40100a'], accent: '#ffc24d', accent2: '#ff6a3d', danger: '#ff2f6a', neb: ['#ff5a1f', '#a3123a'], amb: 'embers',
    speed: 1.05, hazards: ['rock', 'comet', 'mine', 'ring', 'beam'], unlockScore: 2800, planet: 'lava', rules: ['molten'],
    mods: { scoreMul: 1.3, dustMul: 1.2, evW: { flare: 2.5 } },
    bonus: ['+30% score', 'Solar flares are common'], dangers: ['Pulse mines everywhere', 'Laser sweeps', 'Wall rings'],
  },
  {
    id: 3, name: 'Glacier Drift', short: 'Glacier', sub: 'Silent, sharp and slippery', risk: 3, bpm: 114, root: 60, scale: [0, 2, 4, 7, 9],
    bg: ['#021821', '#06404f'], accent: '#aef4ff', accent2: '#ffffff', danger: '#ff6fb5', neb: ['#18c7d9', '#3a7dff'], amb: 'snow',
    speed: 1.08, hazards: ['rock', 'comet', 'mine', 'ring', 'spinner', 'hole'], unlockScore: 4500, planet: 'ice', rules: ['frozen'],
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
  endless:    { name: 'Endless',     desc: 'Survive as long as you can. Bosses every 90 seconds.', free: true },
  daily:      { name: 'Daily',       desc: 'One shared layout per day. Build a streak.' },
  zen:        { name: 'Zen',         desc: 'No danger. Just orbit, breathe, and drift.' },
  hardcore:   { name: 'Hardcore',    desc: 'No pickups to save you. Faster. Double score.' },
  timeattack: { name: 'Time Attack', desc: '60 seconds. Dense debris. Score as much as you can.' },
};
OD.MODE_ORDER = ['endless', 'daily', 'timeattack', 'hardcore', 'zen'];

OD.POWERS = {
  shield: { cat: 'charge', name: 'Shield', color: '#5ab8ff', dur: 0, desc: 'Absorbs one hit' },
  leap:   { cat: 'timed', name: 'Warp Jump', color: '#5ad2ff', dur: 12, desc: 'Jump across any number of orbits' },
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
    { id: 'stardust', name: 'Stardust', price: 250 },
    { id: 'ember', name: 'Cinder', price: 300 },
    { id: 'ice', name: 'Frostbite', price: 300 },
    { id: 'pixel', name: 'Pixel', price: 400 },
    { id: 'rainbow', name: 'Prism', price: 450 },
    { id: 'aurora', name: 'Aurora', price: 550 },
    { id: 'glitch', name: 'Glitch', price: 600 },
    { id: 'plasma', name: 'Plasma', price: 750 },
  ],
  core: [
    { id: 'orb', name: 'Orb', price: 0 },
    { id: 'ring', name: 'Ring', price: 150 },
    { id: 'diamond', name: 'Diamond', price: 250 },
    { id: 'star', name: 'Nova Star', price: 350 },
    { id: 'pulse', name: 'Heartbeat', price: 400 },
    { id: 'halo', name: 'Halo', price: 550 },
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
OD.COSMETIC_LABEL = { trail: 'Trails', core: 'Core', aura: 'Aura', orbit: 'Orbits', debris: 'Debris', sky: 'Sky', burst: 'Burst' };

// Challenges: test(stats, run, save) -> bool, prog(stats, save) -> [cur, goal]
const cnt = (v, goal) => [Math.min(v, goal), goal];
OD.CHALLENGES = [
  { id: 'first', name: 'First Orbit', desc: 'Finish your first run', reward: 10, test: s => s.runs >= 1, prog: s => cnt(s.runs, 1) },
  { id: 'runs50', name: 'Frequent Flyer', desc: 'Complete 50 runs', reward: 60, test: s => s.runs >= 50, prog: s => cnt(s.runs, 50) },
  { id: 'graze10', name: 'Close Shave', desc: 'Graze 10 hazards in one run', reward: 15, test: (s, r) => r && r.grazes >= 10 },
  { id: 'graze25', name: 'Razor\'s Edge', desc: 'Graze 25 hazards in one run', reward: 40, test: (s, r) => r && r.grazes >= 25 },
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
  { id: 'boss1', name: 'Gatekeeper', desc: 'Survive a boss ring', reward: 30, test: s => s.bosses >= 1, prog: s => cnt(s.bosses, 1) },
  { id: 'boss10', name: 'Ring Breaker', desc: 'Survive 10 boss rings', reward: 90, test: s => s.bosses >= 10, prog: s => cnt(s.bosses, 10) },
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
  { id: 'worlds', name: 'Grand Tour', desc: 'Play every sector of space', reward: 80, test: (s, r, sv) => Object.keys(sv.bestWorld).length >= OD.WORLDS.length, prog: (s, sv) => cnt(Object.keys(sv.bestWorld).length, OD.WORLDS.length) },
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
  general: ['Hold, then slide your thumb up or down to pick a bigger or tighter orbit.', 'Release a jump on the golden glow for a Slingshot boost.', 'Close passes (grazes) build your combo and charge Nova.', 'Collect stardust in a row for streak bonuses.', 'A power-up shield also blasts nearby debris away.', 'When a planet drifts in, a jump from your outer orbit can take you to a new home.'],
};
