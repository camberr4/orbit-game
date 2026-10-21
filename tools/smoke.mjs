// End-to-end smoke test: boots the game, plays the free demo to the paywall, buys (simulated), and
// exercises every mode and world with a fake clock. Fails on any page error.
// Usage: node tools/smoke.mjs   (CHROME=/path/to/chrome to override the browser)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server = spawn('node', ['tools/serve.mjs'], { env: { ...process.env, PORT: '8124' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const URL = 'http://localhost:8124/index.html?debug&noaudio';
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
let failed = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failed++; };
async function open(extra = '') {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.clock.install({ time: 0 });
  await page.goto(URL + extra);
  await page.clock.runFor(500);
  return page;
}
const run_ = async (page, secs) => { for (let t = 0; t < secs; t += 2) await page.clock.runFor(2000); };
const immortal = page => page.evaluate(() => setInterval(() => { const S = OD.game.run; if (S && !S.over) S.p.phase = 99; }, 50));

// 1. free runs: 5 runs, new elements introduced one per run with a popup, then the paywall
let page = await open();
const die = async () => { await page.evaluate(() => OD.game._dbg.die()); await page.clock.runFor(3500); };
for (let run = 1; run <= 5; run++) {
  if (run === 2) await page.evaluate(() => { OD.save.tutorialDone = true; OD.save.intro.dust = true; OD.save.intro.rock = true; OD.persist(); });
  await page.click('[data-act=play]');
  if (run === 2) {            // second run: the comet is introduced once it first appears
    await immortal(page);
    await run_(page, 40);
    check(await page.evaluate(() => !!document.querySelector('.intro') && /Comet/.test(document.querySelector('.intro h2').textContent)), 'run 2 pauses with the Comet introduction popup');
    check(await page.evaluate(() => OD.game.state === 'paused'), 'game is paused behind the popup');
    await page.click('[data-act=introok]'); await page.clock.runFor(3500);
    check(await page.evaluate(() => OD.game.state === 'play'), 'game resumes after the popup');
  }
  await page.clock.runFor(1500);
  await die();
  check(await page.evaluate(() => OD.ui.cur === 'over'), `run ${run} ends on the game-over screen`);
  if (run < 5) { await page.clock.runFor(600); await page.click('[data-act=go][data-v=home]'); await page.clock.runFor(400); }
}
await page.clock.runFor(1500);
check(await page.evaluate(() => !!document.querySelector('.pw')), 'paywall appears after the 5th free run');
check(await page.evaluate(() => OD.freeLeft() === 0 && !OD.save.full), 'no free runs left, still locked');
await page.click('[data-act=close]'); await page.click('[data-act=go][data-v=home]'); await page.clock.runFor(400);
await page.click('[data-act=play]'); await page.clock.runFor(400);
check(await page.evaluate(() => !!document.querySelector('.pw') && OD.game.state !== 'play'), 'cannot start a 6th run without buying');
await page.click('[data-act=buyfull]'); await page.clock.runFor(500);
check(await page.evaluate(() => OD.save.full), 'purchase unlocks the full game');
check(page.errors.length === 0, 'no page errors in free-run flow ' + page.errors.join('|'));
await page.context().close();

// 2. every mode x world in the full game
for (const [mode, world, secs] of [['endless', 0, 70], ['endless', 1, 70], ['endless', 2, 70], ['endless', 3, 70], ['endless', 4, 70], ['endless', 5, 70], ['timeattack', 0, 64], ['hardcore', 1, 40], ['zen', 2, 40], ['daily', 0, 40]]) {
  page = await open('&unlock=1');
  await page.evaluate(([m, w]) => {
    OD.save.tutorialDone = true; OD.save.settings.clip = false; OD.save.mode = m; OD.save.world = w;
    OD.INTRO.forEach(i => { OD.save.intro[i.id] = true; }); OD.save.stats.runs = 99;
    for (let i = 0; i < 6; i++) OD.save.bestWorld[i] = 99999;
    OD.persist(); OD.ui.show('home');
  }, [mode, world]);
  await page.click('[data-act=play]'); await immortal(page);
  await run_(page, secs);
  const st = await page.evaluate(() => ({ t: OD.game.run.time, score: OD.game.run.score, state: OD.game.state }));
  check(st.t > secs - 3 || st.state === 'ended', `${mode} world ${world}: ran ${st.t.toFixed(0)}s, score ${Math.floor(st.score)}`);
  check(page.errors.length === 0, `${mode} world ${world}: no page errors ${page.errors.join('|')}`);
  await page.context().close();
}

// 3. death -> game over -> retry, and pause/resume
page = await open('&unlock=1');
await page.evaluate(() => { OD.save.tutorialDone = true; OD.persist(); });
await page.click('[data-act=play]'); await page.clock.runFor(1500);
await page.click('#pausebtn'); check(await page.evaluate(() => OD.game.state === 'paused'), 'pause works');
await page.click('[data-act=resume]'); await page.clock.runFor(3500); check(await page.evaluate(() => OD.game.state === 'play'), 'resume countdown returns to play');
await page.evaluate(() => OD.game._dbg.die()); await page.clock.runFor(3000);
check(await page.evaluate(() => OD.ui.cur === 'over'), 'death shows the game-over screen');
await page.clock.runFor(800); await page.click('#retry'); await page.clock.runFor(500);
check(await page.evaluate(() => OD.game.state === 'play' && OD.game.run.time < 2), 'retry starts a fresh run');
check(page.errors.length === 0, 'no page errors in death/retry flow');
await b.close(); server.kill();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
