'use strict';
// Procedural art: glow sprites, backgrounds, planets, debris and trails.
OD.gfx = (() => {
  const TAU = OD.TAU;
  const cache = new Map();
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

  // Pre-rendered radial glow. Drawn with 'lighter' it is far cheaper than shadowBlur.
  function glowSprite(color, size) {
    const key = color + '|' + size;
    let c = cache.get(key);
    if (c) return c;
    c = mk(size, size);
    const g = c.getContext('2d');
    const r = size / 2;
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, OD.rgba(color, 1));
    gr.addColorStop(0.25, OD.rgba(color, 0.45));
    gr.addColorStop(0.6, OD.rgba(color, 0.12));
    gr.addColorStop(1, OD.rgba(color, 0));
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    cache.set(key, c);
    return c;
  }
  function glow(ctx, x, y, radius, color, alpha = 1) {
    const size = Math.max(8, Math.round(radius * 2 / 16) * 16);
    if (alpha < 0.03 || radius < 1.2) return size;   // too faint or too small to be seen: not drawn (a glow costs a blended image the size of its halo)
    ctx.globalAlpha = alpha;
    ctx.drawImage(glowSprite(color, 128), x - radius, y - radius, radius * 2, radius * 2);
    ctx.globalAlpha = 1;
    return size;
  }

  // ---------------------------------------------------------- background
  function background(w, W, H) {
    const key = 'bg' + w.id + '|' + W + 'x' + H;
    let c = cache.get(key);
    if (c) return c;
    c = mk(W, H);
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, w.bg[0]); gr.addColorStop(1, w.bg[1]);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const rng = OD.makeRng(1000 + w.id * 77);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      const x = rng() * W, y = rng() * H, r = (0.35 + rng() * 0.55) * Math.max(W, H) * 0.6;
      const col = w.neb[i % 2];
      const gg = g.createRadialGradient(x, y, 0, x, y, r);
      gg.addColorStop(0, OD.rgba(col, 0.16));
      gg.addColorStop(1, OD.rgba(col, 0));
      g.fillStyle = gg; g.fillRect(0, 0, W, H);
    }
    g.globalCompositeOperation = 'source-over';
    const v = g.createRadialGradient(W / 2, H * 0.46, Math.min(W, H) * 0.35, W / 2, H * 0.46, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.62)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    cache.set(key, c);
    return c;
  }
  function makeStars(n, seed) {
    const rng = OD.makeRng(seed);
    const arr = [];
    for (let i = 0; i < n; i++) arr.push({ x: rng(), y: rng(), z: 0.2 + rng() * 0.8, p: rng() * TAU, s: 0.6 + rng() * 1.4 });
    return arr;
  }
  // The stars are drawn in five brightness groups (one alpha setting per group instead of one per star): hundreds of single-star state changes
  // were among the busiest things in every frame.
  const starBin = [[], [], [], [], []];
  function drawStars(ctx, stars, W, H, t, speed, tint, dx) {   // dx: how far the whole sky has drifted sideways (px); nearer stars drift faster
    ctx.fillStyle = tint;
    const drifting = dx != null;
    for (const g of starBin) g.length = 0;
    for (const s of stars) {
      const a = (0.35 + 0.65 * Math.abs(Math.sin(t * (0.6 + s.z) + s.p))) * s.z;
      starBin[Math.min(4, (a * 5) | 0)].push(s);
    }
    for (let q = 0; q < 5; q++) {
      const g = starBin[q]; if (!g.length) continue;
      ctx.globalAlpha = (q + 0.5) / 5;
      for (const s of g) {
        const y = ((s.y + t * speed * s.z * (drifting ? 0.002 : 0.01)) % 1) * H, sz = s.s * (0.6 + s.z * 0.8);
        ctx.fillRect(drifting ? ((((s.x + dx * (0.25 + s.z * 0.75) / W) % 1) + 1) % 1) * W : s.x * W, y, sz, sz);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------- planets
  function blob(g, x, y, r, rng, col) {
    g.fillStyle = col;
    const n = 5 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, d = rng() * r * 0.8;
      g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.35 + rng() * 0.5), 0, TAU); g.fill();
    }
  }
  function bands(g, D, rng, cols, wob) {
    let y = -D * 0.05;
    while (y < D * 1.05) {
      const h = D * (0.06 + rng() * 0.12);
      g.fillStyle = cols[Math.floor(rng() * cols.length)];
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= D; x += D / 12) g.lineTo(x, y + Math.sin(x / D * 6 + rng() * 2) * wob);
      for (let x = D; x >= 0; x -= D / 12) g.lineTo(x, y + h + Math.sin(x / D * 6 + 1) * wob);
      g.closePath(); g.fill();
      y += h * 0.85;
    }
  }
  function planetParts(skin, r, dpr) {
    const key = 'pl' + skin + '|' + Math.round(r * dpr);
    let p = cache.get(key);
    if (p) return p;
    const D = Math.round(r * 2 * dpr), rng = OD.makeRng(skin.length * 313 + 7);
    const tex = mk(D, D), g = tex.getContext('2d');
    const base = (c1, c2) => { const gr = g.createLinearGradient(0, 0, 0, D); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fillRect(0, 0, D, D); };
    switch (skin) {
      case 'terra':
        base('#2f7de8', '#0c3a8c');
        for (let i = 0; i < 9; i++) blob(g, rng() * D, rng() * D, D * 0.17, rng, i % 3 ? '#3ea35b' : '#c9b26b');
        g.globalAlpha = 0.4;
        for (let i = 0; i < 10; i++) blob(g, rng() * D, rng() * D, D * 0.14, rng, '#ffffff');
        g.globalAlpha = 1; break;
      case 'ocean':
        base('#1b6fe0', '#06285e');
        g.lineWidth = Math.max(1, D * 0.012);
        for (let i = 0; i < 22; i++) { g.strokeStyle = `rgba(190,230,255,${0.12 + rng() * 0.25})`; g.beginPath(); const x = rng() * D, y = rng() * D; g.moveTo(x, y); g.bezierCurveTo(x + D * 0.08, y - D * 0.05, x + D * 0.16, y + D * 0.05, x + D * 0.24, y); g.stroke(); }
        for (let i = 0; i < 4; i++) blob(g, rng() * D, rng() * D, D * 0.08, rng, 'rgba(220,255,240,0.5)');
        break;
      case 'moon':
        base('#b8b8c4', '#6f6f7c');
        for (let i = 0; i < 16; i++) {
          const x = rng() * D, y = rng() * D, rr = D * (0.03 + rng() * 0.08);
          g.fillStyle = 'rgba(40,40,55,0.45)'; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
          g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = Math.max(1, rr * 0.18); g.beginPath(); g.arc(x - rr * 0.1, y - rr * 0.1, rr, 0, TAU); g.stroke();
        } break;
      case 'lava':
        base('#2a0f0d', '#120505');
        g.lineCap = 'round';
        for (let i = 0; i < 14; i++) {
          let x = rng() * D, y = rng() * D;
          g.beginPath(); g.moveTo(x, y);
          for (let k = 0; k < 6; k++) { x += (rng() - 0.5) * D * 0.25; y += (rng() - 0.5) * D * 0.25; g.lineTo(x, y); }
          g.strokeStyle = 'rgba(255,90,20,0.55)'; g.lineWidth = D * 0.035; g.stroke();
          g.strokeStyle = '#ffd24d'; g.lineWidth = D * 0.012; g.stroke();
        } break;
      case 'ice':
        base('#e8f7ff', '#8fc9ee');
        bands(g, D, rng, ['rgba(255,255,255,0.55)', 'rgba(120,200,255,0.35)', 'rgba(190,230,255,0.4)'], D * 0.02);
        g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = Math.max(1, D * 0.006);
        for (let i = 0; i < 10; i++) { g.beginPath(); let x = rng() * D, y = rng() * D; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (rng() - 0.5) * D * 0.3; y += (rng() - 0.5) * D * 0.3; g.lineTo(x, y); } g.stroke(); }
        break;
      case 'gas':
        base('#d9a066', '#a8643a');
        bands(g, D, rng, ['#e8c08a', '#c9824d', '#f1d9b0', '#9c5a35', '#d79a62'], D * 0.025);
        g.fillStyle = 'rgba(180,60,40,0.8)'; g.beginPath(); g.ellipse(D * 0.62, D * 0.62, D * 0.1, D * 0.06, 0, 0, TAU); g.fill();
        break;
      case 'ringed':
        base('#f1d9a8', '#c79a62');
        bands(g, D, rng, ['#f8e6c0', '#dcb67a', '#e9c892', '#caa064'], D * 0.015);
        break;
      case 'garden':
        base('#2fb3c9', '#0b4f78');
        for (let i = 0; i < 10; i++) blob(g, rng() * D, rng() * D, D * 0.17, rng, i % 3 ? '#4fc468' : '#9be06c');
        g.globalAlpha = 0.85; for (let i = 0; i < 16; i++) blob(g, rng() * D, rng() * D, D * 0.035, rng, i % 2 ? '#ffb3d1' : '#fff2a8');
        g.globalAlpha = 0.28; for (let i = 0; i < 8; i++) blob(g, rng() * D, rng() * D, D * 0.13, rng, '#ffffff');
        g.globalAlpha = 1; break;
      case 'crystal':
        base('#72ead8', '#3b2f94');
        for (let i = 0; i < 18; i++) { const x = rng() * D, y = rng() * D, sz = D * (0.1 + rng() * 0.2); g.fillStyle = `rgba(255,255,255,${0.05 + rng() * 0.18})`; g.beginPath(); g.moveTo(x, y - sz); g.lineTo(x + sz * 0.7, y + sz * 0.5); g.lineTo(x - sz * 0.7, y + sz * 0.5); g.closePath(); g.fill(); g.strokeStyle = `rgba(255,255,255,${0.2 + rng() * 0.3})`; g.lineWidth = Math.max(1, D * 0.006); g.stroke(); }
        g.fillStyle = 'rgba(255,255,255,0.9)'; for (let i = 0; i < 8; i++) { const x = rng() * D, y = rng() * D; g.fillRect(x, y, D * 0.012, D * 0.012); }
        break;
      case 'toxic':
        base('#3b2a73', '#150d2e');
        g.globalAlpha = 0.6; for (let i = 0; i < 9; i++) blob(g, rng() * D, rng() * D, D * 0.18, rng, '#8be03a');
        g.globalAlpha = 0.9; for (let i = 0; i < 14; i++) { const x = rng() * D, y = rng() * D, rr = D * (0.015 + rng() * 0.03); g.strokeStyle = '#d6ff8a'; g.lineWidth = Math.max(1, D * 0.006); g.beginPath(); g.arc(x, y, rr, 0, TAU); g.stroke(); }
        g.globalAlpha = 1; break;
      case 'void':
      default:
        base('#07000d', '#000000');
        g.globalAlpha = 0.5;
        for (let i = 0; i < 6; i++) blob(g, rng() * D, rng() * D, D * 0.2, rng, '#3b0a66');
        g.globalAlpha = 1; break;
    }
    // static lighting overlay
    const sh = mk(D, D), s = sh.getContext('2d');
    const gr = s.createRadialGradient(D * 0.36, D * 0.34, D * 0.05, D * 0.5, D * 0.5, D * 0.58);
    gr.addColorStop(0, 'rgba(255,255,255,0.16)');
    gr.addColorStop(0.5, 'rgba(0,0,0,0.05)');
    gr.addColorStop(1, 'rgba(0,0,10,0.82)');
    s.fillStyle = gr; s.fillRect(0, 0, D, D);
    p = { tex, sh, D };
    cache.set(key, p);
    return p;
  }
  const AURAS = { azure: '#8ec8ff', sunrise: '#ffb36b', toxic: '#8cff5a', violet: '#c28bff', neon: '#ff4dd2' };
  function auraColor(id, t) {
    if (id === 'prism') return hslToHex((t * 50) % 360, 100, 70);
    return AURAS[id] || AURAS.azure;
  }
  function hslToHex(h, s2, l) {
    s2 /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s2 * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const to = v => Math.round(v * 255).toString(16).padStart(2, '0'); return '#' + to(f(0)) + to(f(8)) + to(f(4));
  }
  function drawPlanet(ctx, x, y, r, skin, t, accent, dpr = 1, aura = 'azure') {
    const ac = auraColor(aura, t);
    const rim = skin === 'void' && aura === 'azure' ? accent : ac;
    glow(ctx, x, y, r * 2.1, rim, skin === 'void' ? 0.5 : 0.35);
    if (skin !== 'ringed' && OD.planets && OD.planets.draw(ctx, x, y, r, skin, t, rim, dpr, !OD.save.settings.fx)) return;   // the spinning, lit sphere (see planets.js)
    const { tex, sh } = planetParts(skin, r, dpr);   // (only the old flat planets need these, and they are costly to make: never before the check above)
    ctx.save();
    if (skin === 'ringed') ringHalf(ctx, x, y, r, true);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
    ctx.translate(x, y); ctx.rotate(t * 0.05);
    ctx.drawImage(tex, -r, -r, r * 2, r * 2);
    ctx.rotate(-t * 0.05);
    ctx.drawImage(sh, -r, -r, r * 2, r * 2);
    ctx.restore();
    ctx.lineWidth = 2;
    const rg = ctx.createRadialGradient(x, y, r * 0.85, x, y, r * 1.08);
    rg.addColorStop(0, OD.rgba(rim, 0));
    rg.addColorStop(0.7, OD.rgba(rim, skin === 'void' ? 0.85 : 0.4));
    rg.addColorStop(1, OD.rgba(rim, 0));
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, r * 1.08, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    if (skin === 'ringed') { ctx.save(); ringHalf(ctx, x, y, r, false); ctx.restore(); }
  }
  function ringHalf(ctx, x, y, r, back) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(-0.32); ctx.scale(1, 0.28);
    ctx.beginPath();
    if (back) ctx.arc(0, 0, r * 1.62, Math.PI, TAU); else ctx.arc(0, 0, r * 1.62, 0, Math.PI);
    ctx.lineWidth = r * 0.3;
    ctx.strokeStyle = 'rgba(230,200,150,0.75)'; ctx.stroke();
    ctx.lineWidth = r * 0.06;
    ctx.strokeStyle = 'rgba(255,240,210,0.9)';
    ctx.beginPath();
    if (back) ctx.arc(0, 0, r * 1.5, Math.PI, TAU); else ctx.arc(0, 0, r * 1.5, 0, Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------- debris
  function makeShape(style, rng) {
    if (style === 'aurora') return Array.from({ length: 9 }, () => 0.82 + rng() * 0.28);
    if (style === 'dust') return Array.from({ length: 7 }, () => 0.74 + rng() * 0.42);
    if (style === 'ember') return Array.from({ length: 9 }, (_, i) => (i % 2 ? 0.8 : 1.06) * (0.92 + rng() * 0.16));
    if (style === 'glacier') return [1.25, 0.62, 1.0, 0.6, 1.2, 0.66, 0.95, 0.6].map(v => v * (0.92 + rng() * 0.16));
    if (style === 'pulsar') return Array.from({ length: 6 }, () => 0.96 + rng() * 0.1);
    if (style === 'abyss') return Array.from({ length: 10 }, (_, i) => (i % 2 ? 0.72 : 1.08) * (0.9 + rng() * 0.2));
    if (style === 'gear') return [1, 1, 0.76, 0.76, 1, 1, 0.76, 0.76, 1, 1, 0.76, 0.76, 1, 1, 0.76, 0.76, 1, 1, 0.76, 0.76].map(v => v * (0.97 + rng() * 0.06));
    if (style === 'star') return [1.3, 0.5, 1.3, 0.5, 1.3, 0.5, 1.3, 0.5, 1.3, 0.5].map(v => v * (0.95 + rng() * 0.1));
    if (style === 'scrap') return [1, 0.7, 1, 0.7].map(v => v * (0.85 + rng() * 0.3));
    if (style === 'crystal') return [1.25, 0.6, 0.9, 0.6, 1.25, 0.6, 0.9, 0.6].map(v => v * (0.9 + rng() * 0.2));
    if (style === 'ice') return [1.2, 0.66, 1.0, 0.58, 1.18, 0.64, 0.92, 0.6].map(v => v * (0.92 + rng() * 0.16));
    if (style === 'ocean') return Array.from({ length: 11 }, () => 0.9 + rng() * 0.14);
    if (style === 'toxic') return Array.from({ length: 9 }, (_, i) => (i % 2 ? 0.82 : 1.02) + rng() * 0.12);
    if (style === 'storm') return Array.from({ length: 10 }, () => 0.86 + rng() * 0.2);
    const n = 8, a = [];
    for (let i = 0; i < n; i++) a.push(0.72 + rng() * 0.42);
    return a;
  }
  // each planet type has its own kind of rock: the body takes the planet's material, the rim stays the sector's danger colour so it still reads as a hazard
  const MAT_GLOW = { lava: '#ff7a2a', ice: '#9fe6ff', ocean: '#5ad2ff', void: '#8a3dff', toxic: '#b4ff5a', crystal: '#59f0d6', storm: '#c9a0ff', garden: '#7be08a' };
  const DEBRIS_FOR = { terra: 'rock', moon: 'rock', ringed: 'rock', lava: 'lava', ice: 'ice', gas: 'storm', void: 'void', ocean: 'ocean', garden: 'garden', crystal: 'crystal', toxic: 'toxic' };
  const debrisFor = skin => DEBRIS_FOR[skin] || 'rock';
  // the common rock of each sky is its own: aurora geodes, rust-banded dust stone, cracked ember basalt, glacier ice, pulsar ore and abyssal glass
  const BIOME_ROCK = ['aurora', 'dust', 'ember', 'glacier', 'pulsar', 'abyss'];
  const biomeRock = id => BIOME_ROCK[id] || 'rock';
  const ROCK_PAL = {
    aurora:  { base: ['#06202c', '#1f7a86'], lit: '#bff7ff', shade: '#02101a', glow: '#58ffc4' },
    dust:    { base: ['#3b2012', '#c98a47'], lit: '#ffd9a0', shade: '#1e0e06', glow: '#ffb35a' },
    ember:   { base: ['#0d0605', '#3f1a12'], lit: '#ff9a5a', shade: '#050202', glow: '#ff6a24' },
    glacier: { base: ['#2a6f95', '#e8fbff'], lit: '#ffffff', shade: '#12395a', glow: '#9fe6ff' },
    pulsar:  { base: ['#100e26', '#3a3470'], lit: '#b9a6ff', shade: '#06050f', glow: '#ff5ad8' },
    abyss:   { base: ['#05020c', '#2a1458'], lit: '#a98aff', shade: '#020106', glow: '#8a3dff' },
  };
  const rockCache = new Map(); let rockId = 1;
  function rockSprite(style, shape, size, danger) {
    if (!shape._rid) shape._rid = rockId++;
    const q = Math.max(4, Math.round(size)), key = style + '|' + danger + '|' + q + '|' + shape._rid;
    let e = rockCache.get(key);
    if (e) return e;
    const h = Math.ceil(q * 1.5) + 3, S = 2, cv = document.createElement('canvas'); cv.width = cv.height = h * 2 * S;
    const g = cv.getContext('2d'); g.setTransform(S, 0, 0, S, h * S, h * S);
    drawBiomeRock(g, style, q, 0, danger, shape, 0);
    e = { cv, h }; rockCache.set(key, e);
    if (rockCache.size > 160) rockCache.delete(rockCache.keys().next().value);
    return e;
  }
  // a rock cut into flat faces lit from the upper left (the light stays put while the rock turns), then dressed for its sky
  function drawBiomeRock(ctx, style, size, rot, danger, shape, pulse) {
    const P = ROCK_PAL[style], n = shape.length, pts = [], tt = 0.6;   // (painted once into a small picture, so its look is fixed)
    for (let i = 0; i < n; i++) { const a = i / n * TAU; pts.push([Math.cos(a) * size * shape[i], Math.sin(a) * size * shape[i]]); }
    ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
    const bg = ctx.createLinearGradient(-size, -size, size, size); bg.addColorStop(0, P.base[1]); bg.addColorStop(1, P.base[0]); ctx.fillStyle = bg; ctx.fill();
    ctx.save(); ctx.clip();
    const ox = -size * 0.18, oy = -size * 0.2, lightA = -2.3, edgeLit = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n], mx = (p[0] + q[0]) / 2 - ox, my = (p[1] + q[1]) / 2 - oy, lit = Math.cos(Math.atan2(my, mx) + rot - lightA);
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.closePath();
      ctx.fillStyle = lit > 0 ? OD.rgba(P.lit, (style === 'glacier' ? 0.1 : 0.05) + (style === 'glacier' ? 0.5 : 0.36) * lit * lit) : OD.rgba(P.shade, 0.12 + 0.36 * -lit); ctx.fill();
      if (lit > 0.3) edgeLit.push([p, q, lit]);
    }
    const sd = OD.makeRng(Math.round(shape[0] * 1000) + 11);
    if (style === 'aurora') {   // glowing veins of green and violet running through the stone
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      const pu = 0.65 + 0.35 * Math.sin(tt * 1.6 + shape[0] * 9);
      for (let v = 0; v < 3; v++) {
        const a0 = sd() * TAU, a1 = a0 + 1.4 + sd(), g = ctx.createLinearGradient(Math.cos(a0) * size, Math.sin(a0) * size, Math.cos(a1) * size, Math.sin(a1) * size);
        g.addColorStop(0, 'rgba(88,255,196,0.9)'); g.addColorStop(1, 'rgba(176,110,255,0.8)');
        ctx.strokeStyle = g; ctx.globalAlpha *= 1; ctx.lineWidth = Math.max(1, size * 0.085); ctx.beginPath(); ctx.moveTo(Math.cos(a0) * size * 0.9, Math.sin(a0) * size * 0.9);
        ctx.quadraticCurveTo(Math.cos((a0 + a1) / 2) * size * 0.1, Math.sin((a0 + a1) / 2) * size * 0.1, Math.cos(a1) * size * 0.9, Math.sin(a1) * size * 0.9); ctx.save(); ctx.globalAlpha *= 0.55 * pu; ctx.stroke(); ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
    } else if (style === 'dust') {   // rust and ochre strata, and a few pits
      for (let b = 0; b < 3; b++) { ctx.fillStyle = b % 2 ? 'rgba(255,214,150,0.16)' : 'rgba(60,24,8,0.22)'; ctx.save(); ctx.rotate(-rot + 0.35); ctx.fillRect(-size * 1.3, (b - 1) * size * 0.46 - size * 0.1, size * 2.6, size * 0.2); ctx.restore(); }
      for (let c = 0; c < 3; c++) { const cx0 = (sd() - 0.5) * size * 1.1, cy0 = (sd() - 0.5) * size * 1.1, cr = size * (0.1 + sd() * 0.1); ctx.fillStyle = 'rgba(30,12,4,0.5)'; ctx.beginPath(); ctx.arc(cx0, cy0, cr, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(255,220,170,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx0, cy0 + 0.6, cr, 0.2, 2.9); ctx.stroke(); }
    } else if (style === 'ember') {   // cracks full of glowing lava, breathing slowly
      const pu = 0.7 + 0.3 * Math.sin(tt * 2.2 + shape[0] * 7 + pulse);
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let c = 0; c < 3; c++) {
        const a = sd() * TAU, b = a + 0.7 + sd();
        for (const [lw, al, col] of [[size * 0.2, 0.2, '#ff5a1f'], [size * 0.08, 0.95, '#ffcf6a']]) {
          ctx.strokeStyle = OD.rgba(col, al * pu); ctx.lineWidth = Math.max(1, lw); ctx.beginPath(); ctx.moveTo(Math.cos(a) * size * 0.15, Math.sin(a) * size * 0.15);
          ctx.lineTo(Math.cos(b) * size * 0.55, Math.sin(b) * size * 0.42); ctx.lineTo(Math.cos(a + 0.5) * size * 0.95, Math.sin(a + 0.5) * size * 0.95); ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    } else if (style === 'glacier') {   // frozen white seams inside the ice
      ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 1;
      for (let i = 0; i < n; i += 2) { ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(pts[i][0] * 0.95, pts[i][1] * 0.95); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.moveTo(-size * 0.8, -size * 0.2); ctx.lineTo(-size * 0.1, -size * 0.75); ctx.lineTo(size * 0.05, -size * 0.15); ctx.closePath(); ctx.fill();
    } else if (style === 'pulsar') {   // dark ore with neon seams and a pulsing heart
      const pu = 0.55 + 0.45 * Math.sin(tt * 4 + shape[1] * 8 + pulse * 2);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = OD.rgba('#ff5ad8', 0.8 * pu + 0.3); ctx.lineWidth = 1.5;
      for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(pts[i][0] * 0.98, pts[i][1] * 0.98); ctx.stroke(); }
      const hg = ctx.createRadialGradient(ox, oy, 0, ox, oy, size * 0.6); hg.addColorStop(0, OD.rgba('#ffffff', 0.9 * pu)); hg.addColorStop(0.4, OD.rgba('#ff5ad8', 0.55 * pu)); hg.addColorStop(1, 'rgba(255,90,216,0)'); ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(ox, oy, size * 0.6, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else if (style === 'abyss') {   // black glass with a violet edge-light and a few cold stars caught inside
      const vg = ctx.createRadialGradient(0, 0, size * 0.25, 0, 0, size * 1.1); vg.addColorStop(0, 'rgba(138,61,255,0)'); vg.addColorStop(1, 'rgba(170,110,255,0.7)'); ctx.fillStyle = vg; ctx.fillRect(-size * 1.3, -size * 1.3, size * 2.6, size * 2.6);
      ctx.fillStyle = '#e6d6ff'; for (let i = 0; i < 4; i++) ctx.fillRect((sd() - 0.5) * size, (sd() - 0.5) * size, 1.6, 1.6);
    }
    ctx.restore();
    ctx.lineJoin = 'round';
    for (const [p, q, lit] of edgeLit) { ctx.strokeStyle = OD.rgba(style === 'abyss' ? '#c9b0ff' : '#ffffff', Math.min(0.85, 0.55 * lit)); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); }
    ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
    ctx.strokeStyle = danger; ctx.lineWidth = 2; ctx.stroke();   // the sector's danger colour still rims it, so it reads as a hazard
  }
  function drawDebris(ctx, style, x, y, size, rot, danger, shape, alpha = 1, pulse = 0) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y); ctx.rotate(rot);
    const n = shape.length;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, 0, size * 2.8, danger, 0.5 + pulse * 0.4);
    if (MAT_GLOW[style]) glow(ctx, 0, 0, size * 2.2, MAT_GLOW[style], 0.35);
    if (ROCK_PAL[style]) glow(ctx, 0, 0, size * 2.2, ROCK_PAL[style].glow, 0.28);
    ctx.globalCompositeOperation = 'source-over';
    if (ROCK_PAL[style]) {   // a touch larger than it hits, so the detail reads; painted once and then just placed, which keeps many rocks cheap
      const sp = rockSprite(style, shape, size * 1.1, danger), h = sp.h;
      ctx.drawImage(sp.cv, -h, -h, 2 * h, 2 * h);
      if (style === 'ember' || style === 'pulsar' || style === 'aurora') { ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, 0, size * 1.5, ROCK_PAL[style].glow, 0.08 + 0.1 * (0.5 + 0.5 * Math.sin(performance.now() / 1000 * 3 + shape[0] * 9))); }
      ctx.restore(); return;
    }
    if (style === 'orb') {
      const g = ctx.createRadialGradient(-size * 0.3, -size * 0.3, 0, 0, 0, size);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, danger); g.addColorStop(1, OD.rgba(danger, 0.35));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, size, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.2; ctx.stroke();
    } else {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU, rr = size * shape[i];
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      const lin = (c0, c1, c2) => { const g = ctx.createLinearGradient(-size, -size, size, size); g.addColorStop(0, c0); g.addColorStop(0.5, c1); g.addColorStop(1, c2); return g; };
      const rad = (c0, c1) => { const g = ctx.createRadialGradient(-size * 0.35, -size * 0.35, 1, 0, 0, size * 1.1); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; };
      if (style === 'crystal') ctx.fillStyle = lin('#f2fffc', '#59f0d6', '#3b2f94');
      else if (style === 'lava') ctx.fillStyle = rad('#5a2412', '#140504');
      else if (style === 'ice') ctx.fillStyle = lin('#ffffff', '#a9dcff', '#4b7fb4');
      else if (style === 'ocean') ctx.fillStyle = rad('#d4fbff', '#1b6aa6');
      else if (style === 'storm') ctx.fillStyle = rad('#8c8499', '#2f2a3d');
      else if (style === 'void') ctx.fillStyle = rad('#2b1650', '#05020c');
      else if (style === 'garden') ctx.fillStyle = rad('#7a6650', '#2c2118');
      else if (style === 'toxic') ctx.fillStyle = rad('#a6e64a', '#23401a');
      else if (style === 'star') {
        const g = ctx.createRadialGradient(0, 0, 1, 0, 0, size * 1.3);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, danger); g.addColorStop(1, '#3a0014');
        ctx.fillStyle = g;
      } else if (style === 'gear') {
        ctx.fillStyle = '#2f2f3d';
      } else if (style === 'scrap') {
        ctx.fillStyle = '#2b2b36';
      } else {
        const g = ctx.createRadialGradient(-size * 0.35, -size * 0.35, 1, 0, 0, size * 1.1);
        g.addColorStop(0, '#6b6270'); g.addColorStop(1, '#241d2a');
        ctx.fillStyle = g;
      }
      ctx.fill();
      ctx.save(); ctx.clip();
      const sd = OD.makeRng(Math.round(shape[0] * 1000) + 5);
      if (style === 'lava') {
        ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) { const a = sd() * TAU, b = a + 0.6 + sd(); ctx.beginPath(); ctx.moveTo(Math.cos(a) * size * 0.2, Math.sin(a) * size * 0.2); ctx.lineTo(Math.cos(b) * size * 0.55, Math.sin(b) * size * 0.45); ctx.lineTo(Math.cos(a + 0.2) * size * 1.2, Math.sin(a + 0.2) * size * 1.2); ctx.strokeStyle = 'rgba(255,110,30,0.8)'; ctx.lineWidth = size * 0.2; ctx.stroke(); ctx.strokeStyle = '#ffd35a'; ctx.lineWidth = size * 0.07; ctx.stroke(); }
      } else if (style === 'ice') {
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1;
        for (let i = 0; i < n; i += 2) { const a = (i / n) * TAU; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * size * shape[i], Math.sin(a) * size * shape[i]); ctx.stroke(); }
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(-size * 0.9, -size * 0.2); ctx.lineTo(0, -size * 0.8); ctx.lineTo(size * 0.1, -size * 0.1); ctx.closePath(); ctx.fill();
      } else if (style === 'ocean') {
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(-size * 0.35, -size * 0.4, size * 0.22, size * 0.12, -0.6, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(size * 0.1, size * 0.15, size * 0.5, 0.3, 2.2); ctx.stroke();
      } else if (style === 'storm') {
        for (let i = -2; i <= 2; i++) { ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.22)'; ctx.fillRect(-size * 1.2, i * size * 0.34 - size * 0.12, size * 2.4, size * 0.24); }
      } else if (style === 'void') {
        const g = ctx.createRadialGradient(0, 0, size * 0.3, 0, 0, size * 1.05); g.addColorStop(0, 'rgba(138,61,255,0)'); g.addColorStop(1, 'rgba(160,90,255,0.75)'); ctx.fillStyle = g; ctx.fillRect(-size * 1.3, -size * 1.3, size * 2.6, size * 2.6);
        ctx.fillStyle = '#d9c2ff'; for (let i = 0; i < 4; i++) ctx.fillRect((sd() - 0.5) * size, (sd() - 0.5) * size, 1.6, 1.6);
      } else if (style === 'garden') {
        ctx.fillStyle = '#5fbf5a'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc((sd() - 0.5) * size * 1.1, -size * (0.2 + sd() * 0.5), size * (0.2 + sd() * 0.15), 0, TAU); ctx.fill(); }
        ctx.fillStyle = '#ffb3d1'; ctx.beginPath(); ctx.arc(size * 0.25, -size * 0.45, size * 0.1, 0, TAU); ctx.fill();
      } else if (style === 'toxic') {
        ctx.fillStyle = 'rgba(214,255,138,0.85)'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc((sd() - 0.5) * size * 1.1, (sd() - 0.5) * size * 1.1, size * (0.08 + sd() * 0.12), 0, TAU); ctx.fill(); }
      }
      ctx.restore();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = danger; ctx.lineWidth = 2; ctx.stroke();
      if (style === 'crystal') {
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-size * 0.9, 0); ctx.lineTo(size * 0.9, 0); ctx.moveTo(0, -size * 0.55); ctx.lineTo(0, size * 0.55); ctx.stroke();
      } else if (style === 'scrap') {
        ctx.fillStyle = danger;
        ctx.beginPath(); ctx.arc(size * 0.35, 0, 1.8, 0, TAU); ctx.arc(-size * 0.35, 0, 1.8, 0, TAU); ctx.fill();
      } else if (style === 'gear') {
        ctx.fillStyle = '#0a0a12'; ctx.beginPath(); ctx.arc(0, 0, size * 0.32, 0, TAU); ctx.fill();
        ctx.strokeStyle = danger; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------- trails
  // pts: newest first [{x,y}]. Used in the game and in the shop preview.
  function drawTrail(ctx, pts, style, accent, t, width = 6) {
    const n = pts.length;
    if (n < 2) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    if (style === 'pixel') {
      for (let i = 0; i < n; i += 2) { const k = i / (n - 1), sz = Math.max(1.5, width * (1 - k) * 1.1); ctx.globalAlpha = 1 - k; ctx.fillStyle = i % 4 ? accent : '#ffffff'; ctx.fillRect(Math.round(pts[i].x / sz) * sz - sz / 2, Math.round(pts[i].y / sz) * sz - sz / 2, sz, sz); }
      ctx.restore(); return;
    }
    const NEW = { ribbon: 1, lightning: 1, inferno: 1, nebula: 1, helix: 1, ghost: 1, bubbles: 1, petals: 1, matrix: 1 };
    if (NEW[style]) { drawTrailFancy(ctx, pts, style, accent, t, width); ctx.restore(); return; }
    const passes = style === 'glitch' ? 2 : 1;
    ctx.lineJoin = 'round';
    for (let pass = 0; pass < passes; pass++) {
      for (let i = 0; i < n - 1; i += 2) {   // two segments to a stroke: half the strokes, the same look at this size
        const k = i / (n - 1), a = pts[i], b = pts[i + 1];
        let col, w = width * (1 - k) + 0.5, al = (1 - k) * 0.9, ox = 0, oy = 0;
        switch (style) {
          case 'comet': col = OD.hsl(200 + k * 20, 100, 70 + (1 - k) * 25); break;
          case 'ember': col = OD.hsl(10 + (1 - k) * 40, 100, 50 + (1 - k) * 15); break;
          case 'ice': col = OD.hsl(190, 90, 70 + (1 - k) * 25); break;
          case 'rainbow': col = OD.hsl((i * 11 + t * 180) % 360, 100, 62); break;
          case 'aurora': col = OD.hsl(140 + 130 * (0.5 + 0.5 * Math.sin(i * 0.2 + t * 1.6)), 95, 62); w *= 1 + 0.35 * Math.sin(i * 0.5 - t * 3); break;
          case 'stardust': col = OD.hsl(45, 100, 72 + (1 - k) * 18); w *= 0.45; break;
          case 'plasma': col = i < n * 0.22 ? '#ffffff' : OD.hsl(305 + 20 * k, 100, 62); w *= 1.5 * (1 + 0.22 * Math.sin(i * 0.7 - t * 11)); break;
          case 'glitch':
            col = pass ? '#00f0ff' : '#ff2bd6';
            ox = (pass ? 1 : -1) * (2 + Math.sin(i * 1.7 + t * 30) * 2); oy = Math.cos(i * 2.3 + t * 25) * 1.5;
            w *= 0.7; break;
          default: col = accent;
        }
        ctx.strokeStyle = col; ctx.globalAlpha = al; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(a.x + ox, a.y + oy); ctx.lineTo(b.x + ox, b.y + oy); if (i + 2 < n) ctx.lineTo(pts[i + 2].x + ox, pts[i + 2].y + oy); ctx.stroke();
      }
    }
    if (style === 'stardust') {
      ctx.fillStyle = '#fff6c8';
      for (let i = 1; i < n; i += 4) { const p = pts[i], s2 = 3.2 * (1 - i / n) + 0.8, tw = 0.5 + 0.5 * Math.sin(t * 9 + i); ctx.globalAlpha = 0.9 * tw * (1 - i / n); ctx.beginPath(); ctx.moveTo(p.x, p.y - s2 * 2); ctx.lineTo(p.x + s2 * 0.5, p.y); ctx.lineTo(p.x, p.y + s2 * 2); ctx.lineTo(p.x - s2 * 0.5, p.y); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(p.x - s2 * 2, p.y); ctx.lineTo(p.x, p.y + s2 * 0.5); ctx.lineTo(p.x + s2 * 2, p.y); ctx.lineTo(p.x, p.y - s2 * 0.5); ctx.closePath(); ctx.fill(); }
    } else if (style === 'ice') {
      ctx.globalAlpha = 0.8; ctx.fillStyle = '#e6fbff';
      for (let i = 3; i < n; i += 4) { const p = pts[i], s = 2.2 * (1 - i / n); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4 + i); ctx.fillRect(-s, -s, s * 2, s * 2); ctx.restore(); }
    } else if (style === 'glitch') {
      ctx.globalAlpha = 0.9; ctx.fillStyle = '#ffffff';
      for (let i = 2; i < n; i += 5) { const p = pts[i]; ctx.fillRect(p.x + Math.sin(i + t * 20) * 5, p.y + Math.cos(i * 2 + t * 9) * 5, 3, 2); }
    }
    ctx.restore();
  }


  // the showpiece tails: each one draws its own little scene along the path the dot has travelled
  function drawTrailFancy(ctx, pts, style, accent, t, width) {
    const n = pts.length, nx = i => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1; return [-dy / d, dx / d]; };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (style === 'ribbon') {
      for (const [ph, col] of [[0, '#ff9ae6'], [Math.PI, '#9ad7ff']]) {
        for (let i = 0; i < n - 1; i++) {
          const k = i / (n - 1), [ax, ay] = nx(i), [bx, by] = nx(i + 1), o1 = Math.sin(i * 0.38 - t * 7 + ph) * width * 1.5 * (1 - k * 0.5), o2 = Math.sin((i + 1) * 0.38 - t * 7 + ph) * width * 1.5 * (1 - k * 0.5);
          ctx.strokeStyle = col; ctx.globalAlpha = (1 - k) * 0.85; ctx.lineWidth = Math.max(0.6, width * 0.8 * (1 - k) * (0.55 + 0.45 * Math.cos(i * 0.38 - t * 7 + ph)));
          ctx.beginPath(); ctx.moveTo(pts[i].x + ax * o1, pts[i].y + ay * o1); ctx.lineTo(pts[i + 1].x + bx * o2, pts[i + 1].y + by * o2); ctx.stroke();
        }
      }
    } else if (style === 'lightning') {
      const seed = Math.floor(t * 18);
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? '#ffffff' : '#6ab4ff'; ctx.lineWidth = pass ? 1.2 : 4;
        for (let b = 0; b < (pass ? 1 : 2); b++) {
          ctx.beginPath();
          for (let i = 0; i < n; i += 2) { const [ax, ay] = nx(i), r = OD.makeRng(seed * 31 + i * 7 + b * 101)(), j = (r - 0.5) * width * (1.2 + b) * (0.3 + i / n); ctx.globalAlpha = 0.9 * (1 - i / n); i ? ctx.lineTo(pts[i].x + ax * j, pts[i].y + ay * j) : ctx.moveTo(pts[i].x, pts[i].y); }
          ctx.stroke();
        }
      }
      for (let i = 2; i < n; i += 6) { const rr = OD.makeRng(seed * 13 + i)(); if (rr < 0.4) { const [ax, ay] = nx(i); ctx.globalAlpha = 0.9 * (1 - i / n); ctx.strokeStyle = '#cfe6ff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[i].x + ax * width * 2.4 * (rr < 0.2 ? 1 : -1), pts[i].y + ay * width * 2.4 * (rr < 0.2 ? 1 : -1)); ctx.stroke(); } }
    } else if (style === 'inferno') {
      for (let i = n - 1; i >= 0; i--) {
        const k = i / (n - 1), rr = OD.makeRng(Math.floor(t * 14) * 17 + i)(), s = width * (1.25 - k) * (0.8 + rr * 0.5), up = k * width * 1.6;
        ctx.globalAlpha = (1 - k) * 0.8; ctx.fillStyle = OD.hsl(8 + (1 - k) * 42, 100, 48 + (1 - k) * 22);
        ctx.beginPath(); ctx.arc(pts[i].x + (rr - 0.5) * width, pts[i].y - up * 0.5, Math.max(0.6, s), 0, TAU); ctx.fill();
      }
      for (let i = 3; i < n; i += 5) { const rr = OD.makeRng(Math.floor(t * 9) * 5 + i)(); ctx.globalAlpha = (1 - i / n) * 0.9; ctx.fillStyle = '#ffd27a'; ctx.fillRect(pts[i].x + (rr - 0.5) * width * 3, pts[i].y - rr * width * 3, 1.6, 1.6); }
    } else if (style === 'nebula') {
      for (let i = 0; i < n; i += 2) {
        const k = i / (n - 1), [ax, ay] = nx(i), sw = Math.sin(i * 0.3 - t * 2) * width * 0.9;
        const gx = pts[i].x + ax * sw, gy = pts[i].y + ay * sw, hue = 260 + 90 * Math.sin(i * 0.12 + t);
        ctx.globalAlpha = (1 - k) * 0.5; glow(ctx, gx, gy, width * (3.6 - 2 * k), OD.hsl((hue + 360) % 360, 90, 62), 0.9);
      }
      ctx.fillStyle = '#fff';
      for (let i = 1; i < n; i += 3) { const [ax, ay] = nx(i), o = Math.sin(i * 1.7 + t * 3) * width * 1.8; ctx.globalAlpha = (1 - i / n) * (0.4 + 0.5 * Math.sin(t * 6 + i)); ctx.fillRect(pts[i].x + ax * o, pts[i].y + ay * o, 1.5, 1.5); }
    } else if (style === 'helix') {
      for (const [ph, col] of [[0, '#4df3ff'], [Math.PI, '#ff6ad5']]) {
        for (let i = 0; i < n; i++) {
          const k = i / (n - 1), [ax, ay] = nx(i), o = Math.sin(i * 0.45 - t * 6 + ph) * width * 1.4, dep = 0.6 + 0.4 * Math.cos(i * 0.45 - t * 6 + ph);
          ctx.globalAlpha = (1 - k) * (0.4 + 0.6 * dep); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(pts[i].x + ax * o, pts[i].y + ay * o, Math.max(0.5, width * 0.42 * dep * (1 - k * 0.6)), 0, TAU); ctx.fill();
        }
      }
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.8;
      for (let i = 2; i < n; i += 4) { const [ax, ay] = nx(i), o = Math.sin(i * 0.45 - t * 6) * width * 1.4; ctx.globalAlpha = (1 - i / n) * 0.5; ctx.beginPath(); ctx.moveTo(pts[i].x + ax * o, pts[i].y + ay * o); ctx.lineTo(pts[i].x - ax * o, pts[i].y - ay * o); ctx.stroke(); }
    } else if (style === 'ghost') {
      for (let i = n - 1; i >= 4; i -= 5) {
        const k = i / (n - 1); ctx.globalAlpha = (1 - k) * 0.55; glow(ctx, pts[i].x, pts[i].y, width * 2.4 * (1 - k * 0.5), '#bfe0ff', 0.8);
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, width * 0.6 * (1 - k * 0.6), 0, TAU); ctx.fill();
      }
    } else if (style === 'bubbles') {
      for (let i = 2; i < n; i += 3) {
        const k = i / (n - 1), [ax, ay] = nx(i), o = Math.sin(i * 0.9 + t * 2) * width * 1.3, r = width * (0.35 + 0.5 * ((i * 37) % 10) / 10) * (1 - k * 0.4);
        ctx.globalAlpha = (1 - k) * 0.85; ctx.strokeStyle = '#bff6ff'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.arc(pts[i].x + ax * o, pts[i].y + ay * o - k * width * 2, r, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.globalAlpha *= 0.7; ctx.fillRect(pts[i].x + ax * o - r * 0.4, pts[i].y + ay * o - k * width * 2 - r * 0.4, 1.4, 1.4);
      }
    } else if (style === 'petals') {
      for (let i = 1; i < n; i += 3) {
        const k = i / (n - 1), [ax, ay] = nx(i), o = Math.sin(i * 0.7 + t * 2.4) * width * 1.6;
        ctx.save(); ctx.translate(pts[i].x + ax * o, pts[i].y + ay * o); ctx.rotate(i * 0.9 + t * 3); ctx.globalAlpha = (1 - k) * 0.95;
        ctx.fillStyle = i % 2 ? '#ffb7d5' : '#ff8fb8'; ctx.beginPath(); ctx.ellipse(0, 0, width * 0.85 * (1 - k * 0.5), width * 0.42 * (1 - k * 0.5), 0, 0, TAU); ctx.fill(); ctx.restore();
      }
    } else if (style === 'matrix') {
      ctx.font = `700 ${Math.max(7, width * 1.5)}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < n; i += 2) {
        const k = i / (n - 1), [ax, ay] = nx(i), o = ((i * 53) % 7 - 3) * width * 0.5, ch = (Math.floor(t * 8 + i * 1.3) % 2) ? '1' : '0';
        ctx.globalAlpha = (1 - k) * 0.95; ctx.fillStyle = i < 4 ? '#eafff0' : '#37ff7a'; ctx.fillText(ch, pts[i].x + ax * o, pts[i].y + ay * o + k * width * 3);
      }
    }
  }

  // the player's dot
  function drawCore(ctx, x, y, u, style, t, accent, ringCol) {
    ctx.save();
    const rc = ringCol || accent;
    switch (style) {
      case 'ring':
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.6 * u; ctx.beginPath(); ctx.arc(x, y, 5.2 * u, 0, TAU); ctx.stroke();
        ctx.fillStyle = rc; ctx.beginPath(); ctx.arc(x, y, 1.8 * u, 0, TAU); ctx.fill(); break;
      case 'diamond':
        ctx.translate(x, y); ctx.rotate(t * 1.4); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -6.4 * u); ctx.lineTo(4.6 * u, 0); ctx.lineTo(0, 6.4 * u); ctx.lineTo(-4.6 * u, 0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = rc; ctx.lineWidth = 1.4; ctx.stroke(); break;
      case 'star':
        ctx.translate(x, y); ctx.rotate(t * 1.8); ctx.fillStyle = '#fff'; ctx.beginPath();
        for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, r = (i % 2 ? 2.4 : 7) * u; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        ctx.closePath(); ctx.fill(); break;
      case 'pulse': {
        const k = 1 + 0.28 * Math.max(0, Math.sin(t * 7)) ** 2;
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 4.4 * u * k, 0, TAU); ctx.fill();
        ctx.strokeStyle = OD.rgba(rc, 0.9); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, y, 7.6 * u * k, 0, TAU); ctx.stroke(); break; }
      case 'halo':
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 3.8 * u, 0, TAU); ctx.fill();
        ctx.strokeStyle = OD.rgba(rc, 0.95); ctx.lineWidth = 1.6; ctx.setLineDash([6 * u, 5 * u]);
        ctx.beginPath(); ctx.arc(x, y, 8 * u, t * 3, t * 3 + TAU); ctx.stroke();
        ctx.setLineDash([3 * u, 5 * u]); ctx.beginPath(); ctx.arc(x, y, 11 * u, -t * 2.2, -t * 2.2 + TAU); ctx.stroke(); break;
      case 'prism': {
        ctx.translate(x, y);
        for (let i = 0; i < 8; i++) { ctx.fillStyle = OD.hsl((i * 45 + t * 90) % 360, 100, 62); ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 5.8 * u, i * TAU / 8 + t, (i + 1) * TAU / 8 + t); ctx.closePath(); ctx.fill(); }
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 2.4 * u, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(0, 0, 6.4 * u, 0, TAU); ctx.stroke(); break; }
      case 'atom': {
        ctx.translate(x, y);
        for (let i = 0; i < 3; i++) {
          ctx.save(); ctx.rotate(i * Math.PI / 3 + t * 0.4); ctx.strokeStyle = OD.rgba(rc, 0.75); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(0, 0, 9 * u, 3.4 * u, 0, 0, TAU); ctx.stroke();
          const a = t * (3.2 + i * 0.7) + i * 2; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(Math.cos(a) * 9 * u, Math.sin(a) * 3.4 * u, 1.5 * u, 0, TAU); ctx.fill(); ctx.restore();
        }
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 2.9 * u, 0, TAU); ctx.fill(); break; }
      case 'crystal': {
        ctx.translate(x, y); ctx.rotate(t * 0.9);
        const pts = []; for (let i = 0; i < 6; i++) { const a = i * TAU / 6; pts.push([Math.cos(a) * 6.6 * u, Math.sin(a) * 6.6 * u]); }
        for (let i = 0; i < 6; i++) { const A = pts[i], B = pts[(i + 1) % 6]; ctx.fillStyle = OD.rgba(i % 2 ? '#ffffff' : rc, 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(t * 3 + i))); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.closePath(); ctx.fill(); }
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.3; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.stroke(); break; }
      case 'ringed': {
        ctx.translate(x, y); ctx.rotate(-0.42);
        ctx.strokeStyle = OD.rgba(rc, 0.85); ctx.lineWidth = 1.7 * u * 0.7; ctx.beginPath(); ctx.ellipse(0, 0, 10 * u, 3.1 * u, 0, Math.PI, TAU); ctx.stroke();
        const g = ctx.createRadialGradient(-1.4 * u, -1.6 * u, 0.6 * u, 0, 0, 5 * u); g.addColorStop(0, '#ffffff'); g.addColorStop(1, rc);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 4.4 * u, 0, TAU); ctx.fill();
        ctx.strokeStyle = OD.rgba('#ffffff', 0.9); ctx.lineWidth = 1.7 * u * 0.7; ctx.beginPath(); ctx.ellipse(0, 0, 10 * u, 3.1 * u, 0, 0, Math.PI); ctx.stroke(); break; }
      case 'spirit': {
        ctx.translate(x, y); ctx.globalAlpha = 0.95; const bob = Math.sin(t * 3) * 0.6 * u;
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, bob, 4.8 * u, Math.PI, 0);
        for (let i = 0; i <= 4; i++) { const px = 4.8 * u - i * 2.4 * u, py = bob + 5.4 * u + (i % 2 ? 1.1 : -0.3) * u * (1 + 0.3 * Math.sin(t * 6 + i)); ctx.lineTo(px, py); }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#1a2040'; ctx.beginPath(); ctx.arc(-1.7 * u, bob - 0.4 * u, 0.95 * u, 0, TAU); ctx.arc(1.7 * u, bob - 0.4 * u, 0.95 * u, 0, TAU); ctx.fill(); break; }
      case 'plasmaball': {
        ctx.translate(x, y);
        const seed = Math.floor(t * 11);
        ctx.strokeStyle = OD.rgba('#b78aff', 0.8); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, 8.4 * u, 0, TAU); ctx.stroke();
        for (let b = 0; b < 5; b++) {
          const rng = OD.makeRng(seed * 7 + b * 19); let a = rng() * TAU + b * 1.3, px = 0, py = 0;
          ctx.strokeStyle = b % 2 ? '#8fd0ff' : '#e0b8ff'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, 0);
          for (let s = 1; s <= 5; s++) { a += (rng() - 0.5) * 0.9; px = Math.cos(a) * s * 1.65 * u; py = Math.sin(a) * s * 1.65 * u; ctx.lineTo(px, py); } ctx.stroke();
        }
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 2.8 * u, 0, TAU); ctx.fill(); break; }
      case 'sun': {
        ctx.translate(x, y); ctx.rotate(t * 0.5);
        for (let i = 0; i < 12; i++) { const a = i * TAU / 12, r1 = (7.6 + 2.6 * Math.sin(t * 7 + i * 1.9)) * u; ctx.fillStyle = i % 2 ? '#ffb347' : '#ff7a3d'; ctx.beginPath(); ctx.moveTo(Math.cos(a - 0.2) * 4.6 * u, Math.sin(a - 0.2) * 4.6 * u); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.lineTo(Math.cos(a + 0.2) * 4.6 * u, Math.sin(a + 0.2) * 4.6 * u); ctx.closePath(); ctx.fill(); }
        const g = ctx.createRadialGradient(0, 0, 0.5 * u, 0, 0, 5 * u); g.addColorStop(0, '#fffbe0'); g.addColorStop(1, '#ffc247'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 5 * u, 0, TAU); ctx.fill(); break; }
      case 'galaxy': {
        ctx.translate(x, y);
        for (let arm = 0; arm < 2; arm++) for (let j = 0; j < 16; j++) {
          const a = j * 0.42 + arm * Math.PI + t * 1.8, r = (0.7 + j * 0.62) * u; ctx.globalAlpha = 1 - j / 22; ctx.fillStyle = j % 3 ? '#cfe0ff' : rc;
          ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, (1.5 - j * 0.05) * u, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 2.4 * u, 0, TAU); ctx.fill(); break; }
      case 'eclipse': {
        ctx.translate(x, y);
        const g = ctx.createRadialGradient(0, 0, 4 * u, 0, 0, 12 * u); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.35, OD.rgba(rc, 0.5)); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 12 * u, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
        for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + t * 0.7; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 5.4 * u, Math.sin(a) * 5.4 * u); ctx.lineTo(Math.cos(a) * (8 + 2.5 * Math.sin(t * 5 + i)) * u, Math.sin(a) * (8 + 2.5 * Math.sin(t * 5 + i)) * u); ctx.stroke(); }
        ctx.fillStyle = '#05060f'; ctx.beginPath(); ctx.arc(0, 0, 4.8 * u, 0, TAU); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.3; ctx.stroke(); break; }
      case 'singularity': {
        ctx.translate(x, y);
        ctx.save(); ctx.rotate(t * 0.8); ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) { ctx.strokeStyle = i === 0 ? '#ffd27a' : i === 1 ? OD.rgba(rc, 0.9) : '#ff7a3d'; ctx.lineWidth = (2.2 - i * 0.6) * u * 0.8; ctx.beginPath(); ctx.ellipse(0, 0, (10 - i * 1.4) * u, (3.4 - i * 0.5) * u, 0, 0, TAU); ctx.stroke(); }
        ctx.restore();
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0, 0, 4.2 * u, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.arc(0, 0, 4.7 * u, 0, TAU); ctx.stroke(); break; }
      default:
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 4.6 * u, 0, TAU); ctx.fill();
        ctx.strokeStyle = OD.rgba(rc, 0.9); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 7.4 * u, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
  // one orbit line in the equipped style
  function drawOrbitRing(ctx, cx, cy, r, style, t, color, alpha, u) {
    ctx.save();
    ctx.strokeStyle = OD.rgba(color, alpha); ctx.lineWidth = 1.2;
    const arc = (rr) => { ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke(); };
    switch (style) {
      case 'dotted': ctx.setLineDash([1.5, 7 * u]); ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.strokeStyle = OD.rgba(color, Math.min(1, alpha * 2.4)); arc(r); break;
      case 'dashed': ctx.setLineDash([12 * u, 10 * u]); ctx.lineDashOffset = -t * 30; ctx.lineWidth = 1.6; ctx.strokeStyle = OD.rgba(color, Math.min(1, alpha * 1.8)); arc(r); break;
      case 'double': ctx.lineWidth = 1; arc(r - 3 * u); arc(r + 3 * u); break;
      case 'glow': ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 9 * u; ctx.strokeStyle = OD.rgba(color, alpha * 0.28); arc(r); ctx.lineWidth = 3; ctx.strokeStyle = OD.rgba(color, alpha * 1.4); arc(r); break;
      default: arc(r);
    }
    ctx.restore();
  }
  // the equipped sky behind the world
  function drawSky(ctx, style, stars, W, H, t, speed, dx) {
    switch (style) {
      case 'warp':
        ctx.save(); ctx.strokeStyle = '#cfe0ff'; ctx.lineCap = 'round';
        for (const s of stars[1].concat(stars[0])) { const y = ((s.y + t * 0.05 * s.z * speed) % 1) * H, len = (6 + 26 * s.z) * Math.min(2, speed); ctx.globalAlpha = 0.25 + 0.5 * s.z; ctx.lineWidth = 0.6 + s.z; ctx.beginPath(); ctx.moveTo(s.x * W, y); ctx.lineTo(s.x * W, y - len); ctx.stroke(); }
        ctx.restore(); break;
      case 'snow':
        ctx.save(); ctx.fillStyle = '#ffffff';
        for (const s of stars[0].concat(stars[1])) { const y = ((s.y + t * 0.03 * (0.4 + s.z)) % 1) * H, x = s.x * W + Math.sin(t * 0.7 + s.p) * 16; ctx.globalAlpha = 0.18 + 0.35 * s.z; ctx.beginPath(); ctx.arc(x, y, 1 + s.s * 1.1, 0, TAU); ctx.fill(); }
        ctx.restore(); break;
      case 'fireflies':
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (const s of stars[0].concat(stars[1])) { const x = s.x * W + Math.sin(t * 0.4 + s.p * 3) * 34, y = s.y * H + Math.cos(t * 0.33 + s.p * 2) * 26; ctx.globalAlpha = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.6 + s.p * 5)); glow(ctx, x, y, 7 + s.s * 3, '#d8ff7a', 1); }
        ctx.restore(); break;
      case 'grid':
        ctx.save(); ctx.strokeStyle = 'rgba(255,90,220,0.22)'; ctx.lineWidth = 1;
        const hz = H * 0.62; ctx.beginPath();
        for (let i = -10; i <= 10; i++) { ctx.moveTo(W / 2 + i * W * 0.04, hz); ctx.lineTo(W / 2 + i * W * 0.32, H); }
        const off = (t * 0.5 * speed) % 1;
        for (let k = 0; k < 9; k++) { const q = (k + off) / 9, y = hz + (H - hz) * q * q; ctx.moveTo(0, y); ctx.lineTo(W, y); }
        ctx.stroke(); ctx.restore();
        drawStars(ctx, stars[0], W, H, t, speed, '#ffffff'); break;
      default:
        drawStars(ctx, stars[0], W, H, t, 1.2 * speed, '#9fb4ff', dx);
        drawStars(ctx, stars[1], W, H, t, 2.4 * speed, '#ffffff', dx);
        drawStars(ctx, stars[2], W, H, t, 4.5 * speed, '#c8e0ff', dx);
    }
  }

  // Little preview canvases for the shop
  // shop previews are animated: the dot loops around while its tail follows
  function loopPts(W, H, t, n, rx, ry, spd) {   // an ellipse around the middle
    const pts = [];
    for (let i = 0; i < n; i++) { const a = (t - i * 0.034) * spd; pts.push({ x: W * 0.5 + Math.cos(a) * W * rx, y: H * 0.5 + Math.sin(a) * H * ry }); }
    return pts;
  }
  function previewTrail(cv, style, accent, t = 1.2) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    const pts = loopPts(W, H, t, 34, 0.3, 0.24, 2.4), head = pts[0];
    drawTrail(g, pts, style, accent, t, 7);
    g.save(); g.globalCompositeOperation = 'lighter'; glow(g, head.x, head.y, 14, accent, 1); g.restore();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(head.x, head.y, 4, 0, TAU); g.fill();
  }
  // the equipped dot and tail together, orbiting a small planet (top of the shop)
  function previewHero(cv, trailId, coreId, accent, t = 0) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    g.strokeStyle = OD.rgba(accent, 0.22); g.lineWidth = 1.2; g.beginPath(); g.ellipse(W / 2, H / 2, W * 0.34, H * 0.34, 0, 0, TAU); g.stroke();
    drawPlanet(g, W / 2, H / 2, Math.min(W, H) * 0.13, 'terra', t, accent, 1);
    const pts = loopPts(W, H, t, 46, 0.36, 0.33, 1.5), head = pts[0];
    drawTrail(g, pts, trailId, accent, t, 8);
    g.save(); g.globalCompositeOperation = 'lighter'; glow(g, head.x, head.y, 30, accent, 0.9); g.restore();
    drawCore(g, head.x, head.y, 2.6, coreId, t, accent);
  }
  function previewPlanet(cv, skin, accent) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    drawPlanet(g, W / 2, H / 2, Math.min(W, H) * 0.3, skin, 0, accent, 1);
  }
  function previewAura(cv, id, accent) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height; g.clearRect(0, 0, W, H);
    drawPlanet(g, W / 2, H / 2, Math.min(W, H) * 0.3, 'terra', 0, accent, 1, id);
  }
  function previewCore(cv, id, accent, t = 1.1) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height; g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter'; glow(g, W / 2, H / 2, 46, accent, 0.9); g.globalCompositeOperation = 'source-over';
    drawCore(g, W / 2, H / 2, 4, id, t, accent);
  }
  function previewOrbit(cv, id, accent) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height; g.clearRect(0, 0, W, H);
    for (const r of [0.2, 0.32, 0.44]) drawOrbitRing(g, W / 2, H / 2, Math.min(W, H) * r, id, 0.8, accent, 0.5, 1.6);
    drawPlanet(g, W / 2, H / 2, Math.min(W, H) * 0.09, 'terra', 0, accent, 1);
  }
  function previewSky(cv, id, accent) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.fillStyle = '#070d2a'; g.fillRect(0, 0, W, H);
    const st = [makeStars(30, 11), makeStars(24, 12), makeStars(14, 13)];
    drawSky(g, id, st, W, H, 3.3, 1);
  }
  function previewBurst(cv, id, accent) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, cx = W / 2, cy = H / 2; g.clearRect(0, 0, W, H);
    const rng = OD.makeRng(21); g.save(); g.globalCompositeOperation = 'lighter';
    if (id === 'rings') for (let i = 0; i < 3; i++) { g.strokeStyle = OD.rgba(accent, 0.9 - i * 0.25); g.lineWidth = 4 - i; g.beginPath(); g.arc(cx, cy, 14 + i * 18, 0, TAU); g.stroke(); }
    else if (id === 'implode') for (let i = 0; i < 26; i++) { const a = rng() * TAU, d = 18 + rng() * 40; g.fillStyle = OD.rgba(accent, 0.8); g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2, 0, TAU); g.fill(); g.strokeStyle = OD.rgba(accent, 0.25); g.beginPath(); g.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); g.lineTo(cx + Math.cos(a) * d * 0.55, cy + Math.sin(a) * d * 0.55); g.stroke(); }
    else for (let i = 0; i < 34; i++) { const a = rng() * TAU, d = 10 + rng() * 48; const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d; g.fillStyle = id === 'confetti' ? OD.hsl(rng() * 360, 100, 62) : id === 'stars' ? '#ffe48a' : OD.rgba(accent, 0.9); if (id === 'confetti') g.fillRect(x - 2, y - 2, 4.5, 3); else { g.beginPath(); g.arc(x, y, 1.5 + rng() * 2.2, 0, TAU); g.fill(); } }
    g.restore();
    glow(g, cx, cy, 30, '#ffffff', 0.6);
  }
  function previewDebris(cv, style, danger) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    const rng = OD.makeRng(5);
    drawDebris(g, style, W * 0.32, H * 0.55, 26, 0.4, danger, makeShape(style, rng));
    drawDebris(g, style, W * 0.72, H * 0.4, 16, 1.4, danger, makeShape(style, rng));
  }

  return { glow, glowSprite, background, makeStars, drawStars, drawPlanet, makeShape, drawDebris, debrisFor, biomeRock, drawTrail, drawCore, drawOrbitRing, drawSky, auraColor, previewTrail, previewHero, previewPlanet, previewAura, previewCore, previewOrbit, previewSky, previewBurst, previewDebris, mk };
})();
