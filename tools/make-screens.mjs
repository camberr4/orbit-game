// Produces Play Store phone screenshots (1080x1920) by driving the real game with a fake clock.
// Usage: CHROME=/path/to/chrome node tools/make-screens.mjs   (static server for www/ on :8123)
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
const shot = async (page, name) => { await page.screenshot({ path: `store/screenshots/${name}.png` }); console.log('wrote', name); };
async function fresh(world = 0, extra = '') {
  const ctx = await b.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.clock.install({ time: 0 });
  await page.goto('http://localhost:8123/index.html?debug&unlock=1&noaudio' + extra);
  await page.clock.runFor(600);
  await page.addStyleTag({ content: '#toasts{display:none}' });
  await page.evaluate(w => {
    OD.save.tutorialDone = true; OD.save.settings.clip = false; OD.save.world = w; OD.save.stardust = 1240;
    for (let i = 0; i < 4; i++) OD.save.bestWorld[i] = 12000;
    OD.save.best.endless = 8420;
    OD.save.owned.trail.push('comet', 'rainbow'); OD.save.owned.planet.push('ringed'); OD.save.owned.debris.push('crystal');
    OD.persist(); OD.game.setWorld(w); OD.ui.show('home');
  }, world);
  await page.clock.runFor(900);
  return page;
}
async function play(page, mode = 'endless', secs = 20, keep = true) {
  await page.evaluate(m => { OD.save.mode = m; OD.persist(); }, mode);
  await page.click('[data-act=play]');
  await page.evaluate(() => setInterval(() => { const S = OD.game.run; if (S && !S.over) S.p.phase = 99; }, 50));
  for (let t = 0; t < secs; t += 1) await page.clock.runFor(1000);
}
let page = await fresh(0);
await shot(page, '01-home');
await play(page, 'endless', 24);
await page.evaluate(() => { const S = OD.game.run; S.mult = 5; S.multT = 3; S.score = 2840; S.dispScore = 2840; S.gm = 0.6; });
await page.clock.runFor(300); await shot(page, '02-play-aurora');
await page.context().close();

page = await fresh(1);
await play(page, 'endless', 63);
await page.clock.runFor(2600);
await page.evaluate(() => { const S = OD.game.run; S.mult = 4; S.multT = 3; S.score = 5260; S.dispScore = 5260; });
await page.clock.runFor(200); await shot(page, '03-boss-ember');
await page.context().close();

page = await fresh(3);
await play(page, 'endless', 30);
await page.evaluate(() => { const S = OD.game.run; S.p.phase = 0; OD.game._dbg.spawn.overdrive(); S.mult = 8; S.multT = 3; S.score = 9120; S.dispScore = 9120; });
await page.clock.runFor(900); await shot(page, '04-nova-void');
await page.context().close();

page = await fresh(2);
await play(page, 'endless', 52);
await page.evaluate(() => { const S = OD.game.run; S.p.phase = 0; S.mult = 6; S.multT = 3; S.score = 6310; S.dispScore = 6310; });
await page.clock.runFor(150); await shot(page, '05-glacier');
await page.evaluate(() => { OD.game._dbg.S.p.phase = 0; OD.game._dbg.die(); });
await page.clock.runFor(3500); await shot(page, '06-run-over');
await page.context().close();

page = await fresh(0);
await page.evaluate(() => OD.ui.show('worlds')); await page.clock.runFor(700); await shot(page, '07-worlds');
await page.evaluate(() => OD.ui.show('shop')); await page.clock.runFor(700); await shot(page, '08-shop');
await page.context().close();
await b.close();
