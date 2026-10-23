'use strict';
// The pictures on the Field Guide cards and the in-run tiles. Every card is the same little stage (a planet, three glowing orbits, your dot
// flying round) and plays one clean eight-second loop of what it explains: the thing arrives, shows what it does, and the dot deals with it.
// Everything is computed from the time inside the loop, so the loop closes without a jump and every move is eased.
// Each art function is (g, w, h, t): a canvas context, its size and the time in seconds. OD.introArt[id] is looked up by the guide and the tiles.
OD.introArt = {};
OD.introKit = (() => {
  const TAU = Math.PI * 2, A = '#4df3ff', D = '#ff4d7a', GOLD = '#ffd95a', LOOP = 8, W0 = TAU * 2 / LOOP;
  const clamp01 = v => Math.max(0, Math.min(1, v)), lerp = (a, b, k) => a + (b - a) * k;
  const ss = (a, b, x) => { const q = clamp01((x - a) / (b - a)); return q * q * (3 - 2 * q); };
  const mod = (x, m) => ((x % m) + m) % m;
  const stars = OD.gfx.makeStars(40, 5);
  const font = (g, px, wt = 800) => { g.font = `${wt} ${px}px Outfit, system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; };

  // ---- the stage
  function stage(g, w, h, t, o = {}) {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, o.top || '#050a1f'); gr.addColorStop(1, o.bot || '#13235a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    OD.gfx.drawStars(g, stars, w, h, t, 0.6, '#cfe0ff');
    const u = h / 230, cx = w / 2, cy = h / 2 + (o.dy || 0) * u, R = [46 * u, 74 * u, 102 * u];
    const F = { g, w, h, t, tt: mod(t, LOOP), u, cx, cy, R };
    F.ring = r => r <= 0 ? R[0] + r * 28 * u : r >= 2 ? R[2] + (r - 2) * 28 * u : lerp(R[Math.floor(r)], R[Math.floor(r) + 1], r - Math.floor(r));
    F.p = (r, a) => [cx + Math.cos(a) * F.ring(r), cy + Math.sin(a) * F.ring(r)];
    if (!o.noRings) R.forEach((r, i) => {
      g.strokeStyle = 'rgba(77,243,255,0.07)'; g.lineWidth = 6 * u; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
      g.strokeStyle = o.ringCol || 'rgba(120,235,255,0.30)'; g.lineWidth = 1.4; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
    });
    if (!o.noPlanet) OD.gfx.drawPlanet(g, cx, cy, 20 * u, o.skin || 'terra', t, o.accent || A, 1);
    return F;
  }
  // the dark edge of the picture, drawn last
  function vignette(F) {
    const { g, w, h, cx } = F, vg = g.createRadialGradient(cx, h / 2, h * 0.35, cx, h / 2, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(2,4,14,0)'); vg.addColorStop(1, 'rgba(2,4,14,0.55)'); g.fillStyle = vg; g.fillRect(0, 0, w, h);
  }

  // ---- your dot. plan: [[from, ring], [time, ring] ...] (a ring change eases over half a second); flips: times when a tap turns it round.
  // The dot always makes the same number of laps in the loop, so the loop closes.
  function hero(F, plan, o = {}) {
    const flips = o.flips || [], a0 = o.a0 == null ? -0.9 : o.a0, laps = o.laps || 2;
    const sOf = x => { let s = 0, dir = 1, last = 0; for (const f of flips) { if (x <= f) break; s += dir * (f - last); last = f; dir = -dir; } return s + dir * (x - last); };
    const K = TAU * laps / sOf(LOOP);
    const at = x => {
      const xm = mod(x, LOOP); let ring = plan[0][1];
      for (let i = 1; i < plan.length; i++) ring = lerp(ring, plan[i][1], ss(plan[i][0], plan[i][0] + 0.55, xm));
      const a = a0 + K * sOf(xm); let [px, py] = F.p(ring, a);
      if (o.warp) [px, py] = o.warp(px, py, xm);
      return { x: px, y: py, a, ring, dir: 1 };
    };
    const now = at(F.tt);
    if (!o.hidden) {
      const pts = [], cuts = o.cuts || []; for (let j = 0; j < 26; j++) { const xs = F.tt - j * 0.032; if (j && cuts.some(c => F.tt >= c && xs < c)) break; pts.push(at(xs)); }
      const col = o.col || A, g = F.g, alpha = o.alpha == null ? 1 : o.alpha; g.save(); g.globalAlpha = alpha;
      OD.gfx.drawTrail(g, pts, 'classic', col, 0, 5 * F.u);
      g.save(); g.globalCompositeOperation = 'lighter'; OD.gfx.glow(g, now.x, now.y, 17 * F.u, col, 1); g.restore();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(now.x, now.y, 3.8 * F.u, 0, TAU); g.fill(); g.restore();
    }
    now.at = at; now.K = K; return now;
  }

  // ---- little pieces
  const rockShape = OD.gfx.makeShape('rock', OD.makeRng(3));
  function rock(F, x, y, s = 12, rot = 0, a = 1) { F.g.save(); F.g.globalAlpha *= a; OD.gfx.drawDebris(F.g, 'rock', x, y, s * F.u, rot, D, rockShape); F.g.restore(); }
  function glowAt(F, x, y, r, col, a = 1) { const g = F.g; g.save(); g.globalCompositeOperation = 'lighter'; OD.gfx.glow(g, x, y, r * F.u, col, a); g.restore(); }
  function dustStar(F, x, y, k = 1, spin = 0) {   // a stardust star (the plump five-point one)
    const g = F.g, u = F.u; glowAt(F, x, y, 14 * k, '#ffe9a0', 0.9); g.save(); g.translate(x, y); g.rotate(spin); g.fillStyle = g.strokeStyle = '#fffbe6'; g.lineJoin = 'round'; g.lineWidth = 1.8 * u * k;
    g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i / 10 * TAU, r = (i % 2 ? 2.2 : 3.9) * u * k; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); g.stroke(); g.restore();
  }
  function pop(F, x, y, text, col, k, size = 13) {   // a label that floats up and fades; k 0..1 through its life
    if (k <= 0 || k >= 1) return; const g = F.g; g.save(); g.globalAlpha = Math.sin(Math.PI * Math.min(1, k * 1.15)) ** 0.6; font(g, size * F.u); g.fillStyle = col; g.fillText(text, x, y - 12 * F.u - k * 18 * F.u); g.restore();
  }
  function burst(F, x, y, col, k, size = 34, n = 8) {   // an expanding ring and some sparks; k 0..1
    if (k <= 0 || k >= 1) return; const g = F.g, e = 1 - (1 - k) ** 2; g.save(); g.strokeStyle = col; g.globalAlpha = 1 - k; g.lineWidth = 2.4 * F.u * (1 - k) + 0.6;
    g.beginPath(); g.arc(x, y, (6 + size * e) * F.u, 0, TAU); g.stroke(); g.fillStyle = '#fff';
    for (let i = 0; i < n; i++) { const a = i / n * TAU + 0.4; g.beginPath(); g.arc(x + Math.cos(a) * size * 1.15 * e * F.u, y + Math.sin(a) * size * 1.15 * e * F.u, (2.2 * (1 - k) + 0.4) * F.u, 0, TAU); g.fill(); }
    g.restore();
  }
  function finger(F, x, y, press = 1, a = 1) {   // a fingertip: a soft disc with a ring
    const g = F.g; g.save(); g.globalAlpha = a; g.fillStyle = `rgba(255,255,255,${0.12 + 0.18 * press})`; g.beginPath(); g.arc(x, y, (16 - 2 * press) * F.u, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2; g.stroke(); g.restore();
  }
  function chip(F, text, col = 'rgba(255,255,255,0.85)', y = null) {   // a small caption at the bottom
    if (F.h < 150) return;   // (not on the little thumbnails)
    const g = F.g; font(g, 11 * F.u, 700); const wd = g.measureText(text).width + 22 * F.u, yy = y == null ? F.h - 20 * F.u : y;
    g.save(); g.fillStyle = 'rgba(6,10,30,0.7)'; g.beginPath(); g.roundRect(F.cx - wd / 2, yy - 10 * F.u, wd, 20 * F.u, 10 * F.u); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1; g.stroke();
    g.fillStyle = col; g.fillText(text, F.cx, yy + 0.5); g.restore();
  }
  // a hazard that drifts round the planet at half the dot's speed and meets the dot at time m
  const drift = (H, m, k = 0.5) => tt => H.at(m).a + H.K * k * (tt - m);
  const ang = (cx, cy, x, y) => Math.atan2(y - cy, x - cx);

  return { TAU, A, D, GOLD, LOOP, W0, clamp01, lerp, ss, mod, stage, vignette, hero, rock, glowAt, dustStar, pop, burst, finger, chip, drift, font, ang, rockShape };
})();

// ================================================================== techniques and basic things
(() => {
  const K = OD.introKit, { TAU, A, D, GOLD, LOOP, W0, lerp, ss, mod, stage, vignette, hero, rock, glowAt, dustStar, pop, burst, finger, chip, drift, font } = K;
  const art = OD.introArt, win = (tt, a, b) => tt >= a && tt < b;

  art.rock = (g, w, h, t) => {
    const F = stage(g, w, h, t), m = 3.4;
    // the dot rides the outer orbit, hops in to dodge the rock and out again
    const plan = [[0, 1], [m - 1.1, 2], [m + 0.9, 1]], a = K.drift(hero(F, plan, { hidden: true }), m, 0.5);
    const Hd = hero(F, plan);
    const [rx, ry] = F.p(1, a(F.tt)); rock(F, rx, ry, 12, F.tt * 1.4);
    if (win(F.tt, m - 0.3, m + 0.4)) pop(F, Hd.x, Hd.y - 10 * F.u, 'DODGED', GOLD, (F.tt - (m - 0.3)) / 0.7);
    vignette(F);
  };
  art.dust = (g, w, h, t) => {
    const F = stage(g, w, h, t), plan = [[0, 1]], H0 = hero(F, plan, { hidden: true }), spd = H0.K * 0.5;
    const H = hero(F, plan);
    for (let i = 0; i < 6; i++) {
      const mi = 1.0 + 0.42 * i, a = H0.at(mi).a + spd * (F.tt - mi), appear = ss(0, 0.5, F.tt - 0.05 * i);
      if (F.tt < mi) { const [x, y] = F.p(1, a); dustStar(F, x, y, appear, F.tt * 2 + i); }
      else { const [x, y] = F.p(1, H0.at(mi).a); burst(F, x, y, '#ffe9a0', (F.tt - mi) / 0.45, 22, 6); pop(F, x, y - 6 * F.u, '+10', GOLD, (F.tt - mi) / 0.9, 11); }
    }
    if (F.tt > 3.6 && F.tt < 5.6) { const k = (F.tt - 3.6) / 2; K.pop(F, F.cx, F.cy - F.R[2] - 4 * F.u, 'STREAK BONUS', '#ffe9a0', k, 13); }
    vignette(F);
  };
  art.overdrive = (g, w, h, t) => {
    const F = stage(g, w, h, t), plan = [[0, 1]], H = hero(F, plan, { hidden: true }), tt = F.tt, nova = ss(3.9, 4.3, tt) * (1 - ss(7.0, 7.6, tt)), fill = tt < 4 ? tt / 4 : 1 - ss(6.8, 8, tt);
    // grazes fill the ring round the planet; at full it explodes into a nova that smashes through the rocks
    const rr = F.R[0] - 14 * F.u; g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 5 * F.u; g.beginPath(); g.arc(F.cx, F.cy, rr, 0, TAU); g.stroke();
    g.save(); g.strokeStyle = nova > 0.5 ? '#fff6c8' : GOLD; g.lineWidth = 5 * F.u; g.lineCap = 'round'; g.shadowBlur = 0; g.beginPath(); g.arc(F.cx, F.cy, rr, -Math.PI / 2, -Math.PI / 2 + TAU * fill); g.stroke(); g.restore();
    for (const [gm, ro] of [[1.0, 1.5], [2.1, 1.5], [3.2, 1.5]]) { const a = H.at(gm).a, [x, y] = F.p(ro, a); if (tt < gm + 0.3 || true) { if (tt < 4.4) rock(F, x, y, 9, gm, 0.9); } burst(F, ...F.p(1, a), GOLD, (tt - gm) / 0.5, 18, 5); pop(F, ...F.p(1, a), 'GRAZE', GOLD, (tt - gm) / 0.9, 11); }
    for (const sm of [4.7, 5.5, 6.3]) { const a = H.at(sm).a + 0.0, [x, y] = F.p(1, a + H.K * 0.35 * 0); if (tt < sm) rock(F, ...F.p(1, H.at(sm).a), 12, sm, 1); else burst(F, ...F.p(1, H.at(sm).a), '#fff6c8', (tt - sm) / 0.5, 30, 8); }
    const Hd = hero(F, plan, { col: nova > 0.2 ? '#fff6c8' : A });
    if (nova > 0.02) { glowAt(F, Hd.x, Hd.y, 30 * nova, '#fff2b0', 0.9); g.save(); g.strokeStyle = `rgba(255,255,255,${0.9 * nova})`; g.lineWidth = 2; g.setLineDash([5 * F.u, 7 * F.u]); g.lineDashOffset = -F.tt * 30; g.beginPath(); g.arc(Hd.x, Hd.y, 15 * F.u, 0, TAU); g.stroke(); g.restore(); }
    chip(F, nova > 0.2 ? 'UNSTOPPABLE' : 'GRAZES FILL THE RING');
    vignette(F);
  };
  art.comet = (g, w, h, t) => {
    const F = stage(g, w, h, t), tt = F.tt, plan = [[0, 1]], H = hero(F, plan);
    const m = 3.6, phi = H.at(m).a + Math.PI / 2, ux = Math.cos(phi), uy = Math.sin(phi), L = Math.max(w, h) * 0.75;
    const fade = ss(0.3, 1.2, tt) * (1 - ss(4.6, 5.2, tt));
    g.save(); g.globalAlpha = fade; g.setLineDash([8 * F.u, 8 * F.u]); g.lineDashOffset = -tt * 40; g.strokeStyle = 'rgba(255,77,122,0.75)'; g.lineWidth = 2; g.beginPath(); g.moveTo(F.cx - ux * L, F.cy - uy * L); g.lineTo(F.cx + ux * L, F.cy + uy * L); g.stroke(); g.restore();
    const q = (tt - 3.0) / 1.2;
    if (q > 0 && q < 1) { const e = q * q * 0.4 + q * 0.6, x = F.cx + ux * L * (1 - 2 * e), y = F.cy + uy * L * (1 - 2 * e), tl = 90 * F.u;
      const gr = g.createLinearGradient(x, y, x + ux * tl, y + uy * tl); gr.addColorStop(0, 'rgba(255,77,122,0.95)'); gr.addColorStop(1, 'rgba(255,77,122,0)');
      g.save(); g.strokeStyle = gr; g.lineWidth = 9 * F.u; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + ux * tl, y + uy * tl); g.stroke(); g.restore(); glowAt(F, x, y, 20, D, 0.8); g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 5 * F.u, 0, TAU); g.fill(); }
    chip(F, tt < 3 ? 'READ THE DASHED LINE' : 'BE SOMEWHERE ELSE');
    vignette(F);
  };
  art.mine = (g, w, h, t) => {
    const F = stage(g, w, h, t), tt = F.tt, plan = [[0, 1]], H0 = hero(F, plan, { hidden: true }), m = 2.5;
    const am = H0.at(m).a + H0.K * 0.5 * (m - tt) * -1 + 0;   // the mine drifts at half the dot's speed
    const a = H0.at(m).a + H0.K * 0.5 * (tt - m), [x, y] = F.p(1, a), cyc = mod(tt, 2), flash = ss(1.35, 1.5, cyc) * (1 - ss(1.85, 2.0, cyc)), warn = ss(0.9, 1.3, cyc) * (1 - flash);
    const R2 = (20 + 18 * flash) * F.u;
    g.save(); g.setLineDash([5 * F.u, 5 * F.u]); g.lineDashOffset = -tt * 20; g.strokeStyle = flash > 0.5 ? D : `rgba(255,77,122,${0.35 + 0.3 * warn})`; g.lineWidth = flash > 0.5 ? 3 : 1.6; g.beginPath(); g.arc(x, y, R2, 0, TAU); g.stroke(); g.restore();
    if (flash > 0.02) { g.save(); g.fillStyle = `rgba(255,77,122,${0.28 * flash})`; g.beginPath(); g.arc(x, y, R2, 0, TAU); g.fill(); g.restore(); glowAt(F, x, y, 46 * flash, D, 0.8); }
    g.save(); g.translate(x, y); g.rotate(tt); g.fillStyle = '#1a0710'; g.strokeStyle = D; g.lineWidth = 2; g.beginPath(); for (let i = 0; i < 16; i++) { const aa = i / 16 * TAU, r = (i % 2 ? 6 : 11) * F.u; g.lineTo(Math.cos(aa) * r, Math.sin(aa) * r); } g.closePath(); g.fill(); g.stroke(); g.restore();
    hero(F, plan);
    chip(F, flash > 0.3 ? 'FLASH: DEADLY CIRCLE' : 'SMALL: SLIDE PAST');
    vignette(F);
  };
  art.ring = (g, w, h, t) => {
    const F = stage(g, w, h, t), tt = F.tt, plan = [[0, 1]], H0 = hero(F, plan, { hidden: true });
    const gc = H0.at(tt).a + 0.32 * Math.sin(tt * 1.6) - 0.15, gap = 0.78, solid = ss(1.8, 2.3, mod(tt, 4)) * (1 - ss(3.6, 4, mod(tt, 4)));
    const warn = 1 - solid;
    g.save(); g.lineCap = 'round';
    for (const [lw, al] of [[20 * F.u, 0.18], [7 * F.u, 1]]) { g.strokeStyle = D; g.globalAlpha = al * (0.25 + 0.75 * solid); g.lineWidth = lw; g.beginPath(); g.arc(F.cx, F.cy, F.R[1], gc + gap, gc - gap + TAU); g.stroke(); }
    g.globalAlpha = 1; g.strokeStyle = `rgba(255,255,255,${0.2 + 0.7 * solid})`; g.lineWidth = 2; g.beginPath(); g.arc(F.cx, F.cy, F.R[1], gc + gap, gc - gap + TAU); g.stroke();
    g.fillStyle = '#7ad9ff'; for (const e of [gc + gap, gc - gap]) { g.beginPath(); g.arc(F.cx + Math.cos(e) * F.R[1], F.cy + Math.sin(e) * F.R[1], 5 * F.u, 0, TAU); g.fill(); } g.restore();
    hero(F, plan);
    chip(F, solid > 0.5 ? 'SOLID: STAY IN THE GAP' : 'THE GAP EDGES GLOW');
    vignette(F);
  };
  art.graze = (g, w, h, t) => {
    const F = stage(g, w, h, t), tt = F.tt, plan = [[0, 1]], H = hero(F, plan), m = 3.0;
    const ra = H.at(m).a, [rx, ry] = F.p(1.5, ra + H.K * 0.0);   // a rock just outside the dot's orbit
    const dist = Math.hypot(H.x - rx, H.y - ry), near = Math.max(0, 1 - dist / (46 * F.u));
    rock(F, rx, ry, 12, tt * 0.8);
    g.save(); g.strokeStyle = `rgba(255,217,90,${0.15 + 0.7 * near})`; g.lineWidth = 2; g.setLineDash([4, 5]); g.beginPath(); g.arc(rx, ry, 30 * F.u, 0, TAU); g.stroke(); g.restore();
    if (near > 0.2) glowAt(F, H.x, H.y, 26 * near, GOLD, 0.6);
    for (const mm of [m, m + 4]) pop(F, H.at(mm).x, H.at(mm).y, 'GRAZE  +20', GOLD, (tt - mm) / 1.1, 14);
    chip(F, 'SKIM PAST DANGER, DO NOT TOUCH');
    vignette(F);
  };
  art.combo = (g, w, h, t) => {   // a pill under the score: good moves push it up, then it drains
    const F = stage(g, w, h, t, { noRings: true, noPlanet: true }), c = F.tt;
    const hits = [[0.8, 'GRAZE'], [2.0, 'TRICK'], [3.2, 'STARDUST']];
    let v = 1, fill = 0, last = -9, label = null;
    for (const [ht, nm] of hits) if (c >= ht) { v += 0.5; fill = 1; last = ht; label = [nm, c - ht]; }
    if (last > -9) fill = Math.max(0, 1 - (c - last) / 3.6);
    if (c > last + 3.6 && last > -9) v = Math.max(1, 2.5 - (c - last - 3.6) * 0.45);
    const pw = 168 * F.u, ph = 50 * F.u, x0 = F.cx - pw / 2, y0 = F.cy - ph / 2, r = ph / 2;
    const pill = () => { g.beginPath(); g.roundRect(x0, y0, pw, ph, r); };
    g.save(); pill(); g.fillStyle = 'rgba(6,10,30,0.75)'; g.fill(); g.save(); pill(); g.clip(); g.fillStyle = 'rgba(179,107,255,0.45)'; g.fillRect(x0, y0, pw * fill, ph); g.restore();
    pill(); g.lineWidth = 2; g.strokeStyle = v > 1.05 ? '#b36bff' : 'rgba(255,255,255,0.25)'; g.stroke(); g.restore();
    const pp = label && label[1] < 0.9 ? 1 + 0.25 * Math.sin(Math.min(1, label[1] / 0.25) * Math.PI) : 1;
    font(g, 26 * F.u * pp); g.fillStyle = '#fff'; g.fillText('×' + v.toFixed(1), F.cx, F.cy + 1);
    if (label && label[1] < 1.2) { const q = label[1] / 1.2; g.globalAlpha = 1 - q; font(g, 13 * F.u); g.fillStyle = GOLD; g.fillText(label[0] + '  +0.5', F.cx, y0 - 16 * F.u - q * 22 * F.u); g.globalAlpha = 1; }
    chip(F, fill > 0.02 ? 'THE BAR IS THE TIME LEFT' : v > 1.05 ? 'IT DRAINS WHEN YOU STOP' : 'BACK TO ×1');
    vignette(F);
  };
  art.tricks = (g, w, h, t) => {
    const F = stage(g, w, h, t), tt = F.tt, plan = [[0, 1], [2.0, 2], [2.7, 1], [4.4, 0], [5.6, 1]], flips = [6.6], H = hero(F, plan, { flips });
    const labels = [[1.6, 'DIP', '+8'], [3.6, 'CLEAN LAP', '+12'], [6.7, 'SNAP TURN', '+12']];
    for (const [m, nm, v] of labels) { const q = (tt - m) / 1.3; if (q > 0 && q < 1) { g.save(); g.globalAlpha = Math.sin(Math.PI * q) ** 0.5; font(g, 14 * F.u); g.fillStyle = '#9fe6ff'; const hp = H.at(m + 0.2); g.fillText(nm + '  ' + v, Math.min(F.w - 60 * F.u, Math.max(60 * F.u, hp.x)), hp.y - 24 * F.u - q * 10 * F.u); g.restore(); } }
    chip(F, 'SLICK MOVES PAY EXTRA');
    vignette(F);
  };
  art.tap = (g, w, h, t) => {   // a tap turns the dot round
    const F = stage(g, w, h, t), tt = F.tt, plan = [[0, 1]], flips = [2.0, 4.4], H = hero(F, plan, { flips });
    for (const m of flips) { const q = (tt - m) / 0.7, p0 = H.at(m); if (q > -0.45 && q < 0.7) { finger(F, p0.x + 20 * F.u, p0.y + 22 * F.u, q > 0 ? 1 : 0.3, 1 - Math.abs(q) * 0.6); if (q > 0) burst(F, p0.x, p0.y, '#fff', q, 26, 6); } }
    chip(F, mod(tt - 2.0, 4.4) < 2.4 && tt >= 2.0 && tt < 4.4 ? 'COUNTER-CLOCKWISE' : 'CLOCKWISE', 'rgba(255,255,255,0.85)', F.h - 20 * F.u);
    pop(F, F.cx, F.cy - F.R[2] - 4 * F.u, 'TAP!', GOLD, (tt - 2.0) / 0.9, 16); pop(F, F.cx, F.cy - F.R[2] - 4 * F.u, 'TAP!', GOLD, (tt - 4.4) / 0.9, 16);
    vignette(F);
  };
  art.swipe = (g, w, h, t) => {
    const F = stage(g, w, h, t), tt = F.tt, plan = [[0, 1], [1.7, 2], [4.7, 1]], H = hero(F, plan);
    // a flick away from the planet, then one towards it
    const show = (m, dirOut) => {
      const q = ss(m - 0.55, m, tt), fade = 1 - ss(m + 0.25, m + 0.75, tt), pa = H.at(m).a, p0 = F.p(dirOut ? 1 : 2, pa), px = Math.cos(pa), py = Math.sin(pa);
      const fx = p0[0] + (dirOut ? 1 : -1) * px * 36 * F.u * q, fy = p0[1] + (dirOut ? 1 : -1) * py * 36 * F.u * q;
      if (tt > m - 0.8 && tt < m + 0.8) { g.save(); g.globalAlpha = fade; g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 3 * F.u; g.lineCap = 'round'; g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(fx, fy); g.stroke(); g.restore(); finger(F, fx, fy, 1 - q * 0.5, fade * ss(m - 0.8, m - 0.55, tt)); }
    };
    show(1.7, true); show(4.7, false);
    chip(F, tt < 3.4 ? 'FLICK AWAY: ONE ORBIT OUT' : 'FLICK INWARD: ONE ORBIT IN');
    vignette(F);
  };
  art.steer = (g, w, h, t) => {   // swipe, then keep your finger down: you keep jumping orbit after orbit
    const F = stage(g, w, h, t), tt = F.tt, plan = [[0, 0], [1.4, 1], [2.3, 2], [5.0, 1], [5.9, 0]], H = hero(F, plan);
    const down = ss(0.8, 1.0, tt) * (1 - ss(3.6, 3.8, tt)), pa = H.at(1.4).a;
    const [sx, sy] = F.p(0, pa), [ex, ey] = F.p(2, pa), q = ss(1.0, 2.4, tt);
    const fx = lerp(sx, ex, q), fy = lerp(sy, ey, q);
    if (down > 0.01) { g.save(); g.globalAlpha = down * 0.4; g.strokeStyle = '#fff'; g.lineWidth = 3 * F.u; g.lineCap = 'round'; g.beginPath(); g.moveTo(sx, sy); g.lineTo(fx, fy); g.stroke(); g.restore(); finger(F, fx, fy, 1, down); }
    chip(F, tt < 3.7 ? 'SWIPE, THEN KEEP HOLDING' : 'LET GO TO STOP');
    vignette(F);
  };
  art.shower = (g, w, h, t) => {
    const F = stage(g, w, h, t), tt = F.tt, plan = [[0, 0]], H = hero(F, plan), ang = 0.55, dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx, Ls = Math.max(w, h) * 0.8;
    for (let i = 0; i < 9; i++) {
      const off = (i - 4) * 22 * F.u, bx = F.cx + px * off, by = F.cy + py * off, appear = ss(0.2, 1.2, tt) * (1 - ss(6.8, 7.6, tt)), q = ((tt - 2.2 - i * 0.28) / 1.5);
      g.save(); g.globalAlpha = appear; g.setLineDash([7 * F.u, 7 * F.u]); g.lineDashOffset = -tt * 30; g.strokeStyle = 'rgba(255,77,122,0.4)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(bx - dx * Ls, by - dy * Ls); g.lineTo(bx + dx * Ls, by + dy * Ls); g.stroke(); g.restore();
      if (q > 0 && q < 1) { const x = bx + dx * Ls * (1 - 2 * q), y = by + dy * Ls * (1 - 2 * q); glowAt(F, x, y, 14, D, 0.9); g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 3 * F.u, 0, TAU); g.fill(); }
    }
    chip(F, 'STAY IN THE GAP BETWEEN LINES');
    vignette(F);
  };
  art.bloom = (g, w, h, t) => {   // the stardust bloom: stars along every orbit
    const F = stage(g, w, h, t), tt = F.tt, plan = [[0, 1], [2.4, 2], [4.4, 0], [6.4, 1]], H = hero(F, plan);
    const appear = ss(0.2, 1.4, tt) * (1 - ss(7.2, 7.9, tt));
    for (let r = 0; r < 3; r++) for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + r * 0.5 + tt * 0.1 * (r % 2 ? -1 : 1), [x, y] = F.p(r, a), hd = Math.hypot(x - H.x, y - H.y); if (hd > 14 * F.u || tt < 1) dustStar(F, x, y, appear * (hd < 16 * F.u ? 0.2 : 1), tt + i); }
    chip(F, 'NO DANGER, ONLY REWARD');
    vignette(F);
  };
  art.twin = (g, w, h, t) => {   // another planet drifts in, the dot hops across, the camera settles on the new home
    const F0 = stage(g, w, h, t, { noRings: true, noPlanet: true }), tt = F0.tt, u = F0.u, cx = w / 2;
    const R = [20 * u, 33 * u, 46 * u], Dg = R[2] * 2 + 24 * u, oy0 = h * 0.74, arrive = ss(0, 2.2, tt), settle = ss(5.2, 7.2, tt);
    const shift = settle * (h / 2 - (oy0 - Dg)), oy = oy0 + shift, ny = lerp(oy0 - Dg - 150 * u, oy0 - Dg, arrive) + shift, nx = lerp(cx + 70 * u, cx, arrive);
    const fade = 1 - ss(7.3, 7.9, tt) + 0, fadeIn = ss(0, 0.5, tt), vis = tt > 7.3 ? fade : fadeIn;
    g.save(); g.globalAlpha = vis;
    for (let i = 0; i < 3; i++) { g.strokeStyle = `rgba(77,243,255,${0.32 * (1 - settle * 0.7)})`; g.lineWidth = 1.4; g.beginPath(); g.arc(cx, oy, R[i], 0, TAU); g.stroke(); }
    OD.gfx.drawPlanet(g, cx, oy, 12 * u, 'terra', t, A, 1 - settle * 0.7);
    for (let i = 0; i < 3; i++) { g.strokeStyle = `rgba(255,179,107,${i === 2 ? 0.65 : 0.32})`; g.lineWidth = i === 2 ? 1.8 : 1.3; g.beginPath(); g.arc(nx, ny, R[i], 0, TAU); g.stroke(); }
    if (tt > 2.4 && tt < 5.4) { g.save(); g.setLineDash([5 * u, 6 * u]); g.strokeStyle = GOLD; g.lineWidth = 2; g.lineDashOffset = -tt * 20; g.beginPath(); g.arc(nx, ny, R[2], 0, TAU); g.stroke(); g.restore(); }
    OD.gfx.drawPlanet(g, nx, ny, 12 * u, 'gas', t, '#ffb36b', 1);
    // the dot: round the old outer orbit, up across the gap at its top, then round the new planet's outer orbit
    const W = 1.5, pos = x => { const xm = mod(x, LOOP); let px, py;
      if (xm < 3.4) { const a = -Math.PI / 2 + W * (xm - 3.4); px = cx + Math.cos(a) * R[2]; py = oy0 + Math.sin(a) * R[2] + (xm > 0 ? shift : 0) * 0; }
      else if (xm < 4.3) { const q = ss(3.4, 4.3, xm), y0 = oy0 - R[2], y1 = ny + R[2]; px = cx + (nx - cx) * 0; py = lerp(y0, y1, q) + 0; px = cx; py += 0; }
      else { const a = Math.PI / 2 + W * (xm - 4.3); px = nx + Math.cos(a) * R[2]; py = ny + Math.sin(a) * R[2]; }
      return xm < 5.2 ? { x: px, y: (xm < 3.4 ? py : xm < 4.3 ? py : py) } : { x: px, y: py }; };
    const stable = x => { const xm = mod(x, LOOP); if (xm < 3.4) { const a = -Math.PI / 2 + W * (xm - 3.4); return { x: cx + Math.cos(a) * R[2], y: oy + Math.sin(a) * R[2] }; }
      if (xm < 4.3) { const q = ss(3.4, 4.3, xm); return { x: cx, y: lerp(oy - R[2], ny + R[2], q) - Math.sin(Math.PI * q) * 8 * u }; }
      const a = Math.PI / 2 + W * (xm - 4.3); return { x: nx + Math.cos(a) * R[2], y: ny + Math.sin(a) * R[2] }; };
    const pts = []; for (let j = 0; j < 24; j++) { const xs = tt - j * 0.04; if (j && tt >= 3.4 && xs < 3.4 && tt < 4.4) { pts.push(stable(xs)); continue; } pts.push(stable(xs)); }
    const P = pts[0]; OD.gfx.drawTrail(g, pts, 'classic', A, 0, 5 * u); glowAt(F0, P.x, P.y, 17, A, 1); g.fillStyle = '#fff'; g.beginPath(); g.arc(P.x, P.y, 3.8 * u, 0, TAU); g.fill();
    g.restore();
    chip(F0, tt < 2.6 ? 'A PLANET DRIFTS IN' : tt < 5.4 ? 'JUMP TO ITS OUTER ORBIT' : 'YOUR NEW HOME'); vignette(F0);
  };
})();

// ================================================================== hazards
(() => {
  const K = OD.introKit, { TAU, A, D, GOLD, LOOP, lerp, ss, mod, stage, vignette, hero, rock, glowAt, dustStar, pop, burst, chip, font } = K;
  const art = OD.introArt, win = (tt, a, b) => tt >= a && tt < b, clamp01 = K.clamp01;
  const bolt = (F, x0, y0, x1, y1, seed, wd = 3) => {   // a jagged bolt
    const g = F.g, n = 9; g.save(); g.globalCompositeOperation = 'lighter'; g.lineJoin = 'round'; g.lineCap = 'round';
    for (const [lw, al, col] of [[wd * 4 * F.u, 0.2, '#9fb8ff'], [wd * 1.6 * F.u, 0.7, '#cfe0ff'], [wd * 0.7 * F.u, 1, '#fff']]) { g.strokeStyle = col; g.globalAlpha = al; g.lineWidth = lw; g.beginPath(); g.moveTo(x0, y0);
      for (let i = 1; i < n; i++) { const q = i / n, off = Math.sin(seed * 12.9 + i * 78.2) * 10 * F.u; g.lineTo(lerp(x0, x1, q) + off * (y1 - y0 === 0 ? 0 : 1), lerp(y0, y1, q) + (y1 - y0 === 0 ? off : 0)); } g.lineTo(x1, y1); g.stroke(); }
    g.restore();
  };

  art.strike = (g, w, h, t) => {   // a faint line, a closing ring, then the bolt; the dot is elsewhere
    const F = stage(g, w, h, t), tt = F.tt, plan = [[0, 1]], H0 = hero(F, plan, { hidden: true });
    const spots = [[1.0, 0.9, 2], [3.4, 2.4, 1.2], [5.6, 4.4, 2]];   // [strike time, angle, ring]
    for (const [m, a0, ring] of spots) {
      const a = H0.at(m).a + 1.9 + a0 * 0.4, [x, y] = F.p(ring, a), q = (tt - (m - 1.4)) / 1.4;
      if (q > 0 && q < 1) { g.save(); g.globalAlpha = q; g.setLineDash([4 * F.u, 7 * F.u]); g.strokeStyle = 'rgba(207,230,255,0.5)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, y); g.stroke(); g.setLineDash([]); g.strokeStyle = `rgba(255,242,168,${0.4 + 0.5 * q})`; g.lineWidth = 2.4; g.beginPath(); g.arc(x, y, (30 - 22 * q) * F.u, 0, TAU); g.stroke(); g.restore(); }
      const k = (tt - m) / 0.5;
      if (k > 0 && k < 1) { bolt(F, x, 0, x, y, m + Math.floor(tt * 24)); glowAt(F, x, y, 50 * (1 - k * 0.5), '#cfe0ff', 1 - k); burst(F, x, y, '#fff', k, 34, 6); }
    }
    hero(F, plan); chip(F, 'WHEN THE RING CLOSES, IT STRIKES');
    vignette(F);
  };
  art.cloud = (g, w, h, t) => {   // a poison cloud drifts along the orbit; the dot crosses it, slows and loses its multiplier
    const F = stage(g, w, h, t), tt = F.tt, plan = [[0, 1], [2.6, 2], [4.4, 1]], H = hero(F, plan), m = 3.2;
    const a0 = H.at(m).a + 0.0 + H.K * 0.5 * 0, ca = a0 - H.K * 0.5 * (m - tt) * -1 + 0;
    const cloudA = H.at(5.6).a + H.K * 0.5 * (tt - 5.6);   // the cloud drifts slowly; the dot reaches it near 5.6 and flies through
    const inside = Math.abs(((H.a - cloudA + Math.PI) % TAU + TAU) % TAU - Math.PI) < 0.62 && H.ring < 1.2;
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
    for (const [lw, al] of [[34 * F.u, 0.07], [22 * F.u, 0.13], [11 * F.u, 0.24]]) { g.strokeStyle = `rgba(166,240,64,${al})`; g.lineWidth = lw; g.beginPath(); g.arc(F.cx, F.cy, F.R[1], cloudA - 0.62, cloudA + 0.62); g.stroke(); }
    for (let i = 0; i < 9; i++) { const a = cloudA + (i / 8 - 0.5) * 1.2, [x, y] = F.p(1, a), r = 6 + 3 * Math.sin(tt * 2 + i * 2); glowAt(F, x + Math.sin(tt + i) * 2, y + Math.cos(tt * 1.3 + i) * 2, r, '#b4ff5a', 0.35); }
    g.restore();
    hero(F, plan);
    if (inside) pop(F, H.x, H.y, '×2.0 → ×1.0', '#b4ff5a', mod(tt - 5.5, 1.2) / 1.2, 12);
    chip(F, 'IN THE CLOUD: MULTIPLIER MELTS');
    vignette(F);
  };
  art.spinner = (g, w, h, t) => {
    const F = stage(g, w, h, t), tt = F.tt, plan = [[0, 2]], H0 = hero(F, plan, { hidden: true }), m = 3.4;
    const a = H0.at(m).a + H0.K * 0.5 * (tt - m) - 0.0, [x, y] = F.p(1, a), L = 25 * F.u, rot = a + Math.PI / 2 + 2.0 * (tt - m) * 1.0;
    g.save(); g.translate(x, y); g.rotate(rot); g.lineCap = 'round'; g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,77,122,0.35)'; g.lineWidth = 15 * F.u; g.beginPath(); g.moveTo(-L, 0); g.lineTo(L, 0); g.stroke();
    g.globalCompositeOperation = 'source-over'; g.strokeStyle = D; g.lineWidth = 6.5 * F.u; g.stroke(); g.strokeStyle = '#fff'; g.lineWidth = 2 * F.u; g.stroke(); g.fillStyle = '#12060c'; g.strokeStyle = D; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 6 * F.u, 0, TAU); g.fill(); g.stroke(); g.restore();
    hero(F, plan); chip(F, 'THE WHOLE BAR IS DEADLY');
    vignette(F);
  };
  art.beam = (g, w, h, t) => {
    const F = stage(g, w, h, t), tt = F.tt, plan = [[0, 0]], b = 0.2 + tt * 0.8, cyc = mod(tt, 4), solid = ss(1.4, 1.7, cyc) * (1 - ss(3.6, 3.9, cyc)), r0 = F.R[0] + 16 * F.u, r1 = F.R[2] + 14 * F.u;
    const flick = cyc < 1.5 ? 0.25 + 0.35 * (Math.sin(tt * 40) > 0 ? 1 : 0) : 0;
    const g2 = F.g; g2.save(); g2.lineCap = 'round'; g2.globalCompositeOperation = 'lighter';
    const line = (lw, col, al) => { g2.strokeStyle = col; g2.globalAlpha = al; g2.lineWidth = lw; g2.beginPath(); g2.moveTo(F.cx + Math.cos(b) * r0, F.cy + Math.sin(b) * r0); g2.lineTo(F.cx + Math.cos(b) * r1, F.cy + Math.sin(b) * r1); g2.stroke(); };
    line(18 * F.u, D, 0.35 * solid + 0.5 * flick); line(7 * F.u, '#ff9aa8', 0.9 * solid + 0.4 * flick); line(2.4 * F.u, '#fff', solid + 0.3 * flick); g2.restore();
    hero(F, plan, { a0: 0.6 }); chip(F, solid > 0.5 ? 'IT COVERS TWO ORBITS' : 'FLICKER = WARNING');
    vignette(F);
  };
  art.well = (g, w, h, t) => {
    const F = stage(g, w, h, t), tt = F.tt, m = 3.4, H0 = hero(F, [[0, 2]], { hidden: true });
    const a = H0.at(m).a + H0.K * 0.5 * (tt - m) * 0, [wx, wy] = F.p(1.35, H0.at(m).a + 0.0), rf = 40 * F.u;
    const warp = (x, y) => { const d = Math.hypot(x - wx, y - wy), p = clamp01(1 - d / rf) ** 1.5; return d < 1 ? [x, y] : [x + (wx - x) / d * p * 12 * F.u, y + (wy - y) / d * p * 12 * F.u]; };
    glowAt(F, wx, wy, 70, '#8a3dff', 0.55); g.save(); g.setLineDash([3 * F.u, 6 * F.u]); g.lineDashOffset = tt * 12; g.strokeStyle = 'rgba(190,140,255,0.55)'; g.lineWidth = 1.6; g.beginPath(); g.arc(wx, wy, rf, 0, TAU); g.stroke(); g.restore();
    for (let i = 0; i < 3; i++) { const aa = tt * 2.4 + i * TAU / 3; g.strokeStyle = 'rgba(210,170,255,0.7)'; g.lineWidth = 2; g.beginPath(); g.arc(wx, wy, (14 + i * 6) * F.u, aa, aa + 1.7); g.stroke(); }
    g.fillStyle = '#000'; g.beginPath(); g.arc(wx, wy, 10 * F.u, 0, TAU); g.fill(); g.strokeStyle = '#d9b3ff'; g.lineWidth = 2; g.stroke();
    hero(F, [[0, 2]], { warp: (x, y) => warp(x, y) }); chip(F, 'THE DOTTED FIELD SLOWS AND PULLS');
    vignette(F);
  };
  art.ribbon = (g, w, h, t) => {   // a ribbon of light rippling over two orbits; the dot stays on the third
    const F = stage(g, w, h, t), tt = F.tt, plan = [[0, 0]];
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; const pts = [];
    for (let i = 0; i <= 30; i++) { const th = tt * 0.78 - i * 0.05, r = F.ring(1.5) + 24 * F.u * Math.sin(i * 0.2 + tt * 2.3); pts.push([F.cx + Math.cos(th) * r, F.cy + Math.sin(th) * r]); }
    for (const [lw, al, col] of [[16 * F.u, 0.16, '#4df3ff'], [8 * F.u, 0.32, '#4df3ff'], [3 * F.u, 0.95, '#b36bff']]) { g.lineWidth = lw; g.strokeStyle = col; for (let i = 0; i < 30; i++) { g.globalAlpha = al * Math.sin(Math.PI * (i + 0.5) / 30); g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[i + 1][0], pts[i + 1][1]); g.stroke(); } }
    g.restore(); hero(F, plan, { a0: 2.4 }); chip(F, 'ONLY THE BRIGHT CORE HURTS');
    vignette(F);
  };
  art.tether = (g, w, h, t) => {   // two boulders on a cable that swings like a gate; the dot passes behind it
    const F = stage(g, w, h, t), tt = F.tt, plan = [[0, 1]], flips = [4.3, 5.2], H = hero(F, plan, { hidden: true });
    const m = 4.6, a = H.at(m).a - 0.35 + H.K * 0.55 * (tt - m) * 0.0 + 0.9 * (tt - m) * 0.55;   // the gate swings round
    const a1 = a, a2 = a + 0.5, [x1, y1] = F.p(0.55, a1), [x2, y2] = F.p(1.5, a2);
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.strokeStyle = 'rgba(255,179,71,0.28)'; g.lineWidth = 10 * F.u; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.strokeStyle = '#fff3d6'; g.lineWidth = 2.2 * F.u; g.stroke(); g.restore();
    rock(F, x1, y1, 10, tt); rock(F, x2, y2, 10, -tt);
    hero(F, plan, { flips }); chip(F, 'PASS BEHIND THE CABLE, NOT THROUGH');
    vignette(F);
  };
  art.cinder = (g, w, h, t) => {   // a living ember hunts the dot; the dot flips at the last moment and it overshoots
    const F = stage(g, w, h, t), tt = F.tt, plan = [[0, 1]], flips = [3.7, 5.2], H = hero(F, plan, { flips });
    const k = ss(0.4, 3.7, tt), sa = H.at(0.2).a - 2.2;   // it enters from the edge and homes in on the dot's old position
    const target = H.at(Math.max(0.2, Math.min(tt, 3.75) - 0.3));
    const sx = F.cx + Math.cos(sa) * w * 0.55, sy = F.cy + Math.sin(sa) * w * 0.55;
    let x, y;
    if (tt < 3.8) { x = lerp(sx, target.x, k); y = lerp(sy, target.y, k); } else { const e = ss(3.8, 6.6, tt), over = { x: target.x + Math.cos(sa + Math.PI) * 120 * F.u, y: target.y + Math.sin(sa + Math.PI) * 120 * F.u }; x = lerp(target.x, over.x, e); y = lerp(target.y, over.y, e); }
    const dx = x - (F.cx + (tt < 3.8 ? Math.cos(sa) * w * 0.55 : 0)), fade = 1 - ss(6.6, 7.4, tt) + ss(0, 0.3, tt) - 1 + (tt < 0.5 ? ss(0, 0.5, tt) : 0);
    g.save(); g.globalAlpha = clamp01(tt < 0.5 ? ss(0, 0.5, tt) : 1 - ss(6.4, 7.4, tt)); const ma = Math.atan2(y - target.y, x - target.x);
    g.globalCompositeOperation = 'lighter'; glowAt(F, x, y, 30, '#ff5a1f', 0.6); glowAt(F, x, y, 14, '#ffb347', 0.95); g.strokeStyle = 'rgba(255,150,60,0.7)'; g.lineWidth = 6 * F.u; g.lineCap = 'round';
    const mvx = tt < 3.8 ? (target.x - sx) : (x - target.x), mvy = tt < 3.8 ? (target.y - sy) : (y - target.y), ml = Math.hypot(mvx, mvy) || 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x - mvx / ml * 34 * F.u, y - mvy / ml * 34 * F.u); g.stroke(); g.restore();
    g.save(); g.globalAlpha = clamp01(tt < 0.5 ? ss(0, 0.5, tt) : 1 - ss(6.4, 7.4, tt)); g.fillStyle = '#fff4d0'; g.beginPath(); g.arc(x, y, 4 * F.u, 0, TAU); g.fill(); g.restore();
    chip(F, tt < 3.7 ? 'IT ALWAYS TURNS TOWARDS YOU' : 'FLIP AT THE LAST MOMENT');
    vignette(F);
  };
  art.spear = (g, w, h, t) => {   // a lance falls and walls off every orbit from its tip outward; the inner orbits stay open
    const F = stage(g, w, h, t), tt = F.tt, plan = [[0, 0]], a = -1.1, ux = Math.cos(a), uy = Math.sin(a);
    const warn = ss(0.3, 1.0, tt) * (1 - ss(1.9, 2.1, tt)), fall = ss(1.9, 2.2, tt), life = 1 - ss(6.2, 7.0, tt), tipR = F.R[1], far = Math.max(w, h) * 0.8;
    const ox = F.cx + ux * far, oy = F.cy + uy * far, tr = lerp(far, tipR, fall), tx = F.cx + ux * tr, ty = F.cy + uy * tr;
    if (warn > 0) { g.save(); g.globalAlpha = warn; g.setLineDash([6 * F.u, 8 * F.u]); g.strokeStyle = 'rgba(191,234,255,0.6)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(ox, oy); g.lineTo(F.cx + ux * tipR, F.cy + uy * tipR); g.stroke(); g.setLineDash([]); g.strokeStyle = 'rgba(191,234,255,0.8)'; g.lineWidth = 2; g.beginPath(); g.arc(F.cx + ux * tipR, F.cy + uy * tipR, (26 - 14 * warn) * F.u, 0, TAU); g.stroke(); g.restore(); }
    if (fall > 0.02) { g.save(); g.globalAlpha = life; const gr = g.createLinearGradient(tx, ty, ox, oy); gr.addColorStop(0, '#fff'); gr.addColorStop(0.5, 'rgba(159,230,255,0.5)'); gr.addColorStop(1, 'rgba(159,230,255,0)'); g.strokeStyle = gr; g.lineWidth = 8 * F.u; g.lineCap = 'round'; g.beginPath(); g.moveTo(tx, ty); g.lineTo(ox, oy); g.stroke();
      if (fall >= 1) { glowAt(F, tx, ty, 34, '#9fe6ff', 0.7); g.strokeStyle = 'rgba(191,234,255,0.5)'; g.lineWidth = 1.6; for (let i = 0; i < 7; i++) { const aa = i / 7 * TAU + 0.3, rr = (10 + (i % 2) * 9) * F.u; g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + Math.cos(aa) * rr, ty + Math.sin(aa) * rr); g.stroke(); } } g.restore(); }
    hero(F, plan); chip(F, tt < 2 ? 'DOTTED LINE: A LANCE IS COMING' : 'INNER ORBITS STAY OPEN');
    vignette(F);
  };
  art.pylon = (g, w, h, t) => {   // two crystals, a thread that brightens on the beat, then lightning; quiet, charging, STRIKE, afterglow
    const F = stage(g, w, h, t), tt = F.tt, plan = [[0, 1]], H0 = hero(F, plan, { hidden: true }), beat = mod(tt, 4), idx = Math.floor(beat);   // 0 quiet, 1 charge, 2 strike, 3 afterglow
    const a1 = -2.2, a2 = -0.9, [x1, y1] = F.p(2, a1 + tt * 0.0), [x2, y2] = F.p(2, a2), phase = beat - idx;
    const charge = idx === 1 ? 0.3 + 0.7 * phase : 0, strike = idx === 2 ? 1 : 0, after = idx === 3 ? 1 - phase : 0;
    g.save(); g.setLineDash([3 * F.u, 7 * F.u]); g.strokeStyle = `rgba(190,170,255,${0.25 + 0.5 * charge + 0.3 * after})`; g.lineWidth = 1.6 + 2 * charge; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]); g.restore();
    if (strike) { bolt(F, x1, y1, x2, y2, Math.floor(tt * 30), 3); glowAt(F, (x1 + x2) / 2, (y1 + y2) / 2, 60, '#cfe0ff', 0.5); }
    if (after > 0) { glowAt(F, (x1 + x2) / 2, (y1 + y2) / 2, 40, '#9d86ff', 0.3 * after); }
    for (const [x, y] of [[x1, y1], [x2, y2]]) { glowAt(F, x, y, 20 + 14 * charge + 18 * strike, '#9d86ff', 0.6); g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillStyle = '#d9ccff'; g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, -11 * F.u); g.lineTo(6 * F.u, 0); g.lineTo(0, 11 * F.u); g.lineTo(-6 * F.u, 0); g.closePath(); g.fill(); g.stroke(); g.restore(); }
    hero(F, plan); chip(F, ['QUIET: CROSS NOW', 'CHARGING…', 'STRIKE!', 'AFTERGLOW: CROSS NOW'][idx]);
    vignette(F);
  };
  art.shade = (g, w, h, t) => {   // a dark shade follows exactly where the dot was a couple of seconds ago
    const F = stage(g, w, h, t), tt = F.tt, plan = [[0, 1], [2.6, 2], [4.2, 1]], H = hero(F, plan);
    const S = H.at(tt - 2.0), pts = []; for (let j = 0; j < 14; j++) pts.push(H.at(tt - 2.0 - j * 0.05));
    g.save(); g.setLineDash([3 * F.u, 7 * F.u]); g.strokeStyle = 'rgba(138,79,208,0.6)'; g.lineWidth = 1.8; g.beginPath(); for (let j = 0; j <= 14; j++) { const p = H.at(tt - 2.0 + j * 0.1); j ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); } g.stroke(); g.restore();
    const gr = g.createRadialGradient(S.x, S.y, 0, S.x, S.y, 26 * F.u); gr.addColorStop(0, 'rgba(4,0,12,0.95)'); gr.addColorStop(1, 'rgba(4,0,12,0)'); g.fillStyle = gr; g.beginPath(); g.arc(S.x, S.y, 26 * F.u, 0, TAU); g.fill();
    g.fillStyle = '#05000d'; g.strokeStyle = '#c77dff'; g.lineWidth = 2; g.beginPath(); g.arc(S.x, S.y, 8.5 * F.u, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#f6efff'; for (const s2 of [-1, 1]) { g.beginPath(); g.ellipse(S.x + 3 * F.u, S.y + s2 * 3.3 * F.u, 1.8 * F.u, 2.5 * F.u, 0, 0, TAU); g.fill(); }
    chip(F, 'IT FOLLOWS YOUR OLD PATH'); vignette(F);
  };
  art.shoal = (g, w, h, t) => {   // a school of light swims across, weaving; the dot goes through a gap
    const F = stage(g, w, h, t), tt = F.tt, plan = [[0, 2], [1.0, 1], [5.6, 2]], H = hero(F, plan);
    for (let i = 0; i < 7; i++) { const q = (tt - 1.3 - i * 0.12) / 3.6; if (q < 0 || q > 1) continue; const x = lerp(-0.08 * w, 1.08 * w, q), y = h * 0.42 + Math.sin(q * 8 + 1 + i * 0.6) * 38 * F.u + (i - 3) * 8 * F.u;
      glowAt(F, x, y, 16, i % 2 ? '#4df3ff' : '#9fffd0', 0.55); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, y, 6 * F.u, 3 * F.u, Math.cos(q * 8 + 1 + i * 0.6) * 0.5, 0, TAU); g.fill(); }
    const arrow = ss(0.2, 0.9, tt) * (1 - ss(1.5, 2.1, tt)); if (arrow > 0) { g.save(); g.globalAlpha = arrow; g.fillStyle = GOLD; g.beginPath(); g.moveTo(12 * F.u, h * 0.42); g.lineTo(2 * F.u, h * 0.42 - 8 * F.u); g.lineTo(2 * F.u, h * 0.42 + 8 * F.u); g.closePath(); g.fill(); g.restore(); }
    chip(F, 'SLIP BETWEEN THE FISH'); vignette(F);
  };
  art.devil = (g, w, h, t) => {   // a whirl of sand: the core kills, the wind around only spins you round
    const F = stage(g, w, h, t), tt = F.tt, plan = [[0, 2]], flips = [3.6, 5.2], H = hero(F, plan, { flips, hidden: true }), m = 3.5;
    const a = H.at(m).a + 0.0 + 0.35 * Math.sin(tt * 0.8), ring = 1.2 + 0.6 * Math.sin(tt * 0.8 + 0.5) + 0.3, [x, y] = F.p(ring, H.at(m).a + 0.2 * Math.sin(tt * 0.8));
    g.save(); g.setLineDash([3 * F.u, 6 * F.u]); g.lineDashOffset = -tt * 14; g.strokeStyle = 'rgba(242,214,162,0.45)'; g.lineWidth = 1.6; g.beginPath(); g.arc(x, y, 30 * F.u, 0, TAU); g.stroke(); g.setLineDash([]);
    for (let i = 0; i < 7; i++) { const q = i / 6; g.strokeStyle = i % 2 ? '#e8c48a' : '#a67b45'; g.lineWidth = (3.4 - 1.5 * q) * F.u; g.beginPath(); g.ellipse(x, y + (-16 + 28 * q) * F.u, (22 - 15 * q) * F.u, 4.5 * F.u, 0, tt * 4 + i, tt * 4 + i + 4.2); g.stroke(); }
    g.fillStyle = '#3a2412'; g.strokeStyle = '#ffd9a0'; g.lineWidth = 1.6; g.beginPath(); g.arc(x, y + 4 * F.u, 5 * F.u, 0, TAU); g.fill(); g.stroke(); g.restore();
    hero(F, plan, { flips }); if (win(tt, 3.5, 4.8)) pop(F, H.x, H.y, 'SPUN ROUND', '#ffd9a0', (tt - 3.5) / 1.3, 12);
    chip(F, 'CORE KILLS · WIND ONLY SPINS YOU'); vignette(F);
  };
  art.blossom = (g, w, h, t) => {   // a bud on an orbit: spokes show where six fireballs will go
    const F = stage(g, w, h, t), tt = F.tt, plan = [[0, 1], [3.6, 2], [5.6, 1]], H = hero(F, plan), [x, y] = F.p(1, -2.4 + 0.0), ph = mod(tt, 4) / 4, open = ss(0, 0.5, ph);
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + 0.3; g.strokeStyle = `rgba(255,179,71,${0.4 * open * (1 - (ph > 0.62 ? 0.7 : 0))})`; g.setLineDash([3, 7]); g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 140 * F.u, y + Math.sin(a) * 140 * F.u); g.stroke(); g.setLineDash([]);
      if (ph > 0.62) { const d = (ph - 0.62) / 0.38 * 130 * F.u; glowAt(F, x + Math.cos(a) * d, y + Math.sin(a) * d, 14, '#ff5a1f', 0.8); g.fillStyle = '#fff4d0'; g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 3.4 * F.u, 0, TAU); g.fill(); } }
    if (ph < 0.66) { glowAt(F, x, y, 20 + 14 * open, '#ff5a1f', 0.6); g.fillStyle = '#ffd27a'; g.beginPath(); g.arc(x, y, 6 * F.u, 0, TAU); g.fill(); }
    g.restore(); hero(F, plan); chip(F, ph < 0.62 ? 'SPOKES SHOW WHERE THE FIRE GOES' : 'SIX FIREBALLS FLY OUT'); vignette(F);
  };
  art.hail = (g, w, h, t) => {   // lanes brighten, then a shard falls down each in turn
    const F = stage(g, w, h, t), tt = F.tt, plan = [[0, 2]], H = hero(F, plan);
    for (let i = 0; i < 5; i++) { const x = w * (0.18 + i * 0.16), m = 1.4 + i * 0.9, q = (tt - m) / 0.7, warn = ss(m - 1.2, m, tt) * (1 - ss(m + 0.7, m + 0.8, tt));
      g.save(); g.setLineDash([6 * F.u, 8 * F.u]); g.strokeStyle = `rgba(191,234,255,${0.15 + 0.5 * warn})`; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, 8); g.lineTo(x, h - 8); g.stroke(); g.restore();
      if (warn > 0.1) { glowAt(F, x, 12 * F.u, 16 * warn, '#9fe6ff', 0.8); }
      if (q > 0 && q < 1) { const y = lerp(-20, h + 20, q * q * 0.5 + q * 0.5); glowAt(F, x, y, 22, '#9fe6ff', 0.55); g.fillStyle = '#f4fdff'; g.strokeStyle = '#9fe6ff'; g.beginPath(); g.moveTo(x, y + 6 * F.u); g.lineTo(x + 3.6 * F.u, y - 14 * F.u); g.lineTo(x, y - 30 * F.u); g.lineTo(x - 3.6 * F.u, y - 14 * F.u); g.closePath(); g.fill(); g.stroke(); } }
    chip(F, 'A LANE BRIGHTENS BEFORE ITS SHARD FALLS'); vignette(F);
  };
  art.serpent = (g, w, h, t) => {   // a coil of lightning spirals in and out
    const F = stage(g, w, h, t), tt = F.tt, plan = [[0, 1], [2.2, 0], [4.0, 1]], H = hero(F, plan);
    const head = tt / LOOP, pt = q => { const e = Math.sin(Math.PI * clamp01(q)), r = lerp(Math.max(w, h) * 0.55, F.R[0] * 0.8, e), a = -2.6 + q * 7.5; return [F.cx + Math.cos(a) * r, F.cy + Math.sin(a) * r]; };
    const hq = ss(0.05, 0.95, head) * 1.0, tail = Math.max(0, hq - 0.34);
    g.save(); g.lineCap = 'round'; g.globalCompositeOperation = 'lighter';
    for (const [lw, al, col] of [[14, 0.16, '#7a5cff'], [6, 0.4, '#9d86ff'], [2.6, 0.95, '#e8dcff']]) { g.strokeStyle = col; g.globalAlpha = al; g.lineWidth = lw * F.u; g.beginPath(); for (let i = 0; i <= 50; i++) { const [x, y] = pt(lerp(tail, hq, i / 50)); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
    g.globalAlpha = 1; const [hx, hy] = pt(hq); glowAt(F, hx, hy, 24, '#9d86ff', 0.7); g.restore();
    hero(F, plan); chip(F, 'THE WHOLE BODY IS DEADLY'); vignette(F);
  };
  art.rift = (g, w, h, t) => {   // two doorways joined by a thread: touch one, step out of the other
    const F = stage(g, w, h, t), tt = F.tt, m = 3.2, plan = [[0, 1], [m - 1.2, 2], [m + 1.4, 2], [m + 2.4, 1]], H0 = hero(F, plan, { hidden: true });
    const ra = H0.at(m).a, d1 = F.p(2, ra), d2 = F.p(0, ra + Math.PI);
    // after the door the dot is on the inner orbit on the far side, then drifts back to its own orbit
    const warp = (x, y, xm) => { if (xm < m) return [x, y]; const a = Math.atan2(y - F.cy, x - F.cx) + Math.PI, r = lerp(F.R[0], Math.hypot(x - F.cx, y - F.cy), ss(m + 0.9, m + 2.0, xm)); return [F.cx + Math.cos(a) * r, F.cy + Math.sin(a) * r]; };
    g.save(); g.setLineDash([2 * F.u, 7 * F.u]); g.strokeStyle = 'rgba(217,196,255,0.4)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(...d1); g.lineTo(...d2); g.stroke(); g.setLineDash([]); g.restore();
    [d1, d2].forEach(([x, y], e) => { const pulse = 1 + 0.8 * Math.max(0, 1 - Math.abs(tt - m - 0.05) / 0.35); glowAt(F, x, y, 30 * pulse, e ? '#7a5cff' : '#c77dff', 0.5); g.fillStyle = '#07040f'; g.beginPath(); g.ellipse(x, y, 9 * F.u, 14 * F.u, 0, 0, TAU); g.fill();
      for (let i = 0; i < 3; i++) { g.strokeStyle = i % 2 ? '#fff' : '#c9a6ff'; g.lineWidth = 1.8; g.beginPath(); g.ellipse(x, y, (9 + i * 2.6) * F.u, (14 + i * 2.6) * F.u, 0, tt * (e ? -2.2 : 2.2) + i, tt * (e ? -2.2 : 2.2) + i + 4); g.stroke(); } });
    const gone = tt > m - 0.02 && tt < m + 0.12;
    hero(F, plan, { warp, cuts: [m], alpha: gone ? 0 : 1 });
    chip(F, 'ENTER ONE DOOR, LEAVE BY THE OTHER'); vignette(F);
  };
})();

// ================================================================== power-ups: pick it up, then see what it does
(() => {
  const K = OD.introKit, { TAU, A, D, GOLD, LOOP, lerp, ss, mod, stage, vignette, hero, rock, glowAt, dustStar, pop, burst, chip, font } = K;
  const art = OD.introArt, clamp01 = K.clamp01;
  // a pickup drawn as the game draws it: a ring for timed ones, a tilted diamond for charges, a spiked ring for instant ones, a hexagon for perks
  function pickup(F, type, x, y, k = 1, spin = 0) {
    const g = F.g, u = F.u, P = OD.POWERS[type], cat = P.cat; if (k <= 0) return;
    g.save(); g.globalAlpha = clamp01(k); glowAt(F, x, y, 44 * k, P.color, 0.8);
    g.translate(x, y); g.scale(k, k);
    g.fillStyle = 'rgba(8,10,24,0.92)'; g.strokeStyle = P.color; g.lineWidth = 2.6;
    if (cat === 'charge') { g.save(); g.rotate(Math.PI / 4); g.beginPath(); g.roundRect(-16 * u, -16 * u, 32 * u, 32 * u, 5 * u); g.fill(); g.stroke(); g.restore(); }
    else if (cat === 'perk') { g.save(); g.rotate(spin * 0.5); g.beginPath(); for (let i = 0; i < 6; i++) { const a = i * TAU / 6; g.lineTo(Math.cos(a) * 22 * u, Math.sin(a) * 22 * u); } g.closePath(); g.fill(); g.stroke(); g.restore(); }
    else { g.beginPath(); g.arc(0, 0, 18 * u, 0, TAU); g.fill(); g.stroke();
      if (cat === 'instant') for (let j = 0; j < 8; j++) { const a = j * TAU / 8 + spin, r0 = 23 * u, r1 = (28 + 3 * Math.sin(spin * 6 + j)) * u; g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); g.stroke(); } }
    OD.game.drawPowerIcon(g, type, 0, 0, 14 * u, P.color); g.restore();
  }
  const rk = (F, ring, a, s = 11, rot = 0, al = 1) => { const [x, y] = F.p(ring, a); rock(F, x, y, s, rot, al); return [x, y]; };
  const nearHero = (P, x, y) => Math.hypot(P.x - x, P.y - y);

  // each effect: (F, X) with X = { tt, e (seconds since pickup, negative before), H (the dot, with .at(x)), P (where it is now), col, tc }
  const FX = {
    shield(F, X) { const { e, H, col } = X, m = 2.4, ar = H.at(X.tc + m).a;
      if (e < m) { rk(F, 1, ar, 12, X.tt); if (e > 0) { F.g.save(); F.g.strokeStyle = col; F.g.lineWidth = 3; F.g.shadowBlur = 0; F.g.globalAlpha = 0.9; F.g.beginPath(); F.g.arc(X.P.x, X.P.y, 16 * F.u, 0, TAU); F.g.stroke(); F.g.fillStyle = col + '33'; F.g.fill(); F.g.restore(); } }
      else { const [x, y] = F.p(1, ar); burst(F, x, y, col, (e - m) / 0.7, 50, 10); pop(F, x, y - 8 * F.u, 'BLOCKED', col, (e - m) / 1.2, 14); } },
    slow(F, X) { const { e, col, H } = X; if (e > 0 && e < 5.4) { F.g.save(); F.g.fillStyle = `rgba(255,217,90,${0.07 * ss(0, 0.4, e) * (1 - ss(5, 5.4, e))})`; F.g.fillRect(0, 0, F.w, F.h); F.g.restore();
        F.g.save(); F.g.strokeStyle = col; F.g.lineWidth = 3; F.g.lineCap = 'round'; F.g.beginPath(); F.g.arc(X.P.x, X.P.y, 17 * F.u, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - e / 5.4)); F.g.stroke(); F.g.restore(); }
      for (let i = 0; i < 3; i++) { const rate = e > 0 && e < 5.4 ? 0.12 : 0.55, base = 1.0 + i * 2.1, a = base + H.K * 0.5 * (rate * 0 + 0) + X.tt * (rate * H.K) * 0.5 * (i % 2 ? -1 : 1) ; const [x, y] = rk(F, 1 + (i % 2) * 0.0 + (i === 1 ? 1 : 0), a, 11, X.tt * rate); } },
    magnet(F, X) { const { e, P, col, H } = X;
      for (let i = 0; i < 14; i++) { const ring = i % 3, a = i * 0.9 + 0.4, [bx, by] = F.p(ring, a); let ti = -1;
        for (let s2 = X.tc; s2 < X.tc + 5.6; s2 += 0.06) { const q = H.at(s2); if (Math.hypot(q.x - bx, q.y - by) < 80 * F.u) { ti = s2; break; } }
        const f = ti < 0 || X.tt < ti ? 0 : (X.tt - ti) / 0.45;
        if (f <= 0) dustStar(F, bx, by, 1, X.tt + i); else if (f < 1) dustStar(F, lerp(bx, P.x, f * f), lerp(by, P.y, f * f), 1 - f * 0.4, X.tt * 2 + i); else pop(F, P.x, P.y, '+10', GOLD, (f - 1) * 0.45 / 0.8, 11); }
      if (e > 0 && e < 6.5) { F.g.save(); F.g.strokeStyle = col; F.g.globalAlpha = 0.5; F.g.setLineDash([4 * F.u, 6 * F.u]); F.g.lineDashOffset = -X.tt * 20; F.g.beginPath(); F.g.arc(P.x, P.y, 80 * F.u, 0, TAU); F.g.stroke(); F.g.restore(); } },
    phase(F, X) { const { e, H } = X, ar = H.at(X.tc + 2.3).a; rk(F, 1, ar, 12, X.tt); if (e > 0) { F.g.save(); F.g.strokeStyle = X.col; F.g.setLineDash([4 * F.u, 5 * F.u]); F.g.lineWidth = 2; F.g.beginPath(); F.g.arc(X.P.x, X.P.y, 14 * F.u, X.tt * 4, X.tt * 4 + TAU); F.g.stroke(); F.g.restore(); } if (e > 1.8 && e < 3.4) pop(F, X.P.x, X.P.y, 'THROUGH!', X.col, (e - 1.8) / 1.6, 13); },
    bomb(F, X) { const { e, P } = X, m = 0.5, rocks = [[1, 0.9], [2, 2.0], [1, 3.2], [2, 4.4], [0, 5.5]];
      rocks.forEach(([r, a], i) => { const [x, y] = F.p(r, a), d = nearHero(X.P0, x, y), tk = m + d / (F.u * 300); if (e < tk) rock(F, x, y, 11, X.tt + i); else { burst(F, x, y, '#ff9a3d', (e - tk) / 0.5, 28, 7); pop(F, x, y, '+50', GOLD, (e - tk) / 1.0, 11); } });
      if (e > m && e < m + 1.1) { const k = (e - m) / 1.1; F.g.save(); F.g.strokeStyle = '#ffb36b'; F.g.lineWidth = 6 * F.u * (1 - k); F.g.globalAlpha = 1 - k * 0.6; F.g.beginPath(); F.g.arc(X.P0.x, X.P0.y, 300 * F.u * k * k * 0.8 + 10, 0, TAU); F.g.stroke(); F.g.restore(); glowAt(F, X.P0.x, X.P0.y, 90 * (1 - k), '#ff9a3d', 0.7); } },
    double(F, X) { const { e, H, P } = X; for (let i = 0; i < 4; i++) { const mi = X.tc + 1.0 + i * 0.7, [x, y] = F.p(1, H.at(mi).a); if (X.tt < mi) dustStar(F, x, y, 1, X.tt * 2); else { burst(F, x, y, '#ffe45a', (X.tt - mi) / 0.4, 20, 6); pop(F, x, y, '+10 ×2', '#ffe45a', (X.tt - mi) / 1.0, 12); } }
      if (e > 0 && e < 8) { F.g.save(); font(F.g, 13 * F.u); F.g.fillStyle = '#ffe45a'; F.g.fillText('SCORE ×2', F.cx, F.h * 0.1); F.g.strokeStyle = '#ffe45a'; F.g.lineWidth = 3; F.g.lineCap = 'round'; F.g.beginPath(); F.g.arc(F.cx - 62 * F.u, F.h * 0.1, 8 * F.u, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - e / 5.6)); F.g.stroke(); F.g.restore(); } },
    zap(F, X) { const { e, H, P, col } = X;
      [[1.7, 2.3], [3.9, 4.5]].forEach(([tz, tm], i) => { const ar = H.at(X.tc + tm).a, [x, y] = F.p(1, ar);
        if (e < tz) { rock(F, x, y, 12, X.tt + i); if (e > tz - 0.8) { F.g.save(); F.g.strokeStyle = 'rgba(255,255,255,0.5)'; F.g.lineWidth = 2; F.g.setLineDash([3, 5]); F.g.beginPath(); F.g.arc(x, y, (18 + 12 * (tz - e)) * F.u, 0, TAU); F.g.stroke(); F.g.restore(); } }
        else { const k = (e - tz) / 0.35; if (k < 1) { const sx = P.x, sy = P.y; F.g.save(); F.g.globalCompositeOperation = 'lighter'; F.g.strokeStyle = col; F.g.globalAlpha = 1 - k; F.g.lineWidth = 3.4 * F.u; F.g.lineJoin = 'round'; F.g.beginPath(); F.g.moveTo(sx, sy); for (let j = 1; j < 7; j++) F.g.lineTo(lerp(sx, x, j / 7) + Math.sin(j * 7 + e * 50) * 7 * F.u, lerp(sy, y, j / 7) + Math.cos(j * 5 + e * 50) * 7 * F.u); F.g.lineTo(x, y); F.g.stroke(); F.g.restore(); } burst(F, x, y, col, (e - tz) / 0.6, 36, 8); pop(F, x, y, 'ZAPPED', col, (e - tz) / 1.1, 12); } }); },
    brake(F, X) { const { e, P, col } = X; for (let i = 0; i < 4; i++) { const a = (X.tt * 1.1 + i * 1.6) % TAU, [x, y] = F.p(i % 2 ? 2 : 0, a + 0.0); rock(F, x, y, 10, X.tt + i, 0.85); }
      if (e > 0 && e < 6) { F.g.save(); F.g.strokeStyle = col; F.g.lineWidth = 2.4; F.g.globalAlpha = 0.8; F.g.beginPath(); F.g.arc(P.x, P.y, 15 * F.u, 0, TAU); F.g.stroke(); F.g.fillStyle = col; F.g.fillRect(P.x - 4 * F.u, P.y - 24 * F.u, 3 * F.u, 10 * F.u); F.g.fillRect(P.x + 1 * F.u, P.y - 24 * F.u, 3 * F.u, 10 * F.u); F.g.restore(); } },
    life(F, X) { const { e, H, P, col } = X, m = 2.4, ar = H.at(X.tc + m).a, [x, y] = F.p(1, ar);
      if (e < m) { rk(F, 1, ar, 13, X.tt); if (e > 0) { F.g.save(); F.g.fillStyle = col; font(F.g, 15 * F.u); F.g.fillText('♥', P.x, P.y - 22 * F.u); F.g.restore(); } }
      else { burst(F, x, y, col, (e - m) / 0.9, 80, 12); pop(F, x, y - 10 * F.u, 'SECOND CHANCE', col, (e - m) / 1.4, 13); } },
    overload(F, X) { const { e, P } = X, H = X.H; for (const [i, mi] of [1.0, 1.8, 2.6, 3.4].entries()) { const [x, y] = F.p(1, H.at(X.tc + mi).a); if (e < mi) rock(F, x, y, 12, X.tt + i); else burst(F, x, y, '#fff6c8', (e - mi) / 0.5, 30, 8); }
      if (e > 0 && e < 5) { glowAt(F, P.x, P.y, 30 * ss(0, 0.3, e) * (1 - ss(4.2, 5, e)), '#fff2b0', 0.9); F.g.save(); F.g.strokeStyle = 'rgba(255,255,255,0.85)'; F.g.setLineDash([5 * F.u, 7 * F.u]); F.g.lineDashOffset = -X.tt * 30; F.g.lineWidth = 2; F.g.beginPath(); F.g.arc(P.x, P.y, 15 * F.u, 0, TAU); F.g.stroke(); F.g.restore(); } },
    reaper(F, X) { const { e, P, H, col } = X; [1.2, 2.5, 3.8].forEach((mi, i) => { const [x, y] = F.p(1, H.at(X.tc + mi + 0.3).a); if (e < mi) rock(F, x, y, 11, X.tt + i); else { burst(F, x, y, col, (e - mi) / 0.45, 26, 7); pop(F, x, y, '+30', GOLD, (e - mi) / 1.0, 11); } });
      if (e > 0 && e < 6) { F.g.save(); F.g.strokeStyle = col; F.g.setLineDash([5 * F.u, 5 * F.u]); F.g.lineDashOffset = -X.tt * 40; F.g.lineWidth = 2; F.g.beginPath(); F.g.arc(P.x, P.y, 26 * F.u, 0, TAU); F.g.stroke(); F.g.restore(); glowAt(F, P.x, P.y, 34, col, 0.25); } },
    amp(F, X) { const { e, col } = X, v = e > 0 ? 2.0 : 1.0, pw = 150 * F.u, ph = 40 * F.u, x0 = F.cx - pw / 2, y0 = F.h * 0.08;
      F.g.save(); F.g.beginPath(); F.g.roundRect(x0, y0, pw, ph, ph / 2); F.g.fillStyle = 'rgba(6,10,30,0.75)'; F.g.fill(); F.g.save(); F.g.clip(); F.g.fillStyle = e > 0 ? col + '77' : 'rgba(179,107,255,0.45)'; F.g.fillRect(x0, y0, pw * (e > 0 ? 1 : Math.max(0, 0.5 - mod(X.tt, 1) * 0.5)), ph); F.g.restore(); F.g.beginPath(); F.g.roundRect(x0, y0, pw, ph, ph / 2); F.g.strokeStyle = e > 0 ? col : 'rgba(255,255,255,0.25)'; F.g.lineWidth = 2; F.g.stroke();
      font(F.g, 20 * F.u * (e > 0 && e < 0.4 ? 1.2 : 1)); F.g.fillStyle = '#fff'; F.g.fillText('×' + v.toFixed(1), F.cx, y0 + ph / 2 + 1); F.g.restore();
      if (e > 0 && e < 6) pop(F, F.cx, y0 + ph + 38 * F.u, 'NO DRAIN', col, e / 6, 12); if (e > 0) { F.g.save(); F.g.fillStyle = col; F.g.globalAlpha = 0.9 - ss(0, 1.4, e) * 0.5; const ay = X.P.y - 22 * F.u - (e % 1.2) * 14 * F.u; F.g.beginPath(); F.g.moveTo(X.P.x, ay - 7 * F.u); F.g.lineTo(X.P.x - 6 * F.u, ay + 1 * F.u); F.g.lineTo(X.P.x + 6 * F.u, ay + 1 * F.u); F.g.closePath(); F.g.fill(); F.g.restore(); } },
    alchemy(F, X) { const { e, P, H } = X, rocks = [[1, 0.8], [2, 1.9], [0, 3.1], [1, 4.4], [2, 5.4]];
      rocks.forEach(([r, a], i) => { const [x, y] = F.p(r, a), d = nearHero(X.P0, x, y), tk = 0.5 + d / (F.u * 260), got = X.tt > X.tc + 1.0 + i * 0.5 + 0.8;
        if (e < tk) rock(F, x, y, 11, X.tt + i); else if (!got) { const k = ss(tk, tk + 0.5, e); dustStar(F, x, y, k, X.tt * 2); if (k < 1) rock(F, x, y, 11 * (1 - k), X.tt, 1 - k); } else pop(F, x, y, '+10', GOLD, (X.tt - (X.tc + 1.8 + i * 0.5)) / 0.8, 11); });
      if (e > 0.4 && e < 1.6) { const k = (e - 0.4) / 1.2; F.g.save(); F.g.strokeStyle = '#e08aff'; F.g.globalAlpha = 1 - k; F.g.lineWidth = 4 * F.u; F.g.beginPath(); F.g.arc(X.P0.x, X.P0.y, 260 * F.u * k, 0, TAU); F.g.stroke(); F.g.restore(); } },
    prism(F, X) { const { e, P, H } = X; if (e > 0) { const g = F.g; g.save(); g.lineWidth = 2.4; g.setLineDash([4 * F.u, 5 * F.u]); const cols = ['#ff7a9a', '#ffd95a', '#7affc4', '#7ab8ff']; cols.forEach((c, i) => { g.strokeStyle = c; g.globalAlpha = 0.8; g.beginPath(); g.arc(P.x, P.y, (24 + i * 1.6) * F.u, X.tt * 0.8 + i, X.tt * 0.8 + i + 1.4); g.stroke(); }); g.restore(); }
      const mi = X.tc + 2.4, [x, y] = F.p(1.5, H.at(mi).a); rock(F, x, y, 11, X.tt); if (X.tt > mi - 0.3 && X.tt < mi + 1.3) pop(F, x, y, 'GRAZE +40', '#a0b8ff', (X.tt - mi + 0.3) / 1.6, 13); },
    fortune(F, X) { const { e, H } = X; for (let i = 0; i < 4; i++) { const mi = X.tc + 1.0 + i * 0.8, [x, y] = F.p(1, H.at(mi).a); if (X.tt < mi) dustStar(F, x, y, 1.15, X.tt * 2 + i); else { burst(F, x, y, '#ffc247', (X.tt - mi) / 0.45, 26, 7); pop(F, x, y, '+30  ×3', '#ffc247', (X.tt - mi) / 1.0, 13); } } if (e > 0 && e < 6) glowAt(F, X.P.x, X.P.y, 30, '#ffc247', 0.35); },
    boost(F, X) { const { e, P, col } = X; const n = e < 0 ? 3 : e < 1.2 ? 3 : e < 2.6 ? 2 : e < 4.0 ? 1 : 0; if (e > 0) { F.g.save(); font(F.g, 15 * F.u); F.g.fillStyle = col; F.g.fillText('×' + n, F.cx, F.h * 0.1); F.g.restore(); }
      for (const [bm, i] of [[1.3, 0], [2.7, 1], [4.1, 2]]) { const q = (e - bm) / 0.7; if (q > 0 && q < 1) { const a = X.H.at(X.tc + bm).a; F.g.save(); F.g.strokeStyle = col; F.g.lineWidth = 3; F.g.lineCap = 'round'; F.g.globalAlpha = 1 - q; for (let k = 0; k < 4; k++) { const [x1, y1] = F.p(1 + (k - 1.5) * 0.18, a - 0.9 * q - k * 0.05); F.g.beginPath(); F.g.moveTo(x1, y1); F.g.lineTo(x1 + Math.cos(a - 1.57) * 22 * F.u, y1 + Math.sin(a - 1.57) * 22 * F.u); F.g.stroke(); } F.g.restore(); pop(F, P.x, P.y, 'BOOSTED', col, q, 12); } } },
    jackpot(F, X) { const { e } = X; if (e > 0) { for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + r * 0.4, [x, y] = F.p(r, a), s = ss(0.1 + 0.03 * i, 0.8, e), got = X.tt > X.tc + 2.0 + r * 1.2 + i * 0.12; if (!got) dustStar(F, x, y, s, X.tt + i); } pop(F, F.cx, F.cy - F.R[2] - 2 * F.u, 'JACKPOT  +500', '#ffe9a0', e / 2.4, 15); burst(F, X.P0.x, X.P0.y, '#ffe9a0', e / 0.9, 90, 14); } },
    pulse(F, X) { const { e } = X, rocks = [[1, 0.3, 0], [1, 1.3, 0], [2, 2.0, 0], [2, 3.5, 0], [0, 4.4, 0]];
      rocks.forEach(([r, a], i) => { const [x, y] = F.p(r, a), d = nearHero(X.P0, x, y); for (const tp of [0.8, 2.6]) { } if (d < 80 * F.u && e > 0.8) { burst(F, x, y, '#6ad8ff', (e - 0.8 - d / (F.u * 260)) / 0.5, 26, 7); if (e - 0.8 < d / (F.u * 260)) rock(F, x, y, 11, X.tt + i); } else rock(F, x, y, 11, X.tt + i); });
      for (const tp of [0.8]) { const k = (e - tp) / 1.0; if (k > 0 && k < 1) { F.g.save(); F.g.strokeStyle = '#6ad8ff'; F.g.globalAlpha = 1 - k; F.g.lineWidth = 4 * F.u * (1 - k) + 1; F.g.beginPath(); F.g.arc(X.P0.x, X.P0.y, 85 * F.u * k, 0, TAU); F.g.stroke(); F.g.restore(); } } },
    surge(F, X) { const { e, H, P, col } = X; if (e > 0 && e < 3.5) { for (let i = 0; i < 18; i++) { const tj = X.tt - 0.18 * i, p = H.at(tj); if (tj > X.tc) { F.g.save(); F.g.globalAlpha = 1 - i / 18; dustStar(F, p.x, p.y, 0.7, i); F.g.restore(); } } F.g.save(); F.g.strokeStyle = col; F.g.lineWidth = 2.4; F.g.globalAlpha = 0.8; for (let k = 0; k < 3; k++) { const px = P.x - 14 * F.u - k * 8 * F.u, py = P.y; F.g.beginPath(); F.g.moveTo(px, py - 8 * F.u); F.g.lineTo(px - 8 * F.u, py); F.g.lineTo(px, py + 8 * F.u); F.g.stroke(); } F.g.restore(); glowAt(F, P.x, P.y, 34, col, 0.5); }
      const [x, y] = F.p(1, H.at(X.tc + 2.0).a); if (X.tt < X.tc + 2.0) rock(F, x, y, 12, X.tt); else if (X.tt < X.tc + 2.5) burst(F, x, y, col, (X.tt - X.tc - 2.0) / 0.5, 30, 7); },
    wingman(F, X) { const { e, H, col } = X; if (e > 0) { const m = 3.6, alive = e < m, pts = []; for (let j = 0; j < 22; j++) { const s = H.at(X.tt - j * 0.032); pts.push({ x: 2 * F.cx - s.x, y: 2 * F.cy - s.y }); }
        if (alive) { OD.gfx.drawTrail(F.g, pts, 'classic', col, 0, 5 * F.u); glowAt(F, pts[0].x, pts[0].y, 17, col, 1); F.g.fillStyle = '#fff'; F.g.beginPath(); F.g.arc(pts[0].x, pts[0].y, 3.8 * F.u, 0, TAU); F.g.fill(); }
        const hp = H.at(X.tc + m), wx = 2 * F.cx - hp.x, wy = 2 * F.cy - hp.y; if (e < m + 0.1) rk(F, 1, Math.atan2(wy - F.cy, wx - F.cx), 12, X.tt); else { burst(F, wx, wy, col, (e - m) / 0.8, 56, 10); pop(F, wx, wy, 'TOOK THE HIT', col, (e - m) / 1.3, 12); } } },
    stasis(F, X) { const { e, col } = X, froze = e > 0.3; for (let i = 0; i < 5; i++) { const r = i % 3, base = 0.7 + i * 1.25, sp = i % 2 ? -0.45 : 0.45, a = froze ? base + sp * (X.tc + 0.3) : base + sp * X.tt, [x, y] = F.p(r, a);
        if (froze && e > 0.3) { glowAt(F, x, y, 24 * ss(0.3, 0.9, e), col, 0.5); } rock(F, x, y, 11, froze ? 0.3 * i : X.tt * 0.8, 1); if (froze) { F.g.save(); F.g.strokeStyle = 'rgba(200,240,255,' + 0.8 * ss(0.3, 0.9, e) + ')'; F.g.lineWidth = 1.6; F.g.beginPath(); for (let k = 0; k < 6; k++) { const aa = k * TAU / 6 + 0.2; F.g.moveTo(x, y); F.g.lineTo(x + Math.cos(aa) * 17 * F.u, y + Math.sin(aa) * 17 * F.u); } F.g.stroke(); F.g.restore(); } }
      if (e > 1 && e < 5) pop(F, X.P.x, X.P.y, 'GRAZE ×2', col, (mod(e - 1, 1.7)) / 1.7, 12); },
    vortex(F, X) { const { e, col } = X, [wx, wy] = [X.P0.x, X.P0.y]; if (e > 0.1 && e < 6.1) { const k = ss(0.1, 0.7, e) * (1 - ss(5.5, 6.1, e)); glowAt(F, wx, wy, 80 * k, '#8a3dff', 0.55); for (let i = 0; i < 3; i++) { const aa = X.tt * 2.6 + i * TAU / 3; F.g.strokeStyle = 'rgba(210,170,255,0.7)'; F.g.lineWidth = 2; F.g.beginPath(); F.g.arc(wx, wy, (12 + i * 7) * F.u * k, aa, aa + 1.7); F.g.stroke(); } F.g.fillStyle = '#000'; F.g.beginPath(); F.g.arc(wx, wy, 9 * F.u * k, 0, TAU); F.g.fill(); }
      for (let i = 0; i < 4; i++) { const [bx, by] = F.p(i % 3, 0.9 + i * 1.5), tk = 0.8 + i * 0.6 + Math.hypot(bx - wx, by - wy) / (F.u * 160), q = clamp01((e - 0.6 - i * 0.2) / (tk - i * 0.2)); if (e < 0.4) { i % 2 ? rock(F, bx, by, 11, X.tt) : dustStar(F, bx, by, 1, X.tt); } else if (q < 1) { const s = 1 - q * q, x = lerp(bx, wx, q * q), y = lerp(by, wy, q * q); i % 2 ? rock(F, x, y, 11 * s, X.tt * 3, s) : dustStar(F, x, y, s, X.tt * 4); } } },
    aegis(F, X) { const { e, H, col } = X, m = 2.5, ar = H.at(X.tc + m).a, [x, y] = F.p(1, ar), others = [[2, ar + 0.5], [0, ar - 0.7], [2, ar - 0.9]];
      if (e < m) { rk(F, 1, ar, 13, X.tt); others.forEach(([r, a], i) => rk(F, r, a, 10, X.tt + i)); if (e > 0) { F.g.save(); F.g.strokeStyle = col; F.g.lineWidth = 2.6; F.g.beginPath(); F.g.arc(X.P.x, X.P.y, 17 * F.u, 0, TAU); F.g.stroke(); for (let k = 0; k < 8; k++) { const a = k * TAU / 8 + X.tt; F.g.beginPath(); F.g.moveTo(X.P.x + Math.cos(a) * 20 * F.u, X.P.y + Math.sin(a) * 20 * F.u); F.g.lineTo(X.P.x + Math.cos(a) * 26 * F.u, X.P.y + Math.sin(a) * 26 * F.u); F.g.stroke(); } F.g.restore(); } }
      else { burst(F, x, y, col, (e - m) / 1.0, 140, 14); glowAt(F, x, y, 100 * (1 - clamp01((e - m) / 0.8)), col, 0.6); pop(F, x, y - 12 * F.u, 'BLOCKED + CLEARED', col, (e - m) / 1.4, 12); } },
    calm(F, X) { const { e, col } = X; for (let i = 0; i < 3; i++) { const sp = 0.5 * (i % 2 ? -1 : 1), base = 0.8 + i * 2.2, slow = e > 0 ? 0.94 : 1, a = base + sp * (e > 0 ? X.tc + (X.tt - X.tc) * slow : X.tt), [x, y] = F.p(i, a), ga = base + sp * X.tt, [gx, gy] = F.p(i, ga);
        if (e > 0 && Math.hypot(gx - x, gy - y) > 5 * F.u) { F.g.save(); F.g.globalAlpha = 0.28; rock(F, gx, gy, 11, X.tt); F.g.restore(); } rock(F, x, y, 11, X.tt * 0.8); } if (e > 0) chip(F, 'HAZARDS 6% SLOWER', col, F.h * 0.1); },
    sense(F, X) { const { e, P, col } = X; for (let i = 0; i < 12; i++) { const a = i * 1.1 + 0.3, ring = i % 3, [bx, by] = F.p(ring, a), d = nearHero(X.P0, bx, by), lean = e > 0 ? ss(70 * F.u, 20 * F.u, d) : 0, x = lerp(bx, X.P0.x, lean * 0.45), y = lerp(by, X.P0.y, lean * 0.45); dustStar(F, x, y, 1, X.tt + i); }
      if (e > 0) { F.g.save(); F.g.strokeStyle = col; F.g.globalAlpha = 0.5; F.g.setLineDash([3 * F.u, 6 * F.u]); F.g.beginPath(); F.g.arc(X.P0.x, X.P0.y, 70 * F.u, 0, TAU); F.g.stroke(); F.g.restore(); } },
    daredevil(F, X) { const { e, P, H, col } = X; const rr = (e > 0 ? 34 : 22) * F.u; F.g.save(); F.g.strokeStyle = e > 0 ? col : 'rgba(255,255,255,0.3)'; F.g.setLineDash([4 * F.u, 5 * F.u]); F.g.lineWidth = 2; F.g.beginPath(); F.g.arc(X.P0.x, X.P0.y, rr, X.tt, X.tt + TAU); F.g.stroke(); F.g.restore();
      for (const mi of [1.4, 3.6, 5.4]) { const [x, y] = F.p(1.5, H.at(mi).a); rock(F, x, y, 11, X.tt); if (X.tt > mi - 0.2 && X.tt < mi + 1.2) pop(F, x, y, e > 0 ? 'GRAZE +25%' : 'GRAZE', e > 0 ? col : GOLD, (X.tt - mi + 0.2) / 1.4, 12); } },
    lucky_star(F, X) { const { e } = X, types = ['slow', 'shield', 'magnet', 'bomb']; if (e > 0) types.forEach((ty, i) => { const mi = 0.6 + i * 1.3, [x, y] = F.p(i % 3, 1 + i * 1.5), k = ss(mi, mi + 0.5, e) * (1 - ss(mi + 1.8, mi + 2.2, e)); if (k > 0) { pickup(F, ty, x, y, 0.9 * k, X.tt); burst(F, x, y, '#9dff8a', (e - mi) / 0.7, 30, 6); } }); if (e > 0) chip(F, 'POWER-UPS COME MORE OFTEN', X.col, F.h * 0.1); },
    momentum(F, X) { const { e, col } = X, bar = (x0, y0, k, lab, c) => { const pw = 120 * F.u, ph = 22 * F.u; F.g.save(); F.g.beginPath(); F.g.roundRect(x0, y0, pw, ph, ph / 2); F.g.fillStyle = 'rgba(6,10,30,0.75)'; F.g.fill(); F.g.save(); F.g.clip(); F.g.fillStyle = c; F.g.fillRect(x0, y0, pw * k, ph); F.g.restore(); F.g.beginPath(); F.g.roundRect(x0, y0, pw, ph, ph / 2); F.g.strokeStyle = 'rgba(255,255,255,0.3)'; F.g.lineWidth = 1.5; F.g.stroke(); font(F.g, 10 * F.u, 700); F.g.fillStyle = '#fff'; F.g.fillText(lab, x0 + pw / 2, y0 + ph / 2 + 1); F.g.restore(); };
      const cyc = mod(X.tt - X.tc, 5.6), k1 = 1 - cyc / 5.6 * 1.0, k2 = 1 - cyc / 5.6 * 0.75;
      if (e > 0) { bar(F.cx - 60 * F.u, F.h * 0.07, Math.max(0, k1), 'MULTIPLIER DRAIN', 'rgba(179,107,255,0.45)'); bar(F.cx - 60 * F.u, F.h * 0.07 + 30 * F.u, Math.max(0, k2), 'WITH MOMENTUM', col + '88'); } },
  };
  FX.wingman = FX.wingman; FX.twin = FX.wingman;
  // the same picture for every power-up: it floats on the orbit, the dot collects it, and then you see what it does
  function powerCard(id, cap) {
    return (g, w, h, t) => {
      const F = stage(g, w, h, t), tt = F.tt, P = OD.POWERS[id === 'wingman' ? 'twin' : id], tc = 2.4, plan = [[0, 1]], H = hero(F, plan, { hidden: true }), e = tt - tc;
      const pa = H.at(tc).a, [px, py] = F.p(1, pa), P0 = H.at(tt);
      if (tt < tc) pickup(F, id === 'wingman' ? 'twin' : id, px, py + Math.sin(tt * 3) * 1.5 * F.u, ss(0, 0.6, tt), tt);
      else { burst(F, px, py, P.color, e / 0.7, 44, 10); }
      const X = { tt, e, tc, H, P: P0, P0, col: P.color };
      try { FX[id] && FX[id](F, X); } catch (err) { /* art is optional */ }
      const plus = e > 0 && e < 0.5 ? 1 : 0;
      hero(F, plan, { col: id === 'phase' && e > 0 ? '#7affc4' : id === 'overload' && e > 0 && e < 5 ? '#fff6c8' : A, alpha: id === 'phase' && e > 0 && e < 4 ? 0.6 : 1 });
      if (id === 'wingman' && e > 0) { /* drawn in the effect */ }
      chip(F, cap); vignette(F);
    };
  }
  const caps = {
    shield: 'THE NEXT HIT IS BLOCKED', slow: 'THE WORLD SLOWS DOWN', magnet: 'STARDUST FLIES TO YOU', phase: 'DEBRIS CANNOT HURT YOU', bomb: 'THE WHOLE FIELD BLOWS UP', double: 'ALL POINTS ARE DOUBLED',
    zap: 'DESTROYS WHAT WOULD KILL YOU', brake: 'ONLY YOU SLOW DOWN', life: 'A SECOND CHANCE', overload: 'INSTANT NOVA', reaper: 'THE AURA DESTROYS DEBRIS', amp: 'MULTIPLIER +1 AND HELD', alchemy: 'HAZARDS BECOME STARDUST',
    prism: 'WIDER GRAZES, DOUBLE POINTS', fortune: 'STARDUST IS WORTH TRIPLE', boost: 'YOUR NEXT JUMPS ARE BOOSTED', jackpot: 'A BURST OF STARDUST', pulse: 'DESTROYS EVERYTHING NEAR YOU', surge: 'DASH THROUGH EVERYTHING',
    wingman: 'A SECOND DOT TAKES A HIT FOR YOU', stasis: 'THE FIELD FREEZES', vortex: 'A GRAVITY WELL EATS HAZARDS', aegis: 'BLOCKS A HIT AND CLEARS THE AREA', calm: 'HAZARDS DRIFT SLOWER', sense: 'STARDUST LEANS TOWARDS YOU',
    daredevil: 'A BIGGER GRAZE ZONE', lucky_star: 'MORE POWER-UPS', momentum: 'THE MULTIPLIER LASTS LONGER',
  };
  for (const id of Object.keys(caps)) art[id] = powerCard(id, caps[id]);
  // the four kinds of power-up: three of a kind float on the orbits; the dot collects them and they join the stack at the bottom left
  function catCard(cat, ids, how) {
    return (g, w, h, t) => {
      const F = stage(g, w, h, t), tt = F.tt, plan = [[0, 1]], H = hero(F, plan), tcs = [1.6, 3.4, 5.2];
      ids.forEach((id, i) => { const a = H.at(tcs[i]).a, [x, y] = F.p(1, a); if (tt < tcs[i]) pickup(F, id, x, y + Math.sin(tt * 3 + i) * 1.5 * F.u, 0.85 * ss(0.1 * i, 0.6 + 0.1 * i, tt), tt); else if (tt < tcs[i] + 0.7) burst(F, x, y, OD.POWERS[id].color, (tt - tcs[i]) / 0.7, 40, 9); });
      // the stack in the corner
      const sx = 26 * F.u, sy = F.h - 30 * F.u - 30 * F.u;
      ids.forEach((id, i) => { if (tt < tcs[i] + 0.5 && !(cat === 'instant')) return; const P = OD.POWERS[id], y = sy - i * 34 * F.u, k = ss(tcs[i], tcs[i] + 0.5, tt), g2 = F.g; if (cat === 'instant') return;
        g2.save(); g2.globalAlpha = k; g2.translate(sx, y); g2.fillStyle = 'rgba(8,10,24,0.9)'; g2.strokeStyle = P.color; g2.lineWidth = 2; g2.beginPath(); g2.arc(0, 0, 13 * F.u, 0, TAU); g2.fill(); g2.stroke(); OD.game.drawPowerIcon(g2, id, 0, 0, 9 * F.u, P.color);
        if (cat === 'timed') { const f = 1 - clamp01((tt - tcs[i]) / 5.5); g2.strokeStyle = P.color; g2.lineWidth = 3; g2.lineCap = 'round'; g2.beginPath(); g2.arc(0, 0, 17 * F.u, -Math.PI / 2, -Math.PI / 2 + TAU * f); g2.stroke(); font(g2, 10 * F.u, 700); g2.fillStyle = '#fff'; g2.textAlign = 'left'; g2.fillText(Math.max(0, Math.ceil(5 * f)) + 's', 24 * F.u, 1); }
        else if (cat === 'charge') { font(g2, 11 * F.u, 800); g2.fillStyle = '#fff'; g2.textAlign = 'left'; g2.fillText('×' + (1 + (i % 2)), 24 * F.u, 1); }
        else if (cat === 'perk') { g2.fillStyle = P.color; for (let j = 0; j <= i % 2; j++) { g2.beginPath(); g2.arc(24 * F.u + j * 8 * F.u, 0, 2.6 * F.u, 0, TAU); g2.fill(); } }
        g2.restore(); });
      if (cat === 'instant' && tt > tcs[0]) { const last = tcs.filter(c => tt > c).length - 1; pop(F, F.cx, F.cy, ['BOOM', 'GLITTER', 'PULSE'][last], OD.POWERS[ids[last]].color, (tt - tcs[last]) / 1.2, 18); }
      chip(F, how); vignette(F);
    };
  }
  art.cat_timed = catCard('timed', ['slow', 'magnet', 'double'], 'THE RING EMPTIES: TIME LEFT');
  art.cat_charge = catCard('charge', ['shield', 'life', 'zap'], 'STORED UNTIL YOU NEED IT');
  art.cat_instant = catCard('instant', ['bomb', 'jackpot', 'pulse'], 'FIRES THE MOMENT YOU TOUCH IT');
  art.cat_perk = catCard('perk', ['calm', 'lucky_star', 'momentum'], 'LASTS THE WHOLE RUN, STACKS 3 TIMES');
  OD.introKit.pickup = pickup;
})();

// ================================================================== planet types, cosmic events and the black hole
(() => {
  const K = OD.introKit, { TAU, A, D, GOLD, LOOP, lerp, ss, mod, stage, vignette, hero, rock, glowAt, pop, burst, chip, font } = K;
  const art = OD.introArt, clamp01 = K.clamp01;
  // a planet type: the home planet changes into it, the sky takes its colour and its weather starts
  function eraCard(skin, tint, fx, cap) {
    return (g, w, h, t) => {
      const F = stage(g, w, h, t, { noPlanet: true }), tt = F.tt, plan = [[0, 1], [3.2, 2], [4.8, 1], [6.4, 0], [7.4, 1]];
      const m = ss(0.4, 2.4, tt) * (1 - 0 * ss(7.4, 8, tt));
      g.save(); g.fillStyle = OD.rgba(tint, 0.16 * m); g.fillRect(0, 0, w, h); g.restore();
      if (fx === 'eclipse') { const gr = g.createRadialGradient(F.cx, F.cy, 10 * F.u, F.cx, F.cy, 150 * F.u); gr.addColorStop(0, 'rgba(60,20,120,0.5)'); gr.addColorStop(1, 'rgba(2,3,12,0)'); g.fillStyle = gr; g.globalAlpha = m; g.fillRect(0, 0, w, h); g.globalAlpha = 1; }
      OD.gfx.drawPlanet(g, F.cx, F.cy, 20 * F.u, 'terra', t, tint, 1);
      if (m > 0.01) { g.save(); g.beginPath(); g.arc(F.cx, F.cy, 23 * F.u * m, 0, TAU); g.clip(); OD.gfx.drawPlanet(g, F.cx, F.cy, 20 * F.u, skin, t, tint, 1); g.restore(); }
      const sp = OD.gfx.makeStars(34, 8), a = m;
      for (const s2 of sp) {
        if (fx === 'embers') { g.fillStyle = `rgba(255,179,71,${a})`; g.beginPath(); g.arc(s2.x * w + Math.sin(t + s2.p) * 6, h - ((s2.y * h + t * 40 * s2.z) % h), 1.6, 0, TAU); g.fill(); }
        else if (fx === 'snow') { g.fillStyle = `rgba(234,255,255,${a})`; g.beginPath(); g.arc(s2.x * w + Math.sin(t * 0.7 + s2.p) * 5, (s2.y * h + t * 30 * s2.z) % h, 1.8, 0, TAU); g.fill(); }
        else if (fx === 'pollen' || fx === 'spores') { g.fillStyle = fx === 'pollen' ? (s2.p > 3 ? `rgba(255,183,213,${a})` : `rgba(201,255,154,${a})`) : `rgba(180,255,90,${a})`; g.beginPath(); g.arc(s2.x * w + Math.sin(t + s2.p) * 8, h - ((s2.y * h + t * 24 * s2.z) % h), 1.8, 0, TAU); g.fill(); }
        else if (fx === 'shards' && Math.sin(t * 3 + s2.p * 5) > 0.6) { g.fillStyle = `rgba(255,255,255,${a})`; g.fillRect(s2.x * w, s2.y * h, 3, 3); }
      }
      if (fx === 'bolt' && mod(t, 3.2) < 0.14) { g.fillStyle = `rgba(255,255,255,${0.3 * a})`; g.fillRect(0, 0, w, h); }
      const k2 = fx === 'breathe' ? 1 + 0.03 * Math.sin(t * 2) * a : 1;
      if (k2 !== 1) { g.save(); g.strokeStyle = OD.rgba(tint, 0.35 * a); g.lineWidth = 2; for (const r of F.R) { g.beginPath(); g.arc(F.cx, F.cy, r * k2, 0, TAU); g.stroke(); } g.restore(); }
      const H = hero(F, plan, { col: A });
      if (fx === 'eclipse') { const gr = g.createRadialGradient(H.x, H.y, 22 * F.u, H.x, H.y, 130 * F.u); gr.addColorStop(0, 'rgba(2,3,12,0)'); gr.addColorStop(1, `rgba(2,3,12,${0.8 * a})`); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
      chip(F, cap); vignette(F);
    };
  }
  art.era_tidal = eraCard('ocean', '#2f7bff', 'breathe', 'THE TIDE: SPEED SURGES AND EASES');
  art.era_molten = eraCard('lava', '#ff5a1f', 'embers', 'EMBERS RISE: FIERY WEATHER');
  art.era_frozen = eraCard('ice', '#7fe4ff', 'snow', 'SNOW DRIFTS: SLIPPERY TURNS');
  art.era_storm = eraCard('gas', '#c9a0ff', 'bolt', 'LIGHTNING FLICKERS ACROSS THE SKY');
  art.era_eclipse = eraCard('void', '#7a3dff', 'eclipse', 'NIGHT: YOU ONLY SEE NEAR YOURSELF');
  art.era_verdant = eraCard('garden', '#4fd37a', 'pollen', 'POLLEN DRIFTS UP: A GENEROUS WORLD');
  art.era_prism = eraCard('crystal', '#59f0d6', 'shards', 'GLITTERING FACETS: GRAZES PAY DOUBLE');
  art.era_toxic = eraCard('toxic', '#9ae83a', 'spores', 'SPORES RISE: POISON IN THE AIR');

  art.singularity = (g, w, h, t) => {   // the black hole boss: it takes the planet's place, and its inner orbit blinks, then is eaten
    const F = stage(g, w, h, t, { noPlanet: true, noRings: true, top: '#02030c', bot: '#0b0622' }), tt = F.tt, u = F.u;
    const eat = ss(5.0, 6.6, tt), blink = tt > 3.0 && tt < 5.0 ? 0.5 + 0.5 * Math.sin(tt * 14) : 0, rings = [F.R[0] * 0.78, F.R[0] * 1.25, F.R[1] * 0.98, F.R[2] * 0.95, F.R[2] * 1.2];
    // the accretion glow
    glowAt(F, F.cx, F.cy, 110, '#8a3dff', 0.45 + 0.1 * Math.sin(tt * 2)); glowAt(F, F.cx, F.cy, 60, '#ffb36b', 0.4);
    for (let i = 0; i < 4; i++) { const r = (18 + i * 6) * u, a = tt * (i % 2 ? -1.1 : 1.3) + i; g.strokeStyle = `rgba(${i < 2 ? '255,190,110' : '170,110,255'},${0.8 - i * 0.12})`; g.lineWidth = 2.6 * u; g.lineCap = 'round'; g.beginPath(); g.arc(F.cx, F.cy, r, a, a + 2.0); g.stroke(); }
    g.fillStyle = '#000'; g.beginPath(); g.arc(F.cx, F.cy, 16 * u, 0, TAU); g.fill(); g.strokeStyle = '#ffe7c0'; g.lineWidth = 1.6; g.stroke();
    // the orbits: the innermost blinks and is pulled in
    const hr = tt < 5.0 ? 1 : 1, plan = [[0, 1], [5.4, 0.2]];
    rings.slice(1).forEach((r, i) => { const inner = i === 0, al = inner ? (1 - eat) * (blink > 0 ? 0.25 + 0.75 * blink : 1) : 1, rr = inner ? lerp(r, 16 * u, eat * eat) : r;
      if (al > 0.02) { g.save(); g.globalAlpha = al; g.strokeStyle = inner && blink > 0.4 ? '#ff6a8a' : 'rgba(120,235,255,0.35)'; g.lineWidth = inner && blink > 0 ? 2.4 : 1.4; g.beginPath(); g.arc(F.cx, F.cy, rr, 0, TAU); g.stroke(); g.restore(); } });
    // the dot on the second orbit; it is safe, the eaten orbit had a rock on it
    const a = -0.9 + tt * 1.57, rD = rings[2]; const pts = []; for (let j = 0; j < 24; j++) { const aa = a - j * 0.05; pts.push({ x: F.cx + Math.cos(aa) * rD, y: F.cy + Math.sin(aa) * rD }); }
    OD.gfx.drawTrail(g, pts, 'classic', A, 0, 5 * u); glowAt(F, pts[0].x, pts[0].y, 17, A, 1); g.fillStyle = '#fff'; g.beginPath(); g.arc(pts[0].x, pts[0].y, 3.8 * u, 0, TAU); g.fill();
    // a rock riding the orbit that is about to go, dragged into the hole with it
    { const ra = 1.2 + tt * 0.9, rr = lerp(rings[1], 16 * u, eat * eat); if (eat < 0.97) rock(F, F.cx + Math.cos(ra) * rr, F.cy + Math.sin(ra) * rr, 11 * (1 - eat * 0.6), tt, 1 - eat * 0.6); }
    if (tt > 3.2 && tt < 5.0) pop(F, F.cx, F.cy - rings[1] - 4 * u, '!', '#ff6a8a', 1 - (tt - 3.2) / 1.8 * 0.4, 18);
    chip(F, tt < 3.0 ? 'SURVIVE THE BLACK HOLE' : tt < 5.0 ? 'A BLINKING ORBIT IS ABOUT TO BE EATEN' : 'ONE ORBIT LESS'); vignette(F);
  };
  art.flare = (g, w, h, t) => {   // a sun on the edge: three dashed lanes warn, then they burn
    const F = stage(g, w, h, t), tt = F.tt, sx = w * 0.9, sy = h * 0.12, plan = [[0, 1], [3.0, 2], [4.8, 1]], H0 = hero(F, plan, { hidden: true });
    glowAt(F, sx, sy, 80, '#ffb347', 0.9); g.fillStyle = '#fff'; g.beginPath(); g.arc(sx, sy, 8 * F.u, 0, TAU); g.fill();
    const warn = ss(0.4, 1.2, tt) * (1 - ss(5.6, 6.2, tt)), burn = ss(3.6, 3.8, tt) * (1 - ss(5.4, 5.8, tt));
    for (const [lx, ly] of [[-0.45, -0.1], [-0.55, 0.25], [-0.62, 0.55]]) { const tx = F.cx + (lx * 0.5) * w, ty = F.cy + ly * h * 0.9, ang = Math.atan2(ty - sy, tx - sx), L = Math.max(w, h) * 1.4;
      g.save(); g.lineCap = 'round'; g.globalAlpha = warn * (1 - burn);
      g.setLineDash([8 * F.u, 8 * F.u]); g.lineDashOffset = -tt * 70; g.strokeStyle = 'rgba(255,170,60,0.8)'; g.lineWidth = 2; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + Math.cos(ang) * L, sy + Math.sin(ang) * L); g.stroke(); g.restore();
      if (burn > 0.02) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = burn; g.lineCap = 'round'; for (const [lw, c] of [[22 * F.u, 'rgba(255,170,60,0.3)'], [9 * F.u, '#ffd24d'], [3 * F.u, '#fff']]) { g.strokeStyle = c; g.lineWidth = lw; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + Math.cos(ang) * L, sy + Math.sin(ang) * L); g.stroke(); } g.restore(); } }
    hero(F, plan); chip(F, tt < 3.6 ? 'LANES WARN: BE BETWEEN THEM' : 'THE FLARE BURNS'); vignette(F);
  };
  art.blackhole = (g, w, h, t) => {   // a black hole drifts past below: its pull bends the dot's path
    const F = stage(g, w, h, t), tt = F.tt, bx = F.cx + lerp(-0.28, 0.28, ss(0, 8, tt) * 0 + (tt / 8)) * w * 0.5, by = F.cy + 96 * F.u, rp = 150 * F.u;
    const warp = (x, y) => { const d = Math.hypot(x - bx, y - by), p = clamp01(1 - d / rp) ** 1.4; return d < 1 ? [x, y] : [x + (bx - x) / d * p * 26 * F.u, y + (by - y) / d * p * 26 * F.u]; };
    glowAt(F, bx, by, 130, '#8a3dff', 0.5);
    g.save(); g.translate(bx, by); g.rotate(tt * 0.8); g.scale(1, 0.36); const dg = g.createRadialGradient(0, 0, 12 * F.u, 0, 0, 56 * F.u); dg.addColorStop(0, 'rgba(255,200,120,0.95)'); dg.addColorStop(0.4, 'rgba(255,120,60,0.6)'); dg.addColorStop(1, 'rgba(140,60,255,0)'); g.fillStyle = dg; g.beginPath(); g.arc(0, 0, 56 * F.u, 0, TAU); g.fill(); g.restore();
    g.fillStyle = '#000'; g.beginPath(); g.arc(bx, by, 13 * F.u, 0, TAU); g.fill();
    for (let i = 0; i < 12; i++) { const q = (tt * 0.5 + i / 12) % 1, a = i * 2.4, r = lerp(100 * F.u, 8 * F.u, q); g.fillStyle = i % 2 ? '#ffb36b' : '#c58bff'; g.beginPath(); g.arc(bx + Math.cos(a + q * 4) * r, by + Math.sin(a + q * 4) * r * 0.8, 2 * F.u, 0, TAU); g.fill(); }
    hero(F, [[0, 2], [2.2, 1], [5.6, 2]], { warp }); chip(F, 'ITS PULL BENDS YOUR PATH'); vignette(F);
  };
  art.supernova = (g, w, h, t) => {   // a star swells, then a shockwave sweeps the sky with a deep shadow behind the planet
    const F = stage(g, w, h, t), tt = F.tt, sx = w * 0.14, sy = h * 0.18, charge = ss(0.5, 4.0, tt), blast = ss(4.2, 7.0, tt), plan = [[0, 1], [3.2, 0]];
    const ux = F.cx - sx, uy = F.cy - sy, L = Math.hypot(ux, uy), nx = -uy / L, ny = ux / L, wd = 26 * F.u;
    g.save(); g.fillStyle = `rgba(0,0,0,${0.5 * ss(3.4, 4.2, tt)})`; g.beginPath(); g.moveTo(F.cx + nx * wd, F.cy + ny * wd); g.lineTo(F.cx + ux / L * w * 1.5 + nx * wd, F.cy + uy / L * w * 1.5 + ny * wd); g.lineTo(F.cx + ux / L * w * 1.5 - nx * wd, F.cy + uy / L * w * 1.5 - ny * wd); g.lineTo(F.cx - nx * wd, F.cy - ny * wd); g.closePath(); g.fill(); g.restore();
    glowAt(F, sx, sy, 30 + 90 * charge * charge, '#fff2c8', 0.95); g.fillStyle = '#fff'; g.beginPath(); g.arc(sx, sy, (6 + 8 * charge) * F.u, 0, TAU); g.fill();
    if (blast > 0 && blast < 1) { g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = `rgba(255,230,160,${0.8 * (1 - blast)})`; g.lineWidth = 16 * F.u * (1 - blast * 0.5); g.beginPath(); g.arc(sx, sy, blast * w * 1.15, 0, TAU); g.stroke(); g.restore(); }
    hero(F, plan, { col: tt > 3.2 && tt < 7.2 ? '#9fe6ff' : A }); chip(F, tt < 4 ? 'THE STAR SWELLS' : 'HIDE IN THE PLANET\'S SHADOW'); vignette(F);
  };
})();
