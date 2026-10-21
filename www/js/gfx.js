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
  function drawStars(ctx, stars, W, H, t, speed, tint) {
    ctx.fillStyle = tint;
    for (const s of stars) {
      const y = ((s.y + t * speed * s.z * 0.01) % 1) * H;
      const a = (0.35 + 0.65 * Math.abs(Math.sin(t * (0.6 + s.z) + s.p))) * s.z;
      ctx.globalAlpha = a;
      const sz = s.s * (0.6 + s.z * 0.8);
      ctx.fillRect(s.x * W, y, sz, sz);
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
    const { tex, sh } = planetParts(skin, r, dpr);
    const ac = auraColor(aura, t);
    const rim = skin === 'void' && aura === 'azure' ? accent : ac;
    glow(ctx, x, y, r * 2.1, rim, skin === 'void' ? 0.5 : 0.35);
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
    if (style === 'gear') return [1, 1, 0.76, 0.76, 1, 1, 0.76, 0.76, 1, 1, 0.76, 0.76, 1, 1, 0.76, 0.76, 1, 1, 0.76, 0.76].map(v => v * (0.97 + rng() * 0.06));
    if (style === 'star') return [1.3, 0.5, 1.3, 0.5, 1.3, 0.5, 1.3, 0.5, 1.3, 0.5].map(v => v * (0.95 + rng() * 0.1));
    if (style === 'scrap') return [1, 0.7, 1, 0.7].map(v => v * (0.85 + rng() * 0.3));
    if (style === 'crystal') return [1.25, 0.6, 0.9, 0.6, 1.25, 0.6, 0.9, 0.6].map(v => v * (0.9 + rng() * 0.2));
    const n = 8, a = [];
    for (let i = 0; i < n; i++) a.push(0.72 + rng() * 0.42);
    return a;
  }
  function drawDebris(ctx, style, x, y, size, rot, danger, shape, alpha = 1, pulse = 0) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y); ctx.rotate(rot);
    const n = shape.length;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, 0, size * 2.8, danger, 0.5 + pulse * 0.4);
    ctx.globalCompositeOperation = 'source-over';
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
      if (style === 'crystal') {
        const g = ctx.createLinearGradient(-size, -size, size, size);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, danger); g.addColorStop(1, '#2a0010');
        ctx.fillStyle = g;
      } else if (style === 'star') {
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
    const passes = style === 'glitch' ? 2 : 1;
    for (let pass = 0; pass < passes; pass++) {
      for (let i = 0; i < n - 1; i++) {
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
        ctx.beginPath(); ctx.moveTo(a.x + ox, a.y + oy); ctx.lineTo(b.x + ox, b.y + oy); ctx.stroke();
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
  function drawSky(ctx, style, stars, W, H, t, speed) {
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
        drawStars(ctx, stars[0], W, H, t, 1.2 * speed, '#9fb4ff');
        drawStars(ctx, stars[1], W, H, t, 2.4 * speed, '#ffffff');
        drawStars(ctx, stars[2], W, H, t, 4.5 * speed, '#c8e0ff');
    }
  }

  // Little preview canvases for the shop
  function previewTrail(cv, style, accent) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    const pts = [];
    for (let i = 0; i < 34; i++) { const t = i / 33; pts.push({ x: W * (0.8 - 0.62 * t), y: H * (0.3 + 0.42 * Math.pow(t, 1.4)) }); }
    const head = pts[0];
    drawTrail(g, pts, style, accent, 1.2, 7);
    g.globalCompositeOperation = 'lighter'; glow(g, head.x, head.y, 14, accent, 1);
    g.globalCompositeOperation = 'source-over'; g.fillStyle = '#fff'; g.beginPath(); g.arc(head.x, head.y, 4, 0, TAU); g.fill();
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
  function previewCore(cv, id, accent) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height; g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter'; glow(g, W / 2, H / 2, 46, accent, 0.9); g.globalCompositeOperation = 'source-over';
    drawCore(g, W / 2, H / 2, 3.2, id, 1.1, accent);
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

  return { glow, glowSprite, background, makeStars, drawStars, drawPlanet, makeShape, drawDebris, drawTrail, drawCore, drawOrbitRing, drawSky, auraColor, previewTrail, previewPlanet, previewAura, previewCore, previewOrbit, previewSky, previewBurst, previewDebris, mk };
})();
