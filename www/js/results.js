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
    const goals = r.newAch.map(c => ({ kind: 'goal', name: c.name, glyph: glyphFor(c.id), tier: 0, text: c.desc, reward: c.paid || c.reward }));
    if (goals.length > 3) { const rest = goals.splice(2); const sum = rest.reduce((a, g) => a + g.reward, 0); goals.push({ kind: 'goal', name: `+${rest.length} more goals`, glyph: 'check', tier: 0, text: 'all complete', reward: sum }); }
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
  // A badge is a small piece of jewellery: a glowing halo, a milled metal rim with a bevelled groove, a deep enamel face with a soft inner
  // light, a glyph that glows like neon, tier gems set in the face and (for medals) a ribbon behind. Goals are cut as hexagons, the best-ever
  // badge as a starburst. The "shine" group sweeps across once when it appears.
  function badge(b, size = 132) {
    const [c1, c2] = PAL[b.kind === 'medal' ? b.tier : b.kind] || PAL.goal, uid = 'b' + Math.random().toString(36).slice(2, 7);
    const CX = 60, CY = 57, medal = b.kind === 'medal', tier = b.tier || 0;
    const poly = (n, rad, rot = -Math.PI / 2, alt) => { let p = ''; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + rot, r = alt && i % 2 ? alt : rad; p += (i ? 'L' : 'M') + (CX + Math.cos(a) * r).toFixed(1) + ' ' + (CY + Math.sin(a) * r).toFixed(1); } return p + 'Z'; };
    let rim, groove, face, clip;
    if (b.kind === 'goal') {
      rim = `<path d="${poly(6, 51)}" fill="url(#${uid}r)" stroke-linejoin="round" stroke="url(#${uid}r)" stroke-width="3"/><path d="${poly(6, 51)}" fill="none" stroke="#000" stroke-opacity=".28" stroke-width="1" stroke-linejoin="round" transform="translate(0 1)"/>`;
      groove = `<path d="${poly(6, 44)}" fill="url(#${uid}g)" stroke-linejoin="round" stroke="url(#${uid}g)" stroke-width="2"/>`;
      face = `<path d="${poly(6, 40)}" fill="url(#${uid}f)" stroke-linejoin="round" stroke="url(#${uid}f)" stroke-width="2"/><path d="${poly(6, 35)}" fill="none" stroke="${c1}" stroke-opacity=".4" stroke-width="1" stroke-dasharray="2 4" stroke-linejoin="round"/>`;
      clip = `<path d="${poly(6, 40)}"/>`;
    } else if (b.kind === 'best') {
      rim = `<path d="${poly(16, 55, -Math.PI / 2, 45)}" fill="url(#${uid}r)" stroke="url(#${uid}r)" stroke-width="2" stroke-linejoin="round"/>`;
      groove = `<circle cx="${CX}" cy="${CY}" r="42" fill="url(#${uid}g)"/>`;
      face = `<circle cx="${CX}" cy="${CY}" r="38" fill="url(#${uid}f)"/><circle cx="${CX}" cy="${CY}" r="33" fill="none" stroke="${c1}" stroke-opacity=".4" stroke-width="1" stroke-dasharray="2 4"/>`;
      clip = `<circle cx="${CX}" cy="${CY}" r="38"/>`;
    } else {
      rim = `<circle cx="${CX}" cy="${CY}" r="49" fill="url(#${uid}r)"/><circle cx="${CX}" cy="${CY}" r="47.5" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="3" stroke-dasharray="1.1 3.1"/><circle cx="${CX}" cy="${CY}" r="49" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1" stroke-dasharray="40 200" stroke-dashoffset="-6"/>`;
      groove = `<circle cx="${CX}" cy="${CY}" r="42" fill="url(#${uid}g)"/>`;
      face = `<circle cx="${CX}" cy="${CY}" r="38" fill="url(#${uid}f)"/><circle cx="${CX}" cy="${CY}" r="33.5" fill="none" stroke="${c1}" stroke-opacity=".38" stroke-width="1" stroke-dasharray="2 4.2"/>`;
      clip = `<circle cx="${CX}" cy="${CY}" r="38"/>`;
    }
    const ribbon = medal ? `<path d="M43 88 L28 119 L42 113 L50 121 L58 92 Z" fill="url(#${uid}b)"/><path d="M77 88 L92 119 L78 113 L70 121 L62 92 Z" fill="url(#${uid}b)"/><path d="M43 88 L28 119 L42 113 L50 121 L58 92 Z M77 88 L92 119 L78 113 L70 121 L62 92 Z" fill="none" stroke="#000" stroke-opacity=".3" stroke-width=".8" stroke-linejoin="round"/>` : '';
    // tier gems: lit ones are cut diamonds, the rest are empty settings; evenly spaced along the bottom of the face
    const dia = (x, y, r) => `M${x} ${y - r} L${x + r} ${y} L${x} ${y + r} L${x - r} ${y} Z`;
    const gem = (x, y, on) => on
      ? `<path d="${dia(x, y, 5.6)}" fill="${c1}" opacity=".7" filter="url(#${uid}w)"/><path d="${dia(x, y, 4.4)}" fill="url(#${uid}m)" stroke="#fff" stroke-opacity=".9" stroke-width=".8" stroke-linejoin="round"/><path d="M${x} ${y - 4.4} L${x} ${y + 4.4} M${x - 4.4} ${y} L${x + 4.4} ${y}" stroke="#fff" stroke-opacity=".5" stroke-width=".6"/>`
      : `<path d="${dia(x, y, 4.4)}" fill="rgba(0,0,0,.4)" stroke="${c1}" stroke-opacity=".4" stroke-width="1" stroke-linejoin="round"/>`;
    const gems = tier ? [0, 1, 2].map(i => gem(CX + (i - 1) * 15, CY + 29, i < tier)).join('') : '';
    const spark = (x, y, k, d) => `<path class="tw" style="animation-delay:${d}s" d="M${x} ${y - 5 * k} Q${x} ${y} ${x + 5 * k} ${y} Q${x} ${y} ${x} ${y + 5 * k} Q${x} ${y} ${x - 5 * k} ${y} Q${x} ${y} ${x} ${y - 5 * k}Z" fill="#fff"/>`;
    const sparks = tier === 3 || b.kind === 'best' ? spark(104, 22, 1, 0) + spark(14, 36, 0.8, 0.8) + spark(98, 92, 0.7, 1.5) : '';
    const g = GL[b.glyph] || GL.check, gt = `translate(${CX} ${CY - 3}) scale(1.14) translate(-20 -20)`;
    return `<svg class="rs-badge" viewBox="0 0 120 124" width="${size}" height="${Math.round(size * 124 / 120)}" style="color:${c1}">
      <defs>
        <linearGradient id="${uid}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".18" stop-color="${c1}"/><stop offset=".62" stop-color="${c2}"/><stop offset="1" stop-color="${c1}" stop-opacity=".85"/></linearGradient>
        <linearGradient id="${uid}g" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${c1}" stop-opacity=".8"/><stop offset=".5" stop-color="#000" stop-opacity=".85"/><stop offset="1" stop-color="${c2}"/></linearGradient>
        <radialGradient id="${uid}f" cx=".4" cy=".28" r=".95"><stop offset="0" stop-color="#34478a"/><stop offset=".55" stop-color="#121b4a"/><stop offset="1" stop-color="#070b24"/></radialGradient>
        <radialGradient id="${uid}i" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${c1}" stop-opacity=".42"/><stop offset="1" stop-color="${c1}" stop-opacity="0"/></radialGradient>
        <linearGradient id="${uid}t" gradientUnits="userSpaceOnUse" x1="0" y1="5" x2="0" y2="35"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="${c1}"/></linearGradient>
        <linearGradient id="${uid}m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
        <linearGradient id="${uid}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c2}"/><stop offset="1" stop-color="${c1}" stop-opacity=".55"/></linearGradient>
        <linearGradient id="${uid}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".42"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <filter id="${uid}w" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.4"/></filter>
        <clipPath id="${uid}c">${clip}</clipPath>
      </defs>
      <circle cx="${CX}" cy="${CY}" r="54" fill="${c1}" opacity="${tier === 3 || b.kind === 'best' ? 0.32 : 0.2}" filter="url(#${uid}w)"/>
      ${ribbon}${rim}${groove}${face}
      <g clip-path="url(#${uid}c)">
        <circle cx="${CX}" cy="${CY + 4}" r="30" fill="url(#${uid}i)"/>
        <ellipse cx="${CX - 6}" cy="${CY - 24}" rx="26" ry="11" fill="#fff" opacity=".10" transform="rotate(-14 ${CX} ${CY})"/>
        <g class="shine"><rect x="-70" y="-70" width="40" height="260" fill="url(#${uid}s)" transform="rotate(22 60 60)"/></g>
      </g>
      <g transform="${gt}" stroke="${c1}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity=".5" filter="url(#${uid}w)">${g}</g>
      <g transform="${gt}" stroke="url(#${uid}t)" color="${c1}" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round" fill="url(#${uid}t)">${g.replace(/fill="currentColor"/g, `fill="url(#${uid}t)"`)}</g>
      ${gems}${sparks}</svg>`;
  }

  OD.badgeSvg = badge;

  // ---------------------------------------------------------------- the screen
  const biomeNames = r => (r.biomes || [r.world]).map(i => (OD.WORLDS[i] || OD.WORLDS[0]).short);
  screens.over = function () {
    const r = lastRes(), sv = OD.save;
    const zen = r.mode === 'zen', title = r.reason === 'time' ? 'Time up' : zen ? 'Session ended' : 'Run complete';
    const modeName = OD.MODES[r.mode] ? OD.MODES[r.mode].name : '';
    const big = zen ? fmtT(r.time) : '0';
    const tiles = zen
      ? [[fmtT(r.time), 'Calm time'], [OD.fmt(r.dust), 'Stardust'], [(r.planets || 1), 'Planets']]
      : [[fmtT(r.time), 'Time'], [(r.planets || 1), 'Planets'], ['×' + (+r.maxCombo).toFixed(1), 'Best multiplier']];
    const chips = zen ? '' : `<div class="rs-chips"><span><b>${r.grazes}</b> grazes</span><span><b>${r.tricks || 0}</b> tricks</span><span><b>${OD.fmt(r.dust)}</b> stardust</span></div>`;
    const names = biomeNames(r), trail = names.length > 1 ? `<div class="rs-trail">${names.map(n => `<span>${esc(n)}</span>`).join('<i></i>')}</div>` : `<div class="rs-trail one"><span>${esc(names[0])}</span></div>`;
    const need = OD.spCost(sv.sp.bought || 0), maxed = (sv.sp.bought || 0) >= OD.SP_MAX, pct = maxed ? 100 : Math.min(100, Math.round(sv.stardust / need * 100)), ready = !maxed && sv.stardust >= need;
    const daily = r.dailyInfo ? `<div class="rs-daily">Daily streak <b>${r.dailyInfo.streak} day${r.dailyInfo.streak === 1 ? '' : 's'}</b>${r.bonus ? ` · bonus +${r.bonus}` : ''}</div>` : '';
    const demo = sv.full ? '' : `<div class="rs-demo">${OD.freeLeft()} free run${OD.freeLeft() === 1 ? '' : 's'} left<button class="btn gold" data-act="paywall" data-v="over">Unlock full game · ${OD.shop.price}</button></div>`;
    return `<div class="rs" id="rs">
      <div class="rs-reel" id="rsreel"><div class="rs-rays"></div><div class="rs-stage" id="rsstage"></div><div class="rs-skip">tap to skip</div></div>
      <div class="rs-main" id="rsmain">
        <div class="rs-kick">${title}${modeName ? ' · ' + modeName : ''}</div>
        <div class="rs-score" id="finalscore">${big}</div>
        ${r.newBest && !zen ? '<div class="rs-best">NEW BEST</div>' : (zen ? '' : `<div class="rs-bestline">Best ${OD.fmt(r.best)}</div>`)}
        ${daily}
        <div class="rs-tiles">${tiles.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>
        ${chips}${trail}
        <div class="rs-shelf" id="rsshelf"></div><div class="rs-cap" id="rscap"></div>
        <div class="rs-earn"><div class="rs-earnrow"><span class="rs-plus">${IC.star}+${OD.fmt(r.stardust)}</span><small>stardust</small></div>
          <div class="rs-sp ${ready ? 'ready' : ''}"><div class="bar"><i style="width:${pct}%"></i></div>
          <small>${maxed ? 'Every skill point bought' : ready ? 'A skill point is ready' : `${OD.fmt(need - sv.stardust)} to the next skill point`}</small></div></div>
        ${ready ? `<button class="btn gold rs-skill" data-act="go" data-v="perks">${IC.tree} Spend a skill point</button>` : ''}
        <div class="rs-btns"><button class="btn primary" data-act="restart" id="retry">${IC.redo} Retry</button>
          <div class="rs-btns2"><button class="btn sm ${r.hasClip ? '' : 'hidden'}" id="shareclip" data-act="share">${IC.share} Share</button><button class="btn sm" data-act="go" data-v="home">${IC.home} Menu</button></div></div>
        ${demo}
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
      shelf.innerHTML = reel.map((b, i) => `<button class="rs-mini" data-i="${i}" style="animation-delay:${0.35 + i * 0.06}s" aria-label="${esc(b.name)}">${badge(b, 40)}</button>`).join('');
      // tap a badge to see what it was for
      const cap = scr.querySelector('#rscap'); let shown = -1, capT = 0;
      shelf.addEventListener('click', e => {
        const m = e.target.closest('.rs-mini'); if (!m || !cap) return; e.stopPropagation();
        const i = +m.dataset.i, b = reel[i]; clearTimeout(capT);
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
      if (!OD.save.full && OD.freeLeft() <= 0) setTimeout(() => { if (OD.ui.cur === 'over') OD.ui.paywall('demo'); }, 900);
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
  OD.badgeSVG = badge; OD.badgeGlyph = glyphFor;
})();
