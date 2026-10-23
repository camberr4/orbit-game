'use strict';
// Menus, overlays, paywall and toasts. Screens are plain template strings rendered into #screen.
OD.VERSION = '1.0.0';
OD.ui = (() => {
  const $ = s => document.querySelector(s);
  const scr = $('#screen'), modal = $('#modal'), toasts = $('#toasts'), pauseBtn = $('#pausebtn');
  let planetRaf = 0, cur = 'home', lockTimer = 0, countRaf = 0, lastRes = null;

  const ln = d => `<svg class="ln" viewBox="0 0 24 24">${d}</svg>`;
  const IC = {
    gear: ln('<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>'),
    globe: ln('<circle cx="12" cy="12" r="3.4"/><ellipse cx="12" cy="12" rx="9.6" ry="4" transform="rotate(-24 12 12)"/><circle cx="19.4" cy="7.3" r=".9" fill="currentColor" stroke="none"/>'),
    tree: ln('<circle cx="12" cy="5.2" r="2.2"/><circle cx="5.6" cy="17.8" r="2.2"/><circle cx="18.4" cy="17.8" r="2.2"/><path d="M12 7.4v4.2M12 11.6c-3.600 0-5.600 2.400-6 4M12 11.6c3.600 0 5.600 2.400 6 4"/>'),
    bag: ln('<path d="M6.500 4h11l3.500 5L12 20.500 3 9z"/><path d="M3 9h18M9.500 4 8 9l4 11.500M14.500 4 16 9l-4 11.500"/>'),
    trophy: ln('<path d="M8 4h8v5.200a4 4 0 0 1-8 0z"/><path d="M8 6H5.200a.8.800 0 0 0-.8.900C4.700 9.300 6 10.600 8 10.900M16 6h2.800a.8.800 0 0 1 .8.900c-.3 2.400-1.600 3.700-3.600 4M12 13.200V17M8.500 20h7M10 17h4"/>'),
    star: '<svg viewBox="0 0 24 24"><path d="M12 2c.7 5.400 2.400 7.500 8 10-5.600 2.500-7.300 4.600-8 10-.7-5.400-2.400-7.500-8-10 5.600-2.500 7.300-4.600 8-10z"/></svg>',
    lock: ln('<rect x="5" y="10.500" width="14" height="10" rx="2.500"/><path d="M8 10.500V8a4 4 0 0 1 8 0v2.500"/><circle cx="12" cy="15.500" r="1" fill="currentColor" stroke="none"/>'),
    check: ln('<path d="m5 12.500 4.500 4.500L19 7.500"/>'),
    back: ln('<path d="M14.500 5.500 8 12l6.500 6.500"/>'),
    play: '<svg viewBox="0 0 24 24"><path d="M8.500 5.600v12.800a.7.700 0 0 0 1.100.6l10-6.400a.7.700 0 0 0 0-1.200l-10-6.400a.7.700 0 0 0-1.100.6z"/></svg>',
    redo: ln('<path d="M20 12a8 8 0 1 1-2.600-5.900"/><path d="M20 4.500v4.200h-4.200"/>'),
    share: ln('<circle cx="6" cy="12" r="2.500"/><circle cx="18" cy="6" r="2.500"/><circle cx="18" cy="18" r="2.500"/><path d="m8.200 10.800 7.600-3.600M8.200 13.200l7.600 3.600"/>'),
    home: ln('<path d="M4 11 12 4l8 7M6 9.500V20h12V9.500M10 20v-5.500h4V20"/>'),
    book: ln('<path d="M3 5.500c3-1.200 6-.800 9 1.200 3-2 6-2.400 9-1.200v13c-3-1.200-6-.800-9 1.200-3-2-6-2.400-9-1.200z"/><path d="M12 6.700v13"/>'),
  };
  // what stardust is saving up for: the next skill point
  function nextGoal() {
    const sv = OD.save; if ((sv.sp.bought || 0) >= OD.SP_MAX) return null;
    return { name: 'a skill point', price: OD.spCost(sv.sp.bought || 0), kind: 'sp' };
  }
  OD.nextGoal = nextGoal;
  const tpos = s => `<div class="seg">${[['dot', 'Near dot'], ['below', 'Below'], ['off', 'Off']].map(([k, n]) => `<button class="${(s.trickPos || 'dot') === k ? 'on' : ''}" data-act="trickpos" data-v="${k}">${n}</button>`).join('')}</div>`;
  const qsel = s => `<div class="seg q">${[['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']].map(([k, n]) => `<button class="${((s.quality === 'balanced' ? 'medium' : s.quality) || 'high') === k ? 'on' : ''}" data-act="quality" data-v="${k}">${n}</button>`).join('')}</div>`;
  const sd = n => `<span class="sdi">${IC.star}${OD.fmt(n)}</span>`;

  // The title: a tilted halo of light circles the word HALO, a small comet runs round it (behind the letters on the far side, in front on
  // the near side), and RUN rushes in underneath with streaks of speed. Colours follow the biome's accent.
  // The title is drawn by hand (soft, heavy rounded letters; a small planet sits in the A and another in the O, which an orbit ring circles),
  // so it does not depend on a font.
  function haloLogo() {
    const sparks = [[-120, -44, 0.4], [-8, -50, 1.7], [112, -48, 2.5], [130, 30, 1.1]].map(([x, y, d]) =>
      `<g transform="translate(${x} ${y})"><path d="M0 -8 L1.4 -1.4 L8 0 L1.4 1.4 L0 8 L-1.4 1.4 L-8 0 L-1.4 -1.4 Z" fill="#fff" opacity="0"><animate attributeName="opacity" values="0;0;1;0;0" keyTimes="0;.35;.5;.65;1" dur="4.4s" begin="${d}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="scale" values="0.3;0.3;1;0.3;0.3" keyTimes="0;.35;.5;.65;1" dur="4.4s" begin="${d}s" repeatCount="indefinite"/></path></g>`).join('');
    const word = `<g fill="none" stroke-width="18" stroke-linecap="round" stroke-linejoin="round">
        <path d="M-146 -25V25M-102 -25V25M-146 0H-102"/><path d="M-80 25L-56 -19Q-51 -27 -46 -19L-22 25"/><path d="M0 -25V25H29"/><circle cx="94" cy="0" r="28"/></g>`;
    return `<svg class="halo" viewBox="-190 -88 380 188" aria-label="Halo Run">
      <defs>
        <linearGradient id="hg" gradientUnits="userSpaceOnUse" x1="-150" y1="0" x2="125" y2="0"><stop offset="0" stop-color="#e6f6ff"/><stop offset=".45" stop-color="#dbe8ff"/><stop offset="1" stop-color="#d9b8ff"/></linearGradient>
        <linearGradient id="hv" gradientUnits="userSpaceOnUse" x1="0" y1="-34" x2="0" y2="34"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#6aa0ff" stop-opacity=".35"/></linearGradient>
        <linearGradient id="hs" gradientUnits="userSpaceOnUse" x1="-60" y1="-34" x2="60" y2="34"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
          <animateTransform attributeName="gradientTransform" type="translate" values="-300 0;300 0;300 0" keyTimes="0;.42;1" dur="7s" begin="1.6s" repeatCount="indefinite"/></linearGradient>
        <linearGradient id="hrg" gradientUnits="userSpaceOnUse" x1="-52" y1="0" x2="52" y2="0"><stop offset="0" stop-color="#4fe8ff"/><stop offset=".5" stop-color="#ffffff"/><stop offset="1" stop-color="#ff6fd8"/></linearGradient>
        <linearGradient id="hl1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4fe8ff" stop-opacity="0"/><stop offset="1" stop-color="#6fb8ff"/></linearGradient>
        <linearGradient id="hl2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c06bff"/><stop offset="1" stop-color="#ff6fd8" stop-opacity="0"/></linearGradient>
        <linearGradient id="hnu" gradientUnits="userSpaceOnUse" x1="-60" y1="0" x2="60" y2="0"><stop offset="0" stop-color="#bfe4ff"/><stop offset="1" stop-color="#d4bfff"/></linearGradient>
        <radialGradient id="hbloom"><stop offset="0" stop-color="var(--a)" stop-opacity=".4"/><stop offset=".6" stop-color="var(--a2)" stop-opacity=".1"/><stop offset="1" stop-color="var(--a2)" stop-opacity="0"/></radialGradient>
        <radialGradient id="hpl" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#e6fbff"/><stop offset=".35" stop-color="#3fc8ff"/><stop offset="1" stop-color="#1c4fd8"/></radialGradient>
        <filter id="hglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3"/></filter>
        <filter id="hglow2" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
        <g id="hword">${word}</g>
      </defs>
      <ellipse cx="0" cy="-8" rx="190" ry="74" fill="url(#hbloom)" class="h-bloom"/>
      <g transform="translate(0 -12)" class="h-word"><g transform="translate(10 0) scale(1.14)">
        <g transform="translate(94 0) rotate(-24)"><path d="M-58 0A58 18 0 0 1 58 0" fill="none" stroke="url(#hrg)" stroke-width="3" opacity=".75"/></g>
        <use href="#hword" stroke="var(--a)" opacity=".4" filter="url(#hglow2)"/>
        <use href="#hword" y="3.2" stroke="#5f86f0" opacity=".85"/>
        <use href="#hword" stroke="url(#hg)"/>
        <use href="#hword" stroke="url(#hv)"/>
        <use href="#hword" y="-2" stroke="#fff" stroke-width="1" opacity=".35" class="h-edge"/>
        <use href="#hword" stroke="url(#hs)" class="h-shine"/>
        <g class="h-core"><circle cx="-51" cy="8" r="14" fill="#3fc8ff" opacity=".5" filter="url(#hglow)"/><circle cx="-51" cy="8" r="9.5" fill="url(#hpl)"/><circle cx="-54" cy="4.5" r="2.6" fill="#fff" opacity=".8"/></g>
        <g class="h-core"><circle cx="102" cy="-5" r="19" fill="#3fc8ff" opacity=".5" filter="url(#hglow)"/><circle cx="102" cy="-5" r="13.5" fill="url(#hpl)"/><circle cx="97.5" cy="-10" r="3.6" fill="#fff" opacity=".85"/></g>
        <g transform="translate(94 0) rotate(-24)"><path d="M-58 0A58 18 0 0 0 58 0" fill="none" stroke="url(#hrg)" stroke-width="9" opacity=".55" filter="url(#hglow)"/><path d="M-58 0A58 18 0 0 0 58 0" fill="none" stroke="url(#hrg)" stroke-width="3.4"/><path d="M-40 12.4A58 18 0 0 0 40 12.4" fill="none" stroke="#fff" stroke-width="1.6" opacity=".9"/>
          <circle r="3" fill="#fff"><animateMotion dur="5s" repeatCount="indefinite" path="M-58 0A58 18 0 0 0 58 0A58 18 0 0 0 -58 0"/></circle></g>
      </g></g>
      <g class="h-sparks">${sparks}</g>
      <g class="h-lines"><rect x="-180" y="74" width="86" height="5" rx="2.5" fill="url(#hl1)" filter="url(#hglow)" opacity=".6"/><rect x="-180" y="74.5" width="86" height="4" rx="2" fill="url(#hl1)"/><rect x="94" y="74" width="86" height="5" rx="2.5" fill="url(#hl2)" filter="url(#hglow)" opacity=".6"/><rect x="94" y="74.5" width="86" height="4" rx="2" fill="url(#hl2)"/></g>
      <g class="h-run"><g transform="translate(0 76)" fill="none" stroke="url(#hnu)" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M-58 17V-17H-46A9 9 0 0 1 -46 1H-58M-46 1L-36 17"/><path d="M-12 -17V5A12 12 0 0 0 12 5V-17"/><path d="M36 17V-17L58 17V-17"/></g></g>
    </svg>`;
  }

  // ------------------------------------------------------------ plumbing
  function theme() {
    const w = OD.game.world, s = document.documentElement.style;
    s.setProperty('--a', w.accent); s.setProperty('--a2', w.accent2 === '#ffffff' ? '#7ac8ff' : w.accent2); s.setProperty('--danger', w.danger);
  }
  function show(name, resetScroll) {
    const prev = cur; cur = name; theme(); if (name !== 'hud' && typeof hideTile === 'function') hideTile();
    scr.className = 'screen s-' + name;
    scr.innerHTML = screens[name]();
    if (name === 'home' && ['over', 'pause', 'psettings', 'hud'].includes(prev)) scr.classList.add('flyin');   // the menu glides back in from the sides
    scr.style.animation = 'none'; void scr.offsetWidth; scr.style.animation = '';
    pauseBtn.classList.toggle('hidden', name !== 'hud');
    if (after[name]) after[name]();
  }
  function rerender() { if (cur !== 'hud') { const sc = scr.querySelector('.list'); const y = sc ? sc.scrollTop : 0; show(cur); const l = scr.querySelector('.list'); if (l) l.scrollTop = y; } }
  function toast(msg, ms = 2600) {
    const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = msg;
    toasts.appendChild(t);
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 450);
  }
  // a satisfying burst on whatever was just bought or learned: sparks, rings, a glow and a little hop
  function celebrate(sel, color, big) {
    const el = scr.querySelector(sel); if (!el) return;
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let layer = document.getElementById('fxlayer');
    if (!layer) { layer = document.createElement('div'); layer.id = 'fxlayer'; document.getElementById('ui').appendChild(layer); }
    const cols = [color || '#ffd95a', '#ffffff', '#ffd95a'];
    const mk = (css, anim, opt) => { const d = document.createElement('i'); d.style.cssText = css; layer.appendChild(d); const a = d.animate(anim, opt); a.onfinish = () => d.remove(); return d; };
    const n = big ? 54 : 30;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, dist = (big ? 90 : 60) + Math.random() * (big ? 150 : 100), s = 3 + Math.random() * 5, c = cols[i % 3];
      const dx = Math.cos(a) * dist, dy = Math.sin(a) * dist - 20 - Math.random() * 30, dur = 700 + Math.random() * 600;
      mk(`left:${cx}px;top:${cy}px;width:${s}px;height:${s}px;background:${c};box-shadow:0 0 ${s * 2}px ${c};border-radius:${i % 3 ? '50%' : '1px'}`,
        [{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${dx * 0.7}px),calc(-50% + ${dy * 0.7}px)) scale(1)`, opacity: 1, offset: 0.55 }, { transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${dy + 40}px)) scale(0.2) rotate(${Math.random() * 360}deg)`, opacity: 0 }],
        { duration: dur, easing: 'cubic-bezier(.12,.75,.25,1)', delay: Math.random() * 90 });
    }
    for (let k = 0; k < (big ? 3 : 2); k++) {
      mk(`left:${cx}px;top:${cy}px;width:${r.width * 0.9}px;height:${r.width * 0.9}px;border:2px solid ${color || '#ffd95a'};border-radius:50%;box-shadow:0 0 18px ${color || '#ffd95a'}`,
        [{ transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0.9 }, { transform: `translate(-50%,-50%) scale(${(big ? 3.2 : 2.2) + k * 0.7})`, opacity: 0 }], { duration: 750 + k * 160, delay: k * 110, easing: 'cubic-bezier(.1,.7,.3,1)' });
    }
    mk(`left:${cx}px;top:${cy}px;width:${r.width * 2.6}px;height:${r.width * 2.6}px;border-radius:50%;background:radial-gradient(circle,${color || '#ffd95a'}88,transparent 65%)`,
      [{ transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.25 }, { transform: 'translate(-50%,-50%) scale(1.5)', opacity: 0 }], { duration: 900, easing: 'ease-out' });
    el.animate([{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.22)', filter: 'brightness(1.8)', offset: 0.25 }, { transform: 'scale(0.96)', offset: 0.55 }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: 650, easing: 'ease-out' });
    document.querySelectorAll('.topbar .pill, .head .pill').forEach(p => p.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)', color: '#ffd95a' }, { transform: 'scale(1)' }], { duration: 450, easing: 'ease-out' }));
    if (big && T().fx !== false) { const f = document.createElement('div'); f.className = 'flashfx'; layer.appendChild(f); f.animate([{ opacity: 0.55 }, { opacity: 0 }], { duration: 700 }).onfinish = () => f.remove(); }
  }
  function openModal(html) { modal.innerHTML = html; modal.classList.remove('hidden'); }
  function closeModal() { modal.classList.add('hidden'); modal.classList.remove('full'); modal.innerHTML = ''; }
  const modeLocked = m => !OD.save.full && !OD.MODES[m].free;
  const fmtT = s => { s = Math.floor(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  // ------------------------------------------------------------ screens
  const screens = {
    hud: () => '',

    home() {
      const sv = OD.save, w = OD.game.world, mode = sv.mode, m = OD.MODES[mode];
      const challengesNew = OD.CHALLENGES.some(c => !sv.ach[c.id] && c.prog && c.prog(sv.stats, sv)[0] >= c.prog(sv.stats, sv)[1]);
      let statL = 'Best', statV = OD.fmt(sv.best[mode] || 0);
      if (mode === 'zen') { statL = 'Longest calm'; statV = fmtT(sv.best.zen); }
      else if (mode === 'daily') { const d = sv.daily, today = OD.todayKey(); statL = 'Streak'; statV = String(d.streak && (d.last === today || OD.dayNumber(today) - OD.dayNumber(d.last) === 1) ? d.streak : 0); }
      return `
      <div class="topbar">
        <div class="pill">${IC.star}<span>${OD.fmt(sv.stardust)}</span></div>
        <button class="iconbtn" data-act="go" data-v="settings" aria-label="Settings">${IC.gear}</button>
      </div>
      <div class="logo">${haloLogo()}</div>
      ${sv.full ? '' : `<button class="demo-ribbon" data-act="paywall" data-v="ribbon">Free demo · ${OD.freeLeft()} of ${OD.FREE_RUNS} runs left · Unlock ${OD.shop.price}</button>`}
      <div class="spacer"></div>
      <div class="bottom home2">
        <div class="stat"><small>${statL}</small><b>${statV}</b></div>
        <button class="btn primary big" data-act="play">${IC.play} PLAY</button>
        <div class="pillrow">
          <button class="worldpill ${mode === 'endless' ? '' : 'on'}" data-act="modes">${m.name}<span class="caret"></span></button>
        </div>
        <div class="nav">
          <button class="navbtn" data-act="go" data-v="planets">${IC.globe}Planets</button>
          <button class="navbtn" data-act="go" data-v="perks">${IC.tree}Skills${(OD.spFree() > 0 || (!OD.save.sp.bought && OD.save.stardust >= OD.spCost(0))) ? '<span class="dot"></span>' : ''}</button>
          <button class="navbtn" data-act="go" data-v="goals">${IC.trophy}Goals${challengesNew ? '<span class="dot"></span>' : ''}</button>
          <button class="navbtn" data-act="go" data-v="guide">${IC.book}Guide</button>
        </div>
      </div>`;
    },

    planets() {
      const sv = OD.save, seen = sv.seenPlanets || {};
      const bcards = OD.WORLDS.map(w => {
        const ok = OD.biomeUnlocked(w.id);
        return `<div class="card wcard ${ok ? '' : 'locked'}" style="--c:${w.accent};border-color:${OD.rgba(w.accent, 0.4)}">
          <div class="bgfx" style="background:radial-gradient(circle at 85% 20%, ${OD.rgba(w.neb[1], 0.55)}, transparent 55%),radial-gradient(circle at 10% 90%, ${OD.rgba(w.neb[0], 0.5)}, transparent 55%),linear-gradient(160deg, ${w.bg[0]}, ${w.bg[1]})"></div>
          ${ok ? '' : `<span class="lock">${IC.lock}</span>`}
          <h3 style="color:${w.accent}">${w.name}</h3><p>${w.sub}  ·  ${w.pill}</p>
          <div class="meta"><span>${ok ? 'In your journey' : 'Full game'}</span></div>
        </div>`;
      }).join('');
      const cards = OD.PLANETS.map(p => {
        const e = OD.ENVS[p.skin], ok = OD.planetUnlocked(p.skin), vis = !!seen[p.skin];
        const meta = ok ? (vis ? 'Visited' : 'In your pool') : 'Full game';
        return `<div class="card wcard ${ok ? '' : 'locked'}" style="--c:${e.accent};border-color:${OD.rgba(e.accent, 0.4)}">
          <div class="bgfx" style="background:radial-gradient(circle at 85% 20%, ${OD.rgba(e.neb[1], 0.55)}, transparent 55%),radial-gradient(circle at 10% 90%, ${OD.rgba(e.neb[0], 0.5)}, transparent 55%),linear-gradient(160deg, ${e.bg[0]}, ${e.bg[1]})"></div>
          <canvas class="pcv ${ok ? '' : 'dim'}" data-skin="${p.skin}" width="150" height="150"></canvas>
          ${ok ? '' : `<span class="lock">${IC.lock}</span>`}
          <h3 style="color:${e.accent}">${p.label}</h3><p>${p.bonus}</p>
          <div class="meta"><span>${['Early', 'Early', 'Mid-run', 'Later', 'Deep', 'Deepest'][p.tier]}</span><span>·</span><span>${meta}</span></div>
        </div>`;
      }).join('');
      return `<div class="head"><button class="iconbtn" data-act="go" data-v="home" aria-label="Back">${IC.back}</button><h2>Planets</h2><div class="pill">${Object.keys(seen).length}/${OD.PLANETS.length}</div></div><div class="list"><p class="sub tight" style="margin:0 2px 2px">One long run drifts from planet to planet. Each one changes the rules. Every few planets the whole sky changes into a new biome, with its own music and dangers. Planets drift in as your score climbs: the first at 20,000 points, the next at 70,000, then 140,000 and more.</p><h4 class="sub tight" style="margin:6px 2px 0;letter-spacing:.14em">PLANETS</h4>${cards}<h4 class="sub tight" style="margin:14px 2px 0;letter-spacing:.14em">BIOMES</h4>${bcards}</div>`;
    },

    goals() {
      const sv = OD.save;
      const done = OD.CHALLENGES.filter(c => sv.ach[c.id]).length;
      const rows = OD.CHALLENGES.slice().sort((a, b) => (sv.ach[a.id] ? 1 : 0) - (sv.ach[b.id] ? 1 : 0)).map(c => {
        const d = !!sv.ach[c.id], pr = c.prog ? c.prog(sv.stats, sv) : null;
        const bar = !d && pr ? `<div class="bar"><i style="width:${(pr[0] / pr[1]) * 100}%"></i></div>` : '';
        const cnt = !d && pr && pr[1] > 1 ? ` <small>(${OD.fmt(pr[0])}/${OD.fmt(pr[1])})</small>` : '';
        return `<div class="card chal ${d ? 'done' : ''}"><div class="ic gbadge ${d ? 'on' : ''}">${OD.badgeSVG({ kind: 'goal', glyph: OD.badgeGlyph(c.id), tier: 0 }, 46)}</div><div class="tx"><h4>${c.name}</h4><p>${c.desc}${cnt}</p>${bar}</div><div class="rw">${d ? '' : '+' + c.reward + IC.star.replace('<svg', '<svg width="13" height="13"')}</div></div>`;
      }).join('');
      return `<div class="head"><button class="iconbtn" data-act="go" data-v="home" aria-label="Back">${IC.back}</button><h2>Goals</h2><div class="pill">${done}/${OD.CHALLENGES.length}</div></div><div class="list">${rows}</div>`;
    },

    guide() {
      const sv = OD.save, total = OD.INTRO.length, got = OD.intro.count();
      const rows = OD.INTRO.map(it => {
        const known = !!sv.intro[it.id];
        return known
          ? `<button class="card chal gd k-${it.kind}" data-act="guideopen" data-v="${it.id}"><div class="ic"><canvas data-gicon="${it.id}" width="76" height="76"></canvas></div><div class="tx"><h4>${it.name}</h4><p>${it.tag}</p></div><div class="rw kind">${OD.KIND_LABEL[it.kind]}</div></button>`
          : `<div class="card chal gd locked"><div class="ic">${IC.lock}</div><div class="tx"><h4>Undiscovered</h4><p>Keep playing to find it${it.runs > sv.stats.runs ? ' (about ' + (it.runs - sv.stats.runs) + ' more run' + (it.runs - sv.stats.runs === 1 ? '' : 's') + ')' : ''}</p></div></div>`;
      }).join('');
      return `<div class="head"><button class="iconbtn" data-act="go" data-v="home" aria-label="Back">${IC.back}</button><h2>Field Guide</h2><div class="pill">${got}/${total}</div></div><div class="list">${rows}</div>`;
    },

    settings() {
      const s = OD.save.settings, sw = (k) => `<button class="switch ${s[k] ? 'on' : ''}" data-act="toggle" data-v="${k}" aria-label="${k}"></button>`;
      return `<div class="head"><button class="iconbtn" data-act="go" data-v="home" aria-label="Back">${IC.back}</button><h2>Settings</h2></div>
      <div class="list"><div class="card">
        <div class="row"><label>Music</label><input type="range" min="0" max="1" step="any" value="${s.music}" data-vol="music"></div>
        <div class="row"><label>Sound effects</label><input type="range" min="0" max="1" step="any" value="${s.sfx}" data-vol="sfx"></div>
        <div class="row"><label>Haptics</label>${sw('haptics')}</div>
        <div class="row"><label>Screen shake</label>${sw('shake')}</div>
        <div class="row"><label>Trick text<small>Where slick-move callouts appear</small></label>${tpos(s)}</div>
        <div class="row"><label>Graphics<small>Ultra: every pixel, never lowered. Lower it if slow</small></label>${qsel(s)}</div>
        <div class="row"><label>High quality effects<small>Turn off if the game feels slow</small></label>${sw('fx')}</div>
        <div class="row"><label>Show frame rate<small>For testing: frames per second on screen</small></label>${sw('fps')}</div>
        <div class="row"><label>Speed test<small>Shows how fast this phone draws</small></label><button class="btn sm" data-act="speedtest">Run</button></div>
      </div>
      <div class="card">
        <div class="row tiprow"><label>Tips during play<small>${tipDesc(s.tips)}</small></label>
          <div class="seg">${[['all', 'All'], ['core', 'Core'], ['off', 'None']].map(([k, n]) => `<button class="${(s.tips || 'all') === k ? 'on' : ''}" data-act="tipset" data-v="${k}">${n}</button>`).join('')}</div></div>
        <div class="row"><label>Tutorial<small>The basics, one topic per tab</small></label><button class="btn sm" data-act="howto">Open</button></div>
        <div class="row"><label>Replay tips<small>Show every explanation again as things appear</small></label><button class="btn sm" data-act="replayhints">Replay</button></div>
        <div class="row"><label>Restore purchase</label><button class="btn sm" data-act="restore">Restore</button></div>
        <div class="row"><label>Privacy</label><button class="btn sm" data-act="privacy">Read</button></div>
        <div class="row"><label>Reset progress<small>Deletes scores, unlocks and stardust</small></label><button class="btn sm" data-act="reset" style="color:#ff8a9a">Reset</button></div>
      </div>
      ${OD.save.full ? '' : `<button class="btn gold" data-act="paywall" data-v="settings">Unlock full game · ${OD.shop.price}</button>`}
      <div class="foot">Halo Run v${OD.VERSION}<br>${OD.save.full ? 'Full game unlocked. Thank you for supporting indie games!' : 'Free demo'}</div></div>`;
    },

    pause: () => `<div class="center"><div class="card panel"><h2>Paused</h2>
      <div class="btnrow" style="flex-direction:column;align-items:stretch">
        <button class="btn primary" data-act="resume">${IC.play} Resume</button>
        <button class="btn" data-act="restart">${IC.redo} Restart</button>
        <button class="btn" data-act="psettings">${IC.gear || ''} Settings</button>
        <button class="btn ghost" data-act="quit">${IC.home} Menu</button>
      </div></div></div>`,

    psettings() {   // the settings that matter in a run, reachable from the pause menu
      const s = OD.save.settings, sw = k => `<button class="switch ${s[k] ? 'on' : ''}" data-act="toggle" data-v="${k}" aria-label="${k}"></button>`;
      return `<div class="center"><div class="card panel"><h2>Settings</h2>
        <div class="row"><label>Music</label><input type="range" min="0" max="1" step="any" value="${s.music}" data-vol="music"></div>
        <div class="row"><label>Sound effects</label><input type="range" min="0" max="1" step="any" value="${s.sfx}" data-vol="sfx"></div>
        <div class="row"><label>Haptics</label>${sw('haptics')}</div>
        <div class="row"><label>Screen shake</label>${sw('shake')}</div>
        <div class="row"><label>Trick text</label>${tpos(s)}</div>
        <div class="row"><label>High quality effects</label>${sw('fx')}</div>
        <div class="row tiprow"><label>Tips during play</label><div class="seg">${[['all', 'All'], ['core', 'Core'], ['off', 'None']].map(([k, n]) => `<button class="${(s.tips || 'all') === k ? 'on' : ''}" data-act="tipset" data-v="${k}">${n}</button>`).join('')}</div></div>
        <div class="btnrow" style="flex-direction:column;align-items:stretch;margin-top:10px"><button class="btn primary" data-act="go" data-v="pause">Back</button></div>
      </div></div>`;
    },

    over() {
      const r = lastRes, sv = OD.save;
      const title = r.reason === 'time' ? 'Time up' : r.mode === 'zen' ? 'Session ended' : 'Run over';
      const big = r.mode === 'zen' ? fmtT(r.zen || 0) : '0';
      const ach = r.newAch.map(c => `<span class="mini">${IC.check.replace('<svg', '<svg width="12" height="12" style="vertical-align:-2px"')} ${c.name} <b style="color:var(--gold)">+${(c.paid || c.reward)}</b></span>`).join('');
      const worldMsg = (r.newPlanets || []).map(k => `<div class="mini" style="background:rgba(255,217,90,.2);border-color:var(--gold)">New planet in your pool: <b>${OD.PLANET_BY_SKIN[k].label}</b></div>`).join('');
      const daily = r.dailyInfo ? `<div class="best" style="margin-top:6px">Daily streak <b style="color:var(--gold)">${r.dailyInfo.streak} day${r.dailyInfo.streak === 1 ? '' : 's'}</b>${r.bonus ? ` · bonus +${r.bonus}` : ''}</div>` : '';
      const demo = sv.full ? '' : `<div class="best" style="margin-top:12px">${OD.freeLeft()} free run${OD.freeLeft() === 1 ? '' : 's'} left</div><button class="btn gold" data-act="paywall" data-v="over" style="width:100%;margin-top:8px">Unlock full game · ${OD.shop.price}</button>`;
      return `<div class="center"><div class="card panel"><h2>${title}</h2>
        <div class="final" id="finalscore">${r.mode === 'zen' ? fmtT(r.time) : big}</div>
        ${r.newBest ? '<span class="newbest">NEW BEST</span>' : `<div class="best">Best ${r.mode === 'zen' ? fmtT(r.best) : OD.fmt(r.best)}</div>`}
        ${daily}
        <div class="stats"><div class="stat"><b>${r.grazes}</b><span>Grazes</span></div><div class="stat"><b>${r.tricks || 0}</b><span>Tricks</span></div><div class="stat"><b>×${(+r.maxCombo).toFixed(1)}</b><span>Best multiplier</span></div><div class="stat"><b>${fmtT(r.time)}</b><span>Time</span></div></div>
        <div class="earn">${IC.star}+${OD.fmt(r.stardust)} <small>stardust</small></div>
        ${goalHint()}
        ${r.reshow ? `<div class="gh reshow"><small><b>${OD.INTRO_BY_ID[r.reshow].name}</b> keeps catching you. It will be explained again next run.</small><button class="btn sm" data-act="guideopen" data-v="${r.reshow}">How it works</button></div>` : ''}
        ${tipHtml(r)}
        <div class="chipwrap">${worldMsg}${ach}</div>
        <div class="btnrow" style="flex-direction:column;align-items:stretch">
          <button class="btn primary" data-act="restart" id="retry">${IC.redo} Retry</button>
          <div class="btnrow" style="margin:0">
            
            <button class="btn sm" data-act="go" data-v="home">${IC.home} Menu</button>
          </div>
        </div>${demo}</div></div>`;
    },
  };

  function drawPerkIcon(cv) {
    const [icon, col, st] = cv.dataset.picon.split(':'), g = cv.getContext('2d');
    g.clearRect(0, 0, 96, 96);
    g.globalAlpha = st === 'locked' ? 0.35 : 1;
    if (st !== 'locked') { g.save(); g.globalCompositeOperation = 'lighter'; OD.gfx.glow(g, 48, 48, 40, col, st === 'max' ? 0.9 : st === 'can' ? 0.7 : 0.4); g.restore(); }
    OD.game.drawPowerIcon(g, icon, 48, 48, 26, st === 'locked' ? '#8a93b8' : col);
  }
  const after = {
    planets() {   // each planet card shows the planet itself, turning
      const cvs = [...scr.querySelectorAll('canvas.pcv')];
      const paint = () => {
        if (!document.body.contains(scr) || cur !== 'planets') return;
        let wait = false;
        for (const c of cvs) { const g = c.getContext('2d'); g.clearRect(0, 0, 150, 150); if (OD.planets.ready(c.dataset.skin)) OD.gfx.drawPlanet(g, 75, 75, 46, c.dataset.skin, performance.now() / 1000, '#8ec8ff', 2, 'azure'); else wait = true; }
        planetRaf = requestAnimationFrame(paint); void wait;
      };
      cancelAnimationFrame(planetRaf); planetRaf = requestAnimationFrame(paint);
    },
    guide() {
      scr.querySelectorAll('canvas[data-gicon]').forEach(cv => { try { OD.introArt[cv.dataset.gicon](cv.getContext('2d'), 76, 76, 1.2); } catch (e) { /* art is optional */ } });
    },
    over() {
      const r = lastRes;
      lockout(450);
      if (r.mode === 'zen') return;
      const el = $('#finalscore'), t0 = performance.now(), dur = 900;
      cancelAnimationFrame(countRaf);
      const tick = now => {
        const k = Math.min(1, (now - t0) / dur), v = Math.floor(r.score * OD.easeOut(k));
        if (!document.body.contains(el)) return;
        el.textContent = OD.fmt(v);
        if (k < 1) countRaf = requestAnimationFrame(tick);
      };
      countRaf = requestAnimationFrame(tick);
    },
  };
  function goalHint() {
    const g = nextGoal(), sv = OD.save;
    if (!g || !sv.full) return '';
    const left = g.price - sv.stardust;
    return left > 0 ? `<div class="gh"><div class="bar"><i style="width:${Math.min(100, Math.round(sv.stardust / g.price * 100))}%"></i></div><small>${OD.fmt(left)} more for <b>${g.name}</b></small></div>` : `<div class="gh ready"><small>You can afford <b>${g.name}</b> in the shop!</small></div>`;
  }
  function tipHtml(r) {
    if (r.reason === 'time' || r.mode === 'zen') return '';
    const list = (OD.TIPS[r.cause] || []).concat(OD.save.stats.runs < 30 ? OD.TIPS.general : []);
    if (!list.length) return '';
    return `<div class="tip"><b>Tip</b> ${list[Math.floor(Math.random() * list.length)]}</div>`;
  }
  function lockout(ms) {
    scr.classList.add('lockout'); clearTimeout(lockTimer);
    lockTimer = setTimeout(() => scr.classList.remove('lockout'), ms);
  }
  const modMul = () => OD.save.mods.reduce((a, id) => a * (OD.MODIFIERS[id] ? OD.MODIFIERS[id].mul : 1), 1);
  function modsHtml() {
    const sv = OD.save;
    const cards = OD.MOD_ORDER.map(id => {
      const m = OD.MODIFIERS[id], on = sv.mods.includes(id);
      return `<button class="card modc ${on ? 'on' : ''}" data-act="modtoggle" data-v="${id}"><div class="tx"><h4>${m.name}</h4><p>${m.desc}</p></div><span class="chp ${m.mul >= 1 ? 'good' : 'bad'}">×${m.mul}</span></button>`;
    }).join('');
    return `<div class="card panel pw"><h2>Modifiers</h2><p class="sub">Pick up to two. They change how the run plays and multiply your score. Not used in Daily or Zen.</p><div class="modlist">${cards}</div><div class="best" style="margin:10px 0">Total score multiplier <b style="color:var(--gold)">×${modMul().toFixed(2).replace(/0$/, '')}</b></div><button class="btn primary" data-act="close" style="width:100%">Done</button></div>`;
  }
  function modesHtml() {
    const sv = OD.save;
    const rows = OD.MODE_ORDER.map(k => `<button class="mrow ${k === sv.mode ? 'on' : ''}" data-act="mode" data-v="${k}"><span class="mt"><b>${OD.MODES[k].name}</b><small>${OD.MODES[k].desc}</small></span>${modeLocked(k) ? IC.lock : '<span class="rad"></span>'}</button>`).join('');
    const mods = sv.mode === 'daily' || sv.mode === 'zen' ? '' : `<button class="mrow modrow" data-act="mods"><span class="mt"><b>Modifiers</b><small>${sv.mods.length ? sv.mods.length + ' active · ×' + modMul().toFixed(2).replace(/0$/, '') + ' score' : 'Optional twists that multiply your score'}</small></span>${sv.full ? '' : IC.lock}</button>`;
    return `<div class="sheet"><div class="scrim" data-act="closem"></div><div class="sheetbox"><div class="grab"></div><h2>Game mode</h2>${rows}${mods}</div></div>`;
  }
  function dailyWorld() { return OD.WORLDS[OD.dayNumber(OD.todayKey()) % OD.WORLDS.length]; }
  function dailyLine() {
    const d = OD.save.daily, today = OD.todayKey();
    const done = d.last === today;
    return `Streak <b>${d.streak && (done || OD.dayNumber(today) - OD.dayNumber(d.last) === 1) ? d.streak : 0}</b> · Today's best <b>${OD.fmt(d.bestDay === today ? d.bestScore : 0)}</b>`;
  }

  // ------------------------------------------------------------ actions

  // ------------------------------------------------------------ first run: tutorial and tips
  const TIP_TEXT = { all: 'Every new thing is explained the first time it appears.', core: 'Only the essentials are explained.', off: 'No explanations while you play.' };
  const tipDesc = k => TIP_TEXT[k || 'all'];
  let onboarding = false, tutPage = 0, tutRaf = 0, tutFirst = false;
  const TUT = [
    { tab: 'Move', title: 'Swipe to change orbit', arts: [['swipe', 'Swipe']],
      text: ['Flick your thumb <b>away from the planet</b> to jump to the next bigger orbit, or <b>towards it</b> to jump to the next tighter one.', 'Keep your finger down after the swipe and you <b>keep jumping</b>, orbit after orbit, until you lift it.', 'A jump slips you past anything on your orbit.'] },
    { tab: 'Turn', title: 'Tap to turn around', arts: [['tap', 'Tap']],
      text: ['A quick <b>tap</b> anywhere flips your direction around the planet.', 'Only a tap turns you around. Swipes never do, so you can mix them freely.', 'Turning right before a rock or mine is a CLUTCH dodge and pays bonus points.'] },
    { tab: 'Dodge', title: 'Obstacles', arts: [['rock', 'Asteroid'], ['comet', 'Comet'], ['mine', 'Pulse mine'], ['ring', 'Barrier']],
      text: ['<b>Asteroids</b> circle an orbit. Switch orbit or turn to miss them.', '<b>Comets</b> cross every orbit. A dashed line shows the path first.', '<b>Mines</b> only hurt while they glow. <b>Barriers</b> have one gap to slip through.'] },
    { tab: 'Power-ups', title: 'Power-ups', arts: [['shield', 'Shield'], ['slow', 'Slow-Mo'], ['magnet', 'Magnet'], ['zap', 'Zapper']],
      text: ['Fly through the glowing rings on your orbit to pick them up.', 'The <b>Shield</b> blocks one hit and blasts debris away. <b>Slow-Mo</b> bends time. <b>Magnet</b> pulls in stardust. <b>Zapper</b> shoots the next rocks that come close.', 'Timed ones show a bar under your score. Some wait for your next hit.'] },
    { tab: 'Score', title: 'Points and multiplier', arts: [['dust', 'Stardust'], ['graze', 'Near miss'], ['combo', 'Multiplier']],
      text: ['<b>Stardust</b> adds to your score and buys skill points for your Skills.', 'Skim close to debris without touching it for a <b>near miss</b>. Five in a row ignite <b>NOVA</b>.', 'Good moves raise your <b>multiplier</b>. The bar shows how long it lasts before it drains.'] },
    { tab: 'Planets', title: 'Planets and black holes', arts: [['twin', 'New planet'], ['singularity', 'Black hole']],
      text: ['Sometimes a <b>new planet</b> drifts past. Jump from your outer orbit onto its ring to move in. Each planet type changes the rules.', 'After every two planet switches a <b>black hole</b> drags you in. Hold on for 15 seconds until a planet frees you.'] },
  ];
  function tutHtml() {
    const p = TUT[tutPage];
    return `<div class="tutor"><div class="tuthead"><h2>Tutorial</h2><button class="iconbtn" data-act="tutclose" aria-label="Close">${IC.back}</button></div>
      <div class="tuttabs">${TUT.map((t, i) => `<button class="${i === tutPage ? 'on' : ''}" data-act="tuttab" data-v="${i}">${t.tab}</button>`).join('')}</div>
      <div class="tutbody"><canvas id="tutart" width="440" height="440" aria-hidden="true"></canvas><span class="tutlabel" id="tutlabel"></span>
        <h3>${p.title}</h3><ul>${p.text.map(t => `<li>${t}</li>`).join('')}</ul></div>
      <div class="tutnav"><button class="btn" data-act="tutprev" ${tutPage === 0 ? 'disabled' : ''}>Back</button><span class="tutdots">${TUT.map((t, i) => `<i class="${i === tutPage ? 'on' : ''}"></i>`).join('')}</span><button class="btn primary" data-act="tutnext">${tutPage === TUT.length - 1 ? (tutFirst ? 'Continue' : 'Done') : 'Next'}</button></div></div>`;
  }
  function tutRun() {
    cancelAnimationFrame(tutRaf);
    const cv = document.getElementById('tutart'); if (!cv) return;
    const g = cv.getContext('2d'), lab = document.getElementById('tutlabel'), arts = TUT[tutPage].arts, t0 = performance.now();
    let shown = -1;
    const loop = now => {
      if (!document.body.contains(cv)) return;
      const t = (now - t0) / 1000, i = Math.floor(t / 4) % arts.length;
      if (i !== shown) { shown = i; lab.textContent = arts.length > 1 ? arts[i][1] : ''; lab.style.opacity = arts.length > 1 ? 1 : 0; }
      try { OD.introArt[arts[i][0]](g, cv.width, cv.height, t % 4 + 0.3); } catch (e) { /* art is optional */ }
      tutRaf = requestAnimationFrame(loop);
    };
    tutRaf = requestAnimationFrame(loop);
  }
  function tutGo(i) { tutPage = i; modal.innerHTML = tutHtml(); tutRun(); OD.audio.sfx('click'); }
  function openTutorial(page, first) { tutFirst = first; tutPage = page || 0; openModal(tutHtml()); modal.classList.add('full'); tutRun(); }
  function tutClose() { cancelAnimationFrame(tutRaf); modal.classList.remove('full'); closeModal(); if (tutFirst) { tutFirst = false; askTips(true); } }
  function askTutorial() {
    onboarding = true;
    openModal(`<div class="card panel pw ask"><h2>Welcome, pilot</h2><p class="sub">Want a quick tutorial first? It is one short page per topic and takes about a minute.</p>
      <button class="btn primary" data-act="tutyes" style="width:100%">Show me how to play</button>
      <button class="btn" data-act="tutno" style="width:100%;margin-top:10px">Skip, let me fly</button>
      <p class="fine">You can open the tutorial any time in Settings.</p></div>`);
  }
  function askTips(first) {
    onboarding = !!first;
    const cur_ = OD.save.settings.tips || 'all';
    const opt = (k, name, d) => `<button class="card tipopt ${k === cur_ ? 'sel' : ''}" data-act="tipset" data-v="${k}"><h4>${name}</h4><p>${d}</p></button>`;
    openModal(`<div class="card panel pw ask"><h2>How many tips?</h2><p class="sub">While you play, a short pop-up can explain each new thing the first time it appears.</p>
      <div class="tipopts">${opt('all', 'All tips', 'Every new obstacle, power-up and event is explained once. Best for learning.')}${opt('core', 'Core tips only', 'Just the essentials: the main obstacles, shield, slow-mo, planets and black holes.')}${opt('off', 'No tips', 'Nothing interrupts the game.')}</div>
      <p class="fine">You can change this any time in Settings.</p></div>`);
  }
  function play() {
    const sv = OD.save;
    if (!sv.onboarded) { if (sv.stats.runs > 0) { sv.onboarded = true; sv.tutorialDone = true; OD.persist(); } else { askTutorial(); return; } }
    let mode = sv.mode;
    if (modeLocked(mode)) { paywall('mode'); return; }
    closeModal();
    OD.audio.unlock();
    // one fluid motion: the view zooms in while the menu drifts off to the sides, then the HUD slides in
    const fromHome = cur === 'home';
    if (fromHome) scr.classList.add('leaving'); else show('hud');
    if (OD.game.start(mode) === false) { scr.classList.remove('leaving'); OD.game.quit(); show('home'); return; }
    theme();
    if (fromHome) setTimeout(() => { if (cur === 'home' && OD.game.state !== 'menu') show('hud'); }, 520);
  }
  function pause() {
    if (OD.game.pause()) pauseBtn.classList.add('hidden');   // the pause menu opens once time has eased to a stop
  }
  const acts = {
    play,
    pause,
    resume() { show('hud'); OD.game.resume(); },
    restart() {
      closeModal(); show('hud');
      if (OD.game.start(OD.game.mode()) === false) { OD.game.quit(); show('home'); return; }
      theme();
    },
    introok() { closeIntro(); },
    tileok() { OD.game.endIntro(); },
    guideopen(d) { showIntro(d.v, false); },
    quit() { OD.game.quit(); show('home'); },
    go(d) { if (d.v === 'pause') { show('pause'); return; } if (d.v === 'home' && ['over', 'pause'].includes(cur)) { OD.game.quit(); } show(d.v); },
    modes() { openModal(modesHtml()); },
    noop() {},
    mode(d) {
      if (modeLocked(d.v)) { OD.save.mode = d.v; OD.persist(); closeModal(); rerender(); paywall('mode'); return; }
      OD.save.mode = d.v; OD.persist(); closeModal(); rerender();
    },
    closem() { closeModal(); },
    closemodal() { closeModal(); },
    speedtest() { const r = OD.game.speedTest(); openModal(`<div class="card panel pw"><h2>Speed test</h2><pre style="text-align:left;white-space:pre-wrap;font:12px/1.5 monospace;margin:8px 0">${Object.entries(r).map(([k, v]) => k + ': ' + v + (typeof v === 'number' && /^\d/.test(k) ? ' ms' : '')).join('\n')}</pre><p class="sub">Lower is better. Send me a screenshot of this.</p><div class="btnrow"><button class="btn primary" data-act="closemodal">Close</button></div></div>`); },
    quality(d) { OD.save.settings.quality = d.v; OD.persist(); OD.audio.sfx('click'); OD.game.applyQuality(); show(cur === 'psettings' ? 'psettings' : 'settings'); },
    trickpos(d) { OD.save.settings.trickPos = d.v; OD.persist(); OD.audio.sfx('click'); show(cur === 'psettings' ? 'psettings' : 'settings'); },
    toggle(d) { const s = OD.save.settings; s[d.v] = !s[d.v]; OD.persist(); show(cur === 'psettings' ? 'psettings' : 'settings'); },
    psettings() { show('psettings'); },
    paywall(d) { paywall(d.v); },
    restore() { OD.shop.restore(); },
    howto() { openTutorial(0, false); },
    tutyes() { openTutorial(0, true); },
    tutno() { askTips(true); },
    tuttab(d) { tutGo(+d.v); },
    tutnext() { if (tutPage < TUT.length - 1) tutGo(tutPage + 1); else tutClose(); },
    tutprev() { tutGo(Math.max(0, tutPage - 1)); },
    tutclose() { tutClose(); },
    tipset(d) {
      OD.save.settings.tips = d.v; OD.persist(); OD.audio.sfx('click');
      if (onboarding) { onboarding = false; OD.save.onboarded = true; OD.save.tutorialDone = true; OD.persist(); closeModal(); play(); }
      else if (cur === 'settings' || cur === 'psettings') show(cur);
      else closeModal();
    },
    replayhints() { OD.save.intro = {}; OD.save.reshow = {}; OD.save.deathLog = []; OD.persist(); toast('Hints will show again as you meet things.'); },
    privacy() { openModal(`<div class="card panel pw"><h2>Privacy</h2><div class="priv"><p>Halo Run collects no personal data, has no ads, no analytics and no accounts. Your scores, unlocks and settings stay on your device.</p><p>The one-time purchase is processed entirely by Google Play. We never see your payment details.</p><p>Questions? Open an issue at github.com/camberr4/orbit-game.</p></div><button class="btn primary" data-act="close" style="width:100%;margin-top:12px">Close</button></div>`); },
    mods() { if (!OD.save.full) { paywall('mode'); return; } openModal(modsHtml()); },
    modtoggle(d) {
      const sv = OD.save, i = sv.mods.indexOf(d.v);
      if (i >= 0) sv.mods.splice(i, 1);
      else { if (sv.mods.length >= 2) { toast('Two modifiers at most. Tap one to remove it.'); return; } sv.mods.push(d.v); }
      OD.persist(); modal.innerHTML = modsHtml(); rerender();
    },
    reset() {
      openModal(`<div class="card panel pw"><h2>Reset everything?</h2><p class="sub">This deletes your scores, stardust, skills and goals. Your purchase is kept.</p><button class="btn" data-act="reset2" style="width:100%;color:#ff8a9a">Yes, reset</button><button class="linkbtn" data-act="close">Cancel</button></div>`);
    },
    reset2() { const full = OD.save.full; Object.assign(OD.save, OD.defaultSave()); OD.save.full = full; OD.persist(); closeModal(); show('home'); toast('Progress reset.'); },
    close() { closeModal(); },
    buyfull() { OD.shop.buy().then(ok => { if (ok) onPurchased(); }); },
  };
  function howHtml() {
    return `<div class="card panel pw how"><h2>How to play</h2><ul>
      <li>${IC.play}<span><b>TAP</b> to flip your direction around the planet.</span></li>
      <li>${IC.redo}<span><b>SWIPE</b> away from the planet to jump one orbit out, or towards it to jump one orbit in. <b>Keep your finger down</b> after the swipe to keep jumping through the orbits. Swipes never turn you around, only a tap does.</span></li>
      <li>${IC.globe}<span>A <b>twin planet</b> sometimes sweeps in. Jump onto its ring for bonus stardust, then jump back before it leaves.</span></li>
      <li>${IC.star}<span><b>GRAZE</b> debris to build your combo. Five grazes ignite <b>NOVA</b>: you smash through everything.</span></li>
      <li>${IC.bag}<span>Collect stardust and power-ups: shield, slow-mo, magnet and phase.</span></li>
      <li>${IC.lock}<span>After every two planet switches a black hole drags you in. Hold on for 15 seconds until a planet frees you.</span></li></ul>
      <button class="btn primary" data-act="close" style="width:100%">Got it</button></div>`;
  }

  // ------------------------------------------------------------ element intro popups
  let artRaf = 0, introResume = false;
  function showIntro(id, resume) {
    const it = OD.INTRO_BY_ID[id];
    if (!it) { if (resume) OD.game.resume(); return; }
    introResume = !!resume;
    openModal(`<div class="card panel intro k-${it.kind}">
      <span class="newtag">${resume ? 'NEW ' : ''}${OD.KIND_LABEL[it.kind].toUpperCase()}</span>
      <h2>${it.name}</h2><p class="tagline">${it.tag}</p>
      <canvas id="introart" width="640" height="360" aria-hidden="true"></canvas>
      <h3>What it looks like</h3><p class="look">${it.look}</p>
      <h3>What to do</h3><ul>${it.todo.map(t => `<li>${t}</li>`).join('')}</ul>
      <button class="btn primary" data-act="introok" style="width:100%">${resume ? 'Got it, keep flying' : 'Close'}</button></div>`);
    const cv = $('#introart'), g = cv.getContext('2d'), t0 = performance.now();
    cancelAnimationFrame(artRaf);
    const loop = now => {
      if (!document.body.contains(cv)) return;
      try { OD.introArt[id](g, cv.width, cv.height, (now - t0) / 1000 + 0.3); } catch (e) { /* art is optional */ }
      artRaf = requestAnimationFrame(loop);
    };
    artRaf = requestAnimationFrame(loop);
  }
  // In-run introductions: a tile at the top while the game crawls in slow motion behind it.
  const tileEl = document.getElementById('tile');
  let tileRaf = 0;
  function showTile(id, again) {
    const it = OD.INTRO_BY_ID[id];
    if (!it) { OD.game.endIntro(); return; }
    tileEl.className = 'tile k-' + it.kind;
    tileEl.innerHTML = `<div class="tcard"><span class="newtag">${again ? 'REMINDER' : 'NEW'} ${OD.KIND_LABEL[it.kind].toUpperCase()}</span>
      <canvas id="tileart" width="480" height="480" aria-hidden="true"></canvas>
      <div class="tx"><h3>${it.name}</h3><p class="look">${it.look}</p><ul>${it.todo.slice(0, 3).map(t => `<li>${t}</li>`).join('')}</ul></div>
      <button class="btn primary" data-act="tileok">Got it</button></div>`;
    const cv = document.getElementById('tileart'), g = cv.getContext('2d'), t0 = performance.now();
    cancelAnimationFrame(tileRaf);
    const loop = now => {
      if (!document.body.contains(cv) || tileEl.classList.contains('hidden')) return;
      try { OD.introArt[id](g, cv.width, cv.height, (now - t0) / 1000 + 0.3); } catch (e) { /* art is optional */ }
      tileRaf = requestAnimationFrame(loop);
    };
    tileRaf = requestAnimationFrame(loop);
    OD.audio.sfx('unlock');
  }
  function hideTile() { cancelAnimationFrame(tileRaf); tileEl.classList.add('hidden'); tileEl.innerHTML = ''; }
  function closeIntro() {
    cancelAnimationFrame(artRaf); closeModal();
    if (introResume) { introResume = false; OD.game.resume(); }
  }

  // ------------------------------------------------------------ paywall
  function paywall(reason) {
    if (OD.save.full) return;
    const heads = {
      demo: ['Free runs used up', 'You have played all ' + OD.FREE_RUNS + ' free runs. Unlock the full game to keep flying.'],
      over: ['Unlock Halo Run', 'Ten planets, six biomes, five modes and every skill path. One purchase, forever.'],
      mode: ['Unlock this mode', 'The full game includes Daily, Time Attack, Hardcore and Zen.'],
      world: ['Unlock all planets', 'Every planet has its own rules, bonuses and dangers.'],
      shop: ['Unlock the shop', 'Spend your stardust on trails, planets and debris styles.'],
    };
    const [h, sub] = heads[reason] || heads.over;
    const li = (t, s) => `<li>${IC.check}<span>${t} <small>${s}</small></span></li>`;
    openModal(`<div class="card panel pw"><h2>${h}</h2><p class="sub">${sub}</p><ul>
      ${li(OD.PLANETS.length + ' planets', 'calm to deadly, each with its own rules')}
      ${li('5 game modes', 'Daily, Time Attack, Hardcore, Zen')}
      ${li(OD.ownedTotal() + ' cosmetics', 'trails, planets, debris')}
      ${li(OD.CHALLENGES.length + ' goals', 'with stardust rewards')}
      ${li('Ghost runs', 'race your best run')}
      </ul>
      <button class="btn gold" data-act="buyfull">Unlock · ${OD.shop.price}</button>
      <div class="fine">One-time purchase. No ads. No subscriptions. No in-app purchases.</div>
      <button class="linkbtn" data-act="restore">Restore purchase</button>
      <button class="linkbtn" data-act="close">Maybe later</button></div>`);
  }
  function onPurchased() {
    closeModal(); OD.audio.sfx('unlock'); OD.haptic('heavy');
    toast('<b>Full game unlocked!</b> Thank you ♥', 3600);
    if (cur !== 'hud') rerender();
  }

  // ------------------------------------------------------------ sharing
  // ------------------------------------------------------------ run end
  function onRunEnd(res) {
    lastRes = res;
    if (res.mode === 'zen') res.zen = res.time;
    show('over');
    pauseBtn.classList.add('hidden');
    if (res.newBest) { OD.audio.sfx('record'); OD.audio.fx('record'); } else OD.audio.fx('gameover');
  }

  // ------------------------------------------------------------ events
  scr.addEventListener('click', onClick);
  modal.addEventListener('click', onClick);
  pauseBtn.addEventListener('click', onClick);
  document.getElementById('tile').addEventListener('click', onClick);
  function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    OD.audio.unlock();
    const act = acts[b.dataset.act];
    if (!act) return;
    if (!['buyfull', 'play', 'restart'].includes(b.dataset.act)) OD.audio.sfx('click');
    e.stopPropagation();
    act(b.dataset, b);
  }
  scr.addEventListener('input', e => {
    const k = e.target.dataset && e.target.dataset.vol;
    if (!k) return;
    OD.save.settings[k] = +e.target.value; OD.audio.applyVolumes(); OD.persist();
  });
  OD.shop.onChange(() => {
    if (OD.save.full && !modal.classList.contains('hidden') && modal.querySelector('.pw [data-act="buyfull"]')) onPurchased();
    else if (cur !== 'hud' && cur !== 'pause' && cur !== 'over') rerender();
  });

  function back() {   // Android back button
    if (!modal.classList.contains('hidden')) { if (modal.querySelector('.intro')) closeIntro(); else closeModal(); return true; }
    if (cur === 'hud') { pause(); return true; }
    if (cur === 'psettings') { show('pause'); return true; }
    if (cur === 'pause') { acts.resume(); return true; }
    if (cur === 'over') { acts.quit(); return true; }
    if (cur !== 'home') { show('home'); return true; }
    return false;
  }

  return { internals: { screens, after, acts, scr, modal, IC, show, toast, openModal, closeModal, drawPerkIcon, celebrate, lockout, get cur() { return cur; }, get lastRes() { return lastRes; } }, show, toast, paywall, pause, onRunEnd, back, showIntro, showTile, hideTile, get cur() { return cur; }, openHow: () => openTutorial(0, false) };
})();
