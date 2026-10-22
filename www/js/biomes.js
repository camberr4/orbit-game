'use strict';
// The six biomes: what each one looks like. A biome is a stack of layers, from the far sky to the nearest drifting things:
//   base   a pre-rendered picture (sky gradient, nebula, far stars, the big landmark of the place)
//   mid    a second pre-rendered picture that sways a little on its own, so the sky has depth
//   live   things that move, glow or happen now and then, drawn every frame from cached sprites
// Nothing here reacts to gameplay; it only sets the mood. In a run the whole sky is veiled a little by drawScene.
OD.biomes = (() => {
  const TAU = OD.TAU, rgba = OD.rgba, G = OD.gfx;
  const cache = new Map();
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
      const spr = cached('aur', () => { const s = mk(6, 200), g = s.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 200); gr.addColorStop(0, 'rgba(120,255,200,0)'); gr.addColorStop(0.35, 'rgba(110,255,210,0.85)'); gr.addColorStop(0.7, 'rgba(90,170,255,0.35)'); gr.addColorStop(1, 'rgba(160,100,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 6, 200); return s; });
      c.globalCompositeOperation = 'lighter';
      const n = st.low ? 1 : 2;
      for (let b = 0; b < n; b++) {
        const base = H * (0.1 + b * 0.09), amp = 22 + b * 8, sp = 0.18 + b * 0.05;
        for (let x = -12; x < W + 12; x += 8) {
          const w1 = Math.sin(x * 0.011 + t * sp + b * 2.1), w2 = Math.sin(x * 0.027 - t * sp * 1.7 + b), y = base + w1 * amp + w2 * 7;
          const h = H * (0.2 + 0.09 * Math.sin(x * 0.007 + t * 0.2 + b) + 0.05 * w2), k = 0.5 + 0.5 * Math.sin(x * 0.013 - t * 0.5 + b * 3);
          c.globalAlpha = a * (0.025 + 0.055 * k * k);
          c.drawImage(spr, x - 8, y, 24, h);
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
      st.twinkle(c, t, a * 0.7, '#ffe2b0', 6);
    },
  };

  // 2 EMBER RIFT: a dying red star fills the corner of the sky; the space in front of it is cracked open and glowing.
  B[2] = {
    sky: [[0, '#080201'], [0.55, '#240705'], [1, '#4a0f08']], vig: 0.6,
    far(g, W, H, r) {
      cloud(g, r, W, H, ['#ff5a1f', '#a3123a', '#ff9a3d'], 24, Math.max(W, H) * 0.26, 0.1);
      lanes(g, r, W, H, 7, Math.max(W, H) * 0.2, 0.35);
      stars(g, r, W, H, 70, '#ffc9a0');
      g.globalCompositeOperation = 'lighter';
      const sx = W * 0.86, sy = -H * 0.02, sr = Math.max(W, H) * 0.7;
      gl(g, sx, sy, sr, '#ff4a1f', 0.55); gl(g, sx, sy, sr * 0.5, '#ff9a3d', 0.7); gl(g, sx, sy, sr * 0.2, '#ffe7b0', 0.85);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#ffd9a0'; g.globalAlpha = 0.65; g.beginPath(); g.arc(sx, sy, sr * 0.11, 0, TAU); g.fill(); g.globalAlpha = 1;
    },
    mid(g, W, H, r) {   // the cracks in space: glowing fissures
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const fromLeft = r() < 0.5, y0 = H * R(0.1, 0.95, r);
        bolt(g, r, fromLeft ? -10 : W + 10, y0, fromLeft ? R(-0.4, 0.4, r) : Math.PI + R(-0.4, 0.4, r), Math.max(W, H) * R(0.35, 0.7, r), R(1.4, 2.8, r), i % 2 ? '#ff7a2d' : '#ffb04a', 0.9);
      }
      g.globalCompositeOperation = 'source-over';
    },
    midAlpha: (t, a) => a * (0.55 + 0.3 * Math.sin(t * 0.5) + 0.15 * Math.sin(t * 1.3 + 1)),
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
    mid(g, W, H, r) {   // spires growing from the bottom and hanging from the top, the far ones pale and soft
      const spire = (x, base, h, w, dir, tone, rimA) => {
        g.beginPath(); g.moveTo(x - w, base); g.lineTo(x - w * 0.35, base + dir * h * 0.7); g.lineTo(x + w * 0.1, base + dir * h); g.lineTo(x + w * 0.5, base + dir * h * 0.55); g.lineTo(x + w, base); g.closePath();
        const gr = g.createLinearGradient(x - w, 0, x + w, 0); gr.addColorStop(0, tone[0]); gr.addColorStop(1, tone[1]); g.fillStyle = gr; g.fill();
        g.save(); g.clip(); g.fillStyle = rgba('#bff6ff', rimA); g.beginPath(); g.moveTo(x - w * 0.35, base + dir * h * 0.7); g.lineTo(x + w * 0.1, base + dir * h); g.lineTo(x + w * 0.1, base); g.lineTo(x - w * 0.35, base); g.fill(); g.restore();
        g.strokeStyle = rgba('#d8fbff', rimA * 1.3); g.lineWidth = 1; g.beginPath(); g.moveTo(x + w * 0.1, base + dir * h); g.lineTo(x + w * 0.5, base + dir * h * 0.55); g.stroke();
      };
      for (let pass = 0; pass < 2; pass++) {
        const far = pass === 0;
        for (let i = 0; i < (far ? 9 : 5); i++) {
          const x = R(-0.05, 1.05, r) * W, h = H * (far ? R(0.2, 0.42, r) : R(0.16, 0.32, r)), w = h * R(0.14, 0.26, r);
          g.globalAlpha = far ? 0.7 : 1;
          spire(x, H + 4, h, w, -1, far ? ['#12576a', '#1d7b90'] : ['#062a35', '#10596d'], far ? 0.2 : 0.3);
          if (i % 2 === 0) spire(R(0, 1, r) * W, -4, h * 0.8, w * 0.9, 1, far ? ['#12576a', '#1d7b90'] : ['#062a35', '#10596d'], far ? 0.18 : 0.26);
        }
      }
      g.globalAlpha = 1;
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
  B[5] = {
    sky: [[0, '#020006'], [0.5, '#0e0218'], [1, '#1a0530']], vig: 0.7,
    far(g, W, H, r) {
      cloud(g, r, W, H, ['#9b2dff', '#ff2d9a', '#4a1a9a'], 16, Math.max(W, H) * 0.26, 0.07);
      stars(g, r, W, H, 55, '#d9b8ff');
      const mx = W * 0.5, my = H * 0.34, mr = Math.min(W, H) * 0.32;
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) { g.strokeStyle = rgba(i % 2 ? '#ff2d9a' : '#9b6bff', 0.1 - i * 0.012); g.lineWidth = 1.2 + i * 0.4; g.beginPath(); g.ellipse(mx, my, mr * (1.08 + i * 0.1), mr * (0.34 + i * 0.045), -0.18, 0, TAU); g.stroke(); }
      gl(g, mx, my, mr * 1.5, '#8a2dff', 0.22);
      g.strokeStyle = rgba('#e8c8ff', 0.5); g.lineWidth = 2; g.beginPath(); g.ellipse(mx, my, mr * 1.02, mr * 0.9, -0.18, 0.3, TAU * 0.78); g.stroke();   // the bent light around the edge
      g.globalCompositeOperation = 'source-over';
      const hole = g.createRadialGradient(mx, my, mr * 0.15, mx, my, mr);
      hole.addColorStop(0, 'rgba(0,0,0,1)'); hole.addColorStop(0.8, 'rgba(0,0,0,0.96)'); hole.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = hole; g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
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
      const mx = W * 0.5, my = H * 0.34, mr = Math.min(W, H) * 0.32;
      // the ring of light, in slow pieces
      c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        c.strokeStyle = rgba(i === 1 ? '#ff4db0' : '#b58bff', a * 0.2); c.lineWidth = 1.5 + i * 0.7;
        c.beginPath(); c.ellipse(mx, my, mr * (1.1 + i * 0.12), mr * (0.38 + i * 0.05), -0.18, t * (0.2 - i * 0.07) + i * 2, t * (0.2 - i * 0.07) + i * 2 + 1.5); c.stroke();
      }
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
  B[2].near = (g, W, H, r) => { wisps(g, r, W, H, ['#3a0f08', '#7a2410'], 8, 0.1, 2.4); wisps(g, r, W, H, ['#ff5a1f'], 3, 0.05, 2); };
  B[3].near = (g, W, H, r) => { wisps(g, r, W, H, ['#9fe6ff', '#4ab8d8'], 9, 0.06, 3); for (let i = 0; i < 4; i++) shard(g, r() * W, r() * H, R(10, 24, r), r, { n: 6, spiky: true, fill: 'rgba(120,220,240,0.22)', rim: '#ffffff', rimA: 0.3 }); };
  B[4].near = (g, W, H, r) => wisps(g, r, W, H, ['#6a2dff', '#ff3fb8', '#2d6bff'], 9, 0.07, 2.8);
  B[5].near = (g, W, H, r) => wisps(g, r, W, H, ['#4a1a9a', '#9b2dff'], 8, 0.07, 3.2);
  // every layer is drawn three times, shifted by one screen width each, so it wraps around seamlessly as it drifts
  function tileOf(gen, W, H, seed) {
    const c = mk(W, H), g = c.getContext('2d');
    for (const dx of [-W, 0, W]) { g.save(); g.translate(dx, 0); gen(g, W, H, OD.makeRng(seed)); g.restore(); }
    return c;
  }
  function layers(id, W, H) {
    const key = 'L' + id + '|' + W + 'x' + H;
    let L = cache.get(key);
    if (L) return L;
    const b = B[id] || B[0];
    const sk = mk(W, H), g = sk.getContext('2d'); sky(g, W, H, b.sky); vignette(g, W, H, b.vig);
    L = { base: sk, far: tileOf(b.far, W, H, 4000 + id * 61), mid: tileOf(b.mid, W, H, 5000 + id * 53), near: tileOf(b.near, W, H, 6000 + id * 47) };
    cache.set(key, L); return L;
  }
  return {
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
        c.save(); c.beginPath(); c.rect(0, 0, x0, H); c.clip(); c.drawImage(img, x0 - W, 0, W, H); c.restore();
        c.save(); c.beginPath(); c.rect(x0, 0, W - x0, H); c.clip(); c.drawImage(img, x0, 0, W, H); c.restore();
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
