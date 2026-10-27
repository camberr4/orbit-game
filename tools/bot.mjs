// A test bot that plays Halo Run headless and reports how far it gets, to check pacing and the strength of the skills.
//
//   node tools/bot.mjs [--lives N (the game starts you with 3)] [--runs 6] [--level 1] [--mult 2] [--branch guard|control|fortune|mixed|none] [--sp 30] [--maxmin 40] [--pscale 1] [--port 8123]
//
// The game is stepped directly (OD.game._dbg.update at 60 steps a second, no drawing), so a 20 minute run takes seconds. The bot is a reflex
// player: every 50 ms it looks a short time ahead at where each hazard is going (using the game's own hit geometry, gapAt) and where its dot would
// be if it stayed, flipped or hopped an orbit, and picks the safest. It has no sense of stardust, tricks or the multiplier, so the multiplier is
// simply held at --mult (the share of a real player's score engine). It shows RELATIVE strength (how a loadout compares to none, how the skies
// compare); it is not a human. Level 0, 1, 2 = clumsy, decent, sharp reflexes.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const LIVES = +arg('lives', 0), GOD = arg('god', '') === '1', DEBUG = arg('debug', '') === '1', RUNS = +arg('runs', 6), LEVEL = +arg('level', 1), MULT = +arg('mult', 2), BRANCH = arg('branch', 'none'), SP = +arg('sp', 30), MAXMIN = +arg('maxmin', 40), PSCALE = arg('pscale', '1'), PORT = arg('port', '8124');

const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await b.newPage({ viewport: { width: 390, height: 780 } }); const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(`http://localhost:${PORT}/?debug&noaudio&pscale=${PSCALE}${arg('bh', '') === '1' ? '&bh' : ''}`); await pg.waitForSelector('.halo');
const res = await pg.evaluate(async ({ LIVES, GOD, DEBUG, RUNS, LEVEL, MULT, BRANCH, SP, MAXMIN }) => {
  const d = OD.game._dbg, out = [];
  OD.save.onboarded = true; OD.save.tutorialDone = true; OD.save.hintsDone = true; OD.save.stats.runs = Math.max(OD.save.stats.runs, 50); OD.save.full = true; OD.INTRO.forEach(i => { OD.save.intro[i.id] = true; }); OD.save.settings.tips = 'off';
  const PAR = [{ T: 0.55, margin: 14, miss: 0.22, react: 0.26 }, { T: 0.8, margin: 12, miss: 0.08, react: 0.17 }, { T: 1.05, margin: 10, miss: 0.02, react: 0.1 }][LEVEL];
  // the skill loadout: spend SP on one path, in order, then the abilities that fit
  function loadout() {
    const sv = OD.save; sv.perks = {}; sv.sp = { bought: SP }; sv.equip = 'retro';
    if (BRANCH === 'none') return;
    const ABIL = { guard: ['shock'], fortune: ['draw'], control: [], mixed: ['shock', 'draw'] }[BRANCH] || [];   // the path's own active ability (Retro Thrust and Afterburner are not flown by the bot)
    const reserve = ABIL.reduce((a, id) => a + OD.PERK_BY_ID[id].sp[0], 0);
    let left = SP - reserve; const brs = BRANCH === 'mixed' ? ['guard', 'control', 'fortune'] : [BRANCH];
    for (let round = 0; round < 40 && left > 0; round++) for (const br of brs) {
      const list = OD.PERKS.filter(p => p.branch === br).sort((a, b) => a.tier - b.tier);
      for (const p of list) { const lv = OD.perkLevel(p.id); if (lv >= p.sp.length || !OD.perkOpen(p) || p.sp[lv] > left) continue; sv.perks[p.id] = lv + 1; left -= p.sp[lv]; break; }
    }
    left += reserve;
    for (const id of ABIL) { const a = OD.PERK_BY_ID[id]; if (!OD.perkOpen(a) || a.sp[0] > left || OD.perkLevel(id)) continue; sv.perks[id] = 1; left -= a.sp[0]; }
  }
  for (let run = 0; run < RUNS; run++) {
    loadout(); OD.persist(); OD.ui.show('hud'); OD.game.start('endless');
    let S = d.S; if (LIVES) S.lives = LIVES;   // --lives 3: a bot that always starts with three extra lives
    let prevL = null, prevSh = 0; const hitsAt = []; const vel = new WeakMap(); let bossAt = 0, lastT0 = 0, step = 0, nextDecide = 0.6, pending = null, omega = 1.2, lastTh = S.p.th, skyAt = [], planetAt = [], lastHops = 0, lastBiome = OD.game.world.id, visAt = -1, shocks = 0;
    const MAXSTEP = MAXMIN * 60 * 60;
    const R = d.R(); let prevPos = new Map();
    while (step < MAXSTEP) {
      S = d.S; const p = S.p;
      if (S.win || S.over || (S.dying > 0) || p.dead) break;
      if (OD.game.state !== 'play') break;
      step++; const t = S.time; if (GOD) p.inv = 999;   // --god 1: cannot die, to time the pacing alone
      if (S.mult < MULT) { S.mult = MULT; } S.multT = Math.max(S.multT, 2);   // the player's multiplier engine, held
      if (S.dir.boss && !bossAt) bossAt = Math.round(t);
      { const L = S.lives || 0, Sh = +S.p.shield || 0; if (prevL != null && (L < prevL || Sh < prevSh)) hitsAt.push(+(t - (bossAt || 0)).toFixed(1)); prevL = L; prevSh = Sh; }
      if (S.stats.hops !== lastHops) { lastHops = S.stats.hops; planetAt.push(Math.round(t)); }
      if (OD.game.world.id !== lastBiome) { lastBiome = OD.game.world.id; skyAt.push([lastBiome, Math.round(t)]); }
      // a planet drifts past: the bot goes to it a few seconds after it arrives, as a player would
      if (S.vis && S.vis.phase === 'pass' && !S.vis.bh) { if (visAt < 0) visAt = t; if (t - visAt > 3.5 + Math.random() * 2) { d.startSettle(); visAt = -1; } } else visAt = -1;
      if (pending && t >= pending.at) { const a = pending.a; pending = null; if (a === 'flip') d.flip(); else if (a === 'in') d.keyHop(-1); else if (a === 'out') d.keyHop(1); }
      if (t >= nextDecide && !S.intro) {
        nextDecide = t + 0.05;
        if (p.body === 'main' && !p.jump && !pending) {
          const dth = ((p.th - lastTh + Math.PI * 3) % (Math.PI * 2)) - Math.PI, w = Math.abs(dth) / Math.max(0.02, t - lastT0); lastT0 = t; if (w > 0.2 && w < 1.8) omega = omega * 0.6 + 0.4 * w; lastTh = p.th;
          const [px, py] = d.playerXY(), bs = S.dir.boss, o = p.o, OUT = d.OUTN(), lo = d.lowO();
          // hazard velocities from where they were at the last look
          const hz = S.hz.filter(h => !h.dead && h.warn <= 0.0001 || (!h.dead && h.warn < PAR.react + PAR.T));
          const cur = new Map(); for (const h of hz) { let hx, hy; if (h.k === 'comet' || h.k === 'cinder') { hx = h.x; hy = h.y; } else [hx, hy] = d.hpos(h); cur.set(h, [hx, hy, t]); const q = prevPos.get(h), dtq = q ? t - q[2] : 0; vel.set(h, q && dtq > 0.01 && dtq < 0.5 ? [(hx - q[0]) / dtq, (hy - q[1]) / dtq] : [0, 0]); }
          prevPos = cur;
          const cx0 = px - 0, cy0 = py - 0;
          const ctr = [d.cx || 0, d.cy || 0];
          const eval_ = (act) => {   // the smallest gap to anything lethal over the next T seconds, with the action only taking effect after the bot's own reaction time (and a hop after its flight)
            let worst = 1e9; const orb = act === 'out' ? Math.min(OUT, o + 1) : act === 'in' ? Math.max(lo, o - 1) : o, dir0 = p.dir, delay = act === 'stay' ? 99 : PAR.react;
            if ((act === 'out' && o >= OUT) || (act === 'in' && o <= lo) || (bs && bs.cap && act !== 'stay' && orb < lo)) return -1e9;
            const cxx = px - Math.cos(p.th) * R[o], cyy = py - Math.sin(p.th) * R[o], hop = act === 'out' || act === 'in';
            let th = p.th;
            for (let tt = 0.05; tt <= PAR.T; tt += 0.05) {
              const after = tt > delay, flipped = act === 'flip' && after, onNew = hop && tt > delay + 0.13, rr = onNew ? R[orb] : R[o];
              th += (flipped ? -dir0 : dir0) * omega * (R[o] / rr) * 0.05;
              const qx = cxx + Math.cos(th) * rr, qy = cyy + Math.sin(th) * rr;
              { const e = S.evt, U = d.U(), pr = 4.6 * U;   // the sky's events: flare lanes, a black hole, a nova ring
                if (e) { const et = e.t + tt;
                  if (e.type === 'flare') { for (const v of e.volleys) { if (et < v.at - 0.1 || et > v.at + v.dur) continue; for (const a of v.lanes) { const vx = qx - e.x, vy = qy - e.y; if (vx * Math.cos(a) + vy * Math.sin(a) <= 0) continue; const g = Math.abs(vx * Math.sin(a) - vy * Math.cos(a)) - (3.8 * U + pr); if (g < worst) worst = g; } } }
                  else if (e.type === 'hole' && e.ramp > 0.1) { const g = Math.hypot(qx - e.x, qy - e.y) - (e.core + pr); if (g < worst) worst = g; }
                  else if (e.type === 'nova' && et >= e.warn) { const f = e.blasted ? e.f + e.speed * tt : (et - e.warn) * e.speed, g = Math.abs(Math.hypot(qx - e.x, qy - e.y) - f) - (10 * U + pr); if (g < worst) worst = g; } } }
              for (const h of hz) { if (h.warn > tt) continue; const v = vel.get(h) || [0, 0], w0 = h.warn; h.warn = 0; const g = d.gapAt(h, qx - v[0] * tt, qy - v[1] * tt); h.warn = w0; if (g !== null && g < worst) worst = g; }   // a hazard still warning counts from the moment it turns solid
            }
            return worst - (act === 'stay' ? 0 : 4);
          };
          let best = 'stay', bestV = eval_('stay'); const v0 = bestV;
          const marginPx = PAR.margin * (390 / 360);
          if (bestV < marginPx) for (const a of ['flip', 'out', 'in']) { const v = eval_(a); if (v > bestV) { bestV = v; best = a; } }
          // the black hole: never stand on the orbit about to go
          if (best === 'stay' && bestV > marginPx * 1.6 && !(bs && bs.cap)) {   // nothing is close: go and pick up a power-up on the next orbit, a little way ahead
            let pk = null, pa = 9; for (const k of S.pk) { if (k.dead || k.k !== 'power' || k.t < 0.2 || k.o == null || Math.abs(k.o - o) !== 1) continue; const ah = (((k.a - p.th) * p.dir + 3 * Math.PI) % (2 * Math.PI)) - Math.PI; if (ah > 0.15 && ah < 1.1 && ah < pa) { pa = ah; pk = k; } }
            if (pk) { const a = pk.o > o ? 'out' : 'in'; if (eval_(a) > marginPx * 1.2) best = a; }
          }
          if (bs && bs.cap && o <= bs.minO && o < OUT && bs.minO < OUT) best = 'out';
          if (DEBUG) { (globalThis.__log = globalThis.__log || []).push([+t.toFixed(2), Math.round(v0), best, Math.round(bestV), o, p.dir, +omega.toFixed(2), hz.length]); if (globalThis.__log.length > 40) globalThis.__log.shift(); }
          if (best !== 'stay' && Math.random() > PAR.miss) pending = { a: best, at: t + PAR.react * (0.7 + 0.6 * Math.random()) };
          if (bestV < 2 && OD.ability('shock') && S.shockCd <= 0) { d.fireShock(); shocks++; }
          if (OD.ability('draw') && S.drawCd <= 0 && S.time > 8) d.fireDraw();   // Lucky Draw: a power-up whenever it is ready
        }
      }
      d.update(1 / 60);
    }
    S = d.S;
    if (DEBUG) { out.push({ log: (globalThis.__log || []).slice(-14), cause: S.endCause, time: Math.round(S.time), score: 0, hops: 0, maxSky: 0 }); globalThis.__log = []; try { OD.game.quit(); } catch (e) { /* ok */ } continue; }
    out.push({ win: !!S.win, time: Math.round(S.time), score: Math.round(S.score), hops: S.stats.hops, cause: S.endCause || (S.win ? 'win' : 'timeout'), skies: skyAt, planetAt, bossAt, boss: false, maxSky: lastBiome, boss: !!(S.dir && S.dir.boss), shocks, hitsAt });
    try { OD.game.quit(); } catch (e) { /* ok */ }
  }
  return out;
}, { LIVES, GOD, DEBUG, RUNS, LEVEL, MULT, BRANCH, SP, MAXMIN });
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const mm = t => (t / 60).toFixed(1) + 'm';
console.log(`bot level ${LEVEL}${LIVES ? '  +' + LIVES + ' lives' : ''}  mult x${MULT}  loadout ${BRANCH}${BRANCH === 'none' ? '' : ' ' + SP + ' SP'}  runs ${RUNS}`);
if (DEBUG) for (const r of res) console.log(r.cause, r.time, '\n' + r.log.map(l => JSON.stringify(l)).join('\n'));
for (const r of DEBUG ? [] : res) { if (GOD) console.log('  planets arrived (seconds):', JSON.stringify(r.planetAt)); if (GOD) console.log('  skies entered (sky id @ seconds):', JSON.stringify(r.skies), ' boss at', r.bossAt, 's'); if (arg('bh', '') === '1') console.log('  hits at (s into the boss):', JSON.stringify(r.hitsAt), ' lives left', 0);
  console.log(`  ${r.win ? 'WIN ' : 'died'} ${mm(r.time).padStart(6)}  score ${String(r.score).padStart(7)}  planets ${String(r.hops).padStart(2)}  sky ${r.maxSky}${r.boss ? ' (boss)' : ''}  by ${r.cause}`); }
console.log(`  wins ${res.filter(r => r.win).length}/${res.length}   median time ${mm(med(res.map(r => r.time)))}   median planets ${med(res.map(r => r.hops))}   best sky ${Math.max(...res.map(r => r.maxSky))}`);
const causes = {}; for (const r of res) causes[r.cause] = (causes[r.cause] || 0) + 1; console.log('  deaths:', JSON.stringify(causes), errs.length ? 'ERRORS ' + errs.slice(0, 3).join(' | ') : '');
await b.close();
