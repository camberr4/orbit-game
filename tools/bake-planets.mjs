// Paints every planet's surface, cloud and glow maps with the game's own code (www/js/planets.js) and saves them as pictures in
// www/assets/planets, so the game (above all on a phone) loads them instead of computing them (many seconds of processor time).
// Re-run after changing a planet's look:  node tools/bake-planets.mjs   [png|webp]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const FMT = process.argv[2] === 'png' ? 'png' : 'webp', MIME = 'image/' + FMT;
const server = spawn('node', ['tools/serve.mjs'], { env: { ...process.env, PORT: '8131' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
const pg = await b.newPage();
await pg.addInitScript(() => { window.__noBaked = true; });
await pg.goto('http://localhost:8131/index.html?debug&noaudio');
await pg.waitForTimeout(500);
mkdirSync('www/assets/planets', { recursive: true });
let total = 0;
for (const skin of ['terra', 'garden', 'ocean', 'moon', 'lava', 'ice', 'crystal', 'toxic', 'gas', 'void']) {
  const r = await pg.evaluate(([skin, mime]) => {
    OD.planets.warmNow([skin]);
    const e = OD.planets.exportMaps(skin), q = 0.96;
    return { cloud: !!e.cloudC, emit: !!e.emitC, surf: e.surf.toDataURL(mime, q), cloudD: e.cloudC ? e.cloudC.toDataURL(mime, q) : null, emitD: e.emitC ? e.emitC.toDataURL(mime, q) : null };
  }, [skin, MIME]);
  const put = (name, url) => { const buf = Buffer.from(url.split(',')[1], 'base64'); writeFileSync(`www/assets/planets/${skin}_${name}.${FMT}`, buf); total += buf.length; return buf.length; };
  const sizes = [put('surf', r.surf)];
  if (r.cloud) sizes.push(put('cloud', r.cloudD));
  if (r.emit) sizes.push(put('emit', r.emitD));
  writeFileSync(`www/assets/planets/${skin}.json`, JSON.stringify({ ext: FMT, cloud: r.cloud, emit: r.emit }));
  console.log(skin.padEnd(8), sizes.map(n => Math.round(n / 1024) + ' KB').join('  '));
}
console.log('total', Math.round(total / 1024), 'KB');
await b.close(); server.kill();
