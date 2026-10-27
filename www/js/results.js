'use strict';
// The end of a run. First, the badges you earned arrive one at a time in the middle of the screen (a medal for how you flew, goals you
// completed, planets you unlocked, a new best), each with a short line saying what it was for and a chime that climbs a step with
// every one. Each then settles into a shelf at the bottom. Then everything else is laid out calmly around the score.
(() => {
  const U = OD.ui.internals, { screens, after, acts, scr, IC } = U;
  const fmtT = s => { s = Math.floor(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const esc = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  // ---------------------------------------------------------------- medals: how you flew, in tiers
  OD.MEDALS = [
    { id: 'graze', name: 'Close Call', glyph: 'graze', val: r => r.grazes, tiers: [6, 15, 30], desc: n => `${n} near misses` },
    { id: 'tricks', name: 'Showtime', glyph: 'star', val: r => r.tricks, tiers: [5, 12, 25], desc: n => `${n} tricks landed` },
    { id: 'combo', name: 'Chain Master', glyph: 'bolt', val: r => r.maxCombo, tiers: [2.5, 3.5, 5], desc: n => `a x${(+n).toFixed(1)} multiplier` },
    { id: 'dust', name: 'Stardust Hunter', glyph: 'dust', val: r => r.dust, tiers: [25, 60, 120], desc: n => `${n} stardust gathered` },
    { id: 'time', name: 'Long Haul', glyph: 'clock', val: r => r.time, tiers: [60, 120, 240], desc: n => `${fmtT(n)} in the sky` },
    { id: 'hops', name: 'Planet Hopper', glyph: 'planet', val: r => (r.planets || 1) - 1, tiers: [2, 4, 7], desc: n => `${n} planet switches` },
    { id: 'biomes', name: 'Wayfarer', glyph: 'biome', val: r => r.biomeCount || 1, tiers: [2, 3, 5], desc: n => `${n} biomes crossed` },
    { id: 'power', name: 'Well Armed', glyph: 'power', val: r => r.powerups || 0, tiers: [3, 6, 10], desc: n => `${n} power-ups used` },
    { id: 'perfect', name: 'Dead Centre', glyph: 'target', val: r => r.perfects, tiers: [8, 20, 40], desc: n => `${n} perfect jumps` },
    { id: 'score', name: 'High Flyer', glyph: 'crown', val: r => r.score, tiers: [1500, 4000, 9000], desc: n => `${OD.fmt(n)} points` },
  ];
  const TIER_NAME = ['', 'Bronze', 'Silver', 'Gold'];
  const PAL = { 1: ['#f3c397', '#a8683a'], 2: ['#f7faff', '#9aa8c4'], 3: ['#fff0a0', '#e0a021'], goal: ['#a9ecff', '#6a7dff'], best: ['#fff4b8', '#ff9a3d'], planet: ['#b9ffd6', '#2fa86a'] };

  function earnedMedals(r) {
    if (r.reason === 'demo') return [];
    const out = [];
    for (const m of OD.MEDALS) {
      if (r.mode === 'zen' && !['time', 'dust'].includes(m.id)) continue;
      const v = m.val(r); let tier = 0;
      m.tiers.forEach((t, i) => { if (v >= t) tier = i + 1; });
      const need = x => m.id === 'combo' ? '×' + x : m.id === 'time' ? fmtT(x) : m.id === 'score' ? OD.fmt(x) : String(x);
      if (tier) out.push({ kind: 'medal', id: m.id, name: m.name, glyph: m.glyph, tier, text: m.desc(m.id === 'combo' ? v : Math.floor(v)), note: `${TIER_NAME[tier]} at ${need(m.tiers[tier - 1])}${tier < 3 ? ` · ${TIER_NAME[tier + 1]} at ${need(m.tiers[tier])}` : ' · the top tier'}`, rank: tier + Math.min(0.99, v / m.tiers[2]) });
    }
    return out.sort((a, b) => b.rank - a.rank).slice(0, 4).reverse();   // the best of them arrives last
  }
  // the reel: medals, then goals, then new planets, then a new best
  function buildReel(r) {
    const reel = earnedMedals(r);
    const goals = r.newAch.map(c => ({ kind: 'goal', cid: c.id, name: c.name, glyph: glyphFor(c.id), tier: 0, text: c.desc, reward: c.paid || c.reward, extra: c.gotExtra || '' }));
    if (goals.length > 5) { const rest = goals.splice(4); const sum = rest.reduce((a, g) => a + g.reward, 0); goals.push({ kind: 'goal', name: `+${rest.length} more achievements`, glyph: 'check', tier: 0, text: 'all complete', reward: sum }); }
    reel.push(...goals);
    for (const k of (r.newPlanets || [])) reel.push({ kind: 'planet', name: OD.PLANET_BY_SKIN[k].label, glyph: 'planet', tier: 0, text: 'joins your journey' });
    { const sv = OD.save, cost = OD.spCost(sv.sp.bought || 0), before = sv.stardust - (r.stardust || 0);   // this run's stardust is what made the next skill point affordable
      if ((sv.sp.bought || 0) < OD.SP_MAX && sv.stardust >= cost && before < cost) reel.push({ kind: 'planet', name: 'Skill Point', glyph: 'power', tier: 0, text: 'ready to buy in Skills' }); }
    if (r.newBest && r.mode !== 'zen') reel.push({ kind: 'best', name: 'New Best', glyph: 'crown', tier: 0, text: r.mode === 'daily' ? 'your best today' : 'your highest score yet' });
    return reel;
  }
  const GLYPH_KEYS = [['graze', 'graze'], ['razor', 'graze'], ['trick', 'star'], ['weave', 'star'], ['dust', 'dust'], ['star', 'dust'], ['combo', 'bolt'], ['mult', 'bolt'], ['time', 'clock'], ['zen', 'clock'], ['planet', 'planet'], ['world', 'planet'], ['hop', 'planet'], ['power', 'power'], ['shield', 'power'], ['daily', 'clock'], ['score', 'crown'], ['perfect', 'target'], ['run', 'planet']];
  function glyphFor(id) { for (const [k, g] of GLYPH_KEYS) if (id.includes(k)) return g; return 'check'; }

  // ---------------------------------------------------------------- badge art
  const GL = {   // simple, bold glyphs on a 40 x 40 grid
    graze: '<path d="M8 28c6-14 18-14 24 0" fill="none"/><circle cx="20" cy="12" r="3.2" fill="currentColor" stroke="none"/><path d="M13 31h14" fill="none"/>',
    star: '<path d="M20 5l3.4 9.6L33 17l-9.6 3.4L20 30l-3.4-9.6L7 17l9.6-2.4z" fill="currentColor" stroke="none"/>',
    bolt: '<path d="M23 4L10 22h8l-3 14 15-20h-9z" fill="currentColor" stroke="none"/>',
    dust: '<path d="M20 6l2.4 8.6L31 17l-8.6 2.4L20 28l-2.4-8.6L9 17l8.6-2.4z" fill="currentColor" stroke="none"/><circle cx="30" cy="9" r="2" fill="currentColor" stroke="none"/><circle cx="9" cy="30" r="2.2" fill="currentColor" stroke="none"/>',
    clock: '<circle cx="20" cy="20" r="13" fill="none"/><path d="M20 11v9l6 4" fill="none"/>',
    planet: '<circle cx="20" cy="20" r="8" fill="currentColor" stroke="none"/><ellipse cx="20" cy="20" rx="16" ry="5.5" transform="rotate(-24 20 20)" fill="none"/>',
    biome: '<path d="M4 30c5-10 9-12 13-4 3-8 7-16 12-4l7 8z" fill="currentColor" stroke="none" opacity=".9"/><circle cx="28" cy="10" r="4" fill="currentColor" stroke="none"/>',
    power: '<path d="M20 4l12 16-12 16L8 20z" fill="none"/><path d="M20 12l5.5 8-5.5 8-5.5-8z" fill="currentColor" stroke="none"/>',
    target: '<circle cx="20" cy="20" r="14" fill="none"/><circle cx="20" cy="20" r="8" fill="none"/><circle cx="20" cy="20" r="2.6" fill="currentColor" stroke="none"/>',
    crown: '<path d="M6 29l2-16 8 8 4-11 4 11 8-8 2 16z" fill="currentColor" stroke="none"/><path d="M7 33h26" fill="none"/>',
    check: '<path d="M9 21l8 8 15-17" fill="none"/>',
  };
  const hexPath = rad => { let p = ''; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 - Math.PI / 2; p += (i ? 'L' : 'M') + (60 + Math.cos(a) * rad).toFixed(1) + ' ' + (60 + Math.sin(a) * rad).toFixed(1); } return p + 'Z'; };
  function badge(b, size = 132) {
    if (b.kind === 'goal' && b.cid && OD.goalBadge) return OD.goalBadge(b.cid, size, true).replace('<svg class="gb', '<svg class="rs-badge gb');
    const [c1, c2] = PAL[b.kind === 'medal' ? b.tier : b.kind] || PAL.goal, uid = 'b' + Math.random().toString(36).slice(2, 7);
    const shape = b.kind === 'goal' ? (() => { let p = ''; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 - Math.PI / 2; p += (i ? 'L' : 'M') + (60 + Math.cos(a) * 54).toFixed(1) + ' ' + (60 + Math.sin(a) * 54).toFixed(1); } return `<path d="${p}Z" fill="url(#${uid}f)" stroke="url(#${uid}r)" stroke-width="5" stroke-linejoin="round"/>`; })()
      : b.kind === 'best' ? (() => { let p = ''; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? 46 : 58; p += (i ? 'L' : 'M') + (60 + Math.cos(a) * rr).toFixed(1) + ' ' + (60 + Math.sin(a) * rr).toFixed(1); } return `<path d="${p}Z" fill="url(#${uid}f)" stroke="url(#${uid}r)" stroke-width="4" stroke-linejoin="round"/>`; })()
      : `<circle cx="60" cy="60" r="53" fill="url(#${uid}f)" stroke="url(#${uid}r)" stroke-width="6"/><circle cx="60" cy="60" r="44" fill="none" stroke="${c1}" stroke-opacity=".35" stroke-width="1.2" stroke-dasharray="2 5"/>`;
    // the level dots sit on an arc that follows the curve of the badge, not on a flat line
    const pips = b.tier ? Array.from({ length: 3 }, (_, i) => { const th = Math.PI / 2 + (1 - i) * 0.36; return `<circle cx="${(60 + Math.cos(th) * 38).toFixed(1)}" cy="${(60 + Math.sin(th) * 38).toFixed(1)}" r="3.1" fill="${i < b.tier ? c1 : 'rgba(255,255,255,.2)'}"/>`; }).join('') : '';
    return `<svg class="rs-badge" viewBox="0 0 120 120" width="${size}" height="${size}" style="color:${c1}">
      <defs><linearGradient id="${uid}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
      <radialGradient id="${uid}f" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#26356b"/><stop offset="1" stop-color="#0a1130"/></radialGradient>
      <linearGradient id="${uid}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".34"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <clipPath id="${uid}c">${b.kind === 'goal' ? `<path d="${hexPath(51)}"/>` : `<circle cx="60" cy="60" r="${b.kind === 'best' ? 45 : 52}"/>`}</clipPath></defs>
      ${shape}
      <g clip-path="url(#${uid}c)"><g class="shine"><rect x="-70" y="-70" width="40" height="260" fill="url(#${uid}s)" transform="rotate(22 60 60)"/></g></g>
      <g transform="translate(40 36)" stroke="${c1}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">${GL[b.glyph] || GL.check}</g>${pips}</svg>`;
  }

  OD.badgeSvg = badge;

  // ---------------------------------------------------------------- the screen
  const biomeList = r => (r.biomes || [r.world]).map(i => OD.WORLDS[i] || OD.WORLDS[0]);
  screens.over = function () {
    const r = lastRes(), sv = OD.save;
    const zen = r.mode === 'zen', title = r.reason === 'time' ? 'Time up' : zen ? 'Session ended' : 'Run complete';
    const modeName = esc((OD.WORLDS[r.world] || OD.WORLDS[0]).name);
    const big = zen ? fmtT(r.time) : '0';
    const tiles = zen
      ? [[fmtT(r.time), 'Calm time'], [OD.fmt(r.dust), 'Orbs'], [(r.planets || 1), 'Planets']]
      : [[fmtT(r.time), 'Time'], [(r.planets || 1), 'Planets'], ['×' + (+r.maxCombo).toFixed(1), 'Best mult'], [OD.fmt(r.grazes), 'Grazes'], [OD.fmt(r.tricks || 0), 'Tricks'], [OD.fmt(r.dust), 'Orbs']];
    const chips = '';
    const bl = biomeList(r), dotOf = w => `<span style="--dc:${w.accent}">${esc(w.short)}</span>`, trail = bl.length > 1 ? `<div class="rs-trail">${bl.map((w, i) => (i ? `<i style="background:linear-gradient(90deg, ${bl[i - 1].accent}, ${w.accent})"></i>` : '') + dotOf(w)).join('')}</div>` : `<div class="rs-trail one">${dotOf(bl[0])}</div>`;
    const need = OD.spCost(sv.sp.bought || 0), maxed = (sv.sp.bought || 0) >= OD.SP_MAX, pct = maxed ? 100 : Math.min(100, Math.round(sv.stardust / need * 100)), ready = !maxed && sv.stardust >= need;
    const daily = r.dailyInfo ? `<div class="rs-daily">Daily streak <b>${r.dailyInfo.streak} day${r.dailyInfo.streak === 1 ? '' : 's'}</b>${r.bonus ? ` · bonus +${r.bonus}` : ''}</div>` : '';
    const achSd = (r.newAch || []).reduce((a, c) => a + (c.paid || c.reward || 0), 0), totalSd = (r.stardust || 0) + achSd;
    const scoreSd = zen ? 0 : Math.floor(r.score / 150), restSd = Math.max(0, (r.stardust || 0) - (r.dust || 0) - scoreSd - (r.bonus || 0));
    const brk = [[OD.fmt(r.dust || 0), 'orbs'], scoreSd ? [OD.fmt(scoreSd), 'score'] : null, r.bonus ? ['+' + r.bonus, 'daily'] : null, restSd ? ['+' + OD.fmt(restSd), 'bonus'] : null, achSd ? ['+' + OD.fmt(achSd), 'achievements'] : null].filter(Boolean);
    const gw = r.gate != null ? OD.WORLDS[r.gate] : null;
    const demo = sv.full ? '' : `<div class="rs-unlock" style="--c:${gw ? gw.accent : '#ffd95a'}"><div class="ru-tx"><small>THE FULL GAME · ONE-TIME PURCHASE</small><b>Unlock the entire galaxy</b><span>${OD.WORLDS.length - 1} more biomes, ${OD.PLANETS.length - 2} planets and a boss</span></div><button class="btn gold sm" data-act="paywall" data-v="next">Unlock all · ${OD.shop.price}</button></div>`;
    return `<div class="rs" id="rs">
      <div class="rs-reel" id="rsreel"><div class="rs-rays"></div><div class="rs-stage" id="rsstage"></div><div class="rs-skip">tap to skip</div></div>
      <div class="rs-main" id="rsmain">
        <div class="rs-top">
          <div class="rs-kick">${title}${modeName ? ' · ' + modeName : ''}</div>
          <div class="rs-score" id="finalscore">${big}</div>
          ${r.newBest && !zen ? '<div class="rs-best">NEW BEST</div>' : (zen ? '' : `<div class="rs-bestline">Best ${OD.fmt(r.best)}</div>`)}
          ${daily}
        </div>
        <div class="rs-mid">
          <div class="rs-tiles">${tiles.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>
          ${bl.length > 1 ? trail : ''}
          <div class="rs-achw" id="rsachw"></div>
        </div>
        <div class="rs-low">
          <div class="rs-earn"><div class="rs-earnlab">Stardust earned</div><div class="rs-earnrow"><span class="rs-plus">${IC.star}+${OD.fmt(totalSd)}</span></div>
            <div class="rs-brk">${brk.map(([n, l]) => `<span>${n} ${l}</span>`).join('')}</div></div>
          ${ready || maxed ? `<button class="rs-spbox ready" data-act="go" data-v="perks"><b>${IC.star}${maxed ? 'Every skill point bought' : 'A skill point is ready'}</b><small>Spend it in Skills</small></button>`
            : `<div class="rs-spbox"><div class="rs-sp"><div class="bar"><i style="width:${pct}%"></i></div></div><small>${OD.fmt(need - sv.stardust)} to the next skill point</small></div>`}
          <div class="rs-shelf" id="rsshelf"></div><div class="rs-cap" id="rscap"></div>
        </div>
        <div class="rs-act">
          <div class="rs-btns"><button class="btn sm rs-home" data-act="go" data-v="home">${IC.home} Menu</button><button class="btn primary" data-act="restart" id="retry">${IC.redo} Retry</button></div>
          ${demo}
        </div>
      </div></div>`;
  };
  function lastRes() { return U.lastRes; }

  let reelTimer = 0, countRaf = 0, runId = 0;
  after.over = function () {
    const r = lastRes(); if (!r) return;
    U.lockout(450);
    const id = ++runId, main = scr.querySelector('#rsmain'), reelEl = scr.querySelector('#rsreel'), stage = scr.querySelector('#rsstage'), shelf = scr.querySelector('#rsshelf');
    const reel = buildReel(r);
    main.classList.add('hidden-up');
    let finished = false;
    const finish = () => {
      if (finished || id !== runId) return; finished = true; clearTimeout(reelTimer);
      reelEl.classList.add('gone'); setTimeout(() => reelEl.remove(), 500);
      main.classList.remove('hidden-up'); main.classList.add('in');
      // achievements are the big ones: a row of badges, and a tap slides that badge to the left of a ribbon that says what it was and what it paid
      const goals = (r.newAch || []).map(c => ({ kind: 'goal', cid: c.id, name: c.name, glyph: glyphFor(c.id), tier: 0, text: c.desc, reward: c.paid || c.reward, extra: c.gotExtra || '' })), rest = reel.filter(b => b.kind !== 'goal'), achw = scr.querySelector('#rsachw');
      const asz = goals.length <= 4 ? 66 : goals.length <= 8 ? 52 : 42;   // the more there are, the smaller each badge, so they wrap onto a second or third line instead of being lumped together
      if (goals.length && achw) {
        const total = goals.reduce((a, g) => a + (g.reward || 0), 0);
        achw.innerHTML = `<div class="rs-achh">${goals.length === 1 ? 'Achievement' : 'Achievements'} unlocked <b>${IC.star}+${OD.fmt(total)}</b></div><div class="rs-ach" style="--asz:${asz}px">${goals.map((g, i) => `<button class="rs-ac" data-i="${i}" style="animation-delay:${0.3 + i * 0.1}s"><span class="rs-acb">${badge(g, asz)}</span><span class="rs-act2"><small>${esc(g.name === 'x' ? '' : 'Achievement')}</small><b>${esc(g.name)}</b><em>${esc(g.text || '')}</em>${g.extra ? `<i class="rs-ax">${esc(g.extra)}</i>` : ''}</span><span class="rs-acr">${IC.star}+${OD.fmt(g.reward || 0)}</span></button>`).join('')}</div>`;
        const box = achw.querySelector('.rs-ach');
        box.addEventListener('click', e => {
          const t = e.target.closest('.rs-ac'); if (!t) return; e.stopPropagation();
          const kids = [...box.children], firstR = kids.map(k => k.getBoundingClientRect()), bb = t.querySelector('.rs-acb'), bFirst = bb.getBoundingClientRect(), opening = !t.classList.contains('open');
          kids.forEach(k => k.classList.remove('open')); if (opening) t.classList.add('open');
          kids.forEach((k, i) => { if (k === t) return; const l = k.getBoundingClientRect(), dx = firstR[i].left - l.left, dy = firstR[i].top - l.top; if (dx || dy) k.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' }); });
          const bl = bb.getBoundingClientRect(), dx = bFirst.left - bl.left, dy = bFirst.top - bl.top;
          if (dx || dy) bb.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
          if (opening) t.querySelectorAll('.rs-act2, .rs-acr').forEach((x, j) => x.animate([{ opacity: 0, transform: 'translateX(-10px)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: 120 + j * 60, easing: 'ease-out', fill: 'backwards' }));
          OD.audio.sfx('click');
        });
      } else if (achw) achw.style.display = 'none';
      shelf.innerHTML = rest.map((b, i) => `<button class="rs-mini" data-i="${i}" style="animation-delay:${0.35 + i * 0.06}s" aria-label="${esc(b.name)}">${badge(b, 40)}</button>`).join('');
      // tap a badge to see what it was for
      const cap = scr.querySelector('#rscap'); let shown = -1, capT = 0;
      shelf.addEventListener('click', e => {
        const m = e.target.closest('.rs-mini'); if (!m || !cap) return; e.stopPropagation();
        const i = +m.dataset.i, b = rest[i]; clearTimeout(capT);
        if (shown === i) { shown = -1; cap.classList.remove('on'); return; }
        const was = shown >= 0; shown = i;
        const fill = () => { cap.innerHTML = `<b>${esc(b.name)}</b><span>${esc(b.text || '')}${b.reward ? ` · +${OD.fmt(b.reward)} stardust` : ''}</span>${b.note ? `<small>${esc(b.note)}</small>` : ''}`; };
        if (was) {   // switching from one badge to another: the old text slips out and the new one slides in
          cap.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-5px)' }], { duration: 110, easing: 'ease-in', fill: 'forwards' }).onfinish = () => {
            if (shown !== i) return; fill();
            cap.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
          };
        } else { fill(); cap.getAnimations().forEach(a => a.cancel()); }
        cap.classList.add('on'); shelf.querySelectorAll('.rs-mini').forEach(x => x.classList.toggle('sel', x === m));
        capT = setTimeout(() => { cap.classList.remove('on'); cap.getAnimations().forEach(a => a.cancel()); shelf.querySelectorAll('.rs-mini').forEach(x => x.classList.remove('sel')); shown = -1; }, 4200);
      });
      if (r.mode !== 'zen') countUp(r.score); else { const el = scr.querySelector('#finalscore'); if (el) el.textContent = fmtT(r.time); }
    };
    reelEl.addEventListener('click', finish);
    if (!reel.length) { finish(); return; }
    // one badge at a time: it rises in with a flash and a chime that goes up a step, holds for a beat, then slips away into the shelf
    const STEP = 880;
    let i = 0;
    const next = () => {
      if (finished || id !== runId) return;
      if (i >= reel.length) { reelTimer = setTimeout(finish, 250); return; }
      const b = reel[i++], el = document.createElement('div');
      el.className = 'rs-card k-' + b.kind;
      el.innerHTML = `${badge(b, 150)}<div class="rs-name">${esc(b.name)}</div><div class="rs-sub">${b.tier ? `<b>${TIER_NAME[b.tier]}</b> · ` : ''}${esc(b.text || '')}</div>${b.reward ? `<div class="rs-rew">${IC.star}+${OD.fmt(b.reward)}</div>` : ''}`;
      stage.appendChild(el);
      OD.audio.sfx('badge', i - 1 + (b.kind === 'best' ? 3 : 0)); OD.haptic(b.kind === 'best' ? 'heavy' : 'light');
      el.animate([{ transform: 'scale(.35) translateY(30px)', opacity: 0, filter: 'blur(8px)' }, { transform: 'scale(1.1)', opacity: 1, filter: 'blur(0)', offset: .55 }, { transform: 'scale(1)', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
      reelTimer = setTimeout(() => {
        if (finished) return;
        el.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.82) translateY(-26px)', opacity: 0 }], { duration: 240, easing: 'ease-in', fill: 'forwards' });
        setTimeout(() => el.remove(), 260);
        reelTimer = setTimeout(next, 250);
      }, STEP - 240);
    };
    reelTimer = setTimeout(next, 500);
  };
  function countUp(target) {
    const el = scr.querySelector('#finalscore'), t0 = performance.now(), dur = 1000;
    cancelAnimationFrame(countRaf);
    const tick = now => {
      const k = Math.min(1, (now - t0) / dur), v = Math.floor(target * OD.easeOut(k));
      if (!el || !document.body.contains(el)) return;
      el.textContent = OD.fmt(v);
      if (k < 1) countRaf = requestAnimationFrame(tick);
    };
    countRaf = requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------- the victory screen
  // The white light of the black hole fades away into a celebration: fireworks, a big thank-you, the whole report of the run and the count of
  // universes cleared. "Enter the next universe" washes the screen white again and a new run begins in the first sky.
  const CONGRATS = [
    ['YOU DID IT', 'You flew into the black hole and came out the other side.<br>Nobody has ever flown that well.'],
    ['AGAIN!', 'A second universe bows to you. The stars are starting to learn your name.'],
    ['UNSTOPPABLE', 'Three universes, and the black hole is the one who is nervous now.'],
    ['LEGENDARY', 'Universe after universe. There is nothing out there that can hold you.'],
  ];
  screens.victory = function () {
    const r = lastRes(), sv = OD.save, n = r.universe || 1, cl = sv.wins || n, c = CONGRATS[Math.min(n, CONGRATS.length) - 1];
    const cells = [[OD.fmt(r.score), 'Score'], [fmtT(r.time), 'Time'], [r.planets || 1, 'Planets'], [(r.biomeCount || 6) + ' of 6', 'Biomes crossed'], ['×' + (+r.maxCombo).toFixed(1), 'Best multiplier'], [OD.fmt(r.grazes || 0), 'Close calls'], [OD.fmt(r.tricks || 0), 'Tricks'], [OD.fmt(r.dust || 0), 'Stardust gathered'], [r.powerups || 0, 'Power-ups']];
    let li = 0; const letters = c[0].split(' ').map(w => '<b class="vw">' + w.split('').map(ch => `<span style="animation-delay:${0.9 + (li++) * 0.06}s">${ch}</span>`).join('') + '</b>').join('<i class="sp"></i>');   // (each word stays in one piece; the line may wrap between words only)
    const dots = Array.from({ length: Math.min(cl, 12) }, (_, i) => `<i style="animation-delay:${2.6 + i * 0.08}s"></i>`).join('') + (cl > 12 ? `<em>+${cl - 12}</em>` : '');
    const goals = (r.newAch || []).map(g => `<span>${esc(g.name)}</span>`).join('');
    return `<div class="vic" id="vic"><canvas id="vicfx"></canvas><div class="vic-rays"></div><div class="vic-white"></div>
      <div class="vic-in">
        <div class="vic-emblem"><i class="r1"></i><i class="r2"></i><i class="r3"></i><svg viewBox="-50 -50 100 100"><defs><radialGradient id="vg" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#ffe9a8"/><stop offset="1" stop-color="#ff9d4a" stop-opacity="0"/></radialGradient></defs><circle r="42" fill="url(#vg)"/><path d="M0-30 L7-9 L29-9 L11 4 L18 26 L0 13 L-18 26 L-11 4 L-29-9 L-7-9Z" fill="#fff6d6" stroke="#ffd95a" stroke-width="2" stroke-linejoin="round"/></svg></div>
        <div class="vic-kick">UNIVERSE ${n} CLEARED</div>
        <h1 class="vic-title" style="--n:${Math.max(...c[0].split(' ').map(w => w.length))}">${letters}</h1>
        <p class="vic-msg">${c[1]}</p>
        <div class="vic-scorewrap"><div class="vic-score" id="vicscore">0</div><small>FINAL SCORE</small></div>
        <div class="vic-grid">${cells.slice(1).map(([v, l], i) => `<div style="animation-delay:${1.9 + i * 0.07}s"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
        <div class="vic-uni"><span>Universes cleared</span><b>${cl}</b><div class="dots">${dots}</div></div>
        <div class="vic-earn"><span class="rs-plus">${IC.star}+${OD.fmt(r.stardust)}</span><small>stardust</small>${goals ? `<div class="vic-goals">${goals}</div>` : ''}</div>
        <div class="vic-btns"><button class="btn primary" data-act="nextuni">Enter universe ${n + 1}</button><button class="btn sm" data-act="vichome">${IC.home} Menu</button></div>
      </div></div>`;
  };
  let vicRaf = 0;
  after.victory = function () {
    const r = lastRes(); if (!r) return;
    U.lockout(1800);
    const vic = scr.querySelector('#vic'), cv = scr.querySelector('#vicfx'); if (!vic || !cv) return;
    { const inn = vic.querySelector('.vic-in'); if (inn) { const fit = () => { inn.style.zoom = ''; const k = Math.min(1, (vic.clientHeight - 4) / inn.scrollHeight); if (k < 1) inn.style.zoom = k.toFixed(3); }; fit(); setTimeout(fit, 300); } }   // the whole screen always fits: it shrinks a little on short phones instead of scrolling
    const g = cv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    // the score counts up while the fireworks start
    const sc = scr.querySelector('#vicscore'), t0 = performance.now();
    const cols = ['#ffd95a', '#ffffff', '#7be8ff', '#ff8ad9', '#b69cff', '#9dff8a', '#ffb36b'];
    const parts = [], rockets = []; let nextR = 0.9;
    const burst = (x, y, col, n) => { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, sp = (60 + Math.random() * 220) * (0.6 + Math.random() * 0.6); parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.1 + Math.random() * 0.9, t: 0, col: Math.random() < 0.25 ? '#fff' : col, s: 1.2 + Math.random() * 2 }); } };
    const conf = Array.from({ length: 46 }, () => ({ x: Math.random() * W, y: -Math.random() * H, vy: 50 + Math.random() * 90, sw: Math.random() * 6, w: 4 + Math.random() * 5, col: cols[(Math.random() * cols.length) | 0], ph: Math.random() * 6 }));
    const ring = (x, y, col, n) => { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, sp = 190; parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.5, t: 0, col, s: 2.2 }); } };
    let last = t0;
    const loop = now => {
      if (!document.body.contains(vic)) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now; const t = (now - t0) / 1000;
      if (sc) sc.textContent = OD.fmt(Math.floor(r.score * OD.easeOut(Math.min(1, Math.max(0, (t - 1.2) / 1.8)))));
      if (t > nextR) { nextR = t + 0.35 + Math.random() * 0.55; rockets.push({ x: W * (0.12 + Math.random() * 0.76), y: H + 10, vy: -(430 + Math.random() * 260), ty: H * (0.12 + Math.random() * 0.4), col: cols[(Math.random() * cols.length) | 0] }); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'lighter';
      for (let i = rockets.length - 1; i >= 0; i--) { const k = rockets[i]; k.y += k.vy * dt; g.fillStyle = k.col; g.beginPath(); g.arc(k.x, k.y, 2, 0, 7); g.fill(); g.globalAlpha = 0.4; g.fillRect(k.x - 1, k.y, 2, 22); g.globalAlpha = 1;
        if (k.y <= k.ty) { if (Math.random() < 0.4) ring(k.x, k.y, k.col, 40); else burst(k.x, k.y, k.col, 60); if (t > 2.4 && Math.random() < 0.5) burst(k.x, k.y, cols[(Math.random() * cols.length) | 0], 20); rockets.splice(i, 1); OD.audio.sfx('dust', 4 + ((Math.random() * 6) | 0)); } }
      for (let i = parts.length - 1; i >= 0; i--) { const q = parts[i]; q.t += dt; if (q.t > q.life) { parts.splice(i, 1); continue; } q.vy += 160 * dt; q.vx *= 0.985; q.vy *= 0.985; q.x += q.vx * dt; q.y += q.vy * dt;
        g.globalAlpha = Math.max(0, 1 - q.t / q.life); g.fillStyle = q.col; g.beginPath(); g.arc(q.x, q.y, q.s * (0.6 + 0.4 * Math.sin(q.t * 30 + q.x)), 0, 7); g.fill(); }
      if (t > 1.6) for (const c of conf) { c.y += c.vy * dt; c.ph += dt * 3; if (c.y > H + 10) { c.y = -10; c.x = Math.random() * W; } g.globalAlpha = 0.85; g.fillStyle = c.col; g.save(); g.translate(c.x + Math.sin(c.ph) * 18, c.y); g.rotate(c.ph); g.scale(1, Math.cos(c.ph * 1.7)); g.fillRect(-c.w / 2, -c.w / 4, c.w, c.w / 2); g.restore(); }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      vicRaf = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(vicRaf); vicRaf = requestAnimationFrame(loop);
    OD.audio.sfx('victory');
  };
  // a white wash that covers the screen and then lifts, carrying you into the next universe
  function whiteWash(mid, upMs = 2200) {
    const el = document.createElement('div'); el.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:90;opacity:0;pointer-events:all;transition:opacity .55s ease';
    document.body.appendChild(el); requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => { mid(); el.style.transition = `opacity ${upMs}ms cubic-bezier(.3,.05,.2,1)`; requestAnimationFrame(() => requestAnimationFrame(() => { el.style.opacity = '0'; })); setTimeout(() => el.remove(), upMs + 100); }, 650);
  }
  Object.assign(acts, {
    nextuni() { whiteWash(() => { cancelAnimationFrame(vicRaf); OD.ui.show('hud'); if (OD.game.start('endless') === false) { OD.game.quit(); OD.ui.show('home'); } }); },
    vichome() { whiteWash(() => { cancelAnimationFrame(vicRaf); OD.game.quit(); OD.ui.show('home'); }, 1400); },
  });
  OD.badgeSVG = badge; OD.badgeGlyph = glyphFor;
})();
