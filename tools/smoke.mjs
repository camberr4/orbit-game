// End-to-end smoke test: boots the game, plays the free demo to the paywall, buys (simulated), and
// exercises every mode and world with a fake clock. Fails on any page error.
// Usage: node tools/smoke.mjs   (CHROME=/path/to/chrome to override the browser)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server = spawn('node', ['tools/serve.mjs'], { env: { ...process.env, PORT: '8124' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const URL = 'http://localhost:8124/index.html?debug&noaudio&nounlock';
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
  if (run === 2) await page.evaluate(() => { OD.save.tutorialDone = true; OD.save.onboarded = true; OD.save.aimAsked = true; OD.save.intro.dust = true; OD.save.intro.rock = true; OD.persist(); });
  await page.click('[data-act=play]');
  if (run === 1) {   // first play: offer the tutorial, then ask how many tips
    check(await page.evaluate(() => !!document.querySelector('[data-act=tutyes]')), 'first Play offers the tutorial');
    await page.click('[data-act=tutyes]'); await page.clock.runFor(300);
    check(await page.evaluate(() => !!document.querySelector('.tuttabs') && document.querySelectorAll('.tuttabs button').length >= 5), 'the tutorial has a tab per topic');
    for (let k = 0; k < 7; k++) { if (!(await page.evaluate(() => !!document.querySelector('[data-act=tutnext]')))) break; await page.click('[data-act=tutnext]'); await page.clock.runFor(100); }
    check(await page.evaluate(() => !!document.querySelector('[data-act=tipset]')), 'then it asks how many tips');
    await page.click('[data-act=tipset][data-v=all]'); await page.clock.runFor(300);
    check(await page.evaluate(() => OD.save.settings.tips === 'all' && OD.game.state === 'play'), 'the run starts once tips are chosen');
  }
  if (run === 2) {            // second run: the comet is introduced once it first appears
    await immortal(page);
    for (let i = 0; i < 90 && !(await page.evaluate(() => !!OD.game.run.intro)); i++) await page.clock.runFor(1000);
    check(await page.evaluate(() => !!document.querySelector('#tile:not(.hidden) h3') && document.querySelector('#tile h3').textContent.length > 0), 'run 2 shows a new-element tile at the top');
    check(await page.evaluate(() => OD.game.state === 'play' && !!OD.game.run.intro), 'the game keeps running behind the tile');
    const sc0 = await page.evaluate(() => OD.game.run.score); await page.clock.runFor(1200);
    check(await page.evaluate(sc0 => OD.game.run.score === sc0 && OD.game.run.ts < 0.2, sc0), 'score is frozen and time is crawling while the tile is up');
    const closed = await page.evaluate(() => OD.game.run.intro && OD.game.run.intro.id); await page.click('[data-act=tileok]'); await page.clock.runFor(2400);
    await page.clock.runFor(2200);
    { const st = await page.evaluate(() => ({ intro: OD.game.run.intro && OD.game.run.intro.id, ts: OD.game.run.ts })); check((!st.intro && st.ts > 0.85) || (st.intro && st.intro !== closed), 'normal speed returns about a second after closing the tile (or the next tip is already up) ' + JSON.stringify(st)); }
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

// 2. every mode x start planet in the full game
for (const [mode, world, secs, mods] of [['endless', 0, 70], ['endless', 1, 70], ['endless', 2, 70], ['endless', 3, 70], ['endless', 4, 70], ['endless', 5, 70], ['timeattack', 0, 64], ['hardcore', 1, 40], ['zen', 2, 40], ['daily', 0, 40], ['endless', 2, 60, ['heavy', 'fog']], ['endless', 4, 60, ['swift', 'volatile']], ['endless', 0, 60, ['lucky', 'glass']], ['endless', 1, 60, ['chill']]]) {
  page = await open('&unlock=1');
  await page.evaluate(([m, w, mods]) => {
    OD.save.mods = mods || [];
    OD.save.tutorialDone = true; OD.save.onboarded = true; OD.save.aimAsked = true; OD.save.settings.clip = false; OD.save.mode = m; OD.debugStart = OD.WORLDS[w].planet;
    OD.INTRO.forEach(i => { OD.save.intro[i.id] = true; }); OD.save.stats.runs = 99;
    OD.save.bestAny = 99999;
    OD.persist(); OD.ui.show('home');
  }, [mode, world, mods]);
  await page.click('[data-act=play]'); await immortal(page);
  await run_(page, secs);
  const st = await page.evaluate(() => ({ t: OD.game.run.time, score: OD.game.run.score, state: OD.game.state }));
  check(st.t > secs - 3 || st.state === 'ended', `${mode} world ${world}: ran ${st.t.toFixed(0)}s, score ${Math.floor(st.score)}`);
  check(page.errors.length === 0, `${mode} world ${world} ${(mods || []).join('+')}: no page errors ${page.errors.join('|')}`);
  await page.context().close();
}

// 2b. bomb and double score power-ups
page = await open('&unlock=1');
await page.evaluate(() => { OD.save.tutorialDone = true; OD.save.onboarded = true; OD.save.aimAsked = true; OD.INTRO.forEach(i => { OD.save.intro[i.id] = true; }); OD.persist(); });
await page.click('[data-act=play]'); await page.clock.runFor(1500);
const pu = await page.evaluate(() => { const S = OD.game.run, p = S.p; S.hz.length = 0; OD.game._dbg.spawn.rocks(); S.pk.push({ k: 'power', type: 'bomb', o: 1, a: p.th, life: 9, t: 1, x: p.wx, y: p.wy, w: 0 }, { k: 'power', type: 'double', o: 1, a: p.th, life: 9, t: 1, x: p.wx, y: p.wy, w: 0 }); return S.hz.length; });
await page.clock.runFor(300);
check(await page.evaluate(() => OD.game.run.p.double > 0 && OD.game.run.hz.filter(h => h.warn <= 0).length === 0), 'bomb clears the field and double score activates');
check(page.errors.length === 0, 'no page errors with power-ups ' + page.errors.join('|'));
await page.context().close();

// 3. death -> game over -> retry, and pause/resume
page = await open('&unlock=1');
await page.evaluate(() => { OD.save.tutorialDone = true; OD.save.onboarded = true; OD.save.aimAsked = true; OD.save.settings.tips = 'off'; OD.persist(); });
await page.click('[data-act=play]'); await page.clock.runFor(1500);
await page.click('#pausebtn'); await page.clock.runFor(600); check(await page.evaluate(() => OD.game.state === 'paused'), 'pause works');
await page.click('[data-act=resume]'); await page.clock.runFor(1500); check(await page.evaluate(() => OD.game.state === 'play' && OD.game.run.pz === 1), 'resume eases back to full speed');
await page.evaluate(() => OD.game._dbg.die()); await page.clock.runFor(3000);
check(await page.evaluate(() => OD.ui.cur === 'over'), 'death shows the game-over screen');
await page.clock.runFor(800); await page.click('#retry'); await page.clock.runFor(500);
check(await page.evaluate(() => OD.game.state === 'play' && OD.game.run.time < 2), 'retry starts a fresh run');
check(page.errors.length === 0, 'no page errors in death/retry flow');

// 4. skills: buy a point with stardust, hold a perk icon to learn it, the path locks, reset gives it back
page = await open('&unlock=1');
await page.evaluate(() => { OD.save.stardust = 600; OD.save.onboarded = true; OD.save.tutorialDone = true; OD.persist(); OD.ui.show('perks'); });
await page.click('[data-act=spbuy]'); await page.clock.runFor(300);
check(await page.evaluate(() => OD.save.sp.bought === 1 && OD.save.stardust === 545), 'a skill point is bought with stardust (55)');
const hullBox = await page.locator('.snode[data-perk=hull]').boundingBox();
await page.mouse.move(hullBox.x + 28, hullBox.y + 28); await page.mouse.down(); await page.clock.runFor(1300); await page.mouse.up(); await page.clock.runFor(300);
check(await page.evaluate(() => OD.perkLevel('hull') === 1 && OD.save.path === 'guard' && OD.spFree() === 0), 'holding a perk icon learns it and commits the path');
check(await page.evaluate(() => !OD.perkOpen(OD.PERK_BY_ID.spark)), 'perks of other paths are locked once a path is chosen');
await page.evaluate(() => OD.ui.internals.acts.spreset()); await page.clock.runFor(200); await page.click('[data-act=spreset2]'); await page.clock.runFor(300);
check(await page.evaluate(() => OD.save.path === null && OD.spFree() === 1 && OD.save.sp.bought === 1), 'resetting refunds the skill point and frees the path');
check(page.errors.length === 0, 'no page errors in the skills flow ' + page.errors.join('|'));
await page.context().close();

// 5. the newer power-ups, the corner stack, and the badge reel at the end of a run
page = await open('&unlock=1');
await page.evaluate(() => { OD.save.tutorialDone = true; OD.save.onboarded = true; OD.save.aimAsked = true; OD.save.settings.tips = 'off'; OD.INTRO.forEach(i => { OD.save.intro[i.id] = true; }); OD.persist(); });
await page.click('[data-act=play]'); await page.clock.runFor(1800);
const giveAll = await page.evaluate(() => { const d = OD.game._dbg, S = d.S, p = S.p; p.inv = 999; S.dir.nextWave = 1e9; S.dir.nextDust = 1e9; for (const t of ['surge', 'twin', 'stasis', 'aegis', 'vortex', 'magnet', 'shield', 'shield']) S.pk.push({ k: 'power', type: t, o: p.o, a: p.th, life: 9, t: 1, x: p.wx, y: p.wy, w: 0 }); return true; });
await page.clock.runFor(1500);
const pw = await page.evaluate(() => { const p = OD.game.run.p; return { surge: p.surge > 0, twin: p.twin > 0, stasis: p.stasis > 0, aegis: p.aegis, shield: +p.shield, wells: (OD.game.run.wells || []).length }; });
check(pw.surge && pw.twin && pw.stasis && pw.aegis === 1 && pw.shield === 2 && pw.wells === 1, 'surge, wingman, stasis, aegis, vortex and stacked shields all take effect ' + JSON.stringify(pw));
await page.clock.runFor(6000);
await page.evaluate(() => { const S = OD.game.run; S.stats.grazes = 20; S.stats.tricks = 14; S.p.inv = 0; S.p.shield = false; S.p.aegis = 0; S.p.surge = 0; S.p.phase = 0; S.p.stasis = 0; OD.game._dbg.die(); });
await page.clock.runFor(3500);
check(await page.evaluate(() => OD.ui.cur === 'over' && !!document.getElementById('rsreel')), 'the end of a run opens with the badge reel');
await page.click('#rsreel'); await page.clock.runFor(900);
check(await page.evaluate(() => !!document.querySelector('#rsmain.in') && document.querySelectorAll('.rs-mini').length >= 1), 'tapping skips to the summary with the earned badges on the shelf');
check(page.errors.length === 0, 'no page errors with the new power-ups and results ' + page.errors.join('|'));
await page.context().close();

await b.close(); server.kill();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
