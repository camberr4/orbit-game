'use strict';
// The six biomes: what each one looks like. A biome is a stack of layers, from the far sky to the nearest drifting things:
//   base   a pre-rendered picture (sky gradient, nebula, far stars, the big landmark of the place)
//   mid    a second pre-rendered picture that sways a little on its own, so the sky has depth
//   live   things that move, glow or happen now and then, drawn every frame from cached sprites
// Nothing here reacts to gameplay; it only sets the mood. In a run the whole sky is veiled a little by drawScene.
OD.biomes = (() => {
  const TAU = OD.TAU, rgba = OD.rgba, G = OD.gfx;
  const cache = new Map();
  // the sky's pictures are painted at this many pixels per css pixel (the screen's own density, up to 2), so they stay sharp on a phone
  let SS = 1;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
  const R = (a, b, r) => a + (b - a) * r();

  // soft light, drawn with whatever alpha the caller already set
  function gl(g, x, y, r, col, a) {
    const k = g.globalAlpha; g.globalAlpha = k * a;
    g.drawImage(G.glowSprite(col, 128), x - r, y - r, r * 2, r * 2);
    g.globalAlpha = k;
  }
  // a cloud: many overlapping soft blobs of two colours
  function cloud(g, r, W, H, cols, n, sz, a, box) {
    const [x0, y0, x1, y1] = box || [0, 0, W, H];
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) gl(g, R(x0, x1, r), R(y0, y1, r), R(0.5, 1, r) * sz, cols[i % cols.length], a * R(0.5, 1, r));
    g.globalCompositeOperation = 'source-over';
  }
  // darker lanes in front of a cloud give it depth
  function lanes(g, r, W, H, n, sz, a) {
    for (let i = 0; i < n; i++) { const x = r() * W, y = r() * H, s = R(0.4, 1, r) * sz; const gr = g.createRadialGradient(x, y, 0, x, y, s); gr.addColorStop(0, `rgba(0,0,8,${a})`); gr.addColorStop(1, 'rgba(0,0,8,0)'); g.fillStyle = gr; g.fillRect(x - s, y - s, s * 2, s * 2); }
  }
  function stars(g, r, W, H, n, tint) {
    for (let i = 0; i < n; i++) {
      const x = r() * W, y = r() * H, s = r(), z = s * s;
      g.globalAlpha = 0.18 + 0.5 * z; g.fillStyle = s > 0.9 ? tint : '#ffffff';
      const d = 0.5 + 1.1 * z; g.fillRect(x, y, d, d);
    }
    g.globalAlpha = 1;
  }
  function vignette(g, W, H, a) {
    const v = g.createRadialGradient(W / 2, H * 0.46, Math.min(W, H) * 0.35, W / 2, H * 0.46, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${a})`);
    g.fillStyle = v; g.fillRect(0, 0, W, H);
  }
  function sky(g, W, H, stops) { const gr = g.createLinearGradient(0, 0, 0, H); stops.forEach(([p, c]) => gr.addColorStop(p, c)); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
  // a jagged rock or ice shape, lit on one side
  function shard(g, cx, cy, rad, r, o) {
    const n = o.n || 8, pts = [];
    for (let i = 0; i < n; i++) { const a = i / n * TAU, rr = rad * (o.spiky ? (i % 2 ? 0.45 : 1) * R(0.8, 1.1, r) : R(0.7, 1.1, r)); pts.push([cx + Math.cos(a) * rr * (o.sx || 1), cy + Math.sin(a) * rr]); }
    g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath();
    g.fillStyle = o.fill; g.fill();
    if (o.rim) { g.save(); g.clip(); const lg = g.createLinearGradient(cx - rad * 0.8, cy - rad * 0.8, cx + rad * 0.8, cy + rad * 0.8); lg.addColorStop(0, rgba(o.rim, o.rimA || 0.5)); lg.addColorStop(0.55, rgba(o.rim, 0)); g.fillStyle = lg; g.fillRect(cx - rad * 1.2, cy - rad * 1.2, rad * 2.4, rad * 2.4); g.restore(); }
  }
  // a fork of lightning / a crack: random walk with branches
  function bolt(g, r, x, y, ang, len, w, col, a, depth = 0) {
    const seg = 14; let px = x, py = y;
    g.beginPath(); g.moveTo(px, py);
    const pts = [[px, py]];
    for (let i = 0; i < seg; i++) { ang += R(-0.55, 0.55, r); px += Math.cos(ang) * len / seg; py += Math.sin(ang) * len / seg; g.lineTo(px, py); pts.push([px, py, ang]); }
    for (const [lw, la] of [[w * 5, 0.07], [w * 2.4, 0.18], [w, 0.9]]) { g.strokeStyle = rgba(col, a * la); g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); }
    if (depth < 2) for (let i = 3; i < seg; i += 3) if (r() < 0.5) { const p = pts[i]; bolt(g, r, p[0], p[1], p[2] + R(-1, 1, r), len * 0.4, w * 0.6, col, a * 0.8, depth + 1); }
  }

  // ------------------------------------------------------------------ the six places
  const B = {};
  function auroraSpr() { return cached('aur', () => { const s = mk(6, 200), g = s.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 200); gr.addColorStop(0, 'rgba(120,255,200,0)'); gr.addColorStop(0.35, 'rgba(110,255,210,0.85)'); gr.addColorStop(0.7, 'rgba(90,170,255,0.35)'); gr.addColorStop(1, 'rgba(160,100,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 6, 200); return s; }) }

  // 0 AURORA REACH: calm, huge and bright. A pale ringed planet hangs low in the distance, ribbons of green and violet light wave overhead.
  B[0] = {
    sky: [[0, '#010514'], [0.4, '#06174a'], [0.75, '#0a3170'], [1, '#0a4a7a']], vig: 0.55,
    far(g, W, H, r) {
      // deep space in many blues: broad indigo, royal and sea-blue clouds with dark lanes between them
      cloud(g, r, W, H, ['#1a3fd0', '#0e6ab8', '#3a2aa8', '#0a8fc4'], 34, Math.max(W, H) * 0.34, 0.1);
      cloud(g, r, W, H, ['#4a7dff', '#2a4fd8'], 12, Math.max(W, H) * 0.16, 0.07);
      lanes(g, r, W, H, 8, Math.max(W, H) * 0.24, 0.34);
      stars(g, r, W, H, 150, '#bff3ff');
    },
    mid(g, W, H, r) {   // wisps of cold cloud drifting in front of the far sky
      cloud(g, r, W, H, ['#3a7bff', '#b36bff'], 14, Math.max(W, H) * 0.2, 0.05, [-W * 0.1, 0, W * 1.1, H]);
    },
    live(c, t, W, H, a, u, st) {
      // slow swells of blue light drifting through the depths
      c.globalCompositeOperation = 'lighter';
      const bl = ['#1f4fe0', '#0f86c8', '#4a3ad0', '#2a6aff'];
      for (let i = 0; i < 4; i++) gl(c, W * (0.5 + 0.42 * Math.sin(t * (0.021 + i * 0.007) + i * 1.9)), H * (0.5 + 0.4 * Math.cos(t * (0.017 + i * 0.006) + i * 2.6)), Math.max(W, H) * (0.34 + 0.06 * Math.sin(t * 0.05 + i)), bl[i], a * 0.16);
      c.globalCompositeOperation = 'source-over';
      // ribbons of light, built from thin vertical strips of a cached gradient
      const spr = auroraSpr();
      c.globalCompositeOperation = 'lighter';
      const n = st.low ? 1 : 2;
      for (let b = 0; b < n; b++) {
        const base = H * (0.1 + b * 0.09), amp = 22 + b * 8, sp = 0.18 + b * 0.05;
        const qs = OD.Q(), stp = qs.auroraStep, aw = qs.auroraW, ak = 3 * stp / aw;
        for (let x = -14; x < W + 14; x += stp) {
          const w1 = Math.sin(x * 0.011 + t * sp + b * 2.1), w2 = Math.sin(x * 0.027 - t * sp * 1.7 + b), y = base + w1 * amp + w2 * 7;
          const h = H * (0.2 + 0.09 * Math.sin(x * 0.007 + t * 0.2 + b) + 0.05 * w2), k = 0.5 + 0.5 * Math.sin(x * 0.013 - t * 0.5 + b * 3);
          c.globalAlpha = a * (0.025 + 0.055 * k * k) * ak;
          c.drawImage(spr, x - aw / 3, y, aw, h);
        }
      }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      // a shooting star, now and then
      const ev = st.ev(t, 17, 2.4, 0);
      if (ev) {
        const k = ev.k, x0 = W * (0.15 + 0.5 * ev.s), y0 = H * (0.05 + 0.2 * ev.s2), dx = 260 * u, dy = 120 * u;
        const x = x0 + dx * k, y = y0 + dy * k, tl = c.createLinearGradient(x, y, x - dx * 0.35, y - dy * 0.35);
        tl.addColorStop(0, rgba('#ffffff', 0.85 * a * Math.sin(k * Math.PI))); tl.addColorStop(1, rgba('#9fd8ff', 0));
        c.strokeStyle = tl; c.lineWidth = 1.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y); c.lineTo(x - dx * 0.35, y - dy * 0.35); c.stroke();
      }
      motes(c, st, t, W, H, a * 0.9, '#9fe0ff', st.low ? 8 : 22, -1, 5);
      st.twinkle(c, t, a, '#cfeeff', 9);
    },
  };

  // 1 DUST BELT: a tired amber sun behind miles of haze; big dark boulders turn slowly in the distance.
  B[1] = {
    sky: [[0, '#0d0804'], [0.5, '#25160a'], [1, '#432a12']], vig: 0.6,
    far(g, W, H, r) {
      cloud(g, r, W, H, ['#c47a2a', '#7a3a12', '#d9a45a'], 28, Math.max(W, H) * 0.28, 0.1);
      lanes(g, r, W, H, 6, Math.max(W, H) * 0.2, 0.3);
      stars(g, r, W, H, 90, '#ffe2b0');
      g.globalCompositeOperation = 'lighter';
      gl(g, W * 0.82, H * 0.14, Math.max(W, H) * 0.55, '#ff9d4a', 0.42);
      gl(g, W * 0.82, H * 0.14, Math.max(W, H) * 0.14, '#ffe2b0', 0.5);
      g.globalCompositeOperation = 'source-over';
    },
    mid(g, W, H, r) {   // distant boulders, black on one side and lit by the sun on the other
      const sx = W * 0.82, sy = H * 0.14;
      for (let i = 0; i < 9; i++) {
        const far = i < 5, rad = far ? R(26, 60, r) : R(60, 130, r), x = r() * W * 1.2 - W * 0.1, y = H * (far ? R(0.1, 0.75, r) : R(0.35, 0.95, r));
        g.globalAlpha = far ? 0.5 : 0.8;
        shard(g, x, y, rad, r, { n: 9, fill: far ? '#1e1209' : '#120a05', rim: '#ffb066', rimA: far ? 0.2 : 0.32, sx: R(1, 1.5, r) });
        g.globalAlpha = 1;
        void sx; void sy;
      }
      for (let i = 0; i < 40; i++) { g.globalAlpha = R(0.2, 0.5, r); g.fillStyle = '#2a190c'; const s = R(1, 3.2, r); g.fillRect(r() * W, r() * H, s, s * 0.7); }
      g.globalAlpha = 1;
    },
    live(c, t, W, H, a, u, st) {
      // layers of haze sliding by at different speeds
      const hz = cached('haze', () => { const s = mk(512, 120), g = s.getContext('2d'); for (let i = 0; i < 9; i++) { const x = (i / 9) * 512 + 20; const gr = g.createRadialGradient(x, 60, 0, x, 60, 70); gr.addColorStop(0, 'rgba(190,140,80,0.5)'); gr.addColorStop(1, 'rgba(190,140,80,0)'); g.fillStyle = gr; g.fillRect(x - 80, 0, 160, 120); } return s; });
      for (let b = 0; b < 3; b++) {
        const sp = 7 + b * 6, wdt = W * 1.6, off = (t * sp) % wdt, y = H * (0.18 + b * 0.31) + Math.sin(t * 0.1 + b * 2) * 20;
        c.globalAlpha = a * (0.12 + 0.05 * b);
        for (let k = -1; k < 2; k++) c.drawImage(hz, off + k * wdt - wdt * 0.3, y - 60, wdt, 190);
      }
      c.globalAlpha = 1;
      // wind-blown grit
      const n = st.low ? 14 : 34;
      c.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const q = st.rnd[i], sp = 30 + q.z * 90, x = ((q.x * W + t * sp) % (W + 80)) - 40, y = q.y * H + Math.sin(t * 0.3 + q.p) * 8, len = 5 + q.z * 22;
        c.globalAlpha = a * (0.05 + 0.1 * q.z); c.strokeStyle = q.s > 1.5 ? '#c9a77c' : '#8a7058'; c.lineWidth = 0.8 + q.z;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x - len, y - len * 0.08); c.stroke();
      }
      c.globalAlpha = 1;
      // a dust squall crossing the whole sky, every so often
      const ev = st.ev(t, 26, 7, 1);
      if (ev) {
        const k = ev.k, w = W * 0.7, x = -w + (W + w * 2) * k, al = a * Math.sin(k * Math.PI) * 0.22;
        const gr = c.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, 'rgba(200,150,90,0)'); gr.addColorStop(0.5, rgba('#c89a62', al)); gr.addColorStop(1, 'rgba(200,150,90,0)');
        c.fillStyle = gr; c.fillRect(x, 0, w, H);
      }
      { const sp = 0.012, k = ((t * sp) % 1), bx = W * (1.15 - 1.3 * k), by = H * (0.2 + 0.5 * ((t * 0.0071) % 1)), rr = 22 * u + 10 * u * Math.sin(k * 3);   // a small rock far away, slowly tumbling past
        c.save(); c.translate(bx, by); c.rotate(t * 0.15); c.globalAlpha = a * 0.55; shard(c, 0, 0, rr, OD.makeRng(11), { n: 9, fill: '#150c06', rim: '#ffb066', rimA: 0.35 }); c.restore(); c.globalAlpha = 1; }
      st.twinkle(c, t, a * 0.7, '#ffe2b0', 6);
    },
  };

  // smooth value noise from a seeded table, summed over octaves; returns f(x, y) in 0..1
  function fbmFn(r, oct) {
    const T = new Float32Array(256 * 256); for (let i = 0; i < T.length; i++) T[i] = r();
    const at = (x, y) => T[((y & 255) << 8) | (x & 255)], sm = t => t * t * (3 - 2 * t);
    const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi); const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; };
    return (x, y) => { let v = 0, amp = 0.5, f = 1, tot = 0; for (let o = 0; o < oct; o++) { v += vn(x * f + o * 17.3, y * f - o * 9.1) * amp; tot += amp; amp *= 0.5; f *= 2.03; } return v / tot; };
  }
  // 2 EMBER RIFT: a fiery nebula. Ridged, domain-warped gas in crimson, orange and gold, with dark dust lanes and a white-hot heart; a dying star burns in one corner.
  B[2] = {
    sky: [[0, '#070102'], [0.55, '#1c0508'], [1, '#380a0a']], vig: 0.6,
    far(g, W, H, r) {
      const lw = 190, lh = Math.max(40, Math.round(lw * H / W)), cv = mk(lw, lh), cc = cv.getContext('2d'), im = cc.createImageData(lw, lh), D = im.data;
      const f1 = fbmFn(r, 5), f2 = fbmFn(r, 4), f3 = fbmFn(r, 3), asp = H / W;
      const ramp = [[0, 28, 3, 12], [0.22, 120, 12, 24], [0.45, 214, 50, 20], [0.68, 255, 124, 36], [0.86, 255, 196, 90], [1, 255, 242, 200]];
      const col = v => { for (let i = 1; i < ramp.length; i++) if (v <= ramp[i][0]) { const a = ramp[i - 1], b = ramp[i], k = (v - a[0]) / (b[0] - a[0]); return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k]; } return ramp[ramp.length - 1].slice(1); };
      const cxn = 0.38 + 0.1 * r(), cyn = 0.5 + 0.1 * r();
      for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
        const u0 = x / lw * 3.2, v0 = y / lh * 3.2 * asp;
        const wx = f2(u0 * 0.9 + 4, v0 * 0.9), wy = f2(u0 * 0.9, v0 * 0.9 + 9);          // the warp that swirls the gas
        const n = f1(u0 + (wx - 0.5) * 1.7, v0 + (wy - 0.5) * 1.7);
        const ridge = 1 - Math.abs(n * 2 - 1);                                              // bright filaments along the folds
        let d = 0.55 * Math.pow(ridge, 2.2) + 0.55 * n * n;
        const dx = x / lw - cxn, dy = (y / lh - cyn) * asp, heart = Math.exp(-(dx * dx + dy * dy) / 0.07);   // denser and hotter round the heart
        d = d * (0.55 + 0.8 * heart) + 0.2 * heart;
        const lane = f3(u0 * 1.4 + 20, v0 * 1.4 + 3), dust = Math.max(0, lane - 0.52) * 3.4;   // dark lanes of dust cut across it
        d = Math.max(0, d - dust * 0.55);
        const c = col(Math.min(1, d * 1.45)), al = Math.min(1, Math.pow(d, 0.8) * 1.9), i = (y * lw + x) * 4;
        D[i] = c[0]; D[i + 1] = c[1]; D[i + 2] = c[2]; D[i + 3] = al * 255;
      }
      cc.putImageData(im, 0, 0);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.globalAlpha = 1; g.drawImage(cv, 0, 0, W, H);                                      // the gas
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5; g.drawImage(cv, -W * 0.02, -H * 0.02, W * 1.04, H * 1.04); g.globalAlpha = 1;   // a soft bloom of the same
      cloud(g, r, W, H, ['#ff5a1f', '#ff9a3d'], 10, Math.max(W, H) * 0.18, 0.06);
      g.globalCompositeOperation = 'source-over';
      stars(g, r, W, H, 90, '#ffd0a0');
      g.globalCompositeOperation = 'lighter';
      const sx = W * 0.88, sy = -H * 0.03, sr = Math.max(W, H) * 0.55;   // a dying star in the corner, its light spilling into the gas
      gl(g, sx, sy, sr, '#ff4a1f', 0.42); gl(g, sx, sy, sr * 0.45, '#ff9a3d', 0.6); gl(g, sx, sy, sr * 0.16, '#ffe7b0', 0.8);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#fff0cc'; g.globalAlpha = 0.7; g.beginPath(); g.arc(sx, sy, sr * 0.075, 0, TAU); g.fill(); g.globalAlpha = 1;
    },
    mid(g, W, H, r) {   // drifting streamers and glowing knots of gas in front of the nebula (they repeat every screen width, so there is no seam)
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const y0 = (0.1 + 0.8 * (i + r() * 0.6) / 6) * H, A = H * (0.04 + 0.08 * r()), k = 1 + Math.floor(r() * 2), ph = r() * TAU, cols = ['#ff4a1f', '#ff8a30', '#ffc24d'], c = cols[i % 3], n = 70;
        for (let j = 0; j < n; j++) {
          const x = j / n * W, y = y0 + A * Math.sin(x / W * TAU * k + ph) + A * 0.4 * Math.sin(x / W * TAU * (k + 2) + ph * 2), sz = (22 + 40 * r()) * (W / 390);
          for (const dx of [-W, 0, W]) gl(g, x + dx, y, sz, c, 0.05 + 0.05 * r());
        }
      }
      for (let i = 0; i < 9; i++) { const x = r() * W, y = (0.15 + 0.8 * r()) * H, sz = (14 + 30 * r()) * (W / 390); for (const dx of [-W, 0, W]) { gl(g, x + dx, y, sz * 2.2, '#ff5a1f', 0.12); gl(g, x + dx, y, sz, '#ffb060', 0.2); gl(g, x + dx, y, sz * 0.35, '#fff0c8', 0.35); } }   // hot knots
      g.globalCompositeOperation = 'destination-in';
      const fm = g.createLinearGradient(0, 0, 0, H); fm.addColorStop(0, 'rgba(0,0,0,0.55)'); fm.addColorStop(0.5, '#000'); fm.addColorStop(1, '#000'); g.fillStyle = fm; g.fillRect(-W, 0, W * 3, H);
      g.globalCompositeOperation = 'source-over';
    },
    midAlpha: (t, a) => a * (0.6 + 0.25 * Math.sin(t * 0.5) + 0.12 * Math.sin(t * 1.3 + 1)),
    live(c, t, W, H, a, u, st) {
      // the star breathes
      c.globalCompositeOperation = 'lighter';
      gl(c, W * 0.86, -H * 0.02, Math.max(W, H) * (0.5 + 0.03 * Math.sin(t * 0.7)), '#ff5a1f', a * (0.16 + 0.07 * Math.sin(t * 0.7)));
      c.globalCompositeOperation = 'source-over';
      // heat shimmering up from below
      for (let b = 0; b < 3; b++) {
        const y = H - ((t * (12 + b * 5) + b * H * 0.4) % (H * 1.2)) + H * 0.1, gr = c.createLinearGradient(0, y - 50, 0, y + 50);
        gr.addColorStop(0, 'rgba(255,110,50,0)'); gr.addColorStop(0.5, rgba('#ff7a3a', 0.05 * a)); gr.addColorStop(1, 'rgba(255,110,50,0)');
        c.fillStyle = gr; c.fillRect(0, y - 50, W, 100);
      }
      // embers climbing, with a flicker
      const n = st.low ? 14 : 34;
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n; i++) {
        const q = st.rnd[i], y = H - ((q.y * H + t * (18 + q.z * 44)) % (H + 20)), x = q.x * W + Math.sin(t * 0.8 + q.p) * 16 + Math.sin(y * 0.02 + q.p) * 8;
        const fl = 0.6 + 0.4 * Math.sin(t * (3 + q.z * 5) + q.p * 7);
        gl(c, x, y, (1.6 + q.s * 1.1) * (0.8 + q.z * 0.5), q.s > 1.4 ? '#ff9a3d' : '#d8401f', a * (0.14 + 0.2 * q.z) * fl);
      }
      // heavy smoke climbing slowly, dark against the glow
      c.globalCompositeOperation = 'source-over';
      for (let i = 0; i < (st.low ? 3 : 6); i++) { const q = st.rnd[i], k = ((t * (0.012 + q.z * 0.01) + q.p) % 1), y = H * (1.1 - 1.3 * k), x = q.x * W + Math.sin(t * 0.2 + q.p) * 30, rr = (70 + 90 * q.s) * u;
        const g = c.createRadialGradient(x, y, 0, x, y, rr); g.addColorStop(0, `rgba(18,4,3,${0.34 * a * Math.sin(k * Math.PI)})`); g.addColorStop(1, 'rgba(18,4,3,0)'); c.fillStyle = g; c.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
      c.globalCompositeOperation = 'lighter';
      // a solar flare arcs off the star, rarely
      const ev = st.ev(t, 31, 5, 2);
      if (ev) {
        const k = ev.k, e = OD.easeOut(Math.min(1, k * 1.6)), al = a * Math.sin(Math.min(1, k) * Math.PI) * 0.55, sx = W * 0.86, sy = -H * 0.02;
        c.strokeStyle = rgba('#ffb066', al); c.lineWidth = 7 * u; c.lineCap = 'round';
        c.beginPath(); c.arc(sx - W * 0.2, sy + H * 0.1, W * 0.28, Math.PI * 0.05, Math.PI * (0.05 + 0.5 * e)); c.stroke();
        c.strokeStyle = rgba('#ffe7b0', al * 0.8); c.lineWidth = 2.2 * u; c.stroke();
      }
      c.globalCompositeOperation = 'source-over';
    },
  };

  // 3 GLACIER DRIFT: silence. Black-blue ice spires reach in from the edges; cold light catches on their faces.
  B[3] = {
    sky: [[0, '#010a10'], [0.55, '#052b38'], [1, '#0d5566']], vig: 0.55,
    far(g, W, H, r) {
      cloud(g, r, W, H, ['#18c7d9', '#3a7dff', '#bff6ff'], 22, Math.max(W, H) * 0.3, 0.09);
      lanes(g, r, W, H, 5, Math.max(W, H) * 0.2, 0.25);
      stars(g, r, W, H, 130, '#dffcff');
      g.globalCompositeOperation = 'lighter'; gl(g, W * 0.3, H * 0.12, Math.max(W, H) * 0.5, '#7fe9ff', 0.2); g.globalCompositeOperation = 'source-over';
    },
    mid(g, W, H, r) {   // chunks of ice drifting free: faceted, lit from the upper left, the far ones small and pale, the near ones bigger and darker
      const chunk = (cx, cy, size, tone, rimA, alpha) => {
        const n = 7 + Math.floor(r() * 3), pts = [], rx = size * R(0.85, 1.35, r), ry = size * R(0.6, 1, r), tilt = R(-0.5, 0.5, r);
        for (let i = 0; i < n; i++) {
          const a = (i + R(-0.3, 0.3, r)) / n * TAU, k = R(0.72, 1.08, r), x0 = Math.cos(a) * rx * k, y0 = Math.sin(a) * ry * k;
          pts.push([cx + x0 * Math.cos(tilt) - y0 * Math.sin(tilt), cy + x0 * Math.sin(tilt) + y0 * Math.cos(tilt)]);
        }
        const ox = cx - rx * 0.18, oy = cy - ry * 0.22;   // the ridge where the facets meet, a little up and left of the middle
        g.save(); g.globalAlpha = alpha;
        g.globalCompositeOperation = 'lighter'; gl(g, cx, cy, size * 2.6, '#7fe9ff', 0.1 * alpha); g.globalCompositeOperation = 'source-over';
        g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath();
        const gr = g.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry); gr.addColorStop(0, tone[1]); gr.addColorStop(1, tone[0]); g.fillStyle = gr; g.fill();
        g.save(); g.clip();
        for (let i = 0; i < n; i++) {
          const p = pts[i], q = pts[(i + 1) % n], mx = (p[0] + q[0]) / 2 - ox, my = (p[1] + q[1]) / 2 - oy, lit = Math.cos(Math.atan2(my, mx) - (-2.3));
          g.beginPath(); g.moveTo(ox, oy); g.lineTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.closePath();
          g.fillStyle = lit > 0 ? rgba('#d8fbff', 0.08 + 0.55 * lit * lit) : rgba('#010c14', 0.1 + 0.32 * -lit); g.fill();
          if (lit > 0.35) { g.strokeStyle = rgba('#eafcff', rimA * lit); g.lineWidth = 1; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); }
        }
        g.strokeStyle = rgba('#bff6ff', rimA * 0.45); g.lineWidth = 0.8; g.beginPath(); for (let i = 0; i < n; i += 2) { g.moveTo(ox, oy); g.lineTo(pts[i][0], pts[i][1]); } g.stroke();
        g.restore(); g.restore();
      };
      for (let i = 0; i < 16; i++) chunk(R(-0.05, 1.05, r) * W, R(0.03, 0.97, r) * H, R(8, 26, r), ['#0f5568', '#3fb0c8'], 0.4, 0.6);   // far: small and pale, anywhere
      for (let i = 0; i < 8; i++) {   // near: bigger and darker, kept off the middle band where the planet and its orbits are
        const top = r() < 0.5;
        chunk(R(-0.05, 1.05, r) * W, (top ? R(0.04, 0.26, r) : R(0.72, 0.96, r)) * H, R(26, 62, r), ['#05303d', '#2a8fa8'], 0.65, 0.9);
      }
    },
    live(c, t, W, H, a, u, st) {
      // a cold mist moving along the floor
      const mist = cached('mist', () => { const s = mk(512, 100), g = s.getContext('2d'); for (let i = 0; i < 7; i++) { const x = i / 7 * 512 + 30; const gr = g.createRadialGradient(x, 50, 0, x, 50, 60); gr.addColorStop(0, 'rgba(170,240,255,0.5)'); gr.addColorStop(1, 'rgba(170,240,255,0)'); g.fillStyle = gr; g.fillRect(x - 70, 0, 140, 100); } return s; });
      for (let b = 0; b < 2; b++) { const wdt = W * 1.5, off = (t * (5 + b * 4)) % wdt, y = H * (b ? 0.66 : 0.9); c.globalAlpha = a * 0.13; for (let k = -1; k < 2; k++) c.drawImage(mist, off + k * wdt - wdt * 0.25, y - 60, wdt, 150); }
      c.globalAlpha = 1;
      // snow in two depths
      const n = st.low ? 14 : 40;
      for (let i = 0; i < n; i++) {
        const q = st.rnd[i], y = (q.y * H + t * (14 + q.z * 36)) % (H + 10), x = q.x * W + Math.sin(t * 0.55 + q.p) * 18;
        c.globalAlpha = a * (0.2 + 0.4 * q.z); c.fillStyle = '#eaffff'; c.beginPath(); c.arc(x, y, 0.7 + q.s * 0.7 * q.z, 0, TAU); c.fill();
      }
      c.globalAlpha = 1;
      // a faint curtain of cold light high up
      { const spr = auroraSpr(); if (spr) { c.globalCompositeOperation = 'lighter'; for (let x = -10; x < W + 10; x += 10) { const w1 = Math.sin(x * 0.009 + t * 0.12), y = H * 0.04 + w1 * 14, h = H * (0.16 + 0.06 * Math.sin(x * 0.006 + t * 0.15)); c.globalAlpha = a * (0.025 + 0.03 * (0.5 + 0.5 * Math.sin(x * 0.012 - t * 0.3))); c.drawImage(spr, x - 8, y, 26, h); } c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; } }
      motes(c, st, t, W, H, a * 0.8, '#d8f8ff', st.low ? 6 : 14, 1, 4);
      st.twinkle(c, t, a, '#dffcff', 14);
      // a long glint sliding along the ice every so often
      const ev = st.ev(t, 22, 3.2, 3);
      if (ev) {
        const k = ev.k, x = W * (0.1 + 0.8 * ev.s) + (k - 0.5) * 120 * u, y = H * (0.72 + 0.2 * ev.s2) - k * 80 * u;
        c.globalCompositeOperation = 'lighter'; gl(c, x, y, 26 * u, '#bff6ff', a * 0.9 * Math.sin(k * Math.PI)); c.globalCompositeOperation = 'source-over';
        c.strokeStyle = rgba('#ffffff', a * 0.7 * Math.sin(k * Math.PI)); c.lineWidth = 1; c.beginPath(); c.moveTo(x - 14 * u, y); c.lineTo(x + 14 * u, y); c.moveTo(x, y - 14 * u); c.lineTo(x, y + 14 * u); c.stroke();
      }
    },
  };

  // 4 PULSAR STORM: a spinning star sweeps two beams across a sky of violet thunderclouds, and lightning answers it.
  B[4] = {
    sky: [[0, '#050112'], [0.55, '#1a0645'], [1, '#33095e']], vig: 0.6,
    far(g, W, H, r) {
      cloud(g, r, W, H, ['#ff2dd1', '#2d6bff', '#8a3dff'], 40, Math.max(W, H) * 0.24, 0.1);
      lanes(g, r, W, H, 9, Math.max(W, H) * 0.2, 0.38);
      stars(g, r, W, H, 80, '#ffd0f5');
    },
    mid(g, W, H, r) { cloud(g, r, W, H, ['#6a2dff', '#ff3fb8'], 16, Math.max(W, H) * 0.18, 0.05, [-W * 0.1, 0, W * 1.1, H]); },
    live(c, t, W, H, a, u, st) {
      const px = W * 0.22, py = H * 0.3, ang = t * 0.55, L = Math.hypot(W, H) * 1.2;
      c.globalCompositeOperation = 'lighter';
      // the two beams
      for (let s = 0; s < 2; s++) {
        const an = ang + s * Math.PI, wdt = 0.09;
        const gr = c.createLinearGradient(px, py, px + Math.cos(an) * L, py + Math.sin(an) * L);
        gr.addColorStop(0, rgba('#ff9ae6', 0.32 * a)); gr.addColorStop(0.5, rgba('#8a7dff', 0.1 * a)); gr.addColorStop(1, 'rgba(120,120,255,0)');
        c.fillStyle = gr; c.beginPath(); c.moveTo(px, py); c.lineTo(px + Math.cos(an - wdt) * L, py + Math.sin(an - wdt) * L); c.lineTo(px + Math.cos(an + wdt) * L, py + Math.sin(an + wdt) * L); c.closePath(); c.fill();
      }
      const pulse = 0.7 + 0.3 * Math.sin(t * 6.3);
      gl(c, px, py, 70 * u * pulse, '#ff6ad5', a * 0.55); gl(c, px, py, 22 * u, '#ffffff', a * 0.8);
      for (let i = 0; i < 2; i++) { const k = ((t * 0.5 + i * 0.5) % 1); c.strokeStyle = rgba('#ff9ae6', a * 0.28 * (1 - k)); c.lineWidth = 1.2; c.beginPath(); c.arc(px, py, (14 + k * 110) * u, 0, TAU); c.stroke(); }
      // storm clouds light up as a beam sweeps over them
      for (let i = 0; i < 9; i++) { const q = st.rnd[i], cxx = q.x * W, cyy = q.y * H, ang2 = Math.atan2(cyy - py, cxx - px), da = Math.cos(ang2 - ang), da2 = Math.cos(ang2 - ang - Math.PI), lit = Math.pow(Math.max(0, Math.max(da, da2)), 14); if (lit > 0.02) gl(c, cxx, cyy, (60 + 60 * q.s) * u, i % 2 ? '#ff6ad5' : '#8a7dff', a * 0.5 * lit); }
      // sparks blowing through
      const n = st.low ? 10 : 24;
      for (let i = 0; i < n; i++) {
        const q = st.rnd[i], sp = 60 + q.z * 160, x = ((q.x * W + t * sp) % (W + 60)) - 30, y = (q.y * H + Math.sin(t * 0.8 + q.p) * 14 + x * 0.08) % H;
        c.strokeStyle = rgba(q.s > 1.4 ? '#5ad2ff' : '#ff6ad5', a * (0.25 + 0.4 * q.z)); c.lineWidth = 1; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 8 - q.z * 10, y - 1); c.stroke();
      }
      // lightning somewhere in the clouds: a flash of the whole sky and a faint fork
      const ev = st.ev(t, 11, 0.55, 4);
      if (ev) {
        const k = ev.k, f = k < 0.12 ? k / 0.12 : Math.exp(-(k - 0.12) * 5) * (0.6 + 0.4 * Math.sin(k * 40));
        c.fillStyle = rgba('#b8a0ff', 0.14 * a * f); c.fillRect(0, 0, W, H);
        const r2 = OD.makeRng(ev.n * 31 + 5);
        c.globalAlpha = Math.min(1, f);
        bolt(c, r2, W * R(0.45, 0.95, r2), -10, Math.PI / 2 + R(-0.5, 0.2, r2), H * R(0.45, 0.8, r2), 1.4, '#d9ccff', 0.7 * a);
        c.globalAlpha = 1;
      }
      c.globalCompositeOperation = 'source-over';
    },
  };

  // 5 VOID MAW: a hole in the sky with a cold ring of light around it. Things drift toward it. Sometimes something looks back.
  // a small far-away spiral galaxy: a glowing core and two arms of tiny stars, seen at an angle
  function galaxy(g, r, x, y, sz, rot, tilt, c1, c2) {
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(1, tilt); g.globalCompositeOperation = 'lighter';
    gl(g, 0, 0, sz * 1.1, c2, 0.28); gl(g, 0, 0, sz * 0.4, c1, 0.6); gl(g, 0, 0, sz * 0.12, '#ffffff', 0.9);
    for (let arm = 0; arm < 2; arm++) for (let i = 0; i < 70; i++) {
      const q = i / 70, a = arm * Math.PI + q * 5.2 + (r() - 0.5) * 0.35, rr = sz * (0.12 + 0.9 * q) * (1 + (r() - 0.5) * 0.18);
      g.globalAlpha = 0.25 + 0.5 * (1 - q); g.fillStyle = q < 0.45 ? c1 : c2; g.beginPath(); g.arc(Math.cos(a) * rr, Math.sin(a) * rr, 0.5 + r() * 0.9, 0, TAU); g.fill();
    }
    g.globalAlpha = 1; g.restore();
  }
  // the accretion disc ring colours, hot at the inner edge to violet at the outer
  const DISC = [[255, 244, 216], [255, 196, 112], [255, 122, 58], [224, 48, 122], [122, 45, 255]];
  const discCol = k => { const f = k * (DISC.length - 1), i = Math.min(DISC.length - 2, Math.floor(f)), q = f - i, A = DISC[i], Bc = DISC[i + 1]; return [A[0] + (Bc[0] - A[0]) * q, A[1] + (Bc[1] - A[1]) * q, A[2] + (Bc[2] - A[2]) * q]; };
  // half of the disc (back = the far side, behind the hole; front = the near side, crossing in front of it); the left side is brighter, as if it turned towards us
  function discHalf(g, mx, my, mr, tilt, front, bright) {
    g.save(); g.translate(mx, my); g.rotate(tilt); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const k = i / 25, rx = mr * (1.06 + 0.62 * k), ry = rx * 0.2, c = discCol(k), al = bright * (0.5 * Math.pow(1 - k, 1.3) + 0.04);
      const gr = g.createLinearGradient(-rx, 0, rx, 0); gr.addColorStop(0, `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${al})`); gr.addColorStop(0.5, `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${al * 0.55})`); gr.addColorStop(1, `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${al * 0.3})`);
      g.strokeStyle = gr; g.lineWidth = mr * 0.045 + 1; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, front ? 0 : Math.PI, front ? Math.PI : TAU); g.stroke();
    }
    g.restore();
  }
  // 5 VOID MAW: a black hole with a blazing accretion disc and bent light, in a violet nebula, with far galaxies and a river of stars.
  B[5] = {
    sky: [[0, '#020006'], [0.5, '#0c0216'], [1, '#180530']], vig: 0.7,
    far(g, W, H, r) {
      const mx = W * 0.5, my = H * 0.34, mr = Math.min(W, H) * 0.25, tilt = -0.2;
      // violet and magenta gas, thin and dark lanes through it (the same folded noise as the Ember nebula, in cooler colours)
      const lw = 150, lh = Math.max(40, Math.round(lw * H / W)), cv = mk(lw, lh), cc = cv.getContext('2d'), im = cc.createImageData(lw, lh), D = im.data, f1 = fbmFn(r, 5), f2 = fbmFn(r, 3), asp = H / W;
      const ramp = [[0, 6, 0, 18], [0.35, 52, 12, 110], [0.65, 128, 36, 190], [0.88, 214, 70, 200], [1, 255, 170, 235]];
      const col = v => { for (let i = 1; i < ramp.length; i++) if (v <= ramp[i][0]) { const A = ramp[i - 1], Bc = ramp[i], k = (v - A[0]) / (Bc[0] - A[0]); return [A[1] + (Bc[1] - A[1]) * k, A[2] + (Bc[2] - A[2]) * k, A[3] + (Bc[3] - A[3]) * k]; } return ramp[ramp.length - 1].slice(1); };
      for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
        const u0 = x / lw * 2.6, v0 = y / lh * 2.6 * asp, wx = f2(u0 + 3, v0), wy = f2(u0, v0 + 7), n = f1(u0 + (wx - 0.5) * 1.5, v0 + (wy - 0.5) * 1.5);
        const dx = x / lw - 0.5, dy = (y / lh - 0.34) * asp, near = Math.exp(-(dx * dx + dy * dy) / 0.12);   // brighter near the hole
        let d = (0.4 * Math.pow(1 - Math.abs(n * 2 - 1), 2) + 0.4 * n * n) * (0.5 + 0.9 * near) + 0.08 * near;
        const c = col(Math.min(1, d * 1.3)), i = (y * lw + x) * 4; D[i] = c[0]; D[i + 1] = c[1]; D[i + 2] = c[2]; D[i + 3] = Math.min(1, d * 1.5) * 255 * 0.8;
      }
      cc.putImageData(im, 0, 0); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(cv, 0, 0, W, H);
      // a river of faint stars across the sky, with a few bright ones
      g.save(); g.translate(W * 0.5, H * 0.62); g.rotate(-0.55);
      for (let i = 0; i < 380; i++) { const x = (r() - 0.5) * Math.max(W, H) * 1.5, y = (r() + r() - 1) * H * 0.16; g.globalAlpha = 0.15 + 0.5 * r() * (1 - Math.abs(y) / (H * 0.17)); g.fillStyle = r() < 0.2 ? '#ffd0f0' : '#d8c8ff'; g.fillRect(x, y, 1, 1); }
      g.globalAlpha = 1; g.restore();
      stars(g, r, W, H, 60, '#d9b8ff');
      galaxy(g, r, W * 0.15, H * 0.74, Math.min(W, H) * 0.1, 0.6, 0.45, '#ffd9a8', '#8a6bff');
      galaxy(g, r, W * 0.87, H * 0.6, Math.min(W, H) * 0.07, -0.4, 0.5, '#ffb0e0', '#6bb0ff');
      galaxy(g, r, W * 0.74, H * 0.9, Math.min(W, H) * 0.055, 1.1, 0.4, '#b0e8ff', '#c06bff');
      // the black hole: the far side of the disc, the dark sphere, then the near side crossing in front, and the light bent over the top and under the bottom
      g.globalCompositeOperation = 'lighter'; gl(g, mx, my, mr * 2.6, '#7a2dff', 0.28); gl(g, mx, my, mr * 1.6, '#ff6a3a', 0.12); g.globalCompositeOperation = 'source-over';
      discHalf(g, mx, my, mr, tilt, false, 1.8);
      g.fillStyle = '#000'; g.beginPath(); g.arc(mx, my, mr * 0.98, 0, TAU); g.fill();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 14; i++) { const k = i / 13, c = discCol(k * 0.8), rr = mr * (1.0 + 0.05 * i); g.strokeStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${0.5 * Math.pow(1 - k, 1.6) + 0.02})`; g.lineWidth = mr * 0.04 + 1; g.beginPath(); g.arc(mx, my, rr, Math.PI * 1.08, Math.PI * 1.92); g.stroke(); g.beginPath(); g.arc(mx, my, rr * 0.99, Math.PI * 0.2, Math.PI * 0.8); g.globalAlpha = 0.5; g.stroke(); g.globalAlpha = 1; }   // lensed light
      g.strokeStyle = rgba('#fff0d0', 0.85); g.lineWidth = 1.6; g.beginPath(); g.arc(mx, my, mr * 0.99, 0, TAU); g.stroke();   // the photon ring
      g.globalCompositeOperation = 'source-over';
      discHalf(g, mx, my, mr, tilt, true, 2.1);
    },
    mid(g, W, H, r) {   // curling tendrils of dark mist
      g.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const x0 = R(-0.1, 1.1, r) * W, y0 = R(0.4, 1.1, r) * H;
        g.strokeStyle = rgba(i % 2 ? '#7a2dff' : '#c02dff', 0.07); g.lineWidth = R(10, 26, r);
        g.beginPath(); g.moveTo(x0, y0); g.bezierCurveTo(x0 + R(-150, 150, r), y0 - H * 0.2, x0 + R(-200, 200, r), y0 - H * 0.35, x0 + R(-120, 120, r), y0 - H * R(0.4, 0.7, r)); g.stroke();
      }
    },
    live(c, t, W, H, a, u, st) {
      const mx = W * 0.5, my = H * 0.34, mr = Math.min(W, H) * 0.25, tl = -0.2;
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {   // hot spots racing round the disc
        const sp = 0.9 - i * 0.13, an = t * sp + i * 1.9, rx = mr * (1.15 + 0.12 * i), ry = rx * 0.2, x0 = Math.cos(an) * rx, y0 = Math.sin(an) * ry, front = Math.sin(an) > 0;
        const x = mx + x0 * Math.cos(tl) - y0 * Math.sin(tl), y = my + x0 * Math.sin(tl) + y0 * Math.cos(tl);
        if (!front && Math.hypot(x - mx, y - my) < mr * 0.98) continue;
        gl(c, x, y, mr * 0.2, i % 2 ? '#ff8a4a' : '#ffd9a0', a * (0.4 + 0.2 * Math.sin(t * 3 + i)) * (Math.cos(an) < 0 ? 1 : 0.6));
      }
      for (const sg of [-1, 1]) { const gr = c.createLinearGradient(mx, my, mx, my + sg * H * 0.34); gr.addColorStop(0, rgba('#c9a0ff', a * (0.16 + 0.05 * Math.sin(t * 1.3)))); gr.addColorStop(1, 'rgba(140,80,255,0)'); c.fillStyle = gr; c.fillRect(mx - 2.5, sg > 0 ? my : my - H * 0.34, 5, H * 0.34); }   // faint jets from the poles
      // the ring of light, in slow pieces
      c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        c.strokeStyle = rgba(i === 1 ? '#ff4db0' : '#b58bff', a * 0.2); c.lineWidth = 1.5 + i * 0.7;
        c.beginPath(); c.ellipse(mx, my, mr * (1.1 + i * 0.12), mr * (0.38 + i * 0.05), -0.18, t * (0.2 - i * 0.07) + i * 2, t * (0.2 - i * 0.07) + i * 2 + 1.5); c.stroke();
      }
      // starlight bent into thin arcs around the edge
      for (let i = 0; i < 14; i++) { const q = st.rnd[i], rr = mr * (1.12 + q.z * 0.55), a0 = q.p + t * (0.03 + q.z * 0.02), sw = 0.18 + q.s * 0.2; c.strokeStyle = rgba('#e3d0ff', a * (0.12 + 0.2 * q.z)); c.lineWidth = 0.9; c.beginPath(); c.ellipse(mx, my, rr, rr * 0.86, -0.18, a0, a0 + sw); c.stroke(); }
      // a slow swell from the maw, like breathing
      const k = (t * 0.12) % 1; c.strokeStyle = rgba('#c9a0ff', a * 0.12 * (1 - k)); c.lineWidth = 2; c.beginPath(); c.arc(mx, my, mr * (0.9 + k * 1.6), 0, TAU); c.stroke();
      // motes falling in
      const n = st.low ? 10 : 26;
      for (let i = 0; i < n; i++) {
        const q = st.rnd[i], k2 = (t * (0.025 + q.z * 0.03) + q.p) % 1, ang = q.p * 7 + k2 * 0.8, rad = (1 - k2) * Math.max(W, H) * 0.75 + mr * 0.25;
        const x = mx + Math.cos(ang) * rad, y = my + Math.sin(ang) * rad * 0.8;
        gl(c, x, y, (2 + q.s * 1.5) * (1 - k2 * 0.6), q.s > 1.5 ? '#ff6ad5' : '#b58bff', a * 0.5 * Math.sin(k2 * Math.PI));
      }
      c.globalCompositeOperation = 'source-over';
      // two pale lights open in the dark, look about, and close
      const ev = st.ev(t, 34, 4.6, 5);
      if (ev) {
        const r2 = OD.makeRng(ev.n * 17 + 3), x = W * R(0.12, 0.88, r2), y = H * R(0.5, 0.92, r2), gap = 15 * u, k = ev.k;
        const lid = k < 0.18 ? k / 0.18 : k > 0.8 ? (1 - k) / 0.2 : 1, blink = (k > 0.45 && k < 0.5) ? 0.1 : 1, look = Math.sin(k * 5) * 3 * u;
        c.globalCompositeOperation = 'lighter';
        for (const sx of [-1, 1]) {
          gl(c, x + sx * gap + look, y, 14 * u, '#7dffd0', a * 0.35 * lid * blink);
          c.fillStyle = rgba('#d6fff0', a * 0.7 * lid * blink); c.beginPath(); c.ellipse(x + sx * gap + look, y, 3.4 * u, 1.5 * u * Math.max(0.15, lid * blink), 0, 0, TAU); c.fill();
        }
        c.globalCompositeOperation = 'source-over';
      }
      st.twinkle(c, t, a * 0.6, '#e0c8ff', 5);
    },
  };

  // a few faint motes drifting slowly, for depth. dir: -1 up, 1 down
  function motes(c, st, t, W, H, a, col, n, dirY, sp) {
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const q = st.rnd[i], y = ((q.y * H + dirY * t * sp * (0.4 + q.z)) % H + H) % H, x = q.x * W + Math.sin(t * 0.3 + q.p) * 14;
      gl(c, x, y, 2.5 + q.s * 2, col, a * (0.12 + 0.16 * q.z) * (0.6 + 0.4 * Math.sin(t * 0.9 + q.p * 4)));
    }
    c.globalCompositeOperation = 'source-over';
  }
  // ------------------------------------------------------------------ plumbing
  function cached(key, fn) { let v = cache.get(key); if (!v) { v = fn(); cache.set(key, v); } return v; }
  // per-biome helper state: stable random positions for particles, timed rare events, twinkling stars
  const stCache = new Map();
  function stateFor(id) {
    let s = stCache.get(id);
    if (s) return s;
    const rr = OD.makeRng(900 + id * 41), rnd = [];
    for (let i = 0; i < 40; i++) rnd.push({ x: rr(), y: rr(), z: 0.2 + rr() * 0.8, p: rr() * TAU, s: 0.6 + rr() * 1.4 });
    s = { rnd, low: false, ev(t, every, dur, salt) {   // returns {k 0..1, n, s, s2} while an event is happening, else null
      const n = Math.floor(t / every), r = OD.makeRng(n * 977 + salt * 131 + id), start = n * every + r() * Math.max(0.1, every - dur - 1);
      const k = (t - start) / dur; return k >= 0 && k <= 1 ? { k, n, s: r(), s2: r() } : null;
    }, twinkle(c, t, a, col, cnt) {
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < cnt; i++) {
        const q = rnd[i], ph = (t * (0.12 + q.z * 0.1) + q.p) % 1, k = Math.sin(ph * Math.PI); if (k < 0.5) continue;
        const f = (k - 0.5) * 2, x = q.x * (s.W || 400), y = q.y * (s.H || 700);
        c.globalAlpha = a * 0.55 * f; c.strokeStyle = col; c.lineWidth = 0.8; const l = 4 + 5 * q.z * f;
        c.beginPath(); c.moveTo(x - l, y); c.lineTo(x + l, y); c.moveTo(x, y - l); c.lineTo(x, y + l); c.stroke();
        c.globalAlpha = 1; gl(c, x, y, 4 + 3 * f, col, a * 0.5 * f);
      }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    } };
    stCache.set(id, s); return s;
  }
  // a soft elongated cloud, for the nearest drifting layer
  function wisps(g, r, W, H, cols, n, a, len) {
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const x = r() * W, y = r() * H, rad = R(0.5, 1, r) * Math.max(W, H) * 0.16, col = cols[i % cols.length];
      g.save(); g.translate(x, y); g.rotate(R(-0.25, 0.25, r)); g.scale(len, 1);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, rad); gr.addColorStop(0, rgba(col, a * R(0.5, 1, r))); gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr; g.fillRect(-rad, -rad, rad * 2, rad * 2); g.restore();
    }
    g.globalCompositeOperation = 'source-over';
  }
  B[0].near = (g, W, H, r) => wisps(g, r, W, H, ['#3a7bff', '#17b8c9', '#6a4dff'], 9, 0.07, 2.6);
  B[1].near = (g, W, H, r) => { wisps(g, r, W, H, ['#8a5a2a', '#c49a62'], 8, 0.07, 3); for (let i = 0; i < 4; i++) shard(g, r() * W, r() * H, R(18, 40, r), r, { n: 8, fill: 'rgba(14,8,4,0.55)', rim: '#ffb066', rimA: 0.18, sx: 1.4 }); };
  B[2].near = (g, W, H, r) => {
    wisps(g, r, W, H, ['#3a0f08', '#7a2410'], 8, 0.1, 2.4); wisps(g, r, W, H, ['#ff5a1f'], 3, 0.05, 2);
    for (let i = 0; i < 5; i++) {   // slabs of basalt adrift, glowing from underneath, kept toward the top and bottom of the screen
      const top = i % 2 === 0, cx0 = R(0.02, 0.98, r) * W, cy0 = (top ? R(0.05, 0.24, r) : R(0.76, 0.95, r)) * H, w = R(26, 62, r), h = w * R(0.28, 0.45, r), n = 7, pts = [];
      for (let k = 0; k < n; k++) { const a = k / n * TAU + R(-0.2, 0.2, r), q = R(0.78, 1.08, r); pts.push([cx0 + Math.cos(a) * w * q, cy0 + Math.sin(a) * h * q]); }
      g.save(); g.globalCompositeOperation = 'lighter'; gl(g, cx0, cy0 + h * 0.9, w * 1.9, '#ff5a1f', 0.28); g.globalCompositeOperation = 'source-over';
      g.beginPath(); pts.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath();
      const gr = g.createLinearGradient(0, cy0 - h, 0, cy0 + h); gr.addColorStop(0, 'rgba(70,28,18,0.95)'); gr.addColorStop(1, 'rgba(10,3,2,0.98)'); g.fillStyle = gr; g.fill();
      g.clip(); g.globalCompositeOperation = 'lighter'; const eg = g.createLinearGradient(0, cy0, 0, cy0 + h); eg.addColorStop(0, 'rgba(255,90,30,0)'); eg.addColorStop(1, 'rgba(255,120,40,0.7)'); g.fillStyle = eg; g.fillRect(cx0 - w * 1.2, cy0, w * 2.4, h * 1.4);
      g.restore();
    }
  };
  B[3].near = (g, W, H, r) => { wisps(g, r, W, H, ['#9fe6ff', '#4ab8d8'], 9, 0.06, 3); for (let i = 0; i < 4; i++) shard(g, r() * W, r() * H, R(10, 24, r), r, { n: 6, spiky: true, fill: 'rgba(120,220,240,0.22)', rim: '#ffffff', rimA: 0.3 }); };
  B[4].near = (g, W, H, r) => wisps(g, r, W, H, ['#6a2dff', '#ff3fb8', '#2d6bff'], 9, 0.07, 2.8);
  B[5].near = (g, W, H, r) => wisps(g, r, W, H, ['#4a1a9a', '#9b2dff'], 8, 0.07, 3.2);
  // every layer is drawn three times, shifted by one screen width each, so it wraps around seamlessly as it drifts
  function tileOf(gen, W, H, seed, S = 1) {
    const c = mk(W * S, H * S), g = c.getContext('2d'); g.scale(S, S);
    for (const dx of [-W, 0, W]) { g.save(); g.translate(dx, 0); gen(g, W, H, OD.makeRng(seed)); g.restore(); }
    return c;
  }
  function layers(id, W, H) {
    const S = SS, key = 'L' + id + '|' + W + 'x' + H + '|' + S;
    let L = cache.get(key);
    if (L) return L;
    const b = B[id] || B[0];
    const sk = mk(W * S, H * S), g = sk.getContext('2d'); g.scale(S, S); sky(g, W, H, b.sky); vignette(g, W, H, b.vig);
    // the three drifting layers are painted when first needed, one at a time (prepare() does it a little ahead of a biome change)
    L = { base: sk };
    const lazy = (k, f) => Object.defineProperty(L, k, { configurable: true, get() { const v = f(); Object.defineProperty(L, k, { value: v }); return v; } });
    lazy('far', () => tileOf(b.far, W, H, 4000 + id * 61, S)); lazy('mid', () => tileOf(b.mid, W, H, 5000 + id * 53, S)); lazy('near', () => tileOf(b.near, W, H, 6000 + id * 47, S));
    // each layer twice side by side, so that sliding it sideways needs nothing redrawn (see dom)
    const wide = img => { const c = mk(W * 2 * S, H * S), g = c.getContext('2d'); g.drawImage(img, 0, 0); g.drawImage(img, W * S, 0); return c; };
    lazy('farW', () => wide(L.far)); lazy('midW', () => wide(L.mid)); lazy('nearW', () => wide(L.near));
    cache.set(key, L); return L;
  }
  // ---------------------------------------------------------------- the sky as page elements
  // A phone's canvas is drawn by its processor, so painting a screen-sized sky into it sixty times a second is slow. Here the sky is
  // made of layers in the page instead: the base picture, three wide pictures that slide sideways, and one small canvas for the things
  // that glow and move. The graphics chip slides and blends them for almost nothing, and the game's own canvas (planet, orbits,
  // stardust, hazards) lies on top of it, clear everywhere else.
  const dom = (() => {
    let root = null, starsCv = null, dimCv = null, dim2Cv = null, dim2Id = -1, dim2W = 0, dim2H = 0, glow = null, slots = null, cur = 0, dimId = -1, dimW = 0, dimH = 0;
    const LK = [['farW', 0.3], ['midW', 0.7], ['nearW', 1.35]];
    function make() {
      root = document.getElementById('sky'); if (!root) return false;
      slots = [0, 1].map(() => {
        const el = document.createElement('div'); el.className = 'slot';
        const baseBox = document.createElement('div'), tint = document.createElement('div'), lay = LK.map(() => { const d = document.createElement('div'); d.className = 'lay'; return d; }), live = document.createElement('canvas');
        baseBox.className = 'basebox'; tint.className = 'tint'; live.className = 'live';
        el.append(baseBox, tint, ...lay, live); root.appendChild(el);
        return { el, baseBox, tint, lay, live, lg: live.getContext('2d'), id: -1, W: 0, H: 0, liveAt: -1e9 };
      });
      glow = document.createElement('div'); glow.className = 'sweepglow'; root.appendChild(glow);
      starsCv = document.createElement('canvas'); starsCv.className = 'stars'; root.appendChild(starsCv);
      dim2Cv = document.createElement('canvas'); dim2Cv.className = 'dim'; dim2Cv.style.opacity = 0; root.appendChild(dim2Cv);   // the veil of the sky being swept away
      dimCv = document.createElement('canvas'); dimCv.className = 'dim'; root.appendChild(dimCv);
      slots[1].el.style.display = 'none';
      return true;
    }
    function assign(sl, w, W, H) {   // put a biome's pictures into a slot
      if (sl.id === w.id && sl.W === W && sl.H === H) return;
      const L = layers(w.id, W, H);
      sl.baseBox.replaceChildren(L.base); L.base.style.cssText = 'width:' + W + 'px;height:' + H + 'px';
      LK.forEach(([k], i) => { const c = L[k]; c.style.cssText = 'width:' + (W * 2) + 'px;height:' + H + 'px'; sl.lay[i].replaceChildren(c); });
      sl.id = w.id; sl.W = W; sl.H = H;
    }
    function paint(sl, w, t, W, H, drift, dpr, u, low, q, step) {   // the sliding layers and the small live canvas
      const b = B[w.id] || B[0], st = stateFor(w.id);
      LK.forEach(([, k], i) => {
        const x0 = Math.round((((drift * k) % W + W) % W) * dpr) / dpr, d = sl.lay[i];
        d.style.transform = 'translate3d(' + (x0 - W) + 'px,0,0)';
        const op = i === 0 ? 1 : i === 1 ? (b.midAlpha ? Math.min(1, b.midAlpha(t, 1)) : 0.6) : 0.8, ops = op.toFixed(3);
        if (d._op !== ops) { d._op = ops; d.style.opacity = ops; }   // (only written when it changes: the page does not have to re-check it every frame)
      });
      if (t - sl.liveAt >= step || t < sl.liveAt) {
        sl.liveAt = t;
        const lw = Math.max(2, Math.round(W * q)), lh = Math.max(2, Math.round(H * q)), c = sl.lg;
        if (sl.live.width !== lw || sl.live.height !== lh) { sl.live.width = lw; sl.live.height = lh; sl.live.style.width = W + 'px'; sl.live.style.height = H + 'px'; }
        c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, lw, lh); c.setTransform(lw / W, 0, 0, lh / H, 0, 0);
        st.low = !!low; st.W = W; st.H = H; c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
        b.live(c, t, W, H, 1, u, st);
      }
    }
    return {
      ok() { if (!root && !slots) make(); return !!slots; },
      // one frame of sky: the current biome, or an old one being swept over by a new one (p 0..1 along the sweep)
      frame(o) {
        if (!this.ok()) return false;
        const { W, H, t, drift, dpr, u, low, q, step, world, from, p, dir, accent } = o;
        let a = slots[cur], b = slots[1 - cur];
        if (!from) {   // no sweep: the current slot holds the current biome
          if (a.id !== world.id) { const j = b.id === world.id && b.W === W && b.H === H ? 1 - cur : -1; if (j >= 0) { cur = j; a = slots[cur]; b = slots[1 - cur]; } }
          assign(a, world, W, H); a.el.style.display = ''; a.el.classList.remove('sweep'); b.el.style.display = 'none'; glow.style.opacity = 0;
          paint(a, world, t, W, H, drift, dpr, u, low, q, step);
        } else {
          if (a.id !== from.id || b.id !== world.id) {   // set up: the old sky in the current slot, the new one in the other
            if (b.id === from.id && a.id !== from.id) { cur = 1 - cur; a = slots[cur]; b = slots[1 - cur]; }
            assign(a, from, W, H); assign(b, world, W, H);
          }
          a.el.style.display = ''; b.el.style.display = ''; b.el.classList.add('sweep');
          const F = W * 0.6, front = p * (W + F);
          b.el.style.setProperty('--md', dir > 0 ? 'to right' : 'to left'); b.el.style.setProperty('--ma', (front - F).toFixed(1) + 'px'); b.el.style.setProperty('--mb', front.toFixed(1) + 'px');
          const fc = dir > 0 ? front - F * 0.45 : W - front + F * 0.45, ga = 0.11 * Math.sin(Math.PI * p);
          glow.style.width = F + 'px'; glow.style.transform = 'translate3d(' + (fc - F / 2).toFixed(1) + 'px,0,0)'; glow.style.opacity = ga > 0.005 ? 1 : 0; glow.style.setProperty('--g', OD.rgba(accent, ga));
          paint(a, from, t, W, H, drift, dpr, u, low, q, step); paint(b, world, t, W, H, drift, dpr, u, low, q, step);
          if (p >= 1) { cur = 1 - cur; a.el.style.display = 'none'; b.el.classList.remove('sweep'); glow.style.opacity = 0; }
        }
        const sl = slots[cur];
        const tb = o.tint ? o.tint[0] : 'transparent', to = o.tint ? String(o.tint[1]) : '0', tk = tb + '|' + to;
        if (this._tk !== tk) {   // the colour wash is only rewritten when it changes
          this._tk = tk; sl.tint.style.background = tb; sl.tint.style.opacity = to;
          if (slots[1 - cur].el.style.display !== 'none') { const t2 = slots[1 - cur].tint; t2.style.background = tb; t2.style.opacity = to; }
        }
        return true;
      },
      // the drifting stars: a transparent canvas under the veil
      stars(cw, ch, W, H) { if (!this.ok()) return null; if (starsCv.width !== cw || starsCv.height !== ch) { starsCv.width = cw; starsCv.height = ch; starsCv.style.width = W + 'px'; starsCv.style.height = H + 'px'; } return starsCv.getContext('2d'); },
      // in a run the whole sky is veiled a little: the base picture over it at some strength
      veil(world, W, H, a, from, p) {
        if (!this.ok()) return;
        if (dimId !== world.id || dimW !== W || dimH !== H) { dimId = world.id; dimW = W; dimH = H; dimCv.width = W; dimCv.height = H; dimCv.style.width = W + 'px'; dimCv.style.height = H + 'px'; const g = dimCv.getContext('2d'); g.clearRect(0, 0, W, H); g.drawImage(layers(world.id, W, H).base, 0, 0); }
        // while one sky sweeps over another their veils cross-fade, so the new sky's picture does not appear over the whole screen at once
        if (from && p < 1) {
          if (dim2Id !== from.id || dim2W !== W || dim2H !== H) { dim2Id = from.id; dim2W = W; dim2H = H; dim2Cv.width = W; dim2Cv.height = H; dim2Cv.style.width = W + 'px'; dim2Cv.style.height = H + 'px'; const g2 = dim2Cv.getContext('2d'); g2.clearRect(0, 0, W, H); g2.drawImage(layers(from.id, W, H).base, 0, 0); }
          dim2Cv.style.opacity = a * (1 - p); dimCv.style.opacity = a * p;
        } else { dim2Cv.style.opacity = 0; dimCv.style.opacity = a; }
      },
      // paint the layers of a coming biome a little at a time, so the change itself has nothing left to build
      prepare(w, W, H) {
        const L = layers(w.id, W, H); let i = 0;
        const step = () => { if (i < LK.length) { void L[LK[i++][0]]; setTimeout(step, 70); } };
        setTimeout(step, 30);
      },
    };
  })();
  return {
    dom,
    setScale(d) { SS = Math.min(2, Math.max(1, Math.round(d * 2) / 2)); },   // (called with the pixels per css pixel the sky should have)
    prepare: (w, W, H) => dom.prepare(w, W, H),
    // the still picture of this biome's sky
    base(w, W, H) { return layers(w.id, W, H).base; },
    // everything that moves; alpha lets the old sky fade out while the new one fades in. drift = how far the sky has travelled (px):
    // the far layer moves slowest and the near one fastest, all the same way, so the sky seems to flow past like the planets do.
    draw(c, w, t, W, H, alpha, u, low, drift = 0) {
      const b = B[w.id] || B[0], st = stateFor(w.id), L = layers(w.id, W, H);
      st.low = !!low; st.W = W; st.H = H;
      const dk = c.getTransform().a || 1;   // snap to whole device pixels so the two halves of a layer meet without a seam
      const tile = (img, k, al) => {
        const x0 = Math.round((((drift * k) % W + W) % W) * dk) / dk; c.globalAlpha = alpha * al;
        // the layer wraps round: its right part comes in on the left, with plain source rectangles (no clipping, which is slow)
        const nx = img.width / W;
        if (x0 > 0.5) c.drawImage(img, (W - x0) * nx, 0, x0 * nx, img.height, 0, 0, x0, H);
        if (W - x0 > 0.5) c.drawImage(img, 0, 0, (W - x0) * nx, img.height, x0, 0, W - x0, H);
      };
      c.save();
      tile(L.far, 0.3, 1);
      tile(L.mid, 0.7, b.midAlpha ? Math.min(1, b.midAlpha(t, 1)) : 0.6);
      tile(L.near, 1.35, 0.8);
      c.globalAlpha = 1;
      b.live(c, t, W, H, alpha, u, st);
      c.restore();
    },
  };
})();
