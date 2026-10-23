'use strict';
// Planets, drawn as proper spheres. Each world has a surface map (a full 360 degree picture generated from 3D noise, so it wraps with no
// seam), sometimes a drifting cloud map and a map of things that glow (lava cracks, city lights, crystal edges). Every frame the maps are
// sliced into thin vertical strips and squeezed onto the disc, so the surface really turns and bends round the edge. Light comes from the
// upper left: a soft terminator, a lit atmosphere rim, a specular glint on water and ice. Maps are made a few at a time in the background.
OD.planets = (() => {
  const TAU = Math.PI * 2, MW = 640, MH = 320, PAD = 72;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  // ---- noise
  function makeNoise(seed) {
    const rng = OD.makeRng(seed), V = new Float32Array(256), P = new Uint8Array(512), perm = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    for (let i = 0; i < 512; i++) P[i] = perm[i & 255];
    for (let i = 0; i < 256; i++) V[i] = rng();
    const h = (i, j, k) => V[P[P[P[i & 255] + (j & 255)] + (k & 255)]];
    const noise = (x, y, z) => {
      const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi;
      const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
      const a = h(xi, yi, zi), b = h(xi + 1, yi, zi), c = h(xi, yi + 1, zi), d = h(xi + 1, yi + 1, zi), e = h(xi, yi, zi + 1), f = h(xi + 1, yi, zi + 1), g = h(xi, yi + 1, zi + 1), hh = h(xi + 1, yi + 1, zi + 1);
      const x1 = a + (b - a) * u, x2 = c + (d - c) * u, x3 = e + (f - e) * u, x4 = g + (hh - g) * u, y1 = x1 + (x2 - x1) * v, y2 = x3 + (x4 - x3) * v;
      return y1 + (y2 - y1) * w;
    };
    const fbm = (x, y, z, oct = 5, lac = 2.03, gain = 0.5) => { let s = 0, a = 0.5, n = 0; for (let i = 0; i < oct; i++) { s += a * noise(x, y, z); n += a; x *= lac; y *= lac; z *= lac; a *= gain; } return s / n; };
    // cellular noise for crystal facets: [distance to nearest point, distance to second nearest, cell id]
    const worley = (x, y, z) => {
      const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z); let d1 = 9, d2 = 9, id = 0;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
        const cx = xi + i, cy = yi + j, cz = zi + k, px = cx + h(cx, cy, cz + 11), py = cy + h(cx + 5, cy, cz), pz = cz + h(cx, cy + 9, cz + 3);
        const d = (px - x) * (px - x) + (py - y) * (py - y) + (pz - z) * (pz - z);
        if (d < d1) { d2 = d1; d1 = d; id = h(cx + 3, cy + 7, cz + 1); } else if (d < d2) d2 = d;
      }
      return [Math.sqrt(d1), Math.sqrt(d2), id];
    };
    return { noise, fbm, worley };
  }
  const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const ramp = (stops, t) => {   // stops: [[pos, [r,g,b]], ...]
    if (t <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const [p0, c0] = stops[i - 1], [p1, c1] = stops[i]; return mix(c0, c1, (t - p0) / (p1 - p0)); }
    return stops[stops.length - 1][1];
  };
  const sm = (a, b, t) => { const x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };

  // ---- the worlds: each is a generator of rows. A row callback gets lon, y (= sin latitude), the 3D point and returns colours.
  // out: s = surface [r,g,b,(a)], c = cloud alpha + tint, e = emissive [r,g,b,a]
  const WORLDS = {
    terra(N) {
      const stops = [[0, hex('#06235e')], [0.3, hex('#0c3f9a')], [0.46, hex('#2a7ad8')], [0.5, hex('#46b8dc')], [0.505, hex('#d8cf94')], [0.53, hex('#4ea85a')], [0.62, hex('#2f7d44')], [0.74, hex('#8a8a4c')], [0.84, hex('#8a7a68')], [0.93, hex('#f3f6ff')]];
      return (x, y, z, o) => {
        const e = N.fbm(x * 1.7 + 3, y * 1.7, z * 1.7, 6), ay = Math.abs(y), cap = sm(0.8 + 0.08 * N.noise(x * 6, y * 6, z * 6), 0.92, ay);
        let c = ramp(stops, e + (e > 0.5 ? (0.16 * (1 - Math.pow(ay, 2))) * 0 : 0));
        if (e > 0.5) { const dry = N.fbm(x * 3 + 9, y * 3, z * 3, 3); c = mix(c, [190, 170, 100], clamp((dry - 0.52) * 2.2, 0, 0.7) * (1 - sm(0.6, 0.8, e))); }
        c = mix(c, [244, 248, 255], cap); o.e = e; o.sea = e < 0.5 ? 1 : 0;
        o.s = c;
        const cl = N.fbm(x * 2.6 + 17, y * 3.4, z * 2.6, 5), ca = clamp((cl - 0.44) * 3.8, 0, 1) * (0.95 - 0.2 * ay); o.c = [255, 255, 255, ca];
        const city = e > 0.515 && e < 0.7 && ay < 0.7 ? clamp((N.noise(x * 30, y * 30, z * 30) - 0.8) * 8, 0, 1) * clamp((N.fbm(x * 4, y * 4, z * 4, 3) - 0.45) * 5, 0, 1) : 0;
        o.em = [255, 214, 130, city * 0.95];
      };
    },
    garden(N) {
      const stops = [[0, hex('#06527a')], [0.36, hex('#0d8aa8')], [0.48, hex('#2ed0c8')], [0.505, hex('#f0e6b0')], [0.525, hex('#74d96e')], [0.62, hex('#3fb862')], [0.74, hex('#a6e86a')], [0.84, hex('#b8a6ff')], [0.93, hex('#ffffff')]];
      return (x, y, z, o) => {
        const e = N.fbm(x * 1.9 + 8, y * 1.9, z * 1.9, 6), ay = Math.abs(y);
        let c = ramp(stops, e);
        if (e > 0.52 && e < 0.78) { const f = N.noise(x * 22, y * 22, z * 22), g = N.noise(x * 9 + 4, y * 9, z * 9); if (f > 0.74 && g > 0.5) c = mix(c, g > 0.62 ? hex('#ffb3d1') : hex('#fff2a8'), 0.85); }
        c = mix(c, [244, 250, 255], sm(0.84, 0.95, ay)); o.e = e; o.sea = e < 0.5 ? 1 : 0; o.s = c;
        const cl = N.fbm(x * 2.2 + 31, y * 3.2, z * 2.2, 5); o.c = [255, 244, 250, clamp((cl - 0.46) * 3.6, 0, 1) * 0.85];
        const glow = e > 0.52 ? clamp((N.noise(x * 26 + 2, y * 26, z * 26) - 0.84) * 9, 0, 1) : 0; o.em = [120, 255, 214, glow * 0.9];
      };
    },
    ocean(N) {
      return (x, y, z, o) => {
        const wx = N.fbm(x * 2 + 1, y * 2, z * 2, 3) * 0.9, wy = N.fbm(x * 2 + 5, y * 2 + 3, z * 2, 3) * 0.9;
        const w = N.fbm(x * 3 + wx * 1.4, y * 3 + wy * 1.4, z * 3 + wx, 6), e = N.fbm(x * 1.6 + 40, y * 1.6, z * 1.6, 5);
        let c = ramp([[0, hex('#041c4a')], [0.4, hex('#0a46a8')], [0.58, hex('#1b7ae6')], [0.72, hex('#58b4ff')], [1, hex('#c8ecff')]], w);
        let land = 0;
        if (e > 0.68) { land = sm(0.68, 0.7, e); c = mix(c, e > 0.74 ? hex('#4aa85e') : hex('#ecdca8'), land); }
        o.e = 0.3; o.sea = 1 - land; o.s = c;
        const cl = N.fbm(x * 3 + 60, y * 5, z * 3, 4); o.c = [255, 255, 255, clamp((cl - 0.6) * 3, 0, 1) * 0.55];
      };
    },
    moon(N, craters) {
      return (x, y, z, o) => {
        const e = N.fbm(x * 2.4 + 5, y * 2.4, z * 2.4, 6), maria = sm(0.5, 0.42, N.fbm(x * 1.2 + 70, y * 1.2, z * 1.2, 3));
        let c = mix(hex('#c4c4cc'), hex('#8e8e9a'), clamp((0.55 - e) * 2.2, 0, 1)); c = mix(c, hex('#585866'), maria * 0.8);
        let sh = 0;
        for (const cr of craters) {
          const d = x * cr[0] + y * cr[1] + z * cr[2]; if (d < cr[4]) continue;
          const a = Math.acos(Math.min(1, d)) / cr[3];   // 0 centre .. 1 rim
          if (a < 1) { const bowl = a < 0.82 ? -0.5 * (1 - a / 0.82) : 0, rim = a > 0.82 ? 0.55 * (1 - (a - 0.82) / 0.18) : 0; sh += bowl + rim; }
          else if (a < 1.8) sh += 0.1 * (1 - (a - 1) / 0.8);
        }
        const k = clamp(1 + sh * 0.95, 0.35, 1.6); o.s = [c[0] * k, c[1] * k, c[2] * k]; o.e = e; o.sea = 0;
      };
    },
    lava(N) {
      return (x, y, z, o) => {
        const e = N.fbm(x * 2 + 11, y * 2, z * 2, 6), r = 1 - Math.abs(2 * N.fbm(x * 3.1 + 2, y * 3.1, z * 3.1, 5) - 1), r2 = 1 - Math.abs(2 * N.fbm(x * 7 + 9, y * 7, z * 7, 3) - 1);
        let c = mix(hex('#17090a'), hex('#4a2418'), clamp((e - 0.3) * 2, 0, 1));
        const crack = Math.max(sm(0.9, 0.975, r), sm(0.93, 0.985, r2) * 0.7), sea = sm(0.3, 0.2, e);
        o.s = mix(c, hex('#ff5a14'), sea * 0.7); o.e = e; o.sea = 0;
        const g = clamp(crack + sea * 0.8, 0, 1);
        o.em = [255, 70 + 170 * g * g, 10 + 90 * g * g * g, g * 0.95];
        const sm2 = N.fbm(x * 2.3 + 80, y * 3, z * 2.3, 4); o.c = [40, 20, 18, clamp((sm2 - 0.6) * 3, 0, 1) * 0.35];
      };
    },
    ice(N) {
      return (x, y, z, o) => {
        const e = N.fbm(x * 2.2 + 21, y * 2.2, z * 2.2, 5), r = 1 - Math.abs(2 * N.fbm(x * 3.4 + 1, y * 3.4, z * 3.4, 5) - 1), r2 = 1 - Math.abs(2 * N.fbm(x * 8 + 5, y * 8, z * 8, 3) - 1);
        let c = ramp([[0, hex('#7fc0ee')], [0.5, hex('#d4eeff')], [1, hex('#ffffff')]], e);
        c = mix(c, hex('#3f86d0'), sm(0.55, 0.35, N.fbm(x * 1.4 + 90, y * 1.4, z * 1.4, 3)) * 0.6);
        c = mix(c, hex('#2f6fb8'), sm(0.92, 0.99, r) * 0.8); c = mix(c, [255, 255, 255], sm(0.94, 0.99, r2) * 0.6);
        o.s = c; o.e = e; o.sea = 0.6;
        const cl = N.fbm(x * 2.6 + 50, y * 3, z * 2.6, 4); o.c = [255, 255, 255, clamp((cl - 0.6) * 3, 0, 1) * 0.35];
      };
    },
    gas(N) {
      const pal = [hex('#f4e2bc'), hex('#d9a066'), hex('#b8703a'), hex('#ead0a0'), hex('#8a4a2a'), hex('#f1d9b0'), hex('#c98a52')];
      return (x, y, z, o) => {
        const turb = N.fbm(x * 2.2, y * 9, z * 2.2, 5), wob = (turb - 0.5) * 0.22;
        let yy = y + wob, b = Math.sin(yy * 17 + 0.6 * Math.sin(yy * 5)) * 0.5 + 0.5 + (N.fbm(x * 4, y * 22, z * 4, 4) - 0.5) * 0.4;
        let c = ramp(pal.map((p, i) => [i / (pal.length - 1), p]), clamp(b, 0, 0.999));
        // the great storm
        const lon = Math.atan2(z, x), dl = Math.atan2(Math.sin(lon - 0.9), Math.cos(lon - 0.9)), dy = y + 0.34, q = (dl * dl) / (0.34 * 0.34) + (dy * dy) / (0.15 * 0.15);
        if (q < 1.6) { const sw = Math.sin(Math.atan2(dy, dl * 0.9) * 2 + q * 4) * 0.5 + 0.5, k = 1 - sm(0.5, 1.6, q); c = mix(c, mix(hex('#b8402a'), hex('#f0b080'), sw * 0.5), k * 0.92); }
        o.s = c; o.e = b; o.sea = 0; o.c = [255, 230, 200, clamp((N.fbm(x * 3 + 7, y * 14, z * 3, 4) - 0.62) * 3, 0, 1) * 0.35];
      };
    },
    crystal(N) {
      return (x, y, z, o) => {
        const [d1, d2, id] = N.worley(x * 3.2 + 4, y * 3.2, z * 3.2), edge = sm(0.12, 0.0, d2 - d1);
        const g = N.fbm(x * 1.5, y * 1.5, z * 1.5, 3);
        let c = ramp([[0, hex('#3a2fa0')], [0.5, hex('#3fb8b8')], [1, hex('#a8fff0')]], clamp(0.2 + id * 0.55 + g * 0.5, 0, 1));
        c = mix(c, hex('#ffffff'), edge * 0.7); o.s = c; o.e = g; o.sea = 0.5;
        const spark = clamp((N.noise(x * 34, y * 34, z * 34) - 0.9) * 10, 0, 1);
        o.em = [150 + 100 * edge, 255, 240, Math.max(edge * 0.55, spark)];
      };
    },
    toxic(N) {
      return (x, y, z, o) => {
        const wx = N.fbm(x * 2.4 + 3, y * 2.4, z * 2.4, 3), wy = N.fbm(x * 2.4 + 11, y * 2.4, z * 2.4, 3);
        const f = N.fbm(x * 2.6 + wx * 1.6, y * 2.6 + wy * 1.6, z * 2.6 + wx, 6);
        let c = mix(hex('#160c30'), hex('#3a2275'), clamp(f * 1.4, 0, 1));
        c = mix(c, hex('#8be03a'), sm(0.5, 0.78, f) * 0.85); o.s = c; o.e = f; o.sea = 0;
        const sp = clamp((N.noise(x * 28, y * 28, z * 28) - 0.86) * 9, 0, 1) * sm(0.45, 0.6, f); o.em = [200, 255, 120, sp * 0.9 + sm(0.62, 0.9, f) * 0.18];
        o.c = [170, 255, 90, clamp((N.fbm(x * 3 + 70, y * 4, z * 3, 5) - 0.55) * 3, 0, 1) * 0.5];
      };
    },
    void(N) {
      return (x, y, z, o) => {
        const f = N.fbm(x * 3 + 6, y * 3, z * 3, 5), c = mix(hex('#030008'), hex('#1b0638'), clamp((f - 0.45) * 2.6, 0, 1));
        o.s = c; o.e = f; o.sea = 0; const v = clamp((N.fbm(x * 2.8 + 40, y * 2.8, z * 2.8, 4) - 0.6) * 4, 0, 1); o.em = [180, 90, 255, v * 0.45];
      };
    },
  };
  const SPIN = { terra: 0.055, garden: 0.05, ocean: 0.06, moon: 0.025, lava: 0.04, ice: 0.035, gas: 0.09, crystal: 0.045, toxic: 0.05, void: 0.03 };
  const ATMO = { terra: '#8fd0ff', garden: '#a8ffd0', ocean: '#7ec4ff', moon: null, lava: '#ff7a3a', ice: '#cdf2ff', gas: '#ffd9a0', crystal: '#9fffee', toxic: '#c4ff6a', void: '#b57dff' };
  const SPEC = { terra: 0.22, garden: 0.2, ocean: 0.5, ice: 0.45, crystal: 0.35, lava: 0, moon: 0, gas: 0.08, toxic: 0.1, void: 0 };

  // ---- building maps in the background, a slice of work at a time
  const maps = {}, queue = [];
  function* build(skin) {
    const N = makeNoise(skin.length * 977 + skin.charCodeAt(0) * 31);
    let craters = null;
    if (skin === 'moon') { const rr = OD.makeRng(77); craters = []; for (let i = 0; i < 90; i++) { const th = rr() * TAU, y = rr() * 2 - 1, cz = Math.sqrt(1 - y * y), rad = 0.04 + Math.pow(rr(), 2.4) * 0.3; craters.push([cz * Math.cos(th), y, cz * Math.sin(th), rad, Math.cos(rad * 1.8)]); } }
    const fn = WORLDS[skin](N, craters);
    const surf = new ImageData(MW, MH), cloud = new ImageData(MW, MH), emit = new ImageData(MW, MH), E = new Float32Array(MW * MH), SEA = new Float32Array(MW * MH);
    const o = {}; let hasCloud = false, hasEmit = false;
    for (let j = 0; j < MH; j++) {
      const y = 1 - 2 * (j + 0.5) / MH, cph = Math.sqrt(1 - y * y);
      for (let i = 0; i < MW; i++) {
        const lon = (i + 0.5) / MW * TAU, x = cph * Math.cos(lon), z = cph * Math.sin(lon), k = (j * MW + i) * 4;
        o.c = null; o.em = null; o.e = 0.5; o.sea = 0;
        fn(x, y, z, o);
        const s = o.s; surf.data[k] = s[0]; surf.data[k + 1] = s[1]; surf.data[k + 2] = s[2]; surf.data[k + 3] = 255; E[j * MW + i] = o.e; SEA[j * MW + i] = o.sea;
        if (o.c) { cloud.data[k] = o.c[0]; cloud.data[k + 1] = o.c[1]; cloud.data[k + 2] = o.c[2]; cloud.data[k + 3] = o.c[3] * 255; if (o.c[3] > 0.02) hasCloud = true; }
        if (o.em) { emit.data[k] = o.em[0]; emit.data[k + 1] = o.em[1]; emit.data[k + 2] = o.em[2]; emit.data[k + 3] = o.em[3] * 255; if (o.em[3] > 0.02) hasEmit = true; }
      }
      if (j % 10 === 9) yield;
    }
    // a little relief: light and dark edges from the height of the ground
    const d = surf.data;
    for (let j = 1; j < MH - 1; j++) for (let i = 1; i < MW - 1; i++) {
      const dh = E[(j - 1) * MW + i - 1] - E[(j + 1) * MW + i + 1], k = (j * MW + i) * 4, f = SEA[j * MW + i] > 0.5 ? 0 : 1 + dh * (skin === 'moon' ? 2 : skin === 'gas' || skin === 'void' ? 0.5 : 5);
      if (f !== 0) { d[k] = clamp(d[k] * f, 0, 255); d[k + 1] = clamp(d[k + 1] * f, 0, 255); d[k + 2] = clamp(d[k + 2] * f, 0, 255); }
    }
    yield;
    const pack = img => { const c = document.createElement('canvas'); c.width = MW + PAD; c.height = MH; const g = c.getContext('2d'); g.putImageData(img, 0, 0); g.drawImage(c, 0, 0, PAD, MH, MW, 0, PAD, MH); return c; };
    maps[skin] = { ready: true, surf: pack(surf), cloud: hasCloud ? pack(cloud) : null, emit: hasEmit ? pack(emit) : null };
  }
  function pump() {
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < 9) {
      const job = queue[0], r = job.next();
      if (r.done) queue.shift();
    }
    if (queue.length) setTimeout(pump, 12);
  }
  function warm(list, force) {
    const first = !queue.length;
    for (const s of list) if (WORLDS[s] && !maps[s] && !queue.some(q => q.skin === s)) {
      if (!force && BAKED[s] && !window.__noBaked) { loadBaked([s]); continue; }   // shipped as a picture: nothing to compute
      const g = build(s); g.skin = s; queue.push(g);
    }
    if (first && queue.length) setTimeout(pump, 30);
  }
  // paint some worlds right now, before anything is shown, so a planet never appears in a plainer first version and then switches
  function warmNow(list) { for (const s of list) if (WORLDS[s] && !maps[s]) { const g = build(s); while (!g.next().done); const i = queue.findIndex(q => q.skin === s); if (i >= 0) queue.splice(i, 1); } }
  const want = skin => { if (!maps[skin] && WORLDS[skin] && !queue.some(q => q.skin === skin)) { warm([skin]); } };

  // ---- drawing
  let tmp = null;
  function strips(ctx, map, r, N, lon0) {
    const w = 2 * r / N;
    for (let i = 0; i < N; i++) {
      const n0 = i / N * 2 - 1, n1 = (i + 1) / N * 2 - 1, nm = (n0 + n1) / 2, l0 = Math.asin(n0) + lon0, l1 = Math.asin(n1) + lon0;
      let sx = (((l0 / TAU) % 1) + 1) % 1 * MW; const sw = Math.max(1, (l1 - l0) / TAU * MW), s = Math.sqrt(Math.max(0.0004, 1 - nm * nm));
      ctx.drawImage(map, sx, MH * (0.5 - 0.5 * s), sw, MH * s, -r + i * w, -r * s, w + 0.6, 2 * r * s);
    }
  }
  // the whole sphere (surface, clouds, glow, light, atmosphere) is painted into a small canvas about twelve times a second, then placed every frame
  function render(ctx, m, r, skin, t, dpr, low) {
    const N = clamp(Math.round(r * 2 * (dpr || 1) / (low ? 4 : OD.Q().planetDiv)), 24, OD.Q().planetMax), spin = t * (SPIN[skin] || 0.05), tilt = -0.32;
    ctx.save();
    // the glow of the atmosphere, outside the disc
    const at = ATMO[skin];
    if (at) { ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(0, 0, r * 0.92, 0, 0, r * 1.22); g.addColorStop(0, OD.rgba(at, skin === 'void' ? 0.5 : 0.42)); g.addColorStop(0.35, OD.rgba(at, 0.16)); g.addColorStop(1, OD.rgba(at, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 1.22, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();
    ctx.save(); ctx.rotate(tilt); strips(ctx, m.surf, r, N, spin);
    if (m.cloud) { ctx.globalAlpha = skin === 'toxic' ? 0.8 : 0.95; strips(ctx, m.cloud, r * 1.012, N, spin * 1.6 + 0.8); ctx.globalAlpha = 1; }
    ctx.restore();
    // things that glow: lava, city lights, crystal edges. They are only seen on the dark side, except lava which burns by day too
    if (m.emit) {
      const D = Math.ceil(2 * r * (dpr || 1));
      if (!tmp || tmp.width < D) { tmp = document.createElement('canvas'); tmp.width = tmp.height = Math.max(D, 128); }
      const g = tmp.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, tmp.width, tmp.height);
      const k = D / (2 * r); g.setTransform(k, 0, 0, k, D / 2, D / 2); g.rotate(tilt); strips(g, m.emit, r, N, spin);
      g.setTransform(k, 0, 0, k, D / 2, D / 2);
      if (skin !== 'lava' && skin !== 'toxic') { g.globalCompositeOperation = 'destination-in'; const gr = g.createRadialGradient(-0.4 * r, -0.4 * r, 0.2 * r, 0, 0, 1.2 * r); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.12)'); gr.addColorStop(0.8, 'rgba(0,0,0,1)'); g.fillStyle = gr; g.fillRect(-r * 2, -r * 2, r * 4, r * 4); g.globalCompositeOperation = 'source-over'; }
      const pulse = skin === 'lava' ? 0.8 + 0.2 * Math.sin(t * 1.6) : skin === 'crystal' ? 0.75 + 0.25 * Math.sin(t * 3.1) : 1;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = pulse; ctx.drawImage(tmp, 0, 0, D, D, -r, -r, 2 * r, 2 * r); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    // light: bright upper left, a soft terminator, and a dark side with a little blue sky-light
    const sh = ctx.createRadialGradient(-0.38 * r, -0.4 * r, 0.05 * r, -0.05 * r, -0.05 * r, 1.18 * r);
    sh.addColorStop(0, 'rgba(255,248,230,0.2)'); sh.addColorStop(0.34, 'rgba(255,255,255,0)'); sh.addColorStop(0.62, 'rgba(0,0,16,0.34)'); sh.addColorStop(0.86, 'rgba(0,0,20,0.76)'); sh.addColorStop(1, 'rgba(0,0,28,0.94)');
    ctx.fillStyle = sh; ctx.fillRect(-r, -r, 2 * r, 2 * r);
    const sp = SPEC[skin];
    if (sp) { ctx.globalCompositeOperation = 'lighter'; const g2 = ctx.createRadialGradient(-0.4 * r, -0.42 * r, 0, -0.4 * r, -0.42 * r, 0.34 * r); g2.addColorStop(0, `rgba(255,255,255,${sp})`); g2.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g2; ctx.fillRect(-r, -r, 2 * r, 2 * r); ctx.globalCompositeOperation = 'source-over'; }
    // the lit edge of the atmosphere
    if (at) { ctx.globalCompositeOperation = 'lighter'; const lg = ctx.createLinearGradient(-r * 0.8, -r * 0.8, r * 0.8, r * 0.8); lg.addColorStop(0, OD.rgba(at, 0.85)); lg.addColorStop(0.5, OD.rgba(at, 0.12)); lg.addColorStop(1, OD.rgba(at, 0.02)); ctx.strokeStyle = lg; ctx.lineWidth = Math.max(1.2, r * 0.045); ctx.beginPath(); ctx.arc(0, 0, r - ctx.lineWidth / 2, 0, TAU); ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; }
    ctx.restore(); ctx.restore();
  }
  const cache = new Map();
  // The sphere is painted at a handful of fixed sizes and scaled to the size asked for, so a planet that is shrinking, swelling with the beat or
  // moving about never needs a new picture painted every frame. A picture a little bigger than needed is reused (shrinking looks fine).
  const sizes = {}; let lastPaint = -1;
  function sprite(skin, r, t, d, low) {
    const m = maps[skin]; if (!m) return null;
    const list = sizes[skin + '|' + d] || (sizes[skin + '|' + d] = []);
    let rq = 0; for (const q of list) if (q >= r * 0.97 && q <= r * 2.2) { rq = q; break; }
    if (!rq) { rq = Math.exp(Math.round(Math.log(r) / 0.0953) * 0.0953); if (rq < r * 0.97) rq *= 1.1; list.push(rq); list.sort((a, b) => a - b); }
    const pad = Math.ceil(rq * 0.3), D = Math.ceil((2 * rq + 2 * pad) * d), key = skin + '|' + D;
    let e = cache.get(key);
    if (!e) { e = { cv: document.createElement('canvas'), t: -9, rq, pad }; e.cv.width = e.cv.height = D; cache.set(key, e); }
    if ((t - e.t > OD.Q().planetStep || t < e.t) && (e.t < -8 || lastPaint !== t)) {   // (at most one sphere is repainted per frame: the others wait for the next)
      lastPaint = t;
      const g = e.cv.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, D, D); g.setTransform(d, 0, 0, d, D / 2, D / 2);
      render(g, m, rq, skin, t, d, low); e.t = t;
    }
    return e;
  }
  function draw(ctx, x, y, r, skin, t, rim, dpr, low) {
    want(skin);
    const e = sprite(skin, r, t, dpr || 1, low); if (!e) return false;
    const k = r / e.rq;
    ctx.drawImage(e.cv, x - (e.rq + e.pad) * k, y - (e.rq + e.pad) * k, 2 * (e.rq + e.pad) * k, 2 * (e.rq + e.pad) * k);
    return true;
  }
  // paint a planet's picture ahead of time (when it is first seen, long before it arrives), so its arrival has nothing left to paint
  function prewarm(skin, r, dpr, tries = 0) {
    want(skin);
    if (!maps[skin]) { if (tries < 20) setTimeout(() => prewarm(skin, r, dpr, tries + 1), 250); return; }
    sprite(skin, r, 0.5, dpr || 1, false);
  }

  // ---- baked maps: the painted worlds are shipped as pictures (assets/planets), so a phone does not have to compute them (that took many
  // seconds of its processor and made everything stutter). tools/bake-planets.mjs paints them with the code above and saves them.
  const BAKED = { terra: 1, garden: 1, ocean: 1, moon: 1, lava: 1, ice: 1, crystal: 1, toxic: 1, gas: 1, void: 1 };
  const loadImg = url => new Promise((ok, no) => { const im = new Image(); im.onload = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => ok(im)); im.onerror = () => no(new Error(url)); im.src = url; });
  const baking = {};
  function loadBaked(list) {
    return Promise.all(list.map(skin => {
      if (maps[skin] || !WORLDS[skin]) return null;
      if (!baking[skin]) baking[skin] = fetch('assets/planets/' + skin + '.json').then(r => { if (!r.ok) throw new Error('no baked ' + skin); return r.json(); })
        .then(info => Promise.all([loadImg('assets/planets/' + skin + '_surf.' + info.ext), info.cloud ? loadImg('assets/planets/' + skin + '_cloud.' + info.ext) : null, info.emit ? loadImg('assets/planets/' + skin + '_emit.' + info.ext) : null]))
        .then(([surf, cloud, emit]) => { if (!maps[skin]) maps[skin] = { ready: true, surf, cloud, emit }; })
        .catch(() => { delete baking[skin]; warm([skin], true); });   // not baked (a development copy): paint it the old way
      return baking[skin];
    }));
  }
  function exportMaps(skin) {   // for the baking tool
    const m = maps[skin]; if (!m) return null; const o = { cloud: !!m.cloud, emit: !!m.emit }; o.surf = m.surf; o.cloudC = m.cloud; o.emitC = m.emit; return o;
  }
  return { draw, prewarm, warm, warmNow, loadBaked, exportMaps, baked: BAKED, ready: s => !!maps[s], pending: () => queue.length };
})();
