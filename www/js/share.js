'use strict';
// Sharing a run: a picture of the result (the biome's sky, its planet, the score) handed to the phone's share sheet.
// Everything is drawn here on a canvas, so the card looks the same on every phone and needs no network.
(() => {
  const CW = 1080, CH = 1350, LINK = 'https://play.google.com/store/apps/details?id=com.jellybytes.halorun';
  const fmtT = s => { s = Math.floor(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  let logo = null;
  const loadLogo = () => logo || (logo = new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = 'assets/halo-run-wordmark.png'; }));
  const F = (w, px) => `${w} ${px}px Outfit, system-ui, sans-serif`;
  function spaced(g, str, x, y, sp) { g.letterSpacing = sp + 'px'; g.fillText(str, x + sp / 2, y); g.letterSpacing = '0px'; }
  function fit(g, str, w, px, max) { do { g.font = F(w, px); if (g.measureText(str).width <= max) break; px -= 2; } while (px > 20); return px; }

  async function card(r) {
    const w = OD.WORLDS[r.world] || OD.WORLDS[0], cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
    const g = cv.getContext('2d'), rng = OD.makeRng((Math.floor(r.score) % 9973) + 7 + r.world * 131), cx = CW / 2, cy = 632;
    // the sky: the biome's own colours, two soft nebula clouds, a scatter of stars
    let gr = g.createLinearGradient(0, 0, 0, CH); gr.addColorStop(0, w.bg[0]); gr.addColorStop(1, w.bg[1]); g.fillStyle = gr; g.fillRect(0, 0, CW, CH);
    for (const [x, y, rad, c, a] of [[CW * 0.82, CH * 0.2, 620, w.neb[0], 0.5], [CW * 0.12, CH * 0.72, 680, w.neb[1], 0.42], [cx, cy, 520, w.accent, 0.16]]) {
      gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, OD.rgba(c, a)); gr.addColorStop(1, OD.rgba(c, 0)); g.fillStyle = gr; g.fillRect(0, 0, CW, CH);
    }
    for (let i = 0; i < 170; i++) { const x = rng() * CW, y = rng() * CH, s = rng(); g.globalAlpha = 0.25 + 0.6 * s * s; g.fillStyle = s > 0.93 ? w.accent : '#fff'; g.beginPath(); g.arc(x, y, 0.8 + 1.9 * s * s, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    // the orbits, the planet, and your light with its trail
    const R = [176, 243, 310], pr = 108;
    g.lineWidth = 2.5; for (const rad of R) { g.strokeStyle = OD.rgba(w.accent, 0.22); g.beginPath(); g.arc(cx, cy, rad, 0, 7); g.stroke(); }
    gr = g.createRadialGradient(cx, cy, pr * 0.6, cx, cy, pr * 2.1); gr.addColorStop(0, OD.rgba(w.accent, 0.34)); gr.addColorStop(1, OD.rgba(w.accent, 0)); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, pr * 2.1, 0, 7); g.fill();
    let drawn = false;
    try { if (OD.planets.ready(w.planet)) { OD.planets.draw(g, cx, cy, pr, w.planet, 4.2, w.accent, 2, false); drawn = true; } } catch (e) { /* the plain sphere below */ }
    if (!drawn) { gr = g.createRadialGradient(cx - pr * 0.35, cy - pr * 0.4, pr * 0.1, cx, cy, pr); gr.addColorStop(0, '#fff'); gr.addColorStop(0.5, w.accent); gr.addColorStop(1, w.bg[0]); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, pr, 0, 7); g.fill(); }
    const a1 = -0.62, len = 2.5, rad = R[2]; g.lineCap = 'round';
    for (let i = 0; i < 70; i++) { const k = i / 70, a = a1 - len * (1 - k); g.strokeStyle = OD.rgba(k > 0.75 ? '#ffffff' : w.accent, 0.05 + 0.9 * k * k); g.lineWidth = 3 + 13 * k; g.beginPath(); g.arc(cx, cy, rad, a, a + len / 70 + 0.012); g.stroke(); }
    const dx = cx + Math.cos(a1) * rad, dy = cy + Math.sin(a1) * rad;
    gr = g.createRadialGradient(dx, dy, 0, dx, dy, 64); gr.addColorStop(0, OD.rgba(w.accent, 0.95)); gr.addColorStop(0.35, OD.rgba(w.accent, 0.35)); gr.addColorStop(1, OD.rgba(w.accent, 0)); g.fillStyle = gr; g.beginPath(); g.arc(dx, dy, 64, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(dx, dy, 15, 0, 7); g.fill();
    for (let i = 0; i < 9; i++) { const a = a1 + 0.5 + i * 0.33, rr = R[i % 2 ? 1 : 2]; g.fillStyle = OD.rgba('#ffe27a', 0.95); g.beginPath(); g.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 5.5, 0, 7); g.fill(); }
    // the name of the game
    const lg = await loadLogo();
    if (lg) { const lw = 560, lh = lw * lg.height / lg.width; g.drawImage(lg, cx - lw / 2, 34, lw, lh); }
    else { g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = F(800, 96); spaced(g, 'HALO RUN', cx, 190, 16); }
    // the score, and what kind of run it was
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const best = !!r.newBest, win = r.reason === 'win';
    g.fillStyle = OD.rgba(w.accent, 0.95); g.font = F(700, 30); spaced(g, (win ? OD.t('GALAXY CLEARED') : OD.t(w.name)).toUpperCase(), cx, 1040, 9);
    const sc = OD.fmt(r.score); let px = fit(g, sc, 800, 190, CW - 150);
    g.shadowColor = OD.rgba(w.accent, 0.75); g.shadowBlur = 46; g.fillStyle = '#fff'; g.font = F(800, px); g.fillText(sc, cx, 1196); g.shadowBlur = 0;
    const bits = [fmtT(r.time || 0), '×' + (r.maxCombo || 1).toFixed(1), OD.tn(r.planets || 1, '{0} planet', '{0} planets')];
    g.font = F(500, 34); g.fillStyle = 'rgba(255,255,255,0.82)'; g.fillText(bits.join('   ·   '), cx, 1254);
    if (best) {   // the gold pill, as on the results screen
      const t = OD.t('NEW BEST'); g.font = F(800, 28); g.letterSpacing = '6px'; const tw = g.measureText(t).width + 56, y = 982; g.letterSpacing = '0px';
      gr = g.createLinearGradient(cx - tw / 2, 0, cx + tw / 2, 0); gr.addColorStop(0, '#ffe48a'); gr.addColorStop(1, '#ffb347'); g.fillStyle = gr; g.shadowColor = 'rgba(255,200,90,0.7)'; g.shadowBlur = 26;
      g.beginPath(); g.roundRect(cx - tw / 2, y - 25, tw, 50, 25); g.fill(); g.shadowBlur = 0; g.fillStyle = '#2a1a00'; g.textBaseline = 'middle'; spaced(g, t, cx, y + 2, 6); g.textBaseline = 'alphabetic';
    }
    g.font = F(600, 26); g.fillStyle = 'rgba(255,255,255,0.6)'; spaced(g, OD.t('CAN YOU BEAT IT?  ·  FREE ON GOOGLE PLAY'), cx, 1312, 5);
    return cv;
  }

  const toBlob = cv => new Promise(res => cv.toBlob(res, 'image/png'));
  async function run(r) {
    if (!r) return false;
    const cv = await card(r), text = OD.t('I scored {0} in Halo Run. Can you beat it?', OD.fmt(r.score)) + ' ' + LINK;
    const done = () => { OD.save.stats.shares = (OD.save.stats.shares || 0) + 1; OD.persist(); return true; };
    const P = window.Capacitor && window.Capacitor.Plugins;
    try {
      if (OD.isNative() && P && P.Share && P.Filesystem) {   // the app: the picture is written to the cache, and the system sheet gets its address
        const data = cv.toDataURL('image/png').split(',')[1], f = await P.Filesystem.writeFile({ path: 'halo-run-score.png', data, directory: 'CACHE' });
        await P.Share.share({ title: 'Halo Run', text, files: [f.uri], dialogTitle: OD.t('Share your run') });
        return done();
      }
      const blob = await toBlob(cv), file = new File([blob], 'halo-run-score.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ title: 'Halo Run', text, files: [file] }); return done(); }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'halo-run-score.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);   // a browser with no share sheet: the picture is saved
      return done();
    } catch (e) { return false; }   // (closing the sheet without sharing lands here: nothing to say)
  }
  OD.share = { card, run };
})();
