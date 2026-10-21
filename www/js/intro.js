'use strict';
// Gradual introduction of game elements.
//
// Every new thing (hazard, pickup, event, technique) lives in OD.INTRO. It can only appear once the player has
// completed `runs` runs, and at most ONE new element is introduced per run. The first time it shows up the game
// pauses and a popup explains what it is, how it looks and what to do. Seen elements are listed in the Field Guide.
//
// TO ADD A NEW ELEMENT: add an entry here (id, kind, runs, name, tag, look, todo[]), an illustration in ART below,
// then in game.js gate its spawn with `canUse('<id>')` and call `introduce('<id>')` when it first appears.
OD.INTRO = [
  { id: 'rock', kind: 'hazard', runs: 0, name: 'Asteroid', tag: 'Rocky debris drifting on the orbits',
    look: 'A dark, jagged rock with a glowing red edge. It circles the planet along one orbit.',
    todo: ['Never touch it. One hit ends the run.', 'Flip direction or jump to another orbit to get around it.', 'Pass close without touching it for a GRAZE bonus.'] },
  { id: 'dust', kind: 'pickup', runs: 0, name: 'Stardust', tag: 'Golden stars to collect',
    look: 'Small glowing golden stars floating along the orbits.',
    todo: ['Fly through them to collect them.', 'Stardust buys trails, planets and more in the Shop.', 'Grab several quickly for a streak bonus.'] },
  { id: 'overdrive', kind: 'tip', runs: 0, name: 'Nova', tag: 'Fill the meter, become unstoppable',
    look: 'Your dot blazes white and gold, and a halo spins around it.',
    todo: ['Near misses (grazes) fill the ring around the planet.', 'When it is full you smash through debris for points.', 'Nothing can hurt you until the glow fades.'] },
  { id: 'comet', kind: 'hazard', runs: 1, name: 'Comet', tag: 'A fast streak across the sky',
    look: 'A white-hot head with a red tail. A dashed line shows its path before it arrives.',
    todo: ['Read the dashed line, then be somewhere else.', 'Comets cross every orbit, so flipping or jumping both work.'] },
  { id: 'mine', kind: 'hazard', runs: 2, name: 'Pulse Mine', tag: 'It flashes big on the beat',
    look: 'A spiky red ball inside a dashed circle. On every second beat the circle flashes and becomes deadly.',
    todo: ['Only the flashing circle is the danger zone.', 'Slide past while it is small, between the flashes.'] },
  { id: 'ring', kind: 'hazard', runs: 3, name: 'Wall Ring', tag: 'A glowing wall with one gap',
    look: 'A red circle around the planet with a gap. The gap edges glow and the whole wall turns slowly.',
    todo: ['Be inside the gap when the wall turns solid.', 'Jumping to another orbit lets you slip across a wall.', 'Squeeze through close to an edge for a near miss.'] },
  { id: 'shield', kind: 'power', runs: 4, name: 'Shield', tag: 'Absorbs one hit',
    look: 'A blue ring with a shield symbol inside, floating on an orbit.',
    todo: ['Collect it and the next hit is blocked.', 'The break blasts nearby debris away.'] },
  { id: 'steer', kind: 'tip', runs: 5, name: 'Choose Your Orbit', tag: 'Drag toward the orbit you want',
    look: 'While you hold, gold diamonds mark every orbit you could jump to. The one nearest your finger lights up.',
    todo: ['Hold, then drag your finger toward the orbit you want and release to jump there.', 'Drag back onto your own orbit to cancel.', 'Prefer timing? Do not drag: release on the golden glow for a Slingshot boost.'] },
  { id: 'slow', kind: 'power', runs: 6, name: 'Slow-Mo', tag: 'Bends time around you',
    look: 'A gold ring with a clock inside.',
    todo: ['Everything slows for a few seconds.', 'Use it to line up a tricky pass.'] },
  { id: 'bloom', kind: 'event', runs: 7, name: 'Stardust Bloom', tag: 'A free stardust party',
    look: 'Golden stars appear all along every orbit at once.',
    todo: ['Sweep as many as you can.', 'No danger, only reward.'] },
  { id: 'magnet', kind: 'power', runs: 8, name: 'Magnet', tag: 'Pulls stardust to you',
    look: 'A pink ring with a horseshoe magnet inside.',
    todo: ['Stardust within reach flies to you.', 'Great right after a Bloom.'] },
  { id: 'shower', kind: 'event', runs: 9, name: 'Meteor Shower', tag: 'A wall of comets',
    look: 'A dozen dashed lines appear at once, all pointing the same way.',
    todo: ['Comets arrive one after another along the lines.', 'Find a gap between lines and stay there.'] },
  { id: 'twin', kind: 'event', runs: 10, name: 'New Planet', tag: 'Another planet drifts in. Jump across?',
    look: 'A whole other planet with its own three orbits drifts in above or below. The camera pulls back so you can see both.',
    todo: ['Fly on your OUTERMOST orbit. When the two outer orbits meet, a gold diamond shows the jump.', 'Hold and release to jump across: the new planet locks in as your home and the old one drifts away.', 'Each planet type changes the rules and gives a score bonus.', 'Not interested? Just let it drift by.'] },
  { id: 'bomb', kind: 'power', runs: 13, name: 'Bomb', tag: 'Clears the field',
    look: 'An orange ring with a round bomb inside.',
    todo: ['Every hazard on screen blows up when you collect it.', 'Each one you clear scores points.'] },
  { id: 'double', kind: 'power', runs: 16, name: 'Double Score', tag: 'Score x2 for a few seconds',
    look: 'A yellow ring with a big x2.',
    todo: ['All points are doubled while it lasts.', 'Stack it with grazes and slingshots.'] },
  { id: 'zap', kind: 'power', runs: 7, name: 'Guardian', tag: 'Destroys what would kill you',
    look: 'A lime ring with a lightning bolt inside.',
    todo: ['The next two rocks, comets, mines or spinners that would hit you are destroyed instead.', 'It cannot stop walls, lasers or cosmic events.'] },
  { id: 'brake', kind: 'power', runs: 9, name: 'Brake', tag: 'Slows only you',
    look: 'A lavender ring with a stop bar.',
    todo: ['Your dot slows right down while the world keeps moving.', 'Perfect for threading a tight gap.'] },
  { id: 'life', kind: 'power', runs: 15, name: 'Extra Life', tag: 'A second chance',
    look: 'A red ring with a heart inside.',
    todo: ['When something would end your run, you survive instead and blast the area clear.', 'You can hold up to three. Hearts show at the bottom of the screen.'] },
  { id: 'overload', kind: 'power', runs: 19, name: 'Overload', tag: 'Instant Nova',
    look: 'A white ring with a starburst.',
    todo: ['Triggers Nova right away: smash through everything for a few seconds.', 'No need to fill the meter first.'] },
  { id: 'phase', kind: 'power', runs: 11, name: 'Phase', tag: 'Walk through debris',
    look: 'A green ring drawn with dashes.',
    todo: ['For a few seconds debris cannot hurt you.', 'Do not rely on it to the very last moment.'] },
  { id: 'boss', kind: 'event', runs: 12, name: 'Eclipse', tag: 'Boss rings every 90 seconds',
    look: 'Glowing walls on two orbits with wide gaps, leaving one orbit open.',
    todo: ['Stay on the open orbit.', 'When the walls switch, jump to the new open orbit.', 'Survive both phases for a big bonus.'] },
  { id: 'giant', kind: 'event', runs: 14, name: 'Gas Giant', tag: 'Gravity bends your orbit',
    look: 'A huge banded planet with moons drifts past the edge of the screen.',
    todo: ['Its gravity tugs your orbit toward it.', 'When a gold ring circles you, jump for a GRAVITY ASSIST boost.'] },
  { id: 'flare', kind: 'event', runs: 17, name: 'Solar Flare', tag: 'Lanes of fire',
    look: 'A bright star at the edge draws dashed lines across the screen, then fires.',
    todo: ['Dashed lines show where the lanes will fire.', 'Be in the gap between lanes when they light up.', 'It fires twice, in different places.'] },
  { id: 'blackhole', kind: 'event', runs: 22, name: 'Black Hole', tag: 'It pulls everything in',
    look: 'A black core wrapped in a glowing disc. Stars and debris spiral toward it.',
    todo: ['It drags your orbit toward it. Move to a tighter orbit.', 'Never touch the black core.', 'It also swallows debris and stardust.'] },
  { id: 'supernova', kind: 'event', runs: 30, name: 'Supernova', tag: 'A star explodes',
    look: 'A star swells and flashes. A dark shadow stretches out behind the planet.',
    todo: ['Hide inside the dark shadow behind the planet.', 'A shield or Phase also saves you.', 'Surviving pays a huge bonus.'] },
  { id: 'era_tidal', kind: 'era', runs: 9, name: 'Ocean World', tag: 'A planet where the orbits breathe',
    look: 'A deep blue planet with white swirls. When you move in, the sky glows blue.',
    todo: ['All three orbits slowly breathe in and out.', 'Leave a little extra room around hazards.', 'Bonus: +10% score while you live here.'] },
  { id: 'era_molten', kind: 'era', runs: 13, name: 'Lava World', tag: 'A planet that burns',
    look: 'A dark crust cracked with glowing lava, red light and rising embers.',
    todo: ['Pulse mines become much more common.', 'Learn their beat: only the flash is dangerous.', 'Bonus: +25% score while you live here.'] },
  { id: 'era_frozen', kind: 'era', runs: 18, name: 'Ice World', tag: 'A planet of slippery ice',
    look: 'A pale blue and white planet under glittering snow.',
    todo: ['Turning takes a moment on the ice, so flip a little earlier.', 'Rocks drift more slowly here.', 'Bonus: +15% score while you live here.'] },
  { id: 'era_storm', kind: 'era', runs: 24, name: 'Storm Giant', tag: 'Lightning and surging speed',
    look: 'Swirling bands cover the planet and lightning flashes across a purple sky.',
    todo: ['Your speed surges and eases in waves.', 'Comets come more often, so watch for the dashed lines.', 'Bonus: +30% score while you live here.'] },
  { id: 'era_eclipse', kind: 'era', runs: 32, name: 'Dark World', tag: 'Night falls',
    look: 'A black planet with a glowing rim. Only the area around you is lit.',
    todo: ['You can only see close to your dot.', 'Every beat lights the whole field for a moment: use it to plan.', 'Bonus: +40% score while you live here.'] },
  { id: 'spinner', kind: 'hazard', runs: 15, name: 'Spinner', tag: 'A rotating blade',
    look: 'A glowing two-armed bar spinning around a hub that drifts along an orbit.',
    todo: ['The whole bar is deadly, not just the tips.', 'The arms reach toward the next orbit, so leave space when jumping past.', 'Time your pass between the arms or wait for it to drift away.'] },
  { id: 'beam', kind: 'hazard', runs: 0, name: 'Laser Sweep', tag: 'A rotating beam',
    look: 'A flickering line from the planet, then a bright white-red beam that sweeps around.',
    todo: ['It covers two orbits. Stand on the third or jump across.', 'Watch the flickering warning first.'] },
  { id: 'well', kind: 'hazard', runs: 0, name: 'Gravity Well', tag: 'A small black hole on the orbit',
    look: 'A black disc with purple swirls and a dotted field around it.',
    todo: ['The black core is deadly.', 'The dotted field slows you down. Do not linger.'] },
];
// one briefing per sector, generated from the sector data
OD.WORLDS.forEach(w => {
  if (w.id === 0) return;
  OD.INTRO.push({ id: 'sector_' + w.id, kind: 'sector', runs: 0, name: w.name, tag: ['Peaceful', 'Easy', 'Risky', 'Dangerous', 'Deadly'][w.risk - 1] + ' sector',
    look: w.sub + '.', todo: w.dangers.map(d => 'Danger: ' + d).concat(w.bonus.map(b => 'Bonus: ' + b)) });
});
OD.INTRO_BY_ID = {};
OD.INTRO.forEach(i => { OD.INTRO_BY_ID[i.id] = i; });
OD.KIND_LABEL = { hazard: 'Hazard', pickup: 'Pickup', power: 'Power-up', event: 'Cosmic event', era: 'Planet type', tip: 'Technique', sector: 'Sector' };

OD.intro = {
  seen: id => !!OD.save.intro[id],
  // may this element spawn right now? Seen ones always; new ones only after enough runs and one per run.
  canUse(id, S) {
    const it = OD.INTRO_BY_ID[id];
    if (!it || OD.save.intro[id]) return true;
    return (!S || S.introNew < 1) && OD.save.stats.runs >= it.runs;
  },
  count: () => OD.INTRO.filter(i => OD.save.intro[i.id]).length,
};

// ------------------------------------------------------------------ illustrations
// Each function draws one animated frame (t in seconds) into a w*h canvas.
OD.introArt = (() => {
  const TAU = Math.PI * 2, A = '#4df3ff', D = '#ff4d7a', GOLD = '#ffd95a';
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const stars = OD.gfx.makeStars(40, 5);
  function frame(g, w, h, t, o = {}) {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#060b22'); gr.addColorStop(1, '#122052');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    OD.gfx.drawStars(g, stars, w, h, t, 0.6, '#cfe0ff');
    const u = h / 320, cx = w / 2, cy = h / 2 + (o.dy || 0) * u, R = [46 * u, 74 * u, 102 * u];
    if (!o.noRings) for (const r of R) { g.strokeStyle = 'rgba(77,243,255,0.2)'; g.lineWidth = 1.2; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke(); }
    if (!o.noPlanet) OD.gfx.drawPlanet(g, cx, cy, 20 * u, 'terra', t, A, 1);
    return { u, cx, cy, R };
  }
  function dot(g, x, y, trail, u, col = A) {
    OD.gfx.drawTrail(g, trail, 'classic', col, 0, 5 * u);
    g.save(); g.globalCompositeOperation = 'lighter'; OD.gfx.glow(g, x, y, 17 * u, col, 1); g.restore();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 3.8 * u, 0, TAU); g.fill();
  }
  function orbiter(g, F, ring, a, dir, col) {
    const pts = []; for (let i = 0; i < 24; i++) { const aa = a - dir * i * 0.06; pts.push({ x: F.cx + Math.cos(aa) * F.R[ring], y: F.cy + Math.sin(aa) * F.R[ring] }); }
    dot(g, pts[0].x, pts[0].y, pts, F.u, col);
    return pts[0];
  }
  const rock = (g, x, y, s, rot = 0) => OD.gfx.drawDebris(g, 'rock', x, y, s, rot, D, OD.gfx.makeShape('rock', OD.makeRng(3)));
  const pol = (F, ring, a) => [F.cx + Math.cos(a) * F.R[ring], F.cy + Math.sin(a) * F.R[ring]];
  const arrow = (g, x, y, up, u, col = GOLD) => { g.fillStyle = col; g.beginPath(); const d = up ? -1 : 1; g.moveTo(x, y + d * 8 * u); g.lineTo(x - 6 * u, y - d * 2 * u); g.lineTo(x + 6 * u, y - d * 2 * u); g.closePath(); g.fill(); };
  function powerIcon(g, type, x, y, u, t) {
    const P = OD.POWERS[type];
    g.save(); g.globalCompositeOperation = 'lighter'; OD.gfx.glow(g, x, y, 46 * u, P.color, 0.9); g.restore();
    g.fillStyle = 'rgba(8,10,24,0.9)'; g.beginPath(); g.arc(x, y, 22 * u, 0, TAU); g.fill();
    g.strokeStyle = P.color; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 22 * u, 0, TAU); g.stroke();
    OD.game.drawPowerIcon(g, type, x, y, 17 * u, P.color);
  }

  function eraArt(g, w, h, t, skin, tint, fx) {
    const k = fx === 'breathe' ? 1 + 0.06 * Math.sin(t * 2) : 1;
    const F = frame(g, w, h, t, { noPlanet: true, noRings: true });
    g.fillStyle = OD.rgba(tint, 0.14); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3; i++) { g.strokeStyle = 'rgba(77,243,255,0.25)'; g.lineWidth = 1.4; g.beginPath(); g.arc(F.cx, F.cy, F.R[i] * k * (fx === 'breathe' ? 1 + 0.02 * i : 1), 0, TAU); g.stroke(); }
    const m = Math.min(1, (t % 5) / 1.6);   // the planet transforms from terra
    OD.gfx.drawPlanet(g, F.cx, F.cy, 20 * F.u, 'terra', t, tint, 1);
    g.save(); g.beginPath(); g.arc(F.cx, F.cy, 23 * F.u * m, 0, TAU); g.clip(); OD.gfx.drawPlanet(g, F.cx, F.cy, 20 * F.u, skin, t, tint, 1); g.restore();
    orbiter(g, F, 1, t * 1.4, 1, A);
    const stars2 = OD.gfx.makeStars(30, 8);
    for (const s2 of stars2) {
      if (fx === 'embers') { g.fillStyle = '#ffb347'; g.beginPath(); g.arc(s2.x * w + Math.sin(t + s2.p) * 6, h - ((s2.y * h + t * 40 * s2.z) % h), 1.5, 0, TAU); g.fill(); }
      else if (fx === 'snow') { g.fillStyle = '#eaffff'; g.beginPath(); g.arc(s2.x * w, (s2.y * h + t * 30 * s2.z) % h, 1.6, 0, TAU); g.fill(); }
    }
    if (fx === 'bolt' && (t % 3) < 0.15) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, 0, w, h); }
    if (fx === 'fog') { const p = orbiterPos(F, 1, t * 1.4); const gr = g.createRadialGradient(p.x, p.y, 20 * F.u, p.x, p.y, 120 * F.u); gr.addColorStop(0, 'rgba(2,3,12,0)'); gr.addColorStop(1, 'rgba(2,3,12,0.88)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
  }
  const orbiterPos = (F, ring, a) => ({ x: F.cx + Math.cos(a) * F.R[ring], y: F.cy + Math.sin(a) * F.R[ring] });
  const art = {
    rock(g, w, h, t) {
      const F = frame(g, w, h, t); const [rx, ry] = pol(F, 1, 1.2 + t * 0.35); rock(g, rx, ry, 12 * F.u, t);
      const a = -1.5 + Math.sin(t * 0.9) * 1.1 + t * 0.15; orbiter(g, F, 2, t * 1.1, 1, A);
    },
    dust(g, w, h, t) {
      const F = frame(g, w, h, t);
      for (let i = 0; i < 9; i++) { const a = t * 0.4 + i * 0.24, [x, y] = pol(F, 1, a); g.save(); g.translate(x, y); g.rotate(t * 2 + i); g.globalCompositeOperation = 'lighter'; OD.gfx.glow(g, 0, 0, 14 * F.u, '#ffe48a', 0.9); g.globalCompositeOperation = 'source-over'; g.fillStyle = '#fff6c8'; g.beginPath(); for (let k = 0; k < 8; k++) { const aa = k / 8 * TAU, r = (k % 2 ? 1.6 : 4.4) * F.u; g.lineTo(Math.cos(aa) * r, Math.sin(aa) * r); } g.closePath(); g.fill(); g.restore(); }
      orbiter(g, F, 1, t * 1.3 + 0.2, 1, A);
    },
    overdrive(g, w, h, t) {
      const F = frame(g, w, h, t); const p = orbiter(g, F, 1, t * 1.6, 1, '#fff6c8');
      g.save(); g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, (14 + Math.sin(t * 14) * 2) * F.u, 0, TAU); g.stroke(); g.restore();
      const [rx, ry] = pol(F, 1, t * 1.6 + 0.5); if ((t % 2) < 1.2) rock(g, rx, ry, 10 * F.u * (1 - (t % 2) / 1.3));
      g.strokeStyle = '#fff6c8'; g.lineWidth = 3.5; g.beginPath(); g.arc(F.cx, F.cy, 29 * F.u, -Math.PI / 2, -Math.PI / 2 + TAU * (0.5 + 0.5 * Math.sin(t))); g.stroke();
    },
    comet(g, w, h, t) {
      const F = frame(g, w, h, t); const k = (t % 2.4) / 2.4, a = 0.5;
      const x0 = F.cx - Math.cos(a) * w * 0.6, y0 = F.cy - Math.sin(a) * w * 0.6;
      g.setLineDash([8, 8]); g.lineDashOffset = -t * 60; g.strokeStyle = 'rgba(255,77,122,0.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(F.cx + Math.cos(a) * w * 0.6, F.cy + Math.sin(a) * w * 0.6); g.stroke(); g.setLineDash([]);
      if (k > 0.35) { const q = (k - 0.35) / 0.65, x = lerp(x0, F.cx + Math.cos(a) * w * 0.6, q), y = lerp(y0, F.cy + Math.sin(a) * w * 0.6, q);
        const gr = g.createLinearGradient(x, y, x - Math.cos(a) * 80 * F.u, y - Math.sin(a) * 80 * F.u); gr.addColorStop(0, 'rgba(255,77,122,0.95)'); gr.addColorStop(1, 'rgba(255,77,122,0)');
        g.strokeStyle = gr; g.lineWidth = 9 * F.u; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x - Math.cos(a) * 80 * F.u, y - Math.sin(a) * 80 * F.u); g.stroke();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 5 * F.u, 0, TAU); g.fill(); }
      orbiter(g, F, 2, t * 1.2 + 3, -1, A);
    },
    mine(g, w, h, t) {
      const F = frame(g, w, h, t); const [x, y] = pol(F, 1, -0.6); const armed = (t % 2) < 0.5;
      g.save(); g.translate(x, y); g.globalCompositeOperation = 'lighter'; OD.gfx.glow(g, 0, 0, (armed ? 46 : 24) * F.u, D, armed ? 1 : 0.5); g.globalCompositeOperation = 'source-over';
      g.strokeStyle = armed ? D : 'rgba(255,77,122,0.35)'; g.lineWidth = armed ? 3 : 1.5; g.setLineDash([5, 5]); g.beginPath(); g.arc(0, 0, 24 * F.u, 0, TAU); g.stroke(); g.setLineDash([]);
      g.rotate(t); g.fillStyle = '#1a0710'; g.strokeStyle = D; g.lineWidth = 2; g.beginPath(); for (let i = 0; i < 16; i++) { const aa = i / 16 * TAU, r = (i % 2 ? 6 : 11) * F.u; g.lineTo(Math.cos(aa) * r, Math.sin(aa) * r); } g.closePath(); g.fill(); g.stroke(); g.restore();
      orbiter(g, F, 2, t * 1.1, 1, A);
    },
    ring(g, w, h, t) {
      const F = frame(g, w, h, t), gap = 0.8, a0 = t * 0.5;
      g.save(); g.lineCap = 'round'; g.strokeStyle = 'rgba(255,77,122,0.4)'; g.lineWidth = 20; g.beginPath(); g.arc(F.cx, F.cy, F.R[1], a0 + gap, a0 - gap + TAU); g.stroke();
      g.strokeStyle = D; g.lineWidth = 7 * F.u; g.stroke(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#7ad9ff'; for (const e of [a0 + gap, a0 - gap]) { g.beginPath(); g.arc(F.cx + Math.cos(e) * F.R[1], F.cy + Math.sin(e) * F.R[1], 5 * F.u, 0, TAU); g.fill(); } g.restore();
      orbiter(g, F, 1, a0 + Math.sin(t * 2.5) * 0.45, Math.cos(t * 2.5) > 0 ? 1 : -1, A);
    },
    zap(g, w, h, t) { const F = frame(g, w, h, t, { noRings: true }); powerIcon(g, 'zap', F.cx + Math.cos(t) * 60 * F.u, F.cy + Math.sin(t) * 30 * F.u, F.u, t); },
    brake(g, w, h, t) { const F = frame(g, w, h, t, { noRings: true }); powerIcon(g, 'brake', F.cx + Math.cos(t) * 60 * F.u, F.cy + Math.sin(t) * 30 * F.u, F.u, t); },
    life(g, w, h, t) { const F = frame(g, w, h, t, { noRings: true }); powerIcon(g, 'life', F.cx + Math.cos(t) * 60 * F.u, F.cy + Math.sin(t) * 30 * F.u, F.u, t); },
    overload(g, w, h, t) { const F = frame(g, w, h, t, { noRings: true }); powerIcon(g, 'overload', F.cx + Math.cos(t) * 60 * F.u, F.cy + Math.sin(t) * 30 * F.u, F.u, t); },
    bomb(g, w, h, t) { const F = frame(g, w, h, t, { noRings: true }); powerIcon(g, 'bomb', F.cx + Math.cos(t) * 60 * F.u, F.cy + Math.sin(t) * 30 * F.u, F.u, t); },
    double(g, w, h, t) { const F = frame(g, w, h, t, { noRings: true }); powerIcon(g, 'double', F.cx + Math.cos(t) * 60 * F.u, F.cy + Math.sin(t) * 30 * F.u, F.u, t); },
    shield(g, w, h, t) { const F = frame(g, w, h, t, { noRings: true }); powerIcon(g, 'shield', F.cx + Math.cos(t) * 60 * F.u, F.cy + Math.sin(t) * 30 * F.u, F.u, t); },
    slow(g, w, h, t) { const F = frame(g, w, h, t, { noRings: true }); powerIcon(g, 'slow', F.cx + Math.cos(t) * 60 * F.u, F.cy + Math.sin(t) * 30 * F.u, F.u, t); },
    magnet(g, w, h, t) {
      const F = frame(g, w, h, t); const p = orbiter(g, F, 1, t * 1.2, 1, A);
      for (let i = 0; i < 6; i++) { const q = (t * 0.6 + i / 6) % 1, a = i * 1.05, x0 = p.x + Math.cos(a) * 70 * F.u, y0 = p.y + Math.sin(a) * 70 * F.u; const x = lerp(x0, p.x, q * q), y = lerp(y0, p.y, q * q); g.save(); g.globalCompositeOperation = 'lighter'; OD.gfx.glow(g, x, y, 11 * F.u, '#ffe48a', 1); g.restore(); g.fillStyle = '#fff6c8'; g.beginPath(); g.arc(x, y, 2.5 * F.u, 0, TAU); g.fill(); }
      g.strokeStyle = 'rgba(255,122,217,0.5)'; g.setLineDash([4, 6]); g.beginPath(); g.arc(p.x, p.y, 62 * F.u, 0, TAU); g.stroke(); g.setLineDash([]);
    },
    phase(g, w, h, t) {
      const F = frame(g, w, h, t); const [rx, ry] = pol(F, 1, 1.4 + t * 0.4); rock(g, rx, ry, 12 * F.u, t);
      const p = orbiter(g, F, 1, 1.4 + t * 0.4 + Math.sin(t * 1.7) * 0.9, 1, '#7affc4');
      g.setLineDash([4, 5]); g.strokeStyle = '#7affc4'; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, 13 * F.u, t * 4, t * 4 + TAU); g.stroke(); g.setLineDash([]);
    },
    steer(g, w, h, t) {
      const F = frame(g, w, h, t); const k = (t % 4.2) / 4.2, to = k < 0.5 ? 2 : 0, q = clamp01(((k % 0.5) - 0.08) / 0.3), a = -0.6;
      const p = orbiter(g, F, 1, a, 1, A);
      for (const ring of [2, 0]) { const [mx, my] = pol(F, ring, a), on = ring === to && q > 0.05; g.save(); g.translate(mx, my); g.rotate(Math.PI / 4); g.strokeStyle = on ? GOLD : 'rgba(255,217,90,0.4)'; g.lineWidth = on ? 3 : 1.6; const s2 = 6 * F.u; g.strokeRect(-s2, -s2, s2 * 2, s2 * 2); if (on) { g.fillStyle = 'rgba(255,217,90,0.5)'; g.fillRect(-s2, -s2, s2 * 2, s2 * 2); } g.restore(); }
      const [tx, ty] = pol(F, to, a), fx = lerp(p.x - 40 * F.u, tx + 18 * F.u, OD.smooth(q)), fy = lerp(p.y + 40 * F.u, ty + 14 * F.u, OD.smooth(q));
      g.fillStyle = 'rgba(255,255,255,0.2)'; g.beginPath(); g.arc(fx, fy, 15 * F.u, 0, TAU); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 2; g.stroke();
    },
    bloom(g, w, h, t) {
      const F = frame(g, w, h, t);
      for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) { const a = r + i * 0.2 + t * 0.2 * (r % 2 ? -1 : 1), [x, y] = pol(F, r, a); g.save(); g.globalCompositeOperation = 'lighter'; OD.gfx.glow(g, x, y, 11 * F.u, '#ffe48a', 0.9); g.restore(); g.fillStyle = '#fff6c8'; g.beginPath(); g.arc(x, y, 2.4 * F.u, 0, TAU); g.fill(); }
      orbiter(g, F, 2, t * 1.4, 1, A);
    },
    shower(g, w, h, t) {
      const F = frame(g, w, h, t); const ang = 0.55, dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
      for (let i = 0; i < 8; i++) { const off = (i - 3.5) * 24 * F.u, bx = F.cx + px * off, by = F.cy + py * off, q = ((t * 0.45 + i * 0.13) % 1.3) - 0.15, L = w * 0.7;
        g.setLineDash([7, 7]); g.strokeStyle = 'rgba(255,77,122,0.35)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(bx - dx * L, by - dy * L); g.lineTo(bx + dx * L, by + dy * L); g.stroke(); g.setLineDash([]);
        const x = bx + dx * L * (q * 2 - 1), y = by + dy * L * (q * 2 - 1); g.save(); g.globalCompositeOperation = 'lighter'; OD.gfx.glow(g, x, y, 14 * F.u, D, 0.9); g.restore(); g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 3 * F.u, 0, TAU); g.fill(); }
      orbiter(g, F, 0, t * 2, 1, A);
    },
    twin(g, w, h, t) {
      const k = (t % 6) / 6, u = h / 320, cx = w * 0.5;
      const hop = clamp01((k - 0.42) / 0.3), settle = clamp01((k - 0.7) / 0.28);
      const R = [26 * u, 42 * u, 58 * u], D = 94 * u, cy = h * 0.58;
      const ox = cx, oy = cy - (settle > 0 ? OD.smooth(settle) * 120 * u : 0);          // old system drifts up and away
      const vx = cx + lerp(70 * u, 0, OD.smooth(Math.min(1, k / 0.4))) * (1 - settle), vy = lerp(cy - D - 70 * u, cy - D, OD.smooth(Math.min(1, k / 0.4)));
      const nvx = lerp(vx, cx, OD.smooth(settle)), nvy = lerp(vy, cy, OD.smooth(settle));
      const g2 = g; const gr = g2.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#060b22'); gr.addColorStop(1, '#122052'); g2.fillStyle = gr; g2.fillRect(0, 0, w, h);
      OD.gfx.drawStars(g2, stars, w, h, t, 0.6, '#cfe0ff');
      for (let i = 0; i < 3; i++) { g2.strokeStyle = `rgba(77,243,255,${0.3 * (1 - settle * 0.7)})`; g2.lineWidth = 1.3; g2.beginPath(); g2.arc(ox, oy, R[i], 0, TAU); g2.stroke(); }
      OD.gfx.drawPlanet(g2, ox, oy, 11 * u, 'terra', t, A, 1);
      for (let i = 0; i < 3; i++) { g2.strokeStyle = `rgba(255,179,107,${i === 2 ? 0.55 : 0.28})`; g2.lineWidth = i === 2 ? 1.8 : 1.2; g2.beginPath(); g2.arc(nvx, nvy, R[i], 0, TAU); g2.stroke(); }
      if (k > 0.2 && k < 0.45) { g2.setLineDash([5, 6]); g2.strokeStyle = GOLD; g2.lineWidth = 2; g2.beginPath(); g2.arc(nvx, nvy, R[2], 0, TAU); g2.stroke(); g2.setLineDash([]); }
      OD.gfx.drawPlanet(g2, nvx, nvy, 11 * u, 'gas', t, '#ffb36b', 1);
      // player: orbits the old outer ring, hops across, then orbits the new planet's outer ring
      let px, py; const pts = [];
      if (hop <= 0) { const a = -1.9 + t * 1.4; px = ox + Math.cos(a) * R[2]; py = oy + Math.sin(a) * R[2]; for (let i = 0; i < 20; i++) { const aa = a - i * 0.06; pts.push({ x: ox + Math.cos(aa) * R[2], y: oy + Math.sin(aa) * R[2] }); } }
      else if (hop < 1) { const a0 = -1.9 + (t - 0.1) * 1.4, sx = ox + Math.cos(a0) * R[2], sy = oy + Math.sin(a0) * R[2], ex = nvx + Math.cos(Math.PI * 0.5) * R[2], ey = nvy + Math.sin(Math.PI * 0.5) * R[2]; px = lerp(sx, ex, OD.smooth(hop)); py = lerp(sy, ey, OD.smooth(hop)); pts.push({ x: px, y: py }, { x: lerp(sx, px, 0.7), y: lerp(sy, py, 0.7) }, { x: sx, y: sy }); }
      else { const a = Math.PI * 0.5 + (t - 4) * 1.4; px = nvx + Math.cos(a) * R[2]; py = nvy + Math.sin(a) * R[2]; for (let i = 0; i < 20; i++) { const aa = a - i * 0.06; pts.push({ x: nvx + Math.cos(aa) * R[2], y: nvy + Math.sin(aa) * R[2] }); } }
      dot(g2, px, py, pts, u);
    },
    boss(g, w, h, t) {
      const F = frame(g, w, h, t, { noRings: true });
      for (const [r, dir] of [[0, 0.5], [2, -0.45]]) { const a0 = t * dir, gap = 0.9; g.save(); g.lineCap = 'round'; g.strokeStyle = 'rgba(255,77,122,0.4)'; g.lineWidth = 18; g.beginPath(); g.arc(F.cx, F.cy, F.R[r], a0 + gap, a0 - gap + TAU); g.stroke(); g.strokeStyle = D; g.lineWidth = 6 * F.u; g.stroke(); g.restore(); }
      g.strokeStyle = 'rgba(77,243,255,0.5)'; g.beginPath(); g.arc(F.cx, F.cy, F.R[1], 0, TAU); g.stroke(); orbiter(g, F, 1, t * 1.3, 1, A);
    },
    giant(g, w, h, t) {
      const F = frame(g, w, h, t); const gx = lerp(-30, w + 30, (t % 8) / 8), gy = F.cy - 124 * F.u;
      g.strokeStyle = 'rgba(255,255,255,0.12)'; g.setLineDash([4, 8]); g.beginPath(); g.arc(gx, gy, 130 * F.u, 0, TAU); g.stroke(); g.setLineDash([]);
      OD.gfx.drawPlanet(g, gx, gy, 38 * F.u, 'gas', t * 0.8, '#ffcf9c', 1);
      const a = -1.2 + t * 0.9; const [x, y] = pol(F, 2, a); const d = Math.hypot(x - gx, y - gy), pull = Math.max(0, 1 - d / (130 * F.u)); const dx = (gx - x) / d * pull * 14 * F.u, dy = (gy - y) / d * pull * 14 * F.u;
      const pts = []; for (let i = 0; i < 20; i++) { const aa = a - i * 0.06, px = F.cx + Math.cos(aa) * F.R[2], py = F.cy + Math.sin(aa) * F.R[2]; const dd = Math.hypot(px - gx, py - gy), pl = Math.max(0, 1 - dd / (130 * F.u)); pts.push({ x: px + (gx - px) / dd * pl * 14 * F.u, y: py + (gy - py) / dd * pl * 14 * F.u }); }
      dot(g, x + dx, y + dy, pts, F.u); if (pull > 0.3) { g.strokeStyle = GOLD; g.lineWidth = 2; g.beginPath(); g.arc(x + dx, y + dy, 17 * F.u, 0, TAU); g.stroke(); }
    },
    flare(g, w, h, t) {
      const F = frame(g, w, h, t); const sx = w * 0.88, sy = F.cy - 130 * F.u, k = (t % 3.4) / 3.4;
      g.save(); g.globalCompositeOperation = 'lighter'; OD.gfx.glow(g, sx, sy, 70 * F.u, '#ffb347', 0.9); g.restore(); g.fillStyle = '#fff'; g.beginPath(); g.arc(sx, sy, 7 * F.u, 0, TAU); g.fill();
      const base = Math.atan2(F.cy - sy, F.cx - sx);
      for (const lat of [-70, 0, 70]) { const a = Math.atan2(F.cy + lat * F.u * 0.5 - sy, F.cx - sx + lat * F.u * 0.2 - 0), L = w * 1.4; g.save(); g.lineCap = 'round';
        if (k < 0.65) { g.setLineDash([8, 8]); g.lineDashOffset = -t * 90; g.strokeStyle = `rgba(255,170,60,${0.2 + k})`; g.lineWidth = 2; } else { g.globalCompositeOperation = 'lighter'; g.strokeStyle = '#ffd24d'; g.lineWidth = 9 * F.u; }
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + Math.cos(a) * L, sy + Math.sin(a) * L); g.stroke(); g.restore(); }
      orbiter(g, F, 1, t * 1.2, 1, A);
    },
    blackhole(g, w, h, t) {
      const F = frame(g, w, h, t); const bx = F.cx + 40 * F.u, by = F.cy + 130 * F.u;
      g.save(); g.globalCompositeOperation = 'lighter'; OD.gfx.glow(g, bx, by, 120 * F.u, '#8a3dff', 0.5); g.restore();
      g.save(); g.translate(bx, by); g.rotate(t * 0.8); g.scale(1, 0.36); const dg = g.createRadialGradient(0, 0, 12 * F.u, 0, 0, 50 * F.u); dg.addColorStop(0, 'rgba(255,200,120,0.95)'); dg.addColorStop(0.4, 'rgba(255,120,60,0.6)'); dg.addColorStop(1, 'rgba(140,60,255,0)'); g.fillStyle = dg; g.beginPath(); g.arc(0, 0, 50 * F.u, 0, TAU); g.fill(); g.restore();
      g.fillStyle = '#000'; g.beginPath(); g.arc(bx, by, 12 * F.u, 0, TAU); g.fill();
      for (let i = 0; i < 12; i++) { const q = (t * 0.5 + i / 12) % 1, a = i * 2.4, r = lerp(95 * F.u, 8 * F.u, q); g.fillStyle = i % 2 ? '#ffb36b' : '#c58bff'; g.beginPath(); g.arc(bx + Math.cos(a + q * 4) * r, by + Math.sin(a + q * 4) * r * 0.8, 2 * F.u, 0, TAU); g.fill(); }
      const a = Math.PI / 2 + Math.sin(t * 0.8) * 0.9; const [x, y] = pol(F, 2, a); const d = Math.hypot(x - bx, y - by), pull = Math.max(0, 1 - d / (150 * F.u)); const pts = [];
      for (let i = 0; i < 18; i++) { const aa = a - i * 0.07, px = F.cx + Math.cos(aa) * F.R[2], py = F.cy + Math.sin(aa) * F.R[2]; const dd = Math.hypot(px - bx, py - by), pl = Math.max(0, 1 - dd / (150 * F.u)); pts.push({ x: px + (bx - px) / dd * pl * 22 * F.u, y: py + (by - py) / dd * pl * 22 * F.u }); }
      dot(g, pts[0].x, pts[0].y, pts, F.u);
    },
    supernova(g, w, h, t) {
      const F = frame(g, w, h, t); const sx = w * 0.15, sy = F.cy - 100 * F.u, k = (t % 4.5) / 4.5, charge = Math.min(1, k / 0.45);
      const ux = F.cx - sx, uy = F.cy - sy, L = Math.hypot(ux, uy), nx = -uy / L, ny = ux / L, wdt = 24 * F.u;
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.moveTo(F.cx + nx * wdt, F.cy + ny * wdt); g.lineTo(F.cx + ux / L * w * 1.5 + nx * wdt, F.cy + uy / L * w * 1.5 + ny * wdt); g.lineTo(F.cx + ux / L * w * 1.5 - nx * wdt, F.cy + uy / L * w * 1.5 - ny * wdt); g.lineTo(F.cx - nx * wdt, F.cy - ny * wdt); g.closePath(); g.fill();
      g.save(); g.globalCompositeOperation = 'lighter'; OD.gfx.glow(g, sx, sy, (30 + 90 * charge * charge) * F.u, '#fff2c8', 0.95); g.restore(); g.fillStyle = '#fff'; g.beginPath(); g.arc(sx, sy, (6 + 8 * charge) * F.u, 0, TAU); g.fill();
      if (k > 0.45) { const f = (k - 0.45) / 0.55 * w * 1.2; g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,230,160,0.7)'; g.lineWidth = 14 * F.u; g.beginPath(); g.arc(sx, sy, f, 0, TAU); g.stroke(); g.restore(); }
      orbiter(g, F, 0, Math.atan2(uy, ux) + 0.05 + Math.sin(t) * 0.1, 1, '#9fe6ff');
    },
    era_tidal: (g, w, h, t) => eraArt(g, w, h, t, 'ocean', '#2f7bff', 'breathe'),
    era_molten: (g, w, h, t) => eraArt(g, w, h, t, 'lava', '#ff5a1f', 'embers'),
    era_frozen: (g, w, h, t) => eraArt(g, w, h, t, 'ice', '#7fe4ff', 'snow'),
    era_storm: (g, w, h, t) => eraArt(g, w, h, t, 'gas', '#c9a0ff', 'bolt'),
    era_eclipse: (g, w, h, t) => eraArt(g, w, h, t, 'void', '#7a3dff', 'fog'),
    beam(g, w, h, t) {
      const F = frame(g, w, h, t), a = t * 0.9, r0 = F.R[0] - 16 * F.u, r1 = F.R[1] + 16 * F.u;
      g.save(); g.lineCap = 'round'; g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,77,122,0.4)'; g.lineWidth = 16 * F.u; g.beginPath(); g.moveTo(F.cx + Math.cos(a) * r0, F.cy + Math.sin(a) * r0); g.lineTo(F.cx + Math.cos(a) * r1, F.cy + Math.sin(a) * r1); g.stroke(); g.strokeStyle = D; g.lineWidth = 7 * F.u; g.stroke(); g.strokeStyle = '#fff'; g.lineWidth = 2.5 * F.u; g.stroke(); g.restore();
      orbiter(g, F, 2, t * 1.3, 1, A);
    },
    well(g, w, h, t) {
      const F = frame(g, w, h, t); const [x, y] = pol(F, 1, 0.8 + t * 0.2);
      g.save(); g.globalCompositeOperation = 'lighter'; OD.gfx.glow(g, x, y, 68 * F.u, '#8a3dff', 0.6); g.restore(); g.strokeStyle = 'rgba(190,140,255,0.4)'; g.setLineDash([4, 6]); g.beginPath(); g.arc(x, y, 40 * F.u, 0, TAU); g.stroke(); g.setLineDash([]);
      for (let i = 0; i < 3; i++) { const aa = t * 2.4 + i * TAU / 3; g.strokeStyle = 'rgba(210,170,255,0.7)'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, (14 + i * 6) * F.u, aa, aa + 1.7); g.stroke(); }
      g.fillStyle = '#000'; g.beginPath(); g.arc(x, y, 11 * F.u, 0, TAU); g.fill(); g.strokeStyle = '#d9b3ff'; g.lineWidth = 2; g.stroke();
      orbiter(g, F, 2, t * 1.1, 1, A);
    },
  };
  const lerp = OD.lerp;
  art.spinner = (g, w, h, t) => {
    const F = frame(g, w, h, t); const [x, y] = pol(F, 1, 0.9 + t * 0.18), rot = t * 1.8, L = 27 * F.u;
    g.save(); g.translate(x, y); g.rotate(rot); g.lineCap = 'round'; g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,77,122,0.4)'; g.lineWidth = 15 * F.u; g.beginPath(); g.moveTo(-L, 0); g.lineTo(L, 0); g.stroke();
    g.globalCompositeOperation = 'source-over'; g.strokeStyle = D; g.lineWidth = 6.5 * F.u; g.stroke(); g.strokeStyle = '#fff'; g.lineWidth = 2 * F.u; g.stroke();
    g.fillStyle = '#12060c'; g.strokeStyle = D; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 6 * F.u, 0, TAU); g.fill(); g.stroke(); g.restore();
    orbiter(g, F, 2, t * 1.2, 1, A);
  };
  // sector briefings: the sector's own palette, planet and a sample of its dangers
  OD.WORLDS.forEach(wd => {
    art['sector_' + wd.id] = (g, w, h, t) => {
      const u = h / 320, cx = w / 2, cy = h / 2, R = [46 * u, 74 * u, 102 * u];
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, wd.bg[0]); gr.addColorStop(1, wd.bg[1]); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.save(); g.globalCompositeOperation = 'lighter'; OD.gfx.glow(g, w * 0.85, h * 0.2, 160 * u, wd.neb[1], 0.35); OD.gfx.glow(g, w * 0.1, h * 0.9, 170 * u, wd.neb[0], 0.35); g.restore();
      OD.gfx.drawStars(g, stars, w, h, t, 0.6, '#ffffff');
      for (const r of R) { g.strokeStyle = OD.rgba(wd.accent, 0.25); g.lineWidth = 1.2; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke(); }
      OD.gfx.drawPlanet(g, cx, cy, 20 * u, wd.planet, t, wd.accent, 1);
      wd.hazards.forEach((k, i) => {
        const ring = i % 3, a = t * (0.35 + 0.07 * i) * (i % 2 ? -1 : 1) + i * 1.9, x = cx + Math.cos(a) * R[ring], y = cy + Math.sin(a) * R[ring];
        if (k === 'rock') OD.gfx.drawDebris(g, 'rock', x, y, 9 * u, t + i, wd.danger, OD.gfx.makeShape('rock', OD.makeRng(i + 3)));
        else if (k === 'mine') { g.save(); g.globalCompositeOperation = 'lighter'; OD.gfx.glow(g, x, y, 22 * u, wd.danger, 0.9); g.restore(); g.fillStyle = '#1a0710'; g.strokeStyle = wd.danger; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 6 * u, 0, TAU); g.fill(); g.stroke(); }
        else if (k === 'spinner') { g.save(); g.translate(x, y); g.rotate(t * 2); g.strokeStyle = wd.danger; g.lineWidth = 5 * u; g.lineCap = 'round'; g.beginPath(); g.moveTo(-14 * u, 0); g.lineTo(14 * u, 0); g.stroke(); g.restore(); }
        else if (k === 'ring') { g.save(); g.strokeStyle = wd.danger; g.lineWidth = 5 * u; g.beginPath(); g.arc(cx, cy, R[2] + 8 * u, a, a + 3.6); g.stroke(); g.restore(); }
        else if (k === 'beam') { g.save(); g.strokeStyle = wd.danger; g.lineWidth = 4 * u; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(t * 0.8) * R[1] * 1.1, cy + Math.sin(t * 0.8) * R[1] * 1.1); g.stroke(); g.restore(); }
        else if (k === 'hole') { g.fillStyle = '#000'; g.strokeStyle = '#c58bff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 8 * u, 0, TAU); g.fill(); g.stroke(); }
      });
      const pts = []; for (let i = 0; i < 22; i++) { const aa = t * 1.5 - i * 0.065; pts.push({ x: cx + Math.cos(aa) * R[1], y: cy + Math.sin(aa) * R[1] }); }
      dot(g, pts[0].x, pts[0].y, pts, u, wd.accent);
      g.fillStyle = '#ffd95a'; for (let i = 0; i < wd.risk; i++) { g.beginPath(); const sx = w - 18 * u - i * 16 * u, sy = 18 * u; g.moveTo(sx, sy - 6 * u); g.lineTo(sx + 5 * u, sy); g.lineTo(sx, sy + 6 * u); g.lineTo(sx - 5 * u, sy); g.closePath(); g.fill(); }
    };
  });
  return art;
})();
