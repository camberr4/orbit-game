'use strict';
// Static game content: worlds, modes, cosmetics, power-ups, challenges.

OD.WORLDS = [
  {
    id: 0, name: 'Aurora', sub: 'Where every orbit begins', bpm: 108, root: 57, scale: [0, 3, 5, 7, 10],
    bg: ['#04091c', '#0a1a45'], accent: '#4df3ff', accent2: '#b36bff', danger: '#ff4d7a', neb: ['#2a63ff', '#8a3dff'],
    speed: 1, hazards: ['rock', 'comet', 'mine', 'ring'], unlockScore: 0, planet: 'terra',
  },
  {
    id: 1, name: 'Ember', sub: 'A star on its last breath', bpm: 118, root: 55, scale: [0, 3, 5, 6, 7, 10],
    bg: ['#150403', '#40100a'], accent: '#ffc24d', accent2: '#ff6a3d', danger: '#ff2f6a', neb: ['#ff5a1f', '#a3123a'],
    speed: 1.08, hazards: ['rock', 'comet', 'mine', 'ring', 'beam'], unlockScore: 2000, planet: 'lava',
  },
  {
    id: 2, name: 'Glacier', sub: 'Silent, sharp, and slippery', bpm: 114, root: 60, scale: [0, 2, 4, 7, 9],
    bg: ['#021821', '#06404f'], accent: '#aef4ff', accent2: '#ffffff', danger: '#ff6fb5', neb: ['#18c7d9', '#3a7dff'],
    speed: 1.12, hazards: ['rock', 'comet', 'mine', 'ring', 'beam', 'hole'], unlockScore: 3000, planet: 'ice',
  },
  {
    id: 3, name: 'Void', sub: 'The planet that eats light', bpm: 124, root: 52, scale: [0, 2, 3, 5, 7, 8, 10],
    bg: ['#08000f', '#230638'], accent: '#c77dff', accent2: '#4dffb8', danger: '#ff3d81', neb: ['#9b2dff', '#ff2d9a'],
    speed: 1.18, hazards: ['rock', 'comet', 'mine', 'ring', 'beam', 'hole'], unlockScore: 4500, planet: 'void',
  },
];

OD.MODES = {
  endless:    { name: 'Endless',     desc: 'Survive as long as you can. Bosses every 90 seconds.', free: true },
  daily:      { name: 'Daily',       desc: 'One shared layout per day. Build a streak.' },
  zen:        { name: 'Zen',         desc: 'No danger. Just orbit, breathe, and drift.' },
  hardcore:   { name: 'Hardcore',    desc: 'No pickups to save you. Faster. Double score.' },
  timeattack: { name: 'Time Attack', desc: '60 seconds. Dense debris. Score as much as you can.' },
};
OD.MODE_ORDER = ['endless', 'daily', 'timeattack', 'hardcore', 'zen'];

OD.POWERS = {
  shield: { name: 'Shield', color: '#5ab8ff', dur: 0, desc: 'Absorbs one hit' },
  slow:   { name: 'Slow-Mo', color: '#ffd95a', dur: 5, desc: 'Bends time around you' },
  magnet: { name: 'Magnet', color: '#ff7ad9', dur: 7, desc: 'Pulls in stardust' },
  phase:  { name: 'Phase', color: '#7affc4', dur: 4, desc: 'Pass through debris' },
};

OD.COSMETICS = {
  trail: [
    { id: 'classic', name: 'Classic', price: 0 },
    { id: 'comet', name: 'Comet', price: 150 },
    { id: 'ember', name: 'Cinder', price: 300 },
    { id: 'ice', name: 'Frostbite', price: 300 },
    { id: 'rainbow', name: 'Prism', price: 450 },
    { id: 'glitch', name: 'Glitch', price: 600 },
  ],
  planet: [
    { id: 'terra', name: 'Terra', price: 0 },
    { id: 'moon', name: 'Luna', price: 150 },
    { id: 'lava', name: 'Magma', price: 200 },
    { id: 'ice', name: 'Cryo', price: 200 },
    { id: 'gas', name: 'Jovian', price: 300 },
    { id: 'ringed', name: 'Saturnine', price: 500 },
    { id: 'void', name: 'Eclipse', price: 700 },
  ],
  debris: [
    { id: 'rock', name: 'Asteroid', price: 0 },
    { id: 'scrap', name: 'Scrap', price: 300 },
    { id: 'crystal', name: 'Crystal', price: 350 },
    { id: 'orb', name: 'Plasma', price: 450 },
  ],
};
OD.COSMETIC_LABEL = { trail: 'Trails', planet: 'Planets', debris: 'Debris' };

// Challenges: test(stats, run, save) -> bool, prog(stats, save) -> [cur, goal]
const cnt = (v, goal) => [Math.min(v, goal), goal];
OD.CHALLENGES = [
  { id: 'first', name: 'First Orbit', desc: 'Finish your first run', reward: 10, test: s => s.runs >= 1, prog: s => cnt(s.runs, 1) },
  { id: 'runs50', name: 'Frequent Flyer', desc: 'Complete 50 runs', reward: 60, test: s => s.runs >= 50, prog: s => cnt(s.runs, 50) },
  { id: 'graze10', name: 'Close Shave', desc: 'Graze 10 hazards in one run', reward: 15, test: (s, r) => r && r.grazes >= 10 },
  { id: 'graze25', name: 'Razor\'s Edge', desc: 'Graze 25 hazards in one run', reward: 40, test: (s, r) => r && r.grazes >= 25 },
  { id: 'graze500', name: 'Daredevil', desc: 'Graze 500 hazards in total', reward: 60, test: s => s.grazes >= 500, prog: s => cnt(s.grazes, 500) },
  { id: 'combo5', name: 'On a Roll', desc: 'Reach a x5 combo', reward: 20, test: s => s.maxCombo >= 5, prog: s => cnt(s.maxCombo, 5) },
  { id: 'combo8', name: 'Maximum Overdrive', desc: 'Reach the x8 combo cap', reward: 50, test: s => s.maxCombo >= 8, prog: s => cnt(s.maxCombo, 8) },
  { id: 'score1k', name: 'Warming Up', desc: 'Score 1,000 in a run', reward: 15, test: (s, r) => r && r.score >= 1000 },
  { id: 'score2500', name: 'Gravity Well', desc: 'Score 2,500 in a run', reward: 30, test: (s, r) => r && r.score >= 2500 },
  { id: 'score5k', name: 'Escape Velocity', desc: 'Score 5,000 in a run', reward: 60, test: (s, r) => r && r.score >= 5000 },
  { id: 'score10k', name: 'Event Horizon', desc: 'Score 10,000 in a run', reward: 120, test: (s, r) => r && r.score >= 10000 },
  { id: 'time60', name: 'Minute Man', desc: 'Survive 60 seconds', reward: 15, test: (s, r) => r && r.time >= 60 },
  { id: 'time120', name: 'Long Haul', desc: 'Survive 2 minutes', reward: 35, test: (s, r) => r && r.time >= 120 },
  { id: 'time240', name: 'Lifer', desc: 'Survive 4 minutes', reward: 80, test: (s, r) => r && r.time >= 240 },
  { id: 'perfect5', name: 'Sling Shot', desc: '5 perfect slingshots in one run', reward: 30, test: (s, r) => r && r.perfects >= 5 },
  { id: 'perfect100', name: 'Sharpshooter', desc: '100 perfect slingshots in total', reward: 70, test: s => s.perfects >= 100, prog: s => cnt(s.perfects, 100) },
  { id: 'dust1k', name: 'Stardust Hoarder', desc: 'Collect 1,000 stardust orbs', reward: 60, test: s => s.dust >= 1000, prog: s => cnt(s.dust, 1000) },
  { id: 'overdrive', name: 'Supernova', desc: 'Trigger Overdrive', reward: 20, test: s => s.overdrives >= 1, prog: s => cnt(s.overdrives, 1) },
  { id: 'overdrive10', name: 'Burning Bright', desc: 'Trigger Overdrive 10 times', reward: 50, test: s => s.overdrives >= 10, prog: s => cnt(s.overdrives, 10) },
  { id: 'boss1', name: 'Gatekeeper', desc: 'Survive a boss ring', reward: 30, test: s => s.bosses >= 1, prog: s => cnt(s.bosses, 1) },
  { id: 'boss10', name: 'Ring Breaker', desc: 'Survive 10 boss rings', reward: 90, test: s => s.bosses >= 10, prog: s => cnt(s.bosses, 10) },
  { id: 'inner', name: 'Inner Circle', desc: '30 seconds on the innermost orbit in one run', reward: 40, test: (s, r) => r && r.innerTime >= 30 },
  { id: 'power25', name: 'Power Player', desc: 'Collect 25 power-ups', reward: 40, test: s => s.powerups >= 25, prog: s => cnt(s.powerups, 25) },
  { id: 'daily1', name: 'Daily Driver', desc: 'Finish a Daily run', reward: 20, test: s => s.dailies >= 1, prog: s => cnt(s.dailies, 1) },
  { id: 'streak7', name: 'Seven Suns', desc: 'Reach a 7-day Daily streak', reward: 100, test: (s, r, sv) => sv.daily.streak >= 7, prog: (s, sv) => cnt(sv.daily.streak, 7) },
  { id: 'hard1500', name: 'No Safety Net', desc: 'Score 1,500 in Hardcore', reward: 60, test: (s, r) => r && r.mode === 'hardcore' && r.score >= 1500 },
  { id: 'ta1500', name: 'Speed Runner', desc: 'Score 1,500 in Time Attack', reward: 50, test: (s, r) => r && r.mode === 'timeattack' && r.score >= 1500 },
  { id: 'zen10', name: 'Inner Peace', desc: 'Spend 10 minutes in Zen mode', reward: 40, test: s => s.zenTime >= 600, prog: s => cnt(Math.floor(s.zenTime / 60), 10) },
  { id: 'worlds', name: 'Grand Tour', desc: 'Play all four worlds', reward: 60, test: (s, r, sv) => Object.keys(sv.bestWorld).length >= 4, prog: (s, sv) => cnt(Object.keys(sv.bestWorld).length, 4) },
  { id: 'shop5', name: 'Fashionista', desc: 'Own 6 cosmetics', reward: 30, test: (s, r, sv) => OD.ownedCount() >= 9, prog: (s, sv) => cnt(OD.ownedCount() - 3, 6) },
  { id: 'share', name: 'Show Off', desc: 'Share a clip', reward: 10, test: s => s.shares >= 1, prog: s => cnt(s.shares, 1) },
];
OD.ownedCount = () => Object.values(OD.save.owned).reduce((a, l) => a + l.length, 0);
