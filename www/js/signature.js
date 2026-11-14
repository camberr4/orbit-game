'use strict';
// SIGNATURE STYLES: a dot and its trail drawn as one piece, with their own particles (sparkles, embers, droplets, bubbles ...) and a burst of light each
// time you change orbit. Bought with stardust in the Style screen. Each one has a FULL version (high and ultra graphics) and a lighter one (medium and low)
// that costs about the same as the plain dot. Drawing is in local coordinates: the dot is at (0,0) and the tail follows in the order it was left.
OD.sig = (() => {
  const TAU = Math.PI * 2, NMAX = 56;
  const XS = new Float32Array(NMAX), YS = new Float32Array(NMAX), NX = new Float32Array(NMAX), NY = new Float32Array(NMAX);
  const hsl = (h, s, l, a) => `hsla(${(((h % 360) + 360) % 360) | 0},${s}%,${l}%,${a})`;
  const hh = n => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };   // a steady pseudo-random number from a number
  const JC = ['#ffe14d', '#ffa63d', '#ff4fa3', '#a24dff'];
  const jcol = f => { const x = Math.min(0.999, Math.max(0, f)) * 3, i = Math.floor(x), u = x - i, p = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)], a = p(JC[i]), b = p(JC[i + 1]); return a.map((v, k) => Math.round(v + (b[k] - v) * u)); };

  const LIST = [
    { id: 'jelly', name: 'Jelly Pulse', tag: 'Our little mascot: it wobbles, winks and leaves pixel sparkles', price: 2500, color: '#ff7ac0' },
    { id: 'comet', name: 'Frost Comet', tag: 'A head of ice with two tails: pale dust and a blue streak', price: 4000, color: '#bfe9ff' },
    { id: 'silk', name: 'Aurora Silk', tag: 'Curtains of northern light rippling behind you', price: 5000, color: '#6ee1ff' },
    { id: 'blossom', name: 'Cherry Blossom', tag: 'A ribbon of spring that sheds petals as it goes', price: 6000, color: '#ffb7d5' },
    { id: 'eclipse', name: 'Eclipse', tag: 'A black sun with a golden crown and a burning shadow', price: 8000, color: '#ffbb55' },
    { id: 'bio', name: 'Bioluminescence', tag: 'Glowing plankton and bubbles from the deep sea', price: 8000, color: '#38e6e0' },
    { id: 'gold', name: 'Liquid Gold', tag: 'A ribbon of molten gold with light sliding along it', price: 9000, color: '#ffd166' },
    { id: 'consty', name: 'Constellation', tag: 'Stars joined by light as you fly', price: 11000, color: '#9aa8ff' },
    { id: 'phoenix', name: 'Phoenix', tag: 'Wings of flame, and embers that rise behind you', price: 12000, color: '#ff8a3d' },
    { id: 'prism', name: 'Prism', tag: 'Light split into a spectrum, from a turning gem', price: 15000, color: '#bfe4ff' },
  ];
  const BY_ID = {}; LIST.forEach(s => { BY_ID[s.id] = s; });

  // ---------- helpers
  function glow(c, x, y, r, rgb, a) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  function glowH(c, x, y, r, h, s, l, a) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, hsl(h, s, l, a)); g.addColorStop(1, hsl(h, s, l, 0)); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  function star4(c, x, y, r, rot, col) { c.save(); c.translate(x, y); c.rotate(rot); c.fillStyle = col; c.beginPath(); for (let k = 0; k < 8; k++) { const rr = k % 2 ? r * 0.22 : r, a = k * Math.PI / 4; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill(); c.restore(); }
  function prep(pts, x, y, u) {   // the tail in local coordinates, newest first, and the direction across it at each point
    const n = Math.min(pts.length, NMAX);
    for (let k = 0; k < n; k++) { XS[k] = (pts[k].x - x) / u; YS[k] = (pts[k].y - y) / u; }
    for (let k = 0; k < n; k++) { const a = k > 0 ? k - 1 : 0, b = k < n - 1 ? k + 1 : n - 1, dx = XS[b] - XS[a], dy = YS[b] - YS[a], l = Math.hypot(dx, dy) || 1; NX[k] = -dy / l; NY[k] = dx / l; }
    return n;
  }

  // ---------- bands: the tail as filled, tapering shapes (smooth, and far cheaper than stroking every little piece with round ends)
  // one piece of a band between tail points a and b: hw(i) is half its width at point i, off(i) how far its middle sits to one side
  function piece(c, a, b, hw, off) {
    c.beginPath();
    for (let i = a; i <= b; i++) { const o = off ? off(i) : 0, h = hw(i), x = XS[i] + NX[i] * (o + h), y = YS[i] + NY[i] * (o + h); if (i === a) c.moveTo(x, y); else c.lineTo(x, y); }
    for (let i = b; i >= a; i--) { const o = off ? off(i) : 0, h = hw(i); c.lineTo(XS[i] + NX[i] * (o - h), YS[i] + NY[i] * (o - h)); }
    if (a === 0) { const o = off ? off(0) : 0, h = hw(0), a0 = Math.atan2(NY[0], NX[0]); if (h > 0.05) c.arc(XS[0] + NX[0] * o, YS[0] + NY[0] * o, h, a0 + Math.PI, a0, true); }   // a round end at the dot, so a wide band never shows a cut edge there
    c.closePath(); c.fill();
  }
  // a whole band, in pieces of `step` points so that its colour can change along it: col(f, k) is the fill of the piece starting at f (0 at the dot, 1 at the tip)
  function band(c, N, step, hw, col, off) { for (let k = 0; k < N; k += step) { c.fillStyle = col(Math.min(1, (k + step * 0.5) / N), k); piece(c, k, Math.min(N, k + step), hw, off); } }   // (each piece takes the colour of its middle, so the last one has all but faded: the tip never ends in a visible stub)

  // ---------- particles (kept in world coordinates, so they stay where they were left)
  function spawn(st, o) { if (st.p.length < st.max) st.p.push(o); }
  function ring(st, x, y, r0, r1, life, col) { spawn(st, { k: 'ring', x, y, r0, r1, life, max: life, col }); }
  function stepParticles(st, dt) {
    const P = st.p;
    for (let i = P.length - 1; i >= 0; i--) {
      const q = P[i]; q.life -= dt;
      if (q.life <= 0) { P[i] = P[P.length - 1]; P.pop(); continue; }
      if (q.k !== 'ring') { q.x += q.vx * dt; q.y += q.vy * dt; const d = 1 - (q.drag || 0) * dt; q.vx *= d; q.vy *= d; q.vy += (q.g || 0) * dt; q.rot = (q.rot || 0) + (q.vr || 0) * dt; }
    }
  }
  function drawParticles(c, st, u, t) {
    const P = st.p; if (!P.length) return;
    c.lineCap = 'round';
    for (const q of P) {
      const f = q.life / q.max, a = Math.min(1, f * 1.6) * (q.a == null ? 1 : q.a), s = q.s * u;
      switch (q.k) {
        case 'ring': { const e = 1 - f; c.strokeStyle = q.col.replace('A', (Math.pow(f, 1.4) * 0.6).toFixed(3)); c.lineWidth = (1.6 * f + 0.4) * u; c.beginPath(); c.arc(q.x, q.y, (q.r0 + (q.r1 - q.r0) * Math.pow(e, 0.7)) * u, 0, TAU); c.stroke(); break; }
        case 'glint': { const tw = 0.55 + 0.45 * Math.sin(t * 9 + q.ph); star4(c, q.x, q.y, s * (0.8 + tw * 0.8), q.rot, hsl(q.h, 100, 88, a * tw)); break; }
        case 'spark': { c.fillStyle = hsl(q.h, 100, q.l || 70, a * 0.25); c.beginPath(); c.arc(q.x, q.y, s * 2.4, 0, TAU); c.fill(); c.fillStyle = hsl(q.h, 100, 86, a); c.beginPath(); c.arc(q.x, q.y, s, 0, TAU); c.fill(); break; }
        case 'shard': { c.save(); c.translate(q.x, q.y); c.rotate(q.rot); c.fillStyle = hsl(q.h, 100, 80, a * 0.9); c.beginPath(); c.moveTo(0, -s * 1.5); c.lineTo(s * 0.8, 0); c.lineTo(0, s * 1.5); c.lineTo(-s * 0.8, 0); c.closePath(); c.fill(); c.restore(); break; }
        case 'drop': { const col = q.c; c.fillStyle = `rgba(${col},${a})`; c.beginPath(); c.arc(q.x, q.y, s, 0, TAU); c.fill(); c.fillStyle = `rgba(255,255,255,${a * 0.7})`; c.beginPath(); c.arc(q.x - s * 0.3, q.y - s * 0.3, s * 0.3, 0, TAU); c.fill(); break; }
        case 'pix': { const col = q.c, z = Math.max(1, Math.round(s)); c.fillStyle = `rgba(${col},${a})`; const px = Math.round(q.x / 2) * 2, py = Math.round(q.y / 2) * 2; if (q.plus) { c.fillRect(px - z, py, z * 2 + 1, 1); c.fillRect(px, py - z, 1, z * 2 + 1); } else c.fillRect(px - z / 2, py - z / 2, z, z); break; }
        case 'bubble': { c.strokeStyle = `rgba(190,255,255,${a * 0.7})`; c.lineWidth = 0.7 * u; c.beginPath(); c.arc(q.x, q.y, s, 0, TAU); c.stroke(); c.fillStyle = `rgba(255,255,255,${a * 0.7})`; c.fillRect(q.x - s * 0.5, q.y - s * 0.5, 1, 1); break; }
        case 'petal': { const sw = Math.sin(t * 3 + q.ph); c.save(); c.translate(q.x + sw * 3 * u, q.y); c.rotate(q.rot + sw * 0.5); c.scale(1, 0.55 + 0.35 * Math.cos(t * 4 + q.ph)); c.fillStyle = `rgba(${q.c},${a * 0.95})`; c.beginPath(); c.moveTo(0, -s * 1.5); c.quadraticCurveTo(s * 1.25, -s * 0.2, 0, s * 1.5); c.quadraticCurveTo(-s * 1.25, -s * 0.2, 0, -s * 1.5); c.fill(); c.restore(); break; }
        case 'fleck': { const tw = 0.5 + 0.5 * Math.sin(t * 11 + q.ph); c.save(); c.translate(q.x, q.y); c.rotate(q.rot); c.fillStyle = `rgba(255,${(205 + 40 * tw) | 0},${(110 + 90 * tw) | 0},${a * (0.55 + 0.45 * tw)})`; c.fillRect(-s, -s * 0.45, s * 2, s * 0.9); c.restore(); break; }
        default: break;
      }
    }
  }

  // ---------- the styles. Each draws the tail then the dot, in local coordinates (head at 0,0). K = { n, t, u, full, boost, ae, fly, phi, calm }
  const DRAW = {};

  DRAW.silk = (c, K) => {
    const { t, full, boost } = K, N = Math.min(K.n - 1, full ? 50 : 32), B = 1 + 0.55 * boost;
    c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
    const hue = f => 138 + f * 160 + 16 * Math.sin(t * 0.7);   // green at the dot, through blue to violet and rose at the tip
    // the curtain: a wide veil of light whose edge ripples, with two ribbons of brighter light winding through it
    band(c, N, 2, i => { const f = i / N; return (10.5 * Math.pow(1 - f, 0.75) + 1.2) * (1 + 0.2 * Math.sin(i * 0.3 - t * 4.2)); }, f => hsl(hue(f), 92, 60, Math.pow(1 - f, 1.25) * 0.17 * B));
    if (full) band(c, N, 2, i => { const f = i / N; return (6.2 * Math.pow(1 - f, 0.8) + 0.8) * (1 + 0.24 * Math.sin(i * 0.36 - t * 5.4 + 1.3)); }, f => hsl(hue(f) + 30, 95, 64, Math.pow(1 - f, 1.2) * 0.2 * B), i => Math.sin(i * 0.3 - t * 3) * (i / N) * 3);
    if (full) for (let k = 2; k < N - 2; k += 3) {   // rays standing across the veil, as in a real curtain of aurora
      const f = k / N, L = (8 + 5 * Math.sin(k * 0.7 + t * 5)) * (1 - f * 0.45);
      c.strokeStyle = hsl(hue(f) + 20, 96, 74, Math.pow(1 - f, 1.2) * 0.26 * B); c.lineWidth = 1.3; c.beginPath(); c.moveTo(XS[k] - NX[k] * L * 0.55, YS[k] - NY[k] * L * 0.55); c.lineTo(XS[k] + NX[k] * L, YS[k] + NY[k] * L); c.stroke();
    }
    const wav = ph => i => Math.sin(i * 0.45 - t * 9 + ph) * (i / N) * 4.6;
    band(c, N, 2, i => 3.4 * Math.pow(1 - i / N, 1.05) + 0.25, f => hsl(hue(f), 96, 68, Math.min(1, Math.pow(1 - f, 1.15) * 0.92 * B)), wav(0));
    band(c, N, 2, i => 1.9 * Math.pow(1 - i / N, 1.05) + 0.2, f => hsl(hue(f) + 55, 96, 70, Math.min(1, Math.pow(1 - f, 1.2) * 0.8 * B)), wav(2.1));
    if (full) { band(c, N, 2, i => 1.1 * Math.pow(1 - i / N, 1.1) + 0.15, f => hsl(hue(f) + 110, 96, 74, Math.pow(1 - f, 1.3) * 0.7), wav(4.2));
      band(c, Math.floor(N * 0.7), 2, i => 1.15 * Math.pow(1 - i / (N * 0.7), 1.2) + 0.1, f => `rgba(255,255,255,${Math.pow(1 - f, 1.6) * 0.6})`, wav(0)); }   // the first ribbon's white heart
    glow(c, 0, 0, 26 + 5 * boost, '110,225,255', 0.42); glow(c, 0, 0, 13, '255,255,255', 0.7);
    if (full) star4(c, 0, 0, 10 + 4 * boost, t * 0.6, 'rgba(255,255,255,.4)');
    // not a plain circle: curtains of northern light that wave around the dot (green to blue, and violet to rose)
    const veil = (r0, amp, k, sp, h0, h1, w, al) => { const g = c.createLinearGradient(-r0, 0, r0, 0); g.addColorStop(0, hsl(h0, 90, 70, al)); g.addColorStop(1, hsl(h1, 90, 72, al)); c.strokeStyle = g; c.lineWidth = w; c.beginPath(); const a0 = t * sp; for (let i = 0; i <= 40; i++) { const a = a0 + i / 40 * 4.2, r = r0 + amp * Math.sin(a * k + t * 2.6); i ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r); } c.stroke(); };
    veil(9.5, 1.8, 3, 2.2, 150, 200, 1.1, 0.75);
    if (full) { veil(13, 2.4, 2, -1.6, 270, 330, 0.9, 0.6);
      for (let j = 0; j < 3; j++) { const a = t * 2.4 + j * 2.094; glowH(c, Math.cos(a) * 15, Math.sin(a) * 15, 4.5, 130 + j * 75, 100, 75, 0.8); } }
    c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 4.6, 0, TAU); c.fill();
    c.globalCompositeOperation = 'source-over';
  };

  DRAW.prism = (c, K) => {
    const { t, full, ae } = K, N = Math.min(K.n - 1, full ? 44 : 28);
    c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    // a beam that fans out into its seven colours: each colour is its own band, side by side, spreading as they trail away
    const sp = i => 0.62 + (i / N) * (full ? 2.5 : 2.1), wob = j => i => (j - 3) * sp(i) + Math.sin(i * 0.3 - t * 5 + j * 0.9) * (i / N) * 0.9;
    if (full) band(c, N, 2, i => sp(i) * 4.6 + 2.5, f => `rgba(215,230,255,${Math.pow(1 - f, 1.4) * 0.07})`);   // the haze around the spectrum
    for (let j = 0; j < 7; j++) { const h0 = j * 50 - 20 + t * 20; band(c, N, full ? 2 : 3, i => sp(i) * 0.54 + 0.1, f => hsl(h0, 100, 63, Math.pow(1 - f, 1.5) * 0.9), wob(j)); }
    if (full) band(c, Math.floor(N * 0.62), 2, i => 0.75 * (1 - i / (N * 0.62)) + 0.1, f => `rgba(255,255,255,${Math.pow(1 - f, 1.3) * 0.75})`);   // the white light it came from
    glow(c, 0, 0, 26, '190,225,255', 0.36); glow(c, 0, 0, 12, '255,255,255', 0.6);
    if (ae >= 0 && ae < 0.5) { const q = ae / 0.5, n = full ? 14 : 8;   // changing orbit: the light bursts into its colours
      for (let j = 0; j < n; j++) { const a = j * TAU / n + t * 0.4, L = 6 + 24 * Math.pow(q, 0.6), lg = c.createLinearGradient(Math.cos(a) * 4, Math.sin(a) * 4, Math.cos(a) * L, Math.sin(a) * L); lg.addColorStop(0, hsl(j * 360 / n, 100, 75, (1 - q) * 0.8)); lg.addColorStop(1, hsl(j * 360 / n, 100, 75, 0)); c.strokeStyle = lg; c.lineWidth = 1.3; c.beginPath(); c.moveTo(Math.cos(a) * 4, Math.sin(a) * 4); c.lineTo(Math.cos(a) * L, Math.sin(a) * L); c.stroke(); }
      glow(c, 0, 0, 34 * (1 - q * 0.4), '255,255,255', (1 - q) * 0.55); }
    if (full) { for (let a = 0; a < 6; a++) { const a0 = t * 0.5 + a * TAU / 6, a1 = a0 + TAU / 6, h = a * 60 + t * 50; c.strokeStyle = hsl(h, 100, 74, 0.65); c.lineWidth = 1.1; c.beginPath(); c.moveTo(Math.cos(a0) * 13.5, Math.sin(a0) * 13.5); c.lineTo(Math.cos(a1) * 13.5, Math.sin(a1) * 13.5); c.stroke(); glowH(c, Math.cos(a0) * 13.5, Math.sin(a0) * 13.5, 3, h, 100, 80, 0.7); }   // a turning six-sided outline, each side its own colour
      const lg = c.createLinearGradient(-26, 0, 26, 0); lg.addColorStop(0, 'rgba(180,220,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,.55)'); lg.addColorStop(1, 'rgba(220,190,255,0)'); c.strokeStyle = lg; c.lineWidth = 1.1; c.beginPath(); c.moveTo(-26, 0); c.lineTo(26, 0); c.stroke();
      for (let j = 0; j < 3; j++) { const a = t * 0.9 + j * 2.094, L = 17 + 3 * Math.sin(t * 3 + j), lg2 = c.createLinearGradient(0, 0, Math.cos(a) * L, Math.sin(a) * L); lg2.addColorStop(0, hsl(j * 120 + t * 60, 100, 72, 0.65)); lg2.addColorStop(1, hsl(j * 120 + t * 60, 100, 72, 0)); c.strokeStyle = lg2; c.lineWidth = 1; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * L, Math.sin(a) * L); c.stroke(); } }
    c.globalCompositeOperation = 'source-over';
    const R = 8.2, rot = t * 0.7, sw = (t * 2.2) % TAU;
    for (let i = 0; i < 8; i++) {
      const a1 = rot + i * TAU / 8, a2 = rot + (i + 1) * TAU / 8, am = (a1 + a2) / 2, L = 0.5 + 0.5 * Math.cos(am + 0.9), hue = 205 + 60 * Math.sin(am * 2);
      c.fillStyle = hsl(hue, 85, 58 + 34 * L, 0.97); c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a1) * R, Math.sin(a1) * R); c.lineTo(Math.cos(a2) * R, Math.sin(a2) * R); c.closePath(); c.fill();
      if (full) { c.fillStyle = hsl(hue - 30, 90, 70 + 22 * L, 0.55); c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a1) * R * 0.52, Math.sin(a1) * R * 0.52); c.lineTo(Math.cos(a2) * R * 0.52, Math.sin(a2) * R * 0.52); c.closePath(); c.fill();
        const dd = Math.abs(((am - sw + Math.PI * 3) % TAU) - Math.PI); if (dd < 0.8) { c.fillStyle = `rgba(255,255,255,${(1 - dd / 0.8) * 0.7})`; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a1) * R, Math.sin(a1) * R); c.lineTo(Math.cos(a2) * R, Math.sin(a2) * R); c.closePath(); c.fill(); } }
    }
    c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 0.7; c.beginPath(); for (let i = 0; i < 8; i++) { const a = rot + i * TAU / 8; c.lineTo(Math.cos(a) * R, Math.sin(a) * R); } c.closePath(); c.stroke();
    c.globalCompositeOperation = 'lighter'; star4(c, 0, 0, 5.2, -t * 0.9, 'rgba(255,255,255,.95)'); c.globalCompositeOperation = 'source-over';
  };

  DRAW.jelly = (c, K) => {
    const { t, full, ae, fly, phi, x0, y0, u } = K, N = Math.min(K.n - 1, full ? 32 : 22), GR = 3 * u;
    for (let k = N; k >= 1; k--) {   // the tail: pixels, snapped to a grid that stays fixed on the screen
      const f = k / N, sz = Math.max(2, Math.round(6.2 * Math.pow(1 - f, 0.8))), wx = Math.round((x0 + XS[k] * u) / GR) * GR, wy = Math.round((y0 + YS[k] * u) / GR) * GR, sx = (wx - x0) / u, sy = (wy - y0) / u;
      const col = jcol(f * 0.95), a = Math.pow(1 - f, 1.1) * (0.7 + 0.3 * Math.sin(t * 10 + k * 1.7));
      if (full) { c.globalCompositeOperation = 'lighter'; glow(c, sx, sy, sz * 1.6, col.join(','), a * 0.22); }
      c.globalCompositeOperation = 'source-over'; c.fillStyle = `rgba(${col},${a})`; c.fillRect(sx - sz / 2, sy - sz / 2, sz, sz);
      if (f < 0.6 && k % 2 === 0) { const sd = (k % 4 ? 1 : -1) * GR / u, ex = sx + Math.round(NX[k]) * sd, ey = sy + Math.round(NY[k]) * sd, z2 = Math.max(2, sz - 2); c.fillStyle = `rgba(${col},${a * 0.7})`; c.fillRect(ex - z2 / 2, ey - z2 / 2, z2, z2); }   // a second, smaller pixel beside it: a chunkier tail
      if (full && sz >= 4) { c.fillStyle = `rgba(${col.map(v => Math.min(255, v + 70))},${a * 0.9})`; c.fillRect(sx - sz / 2 + 1, sy - sz / 2 + 1, Math.max(1, sz - 3), Math.max(1, sz - 3)); }
    }
    if (full) for (let j = 0; j < 4; j++) {   // droplets of jelly that wobble behind
      const kk = Math.min(N, 5 + j * 6), f = kk / N, o = Math.sin(t * 6 + j * 2) * 2.4, r = 2.5 * (1 - f) + 0.9, col = jcol(f * 0.9), x = XS[kk] + NX[kk] * o, y = YS[kk] + NY[kk] * o;
      c.fillStyle = `rgba(${col},${(1 - f) * 0.85})`; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.fillStyle = `rgba(255,255,255,${(1 - f) * 0.7})`; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, TAU); c.fill();
    }
    let sq = 1 + 0.12 * Math.sin(t * 9);
    if (fly >= 0) sq *= 1 + 0.25 * Math.sin(fly * Math.PI);                       // it stretches while it leaps
    if (ae >= 0) sq *= 1 - 0.38 * Math.exp(-ae * 7) * Math.cos(ae * 24);          // and squishes like jelly when it lands
    if (ae >= 0 && ae < 0.4) { const q = ae / 0.4; for (let j = 0; j < 8; j++) { const a = j * TAU / 8, d = 7 + 14 * q, col = jcol(j / 8); c.fillStyle = `rgba(${col},${(1 - q) * 0.9})`; c.fillRect(Math.round(Math.cos(a) * d / 2) * 2 - 1, Math.round(Math.sin(a) * d / 2) * 2 - 1, 3, 3); } }
    c.globalCompositeOperation = 'lighter'; glow(c, 0, 0, 26, '255,110,150', 0.4); glow(c, 0, 0, 15, '255,190,90', 0.36); c.globalCompositeOperation = 'source-over';
    c.save(); c.rotate(phi); c.scale(0.8 * sq, 0.8 / sq);
    const body = () => { c.beginPath(); c.moveTo(-11, 6); c.quadraticCurveTo(-12, -9, 0, -11); c.quadraticCurveTo(12, -9, 11, 6); c.quadraticCurveTo(7, 11, 0, 10); c.quadraticCurveTo(-7, 11, -11, 6); };
    const bg = c.createLinearGradient(0, -11, 0, 11); JC.forEach((col, k) => bg.addColorStop(k / 3, col)); c.fillStyle = bg; body(); c.fill();
    if (full) { const ig = c.createRadialGradient(0, -3, 1, 0, 0, 12); ig.addColorStop(0, 'rgba(255,250,200,.55)'); ig.addColorStop(1, 'rgba(255,200,120,0)'); c.fillStyle = ig; body(); c.fill();
      const rim = c.createLinearGradient(0, 2, 0, 11); rim.addColorStop(0, 'rgba(120,40,200,0)'); rim.addColorStop(1, 'rgba(120,40,200,.45)'); c.fillStyle = rim; body(); c.fill(); }
    c.restore();
    c.fillStyle = 'rgba(255,255,255,.8)'; c.beginPath(); c.ellipse(-3.3, -4.6, 3, 1.5, -0.5, 0, TAU); c.fill();
    if (full) { c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.arc(4.4, -3.2, 0.9, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,90,150,.5)'; [-5.2, 5.2].forEach(dx => { c.beginPath(); c.ellipse(dx, 3.1, 1.9, 1.1, 0, 0, TAU); c.fill(); }); }
    c.strokeStyle = '#fff'; c.lineWidth = 1.3; c.lineCap = 'round'; const blink = (t % 3.6) < 0.13;
    [-3, 3].forEach(dx => { c.beginPath(); if (blink) { c.moveTo(dx - 1.8, 1.5); c.lineTo(dx + 1.8, 1.5); } else c.arc(dx, 1.2, 1.8, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); });
  };

  DRAW.eclipse = (c, K) => {
    const { t, full, boost, phi } = K, N = Math.min(K.n - 1, full ? 46 : 30);
    c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    // the shadow it drags: a band of fire with a black heart, like the sun's edge seen round the moon
    const fire = f => f < 0.28 ? '255,232,150' : f < 0.62 ? '255,166,62' : '236,84,50', flick = i => 1 + 0.14 * Math.sin(i * 0.4 - t * 9);
    if (full) band(c, N, 2, i => (8.5 * Math.pow(1 - i / N, 0.8) + 1.4) * flick(i), f => `rgba(255,150,50,${Math.pow(1 - f, 1.4) * 0.13 * (1 + boost)})`);
    band(c, N, 2, i => (4.3 * Math.pow(1 - i / N, 0.9) + 0.4) * flick(i), f => `rgba(${fire(f)},${Math.min(1, Math.pow(1 - f, 1.15) * 0.9 * (1 + 0.4 * boost))})`);
    c.globalCompositeOperation = 'source-over';
    band(c, Math.floor(N * 0.86), 2, i => 2.5 * Math.pow(1 - i / (N * 0.86), 0.85), f => `rgba(5,5,14,${Math.pow(1 - f, 0.7) * 0.94})`);
    c.globalCompositeOperation = 'lighter';
    for (const [ph, am] of full ? [[0, 1.5], [2.6, 2.3]] : [[0, 1.6]]) {   // loose streamers of the corona, waving off the edge
      let px = 0, py = 0;
      for (let k = 0; k <= N; k++) { const f = k / N, w = Math.sin(k * 0.38 - t * 6 + ph) * f * 3.4 * am + (ph ? -1 : 1) * (4.2 * (1 - f)), x = XS[k] + NX[k] * w, y = YS[k] + NY[k] * w;
        if (k) { c.strokeStyle = `rgba(${fire(f)},${Math.min(1, Math.pow(1 - f, 1.3) * 0.7 * (1 + 0.5 * boost))})`; c.lineWidth = 1.2 * (1 - f) + 0.3; c.beginPath(); c.moveTo(px, py); c.lineTo(x, y); c.stroke(); }
        px = x; py = y; }
    }
    glow(c, 0, 0, 27 + 6 * boost, '255,185,75', 0.36 + 0.2 * boost); glow(c, 0, 0, 15, '255,225,150', 0.5);
    if (full) for (let j = 0; j < 2; j++) { const a = t * 0.5 + j * Math.PI + hh(j) * 3, L = 7 + 2 * Math.sin(t * 1.7 + j); c.strokeStyle = 'rgba(255,150,60,.6)'; c.lineWidth = 1.2; c.beginPath(); c.arc(Math.cos(a) * 6.4, Math.sin(a) * 6.4, L * 0.5, a + Math.PI * 0.85, a + Math.PI * 2.15); c.stroke(); }   // prominences
    const R = full ? 16 : 8;
    for (let j = 0; j < R; j++) { const a = j * TAU / R + t * 0.22, L = (7 + 7 * hh(j + 5) + 2.2 * Math.sin(t * 2.1 + j * 1.7)) * (1 + 0.9 * boost), lg = c.createLinearGradient(Math.cos(a) * 6, Math.sin(a) * 6, Math.cos(a) * (6 + L), Math.sin(a) * (6 + L)); lg.addColorStop(0, 'rgba(255,240,200,.75)'); lg.addColorStop(1, 'rgba(255,180,70,0)'); c.strokeStyle = lg; c.lineWidth = 1.1 + hh(j + 9) * 0.8; c.beginPath(); c.moveTo(Math.cos(a) * 6, Math.sin(a) * 6); c.lineTo(Math.cos(a) * (6 + L), Math.sin(a) * (6 + L)); c.stroke(); }
    c.strokeStyle = 'rgba(255,236,185,.95)'; c.lineWidth = 1.8; c.beginPath(); c.arc(0, 0, 5.8, 0, TAU); c.stroke();
    if (full) { c.strokeStyle = 'rgba(255,170,70,.5)'; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, 7.4, 0, TAU); c.stroke();
      glow(c, -Math.cos(phi) * 16, -Math.sin(phi) * 16, 6.2, '255,150,70', 0.3); glow(c, -Math.cos(phi) * 26, -Math.sin(phi) * 26, 4.2, '120,180,255', 0.26); }   // lens ghosts trailing behind
    const ga = t * 1.3, gx = Math.cos(ga) * 5.8, gy = Math.sin(ga) * 5.8; glow(c, gx, gy, 8 + 4 * boost, '255,255,255', 0.95); star4(c, gx, gy, 6 + 4 * boost, ga, 'rgba(255,255,255,.9)');
    c.globalCompositeOperation = 'source-over'; c.fillStyle = '#04050c'; c.beginPath(); c.arc(0, 0, 5, 0, TAU); c.fill();
  };

  DRAW.bio = (c, K) => {
    const { t, full, ae, boost } = K, N = Math.min(K.n - 1, full ? 48 : 30);
    c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    // the water lit from within: a soft band that swells and narrows like a swimming thing, and a brighter thread inside it
    const swim = i => 1 + 0.3 * Math.sin(i * 0.42 - t * 5);
    if (full) band(c, N, 2, i => (8 * Math.pow(1 - i / N, 0.8) + 1.2) * swim(i), f => hsl(176 + f * 40, 100, 58, Math.pow(1 - f, 1.3) * 0.14 * (1 + 0.6 * boost)));
    band(c, N, 2, i => (3.3 * Math.pow(1 - i / N, 0.9) + 0.35) * swim(i), f => hsl(170 + f * 45, 100, 66, Math.pow(1 - f, 1.2) * 0.42 * (1 + 0.5 * boost)));
    if (full) band(c, Math.floor(N * 0.7), 2, i => 0.9 * (1 - i / (N * 0.7)) + 0.12, f => `rgba(225,255,250,${Math.pow(1 - f, 1.4) * 0.7})`);
    for (let k = N; k >= 1; k--) {
      if (k % 2 && !full) continue; const f = k / N, dx = Math.sin(k * 1.7 + t * 2) * (0.25 + f) * 4.6, dy = Math.cos(k * 1.3 + t * 2.2) * (0.25 + f) * 4.6, tw = Math.pow(0.5 + 0.5 * Math.sin(t * 6 + k * 2.3), 2), r = 2.1 * (1 - f * 0.5) + 0.45, hue = 168 + f * 45, bl = Math.min(1, (0.35 + 0.65 * tw) * (1 + 0.6 * boost));
      if (full) glowH(c, XS[k] + dx, YS[k] + dy, r * 3.4, hue, 100, 65, 0.5 * (1 - f) * bl);
      c.fillStyle = hsl(hue, 100, 82, (1 - f) * (0.45 + 0.55 * tw)); c.beginPath(); c.arc(XS[k] + dx, YS[k] + dy, r, 0, TAU); c.fill();
    }
    if (full) for (let j = 0; j < 5; j++) { const kk = Math.min(N, 4 + j * 8), f = kk / N, ph = Math.sin(t * 2 + j * 1.9); glowH(c, XS[kk] + Math.sin(t * 1.4 + j) * 4, YS[kk] + Math.cos(t * 1.2 + j) * 4, 6, 185 + j * 8, 100, 70, (1 - f) * 0.5 * (0.6 + 0.4 * ph)); }
    const RN = full ? 3 : 2; for (let j = 0; j < RN; j++) { const ph = (t * 0.9 + j / RN) % 1, r = 6 + 18 * ph; glow(c, 0, 0, r, '60,240,215', Math.pow(1 - ph, 1.6) * 0.3); }   // a soft pulse of cold light, not a drawn circle
    glow(c, 0, 0, 26 + 5 * boost, '40,225,225', 0.42 + 0.2 * boost); glow(c, 0, 0, 13, '170,255,250', 0.6);
    c.fillStyle = '#eaffff'; c.beginPath(); c.arc(0, 0, 4.4, 0, TAU); c.fill();
    { const PN = full ? 5 : 3; for (let j = 0; j < PN; j++) { const a = t * 1.7 + j * TAU / PN, rr = 8.5 + 1.8 * Math.sin(t * 3 + j * 2); glowH(c, Math.cos(a) * rr, Math.sin(a) * rr, 2.8, 150 + j * 14, 100, 72, 0.8); c.fillStyle = 'rgba(235,255,250,.9)'; c.beginPath(); c.arc(Math.cos(a) * rr, Math.sin(a) * rr, 0.9, 0, TAU); c.fill(); } }   // plankton drifting round the dot
    c.globalCompositeOperation = 'source-over';
  };

  DRAW.consty = (c, K) => {
    const { t, full, boost, ae } = K, KK = Math.min(full ? 8 : 6, Math.floor((K.n - 1) / 3) + 1), step = Math.max(1, Math.floor(Math.min(K.n - 1, 40) / Math.max(1, KK - 1)));
    const px = [], py = []; for (let i = 0; i < KK; i++) { const k = Math.min(K.n - 1, i * step); px.push(XS[k]); py.push(YS[k]); }
    c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    { const M = Math.min(K.n - 1, 40);   // a faint river of night sky behind the stars, and a thread of light along the path
      if (full) band(c, M, 2, i => 9 * Math.pow(1 - i / M, 0.7) + 1.6, f => hsl(248 + f * 40, 85, 60, Math.pow(1 - f, 1.3) * 0.13 * (1 + boost)));
      band(c, M, 2, i => 3.2 * Math.pow(1 - i / M, 0.9) + 0.4, f => hsl(225 + f * 40, 90, 68, Math.pow(1 - f, 1.25) * 0.3));
      band(c, Math.floor(M * 0.75), 2, i => 0.8 * (1 - i / (M * 0.75)) + 0.12, f => `rgba(235,240,255,${Math.pow(1 - f, 1.3) * 0.75})`); }
    for (let i = 0; i < KK - 1; i++) { const f = i / KK; c.strokeStyle = hsl(215 + i * 8, 85, 86, Math.min(1, Math.pow(1 - f, 1.1) * 0.6 * (1 + boost))); c.lineWidth = 0.9; c.beginPath(); c.moveTo(px[i], py[i]); c.lineTo(px[i + 1], py[i + 1]); c.stroke();
      if (full) { c.strokeStyle = hsl(215 + i * 8, 100, 70, Math.pow(1 - f, 1.2) * 0.14); c.lineWidth = 3; c.beginPath(); c.moveTo(px[i], py[i]); c.lineTo(px[i + 1], py[i + 1]); c.stroke(); } }
    if (full && KK > 2) { const uu = (t * 1.4) % 1, seg = Math.min(KK - 2, Math.floor((1 - uu) * (KK - 1))), w = (1 - uu) * (KK - 1) - seg, qx = px[seg] + (px[seg + 1] - px[seg]) * w, qy = py[seg] + (py[seg + 1] - py[seg]) * w; glow(c, qx, qy, 6, '255,255,255', 0.8 * (1 - seg / KK)); }   // a pulse of light running up the lines
    for (let i = 1; i < KK; i++) { const f = i / KK, tw = 0.55 + 0.45 * Math.sin(t * 5 + i * 1.9), sz = 4.6 * (1 - f) + 1.5; if (full) glowH(c, px[i], py[i], sz * 2.8, 215 + i * 10, 100, 80, (1 - f) * 0.4); star4(c, px[i], py[i], sz * 1.5, t * 0.8 + i, hsl(215 + i * 10, 100, 92, (1 - f) * tw)); }
    glow(c, 0, 0, 26 + 5 * boost, '140,160,255', 0.4); glow(c, 0, 0, 12, '235,240,255', 0.65);
    if (ae >= 0 && ae < 0.5) star4(c, 0, 0, 10 + 22 * Math.pow(ae / 0.5, 0.5), Math.PI / 4 * (ae / 0.5), `rgba(255,255,255,${(1 - ae / 0.5) * 0.9})`);   // a new star ignites
    for (const [L, w] of full ? [[17, 0.9], [11, 0.7]] : [[14, 0.8]]) { const lg = c.createLinearGradient(-L, 0, L, 0); lg.addColorStop(0, 'rgba(200,215,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,.85)'); lg.addColorStop(1, 'rgba(200,215,255,0)'); c.strokeStyle = lg; c.lineWidth = w; c.beginPath(); c.moveTo(-L, 0); c.lineTo(L, 0); c.stroke();
      const lg2 = c.createLinearGradient(0, -L, 0, L); lg2.addColorStop(0, 'rgba(200,215,255,0)'); lg2.addColorStop(0.5, 'rgba(255,255,255,.85)'); lg2.addColorStop(1, 'rgba(200,215,255,0)'); c.strokeStyle = lg2; c.beginPath(); c.moveTo(0, -L); c.lineTo(0, L); c.stroke(); }
    if (full) star4(c, 0, 0, 8, t * 0.5, 'rgba(255,255,255,.55)');
    c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 3.7, 0, TAU); c.fill();
    c.globalCompositeOperation = 'source-over';
  };


  // ---- Frost Comet: a head of ice with two tails, as real comets have: a wide pale one of dust that lags to one side, and a thin blue one that runs straight
  DRAW.comet = (c, K) => {
    const { t, full, boost, ae } = K, N = Math.min(K.n - 1, full ? 50 : 32);
    c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    const lag = i => { const f = i / N; return f * f * 7.5 + Math.sin(i * 0.25 - t * 2) * f * 1.2; };
    if (full) band(c, N, 2, i => 9.5 * Math.pow(i / N, 0.55) * Math.pow(1 - i / N, 0.5) + 3.2 * (1 - i / N), f => `rgba(190,225,255,${Math.pow(1 - f, 1.35) * 0.1 * (1 + boost)})`, lag);
    band(c, N, 2, i => 5.4 * Math.pow(i / N, 0.5) * Math.pow(1 - i / N, 0.55) + 2.6 * (1 - i / N), f => `rgba(${(225 - f * 40) | 0},${(240 - f * 20) | 0},255,${Math.pow(1 - f, 1.2) * 0.4 * (1 + 0.4 * boost)})`, lag);
    band(c, N, 2, i => 1.5 * Math.pow(1 - i / N, 1.1) + 0.15, f => hsl(205 + f * 22, 100, 66, Math.pow(1 - f, 1.1) * 0.95));   // the blue streak
    if (full) { band(c, Math.floor(N * 0.6), 2, i => 0.55 * (1 - i / (N * 0.6)) + 0.1, f => `rgba(255,255,255,${Math.pow(1 - f, 1.2) * 0.85})`);
      for (let k = 4; k < N - 2; k += 5) { const f = k / N, o = lag(k) + Math.sin(k * 1.9) * 3.4 * f, tw = 0.5 + 0.5 * Math.sin(t * 7 + k * 1.3); star4(c, XS[k] + NX[k] * o, YS[k] + NY[k] * o, (2.6 * (1 - f) + 0.9) * (0.6 + 0.6 * tw), k + t, `rgba(235,248,255,${(1 - f) * (0.35 + 0.6 * tw)})`); } }   // ice catching the light in the dust
    glow(c, 0, 0, 30 + 6 * boost, '150,215,255', 0.4 + 0.2 * boost); glow(c, 0, 0, 15, '230,246,255', 0.7);
    if (ae >= 0 && ae < 0.45) { const q = ae / 0.45; c.strokeStyle = `rgba(215,240,255,${(1 - q) * 0.8})`; c.lineWidth = 1.4; for (let j = 0; j < 6; j++) { const a = j * TAU / 6 + 0.5, r0 = 7 + 10 * q, r1 = r0 + 7 * (1 - q); c.beginPath(); c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); c.stroke(); } }   // a landing shakes frost off it
    for (const [L, w] of full ? [[20, 1], [12, 0.8]] : [[15, 0.9]]) { const g1 = c.createLinearGradient(-L, 0, L, 0); g1.addColorStop(0, 'rgba(190,230,255,0)'); g1.addColorStop(0.5, 'rgba(255,255,255,.9)'); g1.addColorStop(1, 'rgba(190,230,255,0)'); c.strokeStyle = g1; c.lineWidth = w; c.beginPath(); c.moveTo(-L, 0); c.lineTo(L, 0); c.stroke(); }
    c.globalCompositeOperation = 'source-over';
    // the nucleus: a little six-sided crystal, turning
    const R = 5.6, rot = t * 0.9; c.fillStyle = '#f4fbff'; c.beginPath(); for (let i = 0; i < 6; i++) { const a = rot + i * TAU / 6; c.lineTo(Math.cos(a) * R, Math.sin(a) * R); } c.closePath(); c.fill();
    if (full) { c.fillStyle = 'rgba(140,205,255,.75)'; c.beginPath(); c.moveTo(0, 0); for (let i = 0; i < 3; i++) { const a = rot + i * TAU / 6; c.lineTo(Math.cos(a) * R, Math.sin(a) * R); } c.closePath(); c.fill(); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 0.6; for (let i = 0; i < 3; i++) { const a = rot + i * TAU / 6; c.beginPath(); c.moveTo(Math.cos(a) * R, Math.sin(a) * R); c.lineTo(-Math.cos(a) * R, -Math.sin(a) * R); c.stroke(); } }
  };

  // ---- Cherry Blossom: a soft ribbon in the pinks of spring, with a white thread through it; the dot is a five-petalled flower
  DRAW.blossom = (c, K) => {
    const { t, full, boost, ae } = K, N = Math.min(K.n - 1, full ? 48 : 30);
    c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    const sway = ph => i => Math.sin(i * 0.36 - t * 5 + ph) * (i / N) * 4.2, pink = (f, a) => `rgba(255,${(150 + 70 * (1 - f)) | 0},${(190 + 40 * (1 - f)) | 0},${a})`;
    if (full) band(c, N, 2, i => 9 * Math.pow(1 - i / N, 0.75) + 1.4, f => pink(f, Math.pow(1 - f, 1.3) * 0.1 * (1 + 0.5 * boost)));
    band(c, N, 2, i => 3.9 * Math.pow(1 - i / N, 0.95) + 0.3, f => pink(f, Math.min(1, Math.pow(1 - f, 1.15) * 0.62 * (1 + 0.2 * boost))), sway(0));
    band(c, N, 2, i => 2 * Math.pow(1 - i / N, 1) + 0.2, f => `rgba(255,${(110 + 50 * (1 - f)) | 0},${(150 + 40 * (1 - f)) | 0},${Math.pow(1 - f, 1.2) * 0.5})`, sway(2.4));
    if (full) { band(c, Math.floor(N * 0.7), 2, i => 0.85 * (1 - i / (N * 0.7)) + 0.12, f => `rgba(255,250,252,${Math.pow(1 - f, 1.3) * 0.5})`, sway(0));
      for (let k = 5; k < N - 2; k += 6) { const f = k / N, o = sway(0)(k) + (k % 12 ? 4 : -4) * (1 - f * 0.4), x = XS[k] + NX[k] * o, y = YS[k] + NY[k] * o, r = 2.4 * (1 - f) + 0.9;   // buds along the ribbon
        glow(c, x, y, r * 2.6, '255,170,205', (1 - f) * 0.4); c.fillStyle = `rgba(255,235,242,${(1 - f) * 0.9})`; c.beginPath(); c.arc(x, y, r * 0.55, 0, TAU); c.fill(); } }
    glow(c, 0, 0, 27 + 6 * boost, '255,150,195', 0.4 + 0.2 * boost); glow(c, 0, 0, 14, '255,225,235', 0.55);
    c.globalCompositeOperation = 'source-over';
    // the flower: five notched petals, opening a little wider each time you land, turning slowly
    const open = 1 + (ae >= 0 ? 0.35 * Math.exp(-ae * 6) : 0), rot = t * 0.55;
    for (let i = 0; i < 5; i++) {
      const a = rot + i * TAU / 5; c.save(); c.rotate(a); c.scale(open, open);
      const pg = c.createLinearGradient(0, -2, 0, -11); pg.addColorStop(0, '#ff8fbd'); pg.addColorStop(0.55, '#ffc4dc'); pg.addColorStop(1, '#fff1f6'); c.fillStyle = pg;
      c.beginPath(); c.moveTo(0, -1.5); c.bezierCurveTo(4.6, -4, 4.4, -9.5, 1.3, -10.6); c.lineTo(0, -9.2); c.lineTo(-1.3, -10.6); c.bezierCurveTo(-4.4, -9.5, -4.6, -4, 0, -1.5); c.fill();
      if (full) { c.strokeStyle = 'rgba(255,110,160,.55)'; c.lineWidth = 0.5; c.beginPath(); c.moveTo(0, -2.2); c.lineTo(0, -7.5); c.stroke(); }
      c.restore();
    }
    c.fillStyle = '#ffe58a'; c.beginPath(); c.arc(0, 0, 2.3, 0, TAU); c.fill();
    if (full) { c.fillStyle = '#ffb347'; for (let i = 0; i < 5; i++) { const a = rot * -1.5 + i * TAU / 5; c.beginPath(); c.arc(Math.cos(a) * 3.3, Math.sin(a) * 3.3, 0.6, 0, TAU); c.fill(); } }
  };

  // ---- Liquid Gold: a ribbon of molten metal: dark amber at the edges, bright gold within, and a line of white light that slides along it
  DRAW.gold = (c, K) => {
    const { t, full, boost, ae } = K, N = Math.min(K.n - 1, full ? 50 : 32);
    c.lineCap = 'round';
    const flow = i => Math.sin(i * 0.3 - t * 4.5) * (i / N) * 3.2, w0 = i => (5.2 * Math.pow(1 - i / N, 0.8) + 0.35) * Math.min(1, (1 - i / N) * 6) * (1 + 0.14 * Math.sin(i * 0.34 - t * 6)) * (1 + 0.25 * boost);   // (it thins to a point at the tip)
    c.globalCompositeOperation = 'lighter';
    if (full) band(c, N, 2, i => w0(i) * 1.75 + 1, f => `rgba(255,170,60,${Math.pow(1 - f, 1.35) * 0.075 * (1 + boost)})`, flow);
    c.globalCompositeOperation = 'source-over';
    band(c, N, 2, w0, f => `rgba(${(176 - f * 50) | 0},${(108 - f * 40) | 0},${(22 + f * 10) | 0},${Math.pow(1 - f, 0.9) * 0.95})`, flow);                                  // the dark rim
    band(c, N, 2, i => w0(i) * 0.74, f => `rgba(${(246 - f * 30) | 0},${(196 - f * 50) | 0},${(72 - f * 30) | 0},${Math.pow(1 - f, 0.95)})`, flow);                           // the gold
    band(c, N, 2, i => w0(i) * 0.36, f => `rgba(255,${(232 - f * 40) | 0},${(150 - f * 60) | 0},${Math.pow(1 - f, 1.1)})`, i => flow(i) - w0(i) * 0.2);                       // lighter gold, to one side
    c.globalCompositeOperation = 'lighter';
    band(c, Math.floor(N * 0.8), 2, i => w0(i) * 0.1 + 0.12, f => `rgba(255,252,235,${Math.pow(1 - f, 1.2) * 0.9})`, i => flow(i) - w0(i) * 0.34);                              // the highlight
    { const sp = full ? 3 : 2; for (let j = 0; j < sp; j++) {   // glints of light running down the metal
        const ph = (t * 0.55 + j / sp) % 1, kf = ph * (N - 2), k = Math.floor(kf), fr = kf - k, f = k / N, o = flow(k) - w0(k) * 0.25, x = XS[k] + (XS[k + 1] - XS[k]) * fr + NX[k] * o, y = YS[k] + (YS[k + 1] - YS[k]) * fr + NY[k] * o, a = Math.sin(Math.PI * ph) * (1 - f);
        glow(c, x, y, 7, '255,235,170', a * 0.7); star4(c, x, y, 4.2 * (1 - f * 0.5), t * 2 + j, `rgba(255,255,255,${a})`); } }
    glow(c, 0, 0, 28 + 6 * boost, '255,190,80', 0.4 + 0.2 * boost); glow(c, 0, 0, 13, '255,236,180', 0.5);
    if (ae >= 0 && ae < 0.45) { const q = ae / 0.45; for (let j = 0; j < 8; j++) { const a = j * TAU / 8 + 0.4, r0 = 8 + 12 * q, r1 = r0 + 6 * (1 - q); c.strokeStyle = `rgba(255,225,150,${(1 - q) * 0.85})`; c.lineWidth = 1.5; c.beginPath(); c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); c.stroke(); } }
    c.globalCompositeOperation = 'source-over';
    // the dot: a bead of gold with a hot centre, and a thin ring that turns round it
    const gg = c.createRadialGradient(-2.2, -2.6, 0.4, 0, 0, 7.2); gg.addColorStop(0, '#fffbe6'); gg.addColorStop(0.35, '#ffd766'); gg.addColorStop(0.8, '#d1912a'); gg.addColorStop(1, '#8f5a14'); c.fillStyle = gg; c.beginPath(); c.arc(0, 0, 6.4, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.ellipse(-2.3, -2.7, 2, 1.1, -0.6, 0, TAU); c.fill();
    if (full) { c.save(); c.rotate(t * 0.9); c.scale(1, 0.42); c.strokeStyle = 'rgba(255,222,140,.85)'; c.lineWidth = 1.1; c.beginPath(); c.arc(0, 0, 11, 0.5, TAU - 0.5); c.stroke(); c.restore();
      c.globalCompositeOperation = 'lighter'; star4(c, 2.6, 2.2, 3.2 + Math.sin(t * 5), t, 'rgba(255,255,255,.7)'); c.globalCompositeOperation = 'source-over'; }
  };

  // ---- Phoenix: the tail is a plume of flame, feathered along both edges; the dot is the bird itself, beating its wings
  DRAW.phoenix = (c, K) => {
    const { t, full, boost, ae, fly, phi } = K, N = Math.min(K.n - 1, full ? 50 : 32);
    c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
    const lick = i => 1 + 0.2 * Math.sin(i * 0.42 - t * 12) + 0.08 * Math.sin(i * 0.7 - t * 19), body = i => (6.4 * Math.pow(1 - i / N, 0.78) + 0.5) * lick(i) * (1 + 0.3 * boost);
    const fire = (f, a) => f < 0.18 ? `rgba(255,244,200,${a})` : f < 0.42 ? `rgba(255,${(205 - (f - 0.18) * 260) | 0},70,${a})` : f < 0.72 ? `rgba(255,${(142 - (f - 0.42) * 240) | 0},${(60 + (f - 0.42) * 120) | 0},${a})` : `rgba(${(255 - (f - 0.72) * 300) | 0},60,${(96 + (f - 0.72) * 300) | 0},${a})`;
    if (full) band(c, N, 2, i => body(i) * 1.9 + 1.5, f => fire(Math.min(1, f + 0.3), Math.pow(1 - f, 1.4) * 0.12 * (1 + boost)));
    band(c, N, 2, body, f => fire(f, Math.min(1, Math.pow(1 - f, 1.1) * 0.82)));
    band(c, Math.floor(N * 0.72), 2, i => body(i) * 0.42, f => `rgba(255,${(250 - f * 60) | 0},${(215 - f * 130) | 0},${Math.pow(1 - f, 1.2) * 0.85})`);   // the white-hot heart
    // tongues of flame that peel off both edges and sweep back, alternating sides, each one flickering in its own time
    for (let k = 2; k < N - 4; k += full ? 3 : 5) {
      const f = k / N, sd = (k / (full ? 3 : 5)) % 2 < 1 ? 1 : -1, b = body(k), j = Math.min(N, k + 4), L = (11 * (1 - f) + 2.5) * (0.75 + 0.35 * Math.sin(k * 2.3 - t * 10));
      const ax = XS[k] + NX[k] * b * sd * 0.7, ay = YS[k] + NY[k] * b * sd * 0.7, bx = XS[j] + NX[j] * body(j) * sd * 0.7, by = YS[j] + NY[j] * body(j) * sd * 0.7, tx = bx + NX[j] * L * sd * 0.75 + (XS[j] - XS[k]) * 0.55, ty = by + NY[j] * L * sd * 0.75 + (YS[j] - YS[k]) * 0.55;
      c.fillStyle = fire(Math.min(1, f + 0.16), Math.pow(1 - f, 1.1) * 0.6);
      c.beginPath(); c.moveTo(ax, ay); c.quadraticCurveTo(ax + NX[k] * L * sd * 0.55, ay + NY[k] * L * sd * 0.55, tx, ty); c.quadraticCurveTo((bx + tx) / 2 - NX[j] * sd * 1.2, (by + ty) / 2 - NY[j] * sd * 1.2, bx, by); c.closePath(); c.fill();
    }
    glow(c, 0, 0, 30 + 7 * boost, '255,140,60', 0.4 + 0.22 * boost); glow(c, 0, 0, 13, '255,225,150', 0.35);
    // the bird: two wings that beat (wide while it leaps), a bright body, a small crest
    c.save(); c.rotate(phi);
    const beat = Math.sin(t * 11), spread = 0.55 + 0.3 * beat + (fly >= 0 ? 0.35 * Math.sin(fly * Math.PI) : 0) + (ae >= 0 ? 0.3 * Math.exp(-ae * 7) : 0);
    for (const sd of [1, -1]) {
      c.save(); c.scale(1.3, 1.3 * sd); c.rotate(-spread * 0.55);
      const wg = c.createLinearGradient(0, 0, -9, 15); wg.addColorStop(0, 'rgba(255,240,190,.95)'); wg.addColorStop(0.45, 'rgba(255,160,60,.9)'); wg.addColorStop(1, 'rgba(240,60,90,0)'); c.fillStyle = wg;
      c.beginPath(); c.moveTo(2, 1); c.quadraticCurveTo(3, 9, -3, 16); c.quadraticCurveTo(-5, 11, -8, 12.5); c.quadraticCurveTo(-6.5, 8, -10, 8); c.quadraticCurveTo(-5.5, 4.5, -4, 1); c.closePath(); c.fill();
      c.restore();
    }
    if (full) { c.strokeStyle = 'rgba(255,220,140,.9)'; c.lineWidth = 1.1; for (const o of [-0.5, 0, 0.5]) { c.beginPath(); c.moveTo(-3, o * 2.4); c.quadraticCurveTo(-9, o * 6, -13 - 2 * Math.sin(t * 8 + o * 3), o * 9); c.stroke(); } }   // tail feathers
    c.fillStyle = '#fff6d8'; c.beginPath(); c.ellipse(1.5, 0, 5.4, 3.1, 0, 0, TAU); c.fill();
    c.fillStyle = '#ffd166'; c.beginPath(); c.moveTo(6.2, -1.2); c.lineTo(9.8, 0); c.lineTo(6.2, 1.2); c.closePath(); c.fill();   // the beak leads the way
    c.restore();
    c.globalCompositeOperation = 'source-over';
  };

  DRAW.classic = (c, K) => {
    const N = Math.min(K.n - 1, 30); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    band(c, N, 2, i => (6.5 * (1 - i / N) + 0.5) * 0.5, f => hsl(200 + f * 20, 100, 70 + (1 - f) * 25, (1 - f) * 0.9));
    band(c, Math.floor(N * 0.66), 2, i => Math.max(0.3, 0.8 * (1 - i / (N * 0.66))), f => `rgba(255,255,255,${(1 - f) * 0.3})`);
    glow(c, 0, 0, 26, '77,243,255', 1); c.globalCompositeOperation = 'source-over'; c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 5, 0, TAU); c.fill();
  };

  // ---------- particles: what each style sheds while it flies (rate per second) and the burst it makes when you change orbit
  const AMB = {
    silk: (st, K, wx, wy, u) => { const j = (Math.random() * K.n) | 0, r = hh(j + st.seed); spawn(st, { k: 'glint', x: wx + XS[j] * u + (Math.random() - 0.5) * 8 * u, y: wy + YS[j] * u + (Math.random() - 0.5) * 8 * u, vx: 0, vy: -5 * u, life: 0.7 + Math.random() * 0.5, max: 1.1, s: 2.2, h: 190 + r * 120, rot: Math.random() * 6, vr: 1.5, ph: Math.random() * 6 }); },
    prism: (st, K, wx, wy, u) => { const j = (Math.random() * K.n) | 0; const sh = Math.random() < 0.55; spawn(st, { k: sh ? 'shard' : 'glint', x: wx + XS[j] * u + (Math.random() - 0.5) * 6 * u, y: wy + YS[j] * u + (Math.random() - 0.5) * 6 * u, vx: (Math.random() - 0.5) * 14 * u, vy: (Math.random() - 0.5) * 14 * u, life: 0.6 + Math.random() * 0.5, max: 1, s: sh ? 1.5 + Math.random() * 1.5 : 2, h: Math.random() * 360, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 8, ph: Math.random() * 6 }); },
    jelly: (st, K, wx, wy, u) => { const j = (Math.random() * K.n) | 0; if (Math.random() < 0.5) spawn(st, { k: 'drop', x: wx + XS[j] * u, y: wy + YS[j] * u, vx: (Math.random() - 0.5) * 10 * u, vy: 4 * u, g: 40 * u, life: 0.7 + Math.random() * 0.4, max: 1, s: 1.4 + Math.random() * 1.1, c: jcol(Math.random()).join(',') }); else spawn(st, { k: 'pix', plus: true, x: wx + XS[j] * u + (Math.random() - 0.5) * 8 * u, y: wy + YS[j] * u + (Math.random() - 0.5) * 8 * u, vx: 0, vy: -8 * u, life: 0.6 + Math.random() * 0.4, max: 0.9, s: 1.6, c: jcol(Math.random()).join(',') }); },
    eclipse: (st, K, wx, wy, u) => { const j = (Math.random() * Math.min(K.n, 14)) | 0, a = Math.atan2(-K.phiY, -K.phiX) + (Math.random() - 0.5) * 1.2; spawn(st, { k: 'spark', x: wx + XS[j] * u, y: wy + YS[j] * u, vx: Math.cos(a) * 26 * u, vy: Math.sin(a) * 26 * u, drag: 2, life: 0.5 + Math.random() * 0.5, max: 0.9, s: 1 + Math.random() * 0.9, h: 28 + Math.random() * 20, l: 62 }); },
    bio: (st, K, wx, wy, u) => { const j = (Math.random() * K.n) | 0; if (Math.random() < 0.7) spawn(st, { k: 'spark', x: wx + XS[j] * u, y: wy + YS[j] * u, vx: (Math.random() - 0.5) * 8 * u, vy: (Math.random() - 0.5) * 8 * u, drag: 0.8, life: 0.8 + Math.random() * 0.6, max: 1.3, s: 1 + Math.random() * 0.9, h: 170 + Math.random() * 40, l: 62 }); else spawn(st, { k: 'bubble', x: wx + XS[j] * u, y: wy + YS[j] * u, vx: (Math.random() - 0.5) * 5 * u, vy: -10 * u, life: 1 + Math.random() * 0.6, max: 1.4, s: 1.1 + Math.random() * 1.3 }); },
    consty: (st, K, wx, wy, u) => { const j = (Math.random() * K.n) | 0; spawn(st, { k: 'glint', x: wx + XS[j] * u + (Math.random() - 0.5) * 10 * u, y: wy + YS[j] * u + (Math.random() - 0.5) * 10 * u, vx: 0, vy: 0, life: 0.6 + Math.random() * 0.6, max: 1, s: 1.6, h: 210 + Math.random() * 40, rot: Math.random() * 6, vr: 0.8, ph: Math.random() * 6 }); },
  };
  AMB.comet = (st, K, wx, wy, u) => { const j = (Math.random() * K.n) | 0, sh = Math.random() < 0.5; spawn(st, { k: sh ? 'shard' : 'glint', x: wx + XS[j] * u + (Math.random() - 0.5) * 10 * u, y: wy + YS[j] * u + (Math.random() - 0.5) * 10 * u, vx: (Math.random() - 0.5) * 8 * u, vy: (Math.random() - 0.5) * 8 * u, life: 0.6 + Math.random() * 0.6, max: 1.1, s: sh ? 1.2 + Math.random() : 2, h: 195 + Math.random() * 20, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 6, ph: Math.random() * 6 }); };
  AMB.blossom = (st, K, wx, wy, u) => { const j = (Math.random() * K.n) | 0, pk = Math.random(); spawn(st, { k: 'petal', x: wx + XS[j] * u + (Math.random() - 0.5) * 8 * u, y: wy + YS[j] * u + (Math.random() - 0.5) * 8 * u, vx: (Math.random() - 0.5) * 10 * u, vy: (4 + Math.random() * 8) * u, g: 9 * u, drag: 0.6, life: 1.1 + Math.random() * 0.8, max: 1.7, s: 1.5 + Math.random() * 1.2, c: pk < 0.5 ? '255,190,215' : pk < 0.85 ? '255,150,190' : '255,240,245', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 3, ph: Math.random() * 6 }); };
  AMB.gold = (st, K, wx, wy, u) => { const j = (Math.random() * K.n) | 0; spawn(st, { k: 'fleck', x: wx + XS[j] * u + (Math.random() - 0.5) * 9 * u, y: wy + YS[j] * u + (Math.random() - 0.5) * 9 * u, vx: (Math.random() - 0.5) * 5 * u, vy: (2 + Math.random() * 5) * u, g: 5 * u, life: 0.8 + Math.random() * 0.7, max: 1.4, s: 0.9 + Math.random() * 1, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 4, ph: Math.random() * 6 }); };
  AMB.phoenix = (st, K, wx, wy, u) => { const j = (Math.random() * Math.min(K.n, 24)) | 0; spawn(st, { k: 'spark', x: wx + XS[j] * u + (Math.random() - 0.5) * 7 * u, y: wy + YS[j] * u + (Math.random() - 0.5) * 7 * u, vx: (Math.random() - 0.5) * 12 * u, vy: -(10 + Math.random() * 18) * u, drag: 0.9, life: 0.6 + Math.random() * 0.6, max: 1.1, s: 0.9 + Math.random() * 1, h: 14 + Math.random() * 34, l: 62 }); };
  const RATE = { silk: 13, prism: 12, jelly: 9, eclipse: 16, bio: 14, consty: 10, comet: 11, blossom: 9, gold: 8, phoenix: 17 };
  const BURST = {
    silk: (st, wx, wy, u, full) => { ring(st, wx, wy, 4, 26, 0.6, 'hsla(200,100,78,A)'); for (let j = 0; j < (full ? 10 : 5); j++) { const a = j * TAU / 10 + Math.random() * 0.5, v = (24 + Math.random() * 26) * u; spawn(st, { k: 'glint', x: wx, y: wy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.2, life: 0.55 + Math.random() * 0.4, max: 0.95, s: 2.6, h: 180 + j * 24, rot: 0, vr: 3, ph: j }); } },
    prism: (st, wx, wy, u, full) => { for (let j = 0; j < (full ? 14 : 8); j++) { const a = j * TAU / 14 + Math.random() * 0.4, v = (30 + Math.random() * 30) * u; spawn(st, { k: j % 2 ? 'shard' : 'glint', x: wx, y: wy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.4, life: 0.5 + Math.random() * 0.4, max: 0.9, s: 2 + Math.random(), h: j * 26, rot: a, vr: 6, ph: j }); } },
    jelly: (st, wx, wy, u, full) => { for (let j = 0; j < (full ? 7 : 4); j++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, v = (30 + Math.random() * 34) * u; spawn(st, { k: 'drop', x: wx, y: wy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 120 * u, life: 0.55 + Math.random() * 0.35, max: 0.9, s: 1.6 + Math.random() * 1.2, c: jcol(j / 7).join(',') }); } },
    eclipse: (st, wx, wy, u, full) => { ring(st, wx, wy, 6, 30, 0.65, 'rgba(255,190,90,A)'); for (let j = 0; j < (full ? 16 : 8); j++) { const a = j * TAU / 16 + Math.random() * 0.3, v = (34 + Math.random() * 30) * u; spawn(st, { k: 'spark', x: wx, y: wy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.2, life: 0.5 + Math.random() * 0.4, max: 0.9, s: 1.2 + Math.random(), h: 30 + Math.random() * 20, l: 66 }); } },
    bio: (st, wx, wy, u, full) => { ring(st, wx, wy, 5, 32, 0.7, 'rgba(120,255,240,A)'); for (let j = 0; j < (full ? 12 : 6); j++) { const a = j * TAU / 12 + Math.random() * 0.5, v = (16 + Math.random() * 22) * u; spawn(st, { k: 'spark', x: wx, y: wy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 1.6, life: 0.7 + Math.random() * 0.5, max: 1.2, s: 1.2 + Math.random(), h: 172 + Math.random() * 30, l: 64 }); } },
    consty: (st, wx, wy, u, full) => { ring(st, wx, wy, 4, 28, 0.6, 'rgba(210,220,255,A)'); for (let j = 0; j < (full ? 8 : 4); j++) { const a = j * TAU / 8 + Math.random() * 0.5, v = (20 + Math.random() * 24) * u; spawn(st, { k: 'glint', x: wx, y: wy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2, life: 0.6 + Math.random() * 0.5, max: 1.1, s: 2.4, h: 215 + j * 8, rot: 0, vr: 2, ph: j }); } },
  };

  BURST.comet = (st, wx, wy, u, full) => { ring(st, wx, wy, 4, 28, 0.6, 'rgba(200,235,255,A)'); for (let j = 0; j < (full ? 12 : 6); j++) { const a = j * TAU / 12 + Math.random() * 0.4, v = (26 + Math.random() * 28) * u; spawn(st, { k: j % 2 ? 'shard' : 'glint', x: wx, y: wy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.3, life: 0.5 + Math.random() * 0.4, max: 0.9, s: 1.6 + Math.random(), h: 198 + Math.random() * 16, rot: a, vr: 5, ph: j }); } };
  BURST.blossom = (st, wx, wy, u, full) => { ring(st, wx, wy, 4, 26, 0.6, 'rgba(255,190,215,A)'); for (let j = 0; j < (full ? 10 : 5); j++) { const a = j * TAU / 10 + Math.random() * 0.5, v = (22 + Math.random() * 24) * u; spawn(st, { k: 'petal', x: wx, y: wy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 14 * u, drag: 1.6, life: 0.9 + Math.random() * 0.6, max: 1.5, s: 1.8 + Math.random() * 1.2, c: j % 3 ? '255,180,210' : '255,238,244', rot: a, vr: (Math.random() - 0.5) * 5, ph: j }); } };
  BURST.gold = (st, wx, wy, u, full) => { ring(st, wx, wy, 5, 26, 0.55, 'rgba(255,225,160,A)'); for (let j = 0; j < (full ? 12 : 6); j++) { const a = j * TAU / 12 + Math.random() * 0.5, v = (20 + Math.random() * 30) * u; spawn(st, { k: 'fleck', x: wx, y: wy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 30 * u, drag: 1.8, life: 0.6 + Math.random() * 0.5, max: 1.1, s: 1 + Math.random() * 1.1, rot: a, vr: (Math.random() - 0.5) * 9, ph: j }); } };
  BURST.phoenix = (st, wx, wy, u, full) => { ring(st, wx, wy, 6, 32, 0.65, 'rgba(255,170,80,A)'); for (let j = 0; j < (full ? 18 : 9); j++) { const a = j * TAU / 18 + Math.random() * 0.3, v = (30 + Math.random() * 36) * u; spawn(st, { k: 'spark', x: wx, y: wy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 14 * u, drag: 2, life: 0.55 + Math.random() * 0.45, max: 1, s: 1.1 + Math.random() * 1.1, h: 12 + Math.random() * 38, l: 64 }); } };

  // ---------- the public drawing call.
  // pts: the tail, newest first ({x,y}); (x,y) the dot; u the screen scale; t seconds; ev { ae: seconds since landing on an orbit (or -1), fly: 0..1 while jumping (or -1), land: a number that changes on each landing };
  // lite: the lighter version; st: this surface's own state (see newState)
  function newState() { return { p: [], max: 60, last: 0, land: null, acc: 0, seed: (Math.random() * 100) | 0 }; }
  function draw(c, id, pts, x, y, u, t, ev, lite, st, calm) {
    const fn = DRAW[id]; if (!fn || pts.length < 3) return false;
    const dt = Math.min(0.05, Math.max(0, t - st.last)); st.last = t; st.max = lite ? 22 : 64;
    const n = prep(pts, x, y, u), full = !lite, ae = ev && ev.ae >= 0 && ev.ae < 0.6 ? ev.ae : -1, fly = ev && ev.fly >= 0 ? ev.fly : -1;
    const boost = !calm && ae >= 0 ? Math.max(0, 1 - ae / 0.5) : 0, k3 = Math.min(3, n - 1), phiX = XS[0] - XS[k3], phiY = YS[0] - YS[k3], phi = Math.atan2(phiY, phiX);
    if (ev && ev.land != null && ev.land !== st.land) { if (st.land != null && !calm && BURST[id]) BURST[id](st, x, y, u, full); st.land = ev.land; }   // a landing: the burst
    if (dt > 0) {   // shed particles, then move them
      st.acc += (RATE[id] || 8) * (lite ? 0.45 : 1) * (calm ? 0.5 : 1) * dt;
      const K0 = { n, phiX, phiY }; while (AMB[id] && st.acc >= 1) { st.acc -= 1; AMB[id](st, K0, x, y, u); } if (!AMB[id]) st.acc = 0;
      stepParticles(st, dt);
    }
    const K = { n, t, u, full, boost, ae, fly, phi, phiX, phiY, x0: x, y0: y, calm };
    c.save(); c.globalCompositeOperation = 'lighter'; drawParticles(c, st, u, t); c.globalCompositeOperation = 'source-over';
    c.translate(x, y); c.scale(u, u); fn(c, K); c.restore();
    return true;
  }
  // everything a thumbnail needs: a small scene (a planet, three orbits, the dot hopping between them) drawn at (w,h) css pixels
  const SEG = 1.8, PER = 7.2, RAD = [62, 96, 130], SEQ = [1, 0, 1, 2];
  const ss = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  const radAt = t => { t = ((t % PER) + PER) % PER; const i = Math.floor(t / SEG), uu = t / SEG - i, a = RAD[SEQ[i]], b = RAD[SEQ[(i + 1) % 4]]; return a + (b - a) * ss((uu - 0.72) / 0.28); };
  const posAt = t => { const r = radAt(t), a = TAU * 3 * t / PER - 1.2; return [Math.cos(a) * r, Math.sin(a) * r]; };
  function preview(cv, id, t, st, opt) {
    opt = opt || {};
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth || cv.width, h = cv.clientHeight || cv.height;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
    const sc = (opt.scale || Math.min(w / 300, h / 270)), cx = w / 2 + (opt.dx || 0), cy = h * 0.5 + (opt.dy || 0), bg = c.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#060b26'); bg.addColorStop(1, '#10205e'); c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.save(); c.translate(cx, cy); c.scale(sc, sc);
    RAD.forEach((r, k) => { c.strokeStyle = `rgba(120,200,255,${0.1 + k * 0.03})`; c.lineWidth = 1.2; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); });
    const pg = c.createRadialGradient(-8, -10, 2, 0, 0, 30); pg.addColorStop(0, '#9fd4ff'); pg.addColorStop(0.35, '#3f8fd6'); pg.addColorStop(0.7, '#2a7a4a'); pg.addColorStop(1, '#0b2a52'); c.fillStyle = pg; c.beginPath(); c.arc(0, 0, 28, 0, TAU); c.fill();
    c.restore();
    const pts = []; for (let k = 0; k < 30; k++) { const [px, py] = posAt(t - k * 0.0175); pts.push({ x: cx + px * sc, y: cy + py * sc }); }
    const tt = ((t % PER) + PER) % PER, uu = (tt % SEG) / SEG, ev = { ae: uu < 0.34 ? uu * SEG : -1, fly: uu >= 0.72 ? (uu - 0.72) / 0.28 : -1, land: Math.floor(tt / SEG) + Math.floor(t / PER) * 4 };
    draw(c, id, pts, pts[0].x, pts[0].y, sc, t, ev, !!opt.lite, st, false);
  }
  // full on high and ultra graphics, the lighter one on medium and low (or when "high quality effects" is off)
  function isLite() { const s = OD.save && OD.save.settings || {}, q = s.quality; return s.fx === false || !(q === 'high' || q === 'ultra'); }

  return { LIST, BY_ID, draw, preview, newState, isLite };
})();
