// Renders the app icon, splash and Play Store graphics using the game's own drawing code.
// Usage: node tools/make-art.mjs   (needs the playwright package and a static server on :8123 serving www/)
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = (name, b64) => fs.writeFileSync(name, Buffer.from(b64.split(',')[1], 'base64'));
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 800, height: 800 } });
await page.goto('http://localhost:8123/index.html');
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
const draw = `(${function (kind, W, H) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), w = OD.WORLDS[0], T = OD.TAU;
  const S = Math.min(W, H);
  const bg = () => {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#050a22'); gr.addColorStop(1, '#14246b');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    for (const [x, y, r, col] of [[0.85, 0.15, 0.7, '#8a3dff'], [0.1, 0.95, 0.8, '#2a63ff']]) {
      const rg = g.createRadialGradient(W * x, H * y, 0, W * x, H * y, S * r);
      rg.addColorStop(0, OD.rgba(col, 0.35)); rg.addColorStop(1, OD.rgba(col, 0));
      g.fillStyle = rg; g.fillRect(0, 0, W, H);
    }
    g.globalCompositeOperation = 'source-over';
    const rng = OD.makeRng(9);
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + rng() * 0.7})`; const s = rng() * S * 0.004 + S * 0.0015; g.fillRect(rng() * W, rng() * H, s, s); }
  };
  const mark = (cx, cy, k) => {   // planet + orbits + glowing dot, k = overall scale
    for (const [rr, a] of [[0.46, 0.18], [0.34, 0.28], [0.22, 0.4]]) {
      g.strokeStyle = OD.rgba('#4df3ff', a); g.lineWidth = S * 0.006 * k; g.beginPath(); g.arc(cx, cy, S * rr * k, 0, T); g.fill; g.stroke();
    }
    OD.gfx.drawPlanet(g, cx, cy, S * 0.13 * k, 'terra', 0, w.accent, 1);
    // comet dot on the middle orbit with a tapering trail
    const R = S * 0.34 * k, a0 = -0.55, pts = [];
    for (let i = 0; i < 40; i++) { const a = a0 - i * 0.045; pts.push({ x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R }); }
    OD.gfx.drawTrail(g, pts, 'classic', w.accent, 0, S * 0.035 * k);
    const p = pts[0];
    g.globalCompositeOperation = 'lighter'; OD.gfx.glow(g, p.x, p.y, S * 0.09 * k, w.accent, 1); g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#fff'; g.beginPath(); g.arc(p.x, p.y, S * 0.024 * k, 0, T); g.fill();
    // a debris chunk on the outer orbit
    OD.gfx.drawDebris(g, 'rock', cx + Math.cos(2.4) * S * 0.46 * k, cy + Math.sin(2.4) * S * 0.46 * k, S * 0.04 * k, 0.6, w.danger, OD.gfx.makeShape('rock', OD.makeRng(4)));
  };
  const word = (cx, y, size) => {
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = `800 ${size}px Outfit`; g.letterSpacing = size * 0.26 + 'px';
    const gr = g.createLinearGradient(cx - size * 2.5, 0, cx + size * 2.5, 0); gr.addColorStop(0, '#9ffbff'); gr.addColorStop(0.5, '#4df3ff'); gr.addColorStop(1, '#c79bff');
    g.fillStyle = gr; g.shadowColor = 'rgba(77,243,255,.6)'; g.shadowBlur = size * 0.4;
    g.fillText('ORBIT', cx + size * 0.13, y); g.shadowBlur = 0;
    g.font = `300 ${size * 0.34}px Outfit`; g.letterSpacing = size * 0.2 + 'px'; g.fillStyle = 'rgba(255,255,255,.85)';
    g.fillText('DODGER', cx + size * 0.07, y + size * 0.5);
  };
  if (kind === 'icon') { bg(); mark(W / 2, H / 2, 1.0); }
  else if (kind === 'fg') { mark(W / 2, H / 2, 0.66); }
  else if (kind === 'bgonly') { bg(); }
  else if (kind === 'splash') { bg(); mark(W / 2, H * 0.42, 0.62); word(W / 2, H * 0.74, S * 0.09); }
  else if (kind === 'feature') { bg(); mark(W * 0.27, H / 2, 1.15 * H / S); word(W * 0.64, H * 0.52, H * 0.2); }
  return c.toDataURL('image/png');
}})`;
for (const [kind, W, H, file] of [
  ['icon', 1024, 1024, 'assets/icon-only.png'], ['fg', 1024, 1024, 'assets/icon-foreground.png'], ['bgonly', 1024, 1024, 'assets/icon-background.png'],
  ['splash', 2732, 2732, 'assets/splash.png'], ['splash', 2732, 2732, 'assets/splash-dark.png'],
  ['icon', 512, 512, 'store/icon-512.png'], ['feature', 1024, 500, 'store/feature-graphic-1024x500.png'],
]) out(file, await page.evaluate(`${draw}('${kind}', ${W}, ${H})`));
await b.close();
console.log('art written');
