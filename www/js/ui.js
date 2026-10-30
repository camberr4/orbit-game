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
        <linearGradient id="hg2" gradientUnits="userSpaceOnUse" x1="-55" y1="0" x2="60" y2="0"><stop offset="0" stop-color="#e3f1ff"/><stop offset="1" stop-color="#dcc0ff"/></linearGradient>
        <linearGradient id="hv2" gradientUnits="userSpaceOnUse" x1="0" y1="-18" x2="0" y2="18"><stop offset="0" stop-color="#fff" stop-opacity=".8"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <linearGradient id="hnu" gradientUnits="userSpaceOnUse" x1="-60" y1="0" x2="60" y2="0"><stop offset="0" stop-color="#bfe4ff"/><stop offset="1" stop-color="#d4bfff"/></linearGradient>
        <radialGradient id="hbloom"><stop offset="0" stop-color="var(--a)" stop-opacity=".4"/><stop offset=".6" stop-color="var(--a2)" stop-opacity=".1"/><stop offset="1" stop-color="var(--a2)" stop-opacity="0"/></radialGradient>
        <radialGradient id="hpl" cx=".38" cy=".32" r=".85"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#f1f6ff"/><stop offset="1" stop-color="#c9d4f5"/></radialGradient>
        <filter id="hglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3"/></filter>
        <filter id="hglow2" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
        <g id="hword">${word}</g>
      </defs>
      <ellipse cx="0" cy="-8" rx="190" ry="74" fill="url(#hbloom)" class="h-bloom"/>
      <g transform="translate(0 -12)" class="h-word"><g transform="translate(10 0) scale(1.14)">
        <g transform="translate(94 0) rotate(-24)"><path d="M-58 0A58 18 0 0 1 58 0" fill="none" stroke="url(#hrg)" stroke-width="3" opacity=".75"/><circle r="3" fill="#fff" opacity="0"><animateMotion dur="5s" repeatCount="indefinite" path="M-58 0A58 18 0 0 0 58 0A58 18 0 0 0 -58 0"/><animate attributeName="opacity" dur="5s" repeatCount="indefinite" calcMode="discrete" values="0;1" keyTimes="0;.5"/></circle></g>
        <use href="#hword" stroke="var(--a)" opacity=".4" filter="url(#hglow2)"/>
        <use href="#hword" y="3.2" stroke="#5f86f0" opacity=".85"/>
        <use href="#hword" stroke="url(#hg)"/>
        <use href="#hword" stroke="url(#hv)"/>
        <use href="#hword" y="-2" stroke="#fff" stroke-width="1" opacity=".35" class="h-edge"/>
        <use href="#hword" stroke="url(#hs)" class="h-shine"/>
        <g class="h-core"><circle cx="-51" cy="8" r="14" fill="#ffffff" opacity=".45" filter="url(#hglow)"/><circle cx="-51" cy="8" r="9.5" fill="url(#hpl)"/><circle cx="-54" cy="4.5" r="2.6" fill="#9fb4e8" opacity=".5"/></g>
        <g class="h-core"><circle cx="94" cy="0" r="14" fill="#ffffff" opacity=".45" filter="url(#hglow)"/><circle cx="94" cy="0" r="10.5" fill="url(#hpl)"/><circle cx="90.6" cy="-3.6" r="2.8" fill="#fff" opacity=".85"/></g>
        <g transform="translate(94 0) rotate(-24)"><path d="M-58 0A58 18 0 0 0 58 0" fill="none" stroke="url(#hrg)" stroke-width="9" opacity=".55" filter="url(#hglow)"/><path d="M-58 0A58 18 0 0 0 58 0" fill="none" stroke="url(#hrg)" stroke-width="3.4"/><path d="M-40 12.4A58 18 0 0 0 40 12.4" fill="none" stroke="#fff" stroke-width="1.6" opacity=".9"/>
          <circle r="3" fill="#fff"><animateMotion dur="5s" repeatCount="indefinite" path="M-58 0A58 18 0 0 0 58 0A58 18 0 0 0 -58 0"/><animate attributeName="opacity" dur="5s" repeatCount="indefinite" calcMode="discrete" values="1;0" keyTimes="0;.5"/></circle></g>
      </g></g>
      <g class="h-sparks">${sparks}</g>
      <g class="h-lines"><rect x="-180" y="74" width="86" height="5" rx="2.5" fill="url(#hl1)" filter="url(#hglow)" opacity=".6"/><rect x="-180" y="74.5" width="86" height="4" rx="2" fill="url(#hl1)"/><rect x="94" y="74" width="86" height="5" rx="2.5" fill="url(#hl2)" filter="url(#hglow)" opacity=".6"/><rect x="94" y="74.5" width="86" height="4" rx="2" fill="url(#hl2)"/></g>
      <g class="h-run"><g transform="translate(2 76)" fill="none" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
        <g id="hrun"><path d="M-52 15V-15H-42A8.5 8.5 0 0 1 -42 2H-52M-42 2L-32 15"/><path d="M-8 -15V4A9 9 0 0 0 10 4V-15"/><path d="M34 15V-15L56 15V-15"/></g>
        <use href="#hrun" stroke="var(--a)" opacity=".4" filter="url(#hglow)"/>
        <use href="#hrun" y="1.8" stroke="#6f8fe8" opacity=".85"/>
        <use href="#hrun" stroke="url(#hg2)"/>
        <use href="#hrun" stroke="url(#hv2)"/></g></g>
    </svg>`;
  }

  // ------------------------------------------------------------ plumbing
  function theme() {
    const w = OD.game.world, s = document.documentElement.style;
    s.setProperty('--a', w.accent); s.setProperty('--a2', w.accent2 === '#ffffff' ? '#7ac8ff' : w.accent2); s.setProperty('--danger', w.danger);
  }
  function show(name, resetScroll) {
    if (name === 'home' && OD.game && ['ended', 'paused', 'pausing'].includes(OD.game.state)) OD.game.quit();   // home is always Aurora again, whichever way you got here
    const prev = cur; cur = name; theme(); if (name !== 'hud' && typeof hideTile === 'function') hideTile();
    scr.className = 'screen s-' + name;
    scr.innerHTML = screens[name]();
    if (name === 'home' && ['over', 'pause', 'psettings', 'hud'].includes(prev)) scr.classList.add('flyin');   // the menu glides back in from the sides
    scr.style.animation = 'none'; void scr.offsetWidth; scr.style.animation = '';
    pauseBtn.classList.toggle('hidden', name !== 'hud');
    if (after[name]) after[name]();
  }
  // redraws the current screen's contents in place: no opening animation again, no flash, the scroll stays where it was (for settings, toggles and the like)
  function redraw() {
    if (cur === 'hud' || !screens[cur]) return;
    const sc = scr.querySelector('.list'), y = sc ? sc.scrollTop : 0;
    scr.innerHTML = screens[cur]();
    if (after[cur]) after[cur]();
    const l = scr.querySelector('.list'); if (l) l.scrollTop = y;
  }
  function rerender() { redraw(); }
  // an achievement earned mid-run: a small card rises at the bottom of the screen, shines, and leaves. They queue if several arrive together.
  const achQ = []; let achBusy = false;
  function achievement(c) { achQ.push(c); if (!achBusy) achNext(); }
  function achNext() {
    const c = achQ.shift(); if (!c) { achBusy = false; return; }
    achBusy = true;
    const host = document.getElementById('ui'); if (!host) { achBusy = false; return; }
    const el = document.createElement('div'); el.className = 'achpop';
    el.innerHTML = `<i class="achglow"></i><span class="achb">${OD.goalBadge ? OD.goalBadge(c.id, 54, true) : ''}</span><span class="acht"><small>Achievement unlocked</small><b>${c.name}</b><em>${c.desc}</em>${OD.achExtra(c) ? `<i class="achx">${OD.achExtra(c)}</i>` : ''}</span><span class="achr">${IC.star}+${c.reward}</span><i class="achshine"></i>`;
    host.appendChild(el);
    OD.audio.sfx('achieve');
    const spark = el.querySelector('.achglow');
    for (let i = 0; i < 14; i++) {
      const d = document.createElement('i'); d.className = 'achsp'; const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 70;
      d.style.cssText = `left:${30 + Math.random() * 40}px;top:50%;--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r * 0.7 - 20}px;animation-delay:${0.15 + Math.random() * 0.25}s`;
      el.appendChild(d);
    }
    setTimeout(() => el.classList.add('out'), 3300);
    setTimeout(() => { el.remove(); achNext(); }, 3800);
  }
  // what greets you when the game opens: a first-time pilot gets the full welcome (and the choice of a tutorial); everyone else gets nothing extra
  function welcome() {
    const sv = OD.save;
    if (!sv.onboarded && !(sv.stats.runs > 0)) { setTimeout(() => { if (cur === 'home') askTutorial(); }, 500); return; }
  }
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
  const fmtT = s => { s = Math.floor(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  // ------------------------------------------------------------ screens
  const screens = {
    hud: () => '',

    home() {
      const sv = OD.save, w = OD.game.world, mode = 'endless';
      const challengesNew = OD.CHALLENGES.some(c => !sv.ach[c.id] && c.prog && c.prog(sv.stats, sv)[0] >= c.prog(sv.stats, sv)[1]);
      let statL = 'Best', statV = OD.fmt(sv.best[mode] || 0);
      const gl = OD.CHALLENGES.filter(c => !sv.ach[c.id]).map(c => { const pr = c.prog ? c.prog(sv.stats, sv) : null; return { c, pr, r: pr ? pr[0] / pr[1] : 0 }; }).sort((x, y) => (y.pr ? 1 : 0) - (x.pr ? 1 : 0) || y.r - x.r)[0];
      const goalChip = '';   // (the next-goal card is no longer on the home screen; goals live under Goals)
      return `
      <div class="topbar">
        <div class="pill">${IC.star}<span>${OD.fmt(sv.stardust)}</span></div>
        <div class="bestpill"><i>${IC.trophy}</i><span><small>${statL}</small><b>${statV}</b></span>${sv.wins ? `<em>U${sv.universe || 1}</em>` : ''}</div>
        <button class="iconbtn" data-act="go" data-v="settings" aria-label="Settings">${IC.gear}</button>
      </div>
      <div class="logo">${haloLogo()}</div>
      ${sv.full ? '' : `<button class="unlockbar" data-act="paywall" data-v="ribbon"><span class="ub-ico">${IC.lock}</span><span class="ub-tx"><b>Unlock the full galaxy</b><small>${OD.WORLDS.length - 1} more unique biomes, ${OD.PLANETS.length - 2} planets and a final trial</small></span><span class="ub-price">${OD.shop.price}</span></button>`}
      <div class="spacer"></div>
      <div class="bottom home2">
        ${goalChip}
        <button class="btn primary big playbtn" data-act="play"><span class="pdisc">${IC.play}</span><b>PLAY</b></button>
        <div class="nav">
          <button class="navbtn" data-act="go" data-v="perks" style="--c:#ffd95a"><i class="nico">${IC.tree}</i>Skills${(OD.spFree() > 0 || (!OD.save.sp.bought && OD.save.stardust >= OD.spCost(0))) ? '<span class="dot"></span>' : ''}</button>
          <button class="navbtn" data-act="go" data-v="planets" style="--c:#6fb6ff"><i class="nico">${IC.globe}</i>Journey</button>
          <button class="navbtn" data-act="go" data-v="goals" style="--c:#ff8ad9;font-size:.9em;letter-spacing:0"><i class="nico">${IC.trophy}</i>Achievements${challengesNew ? '<span class="dot"></span>' : ''}</button>
          <button class="navbtn" data-act="go" data-v="guide" style="--c:#8affb0"><i class="nico">${IC.book}</i>Guide</button>
        </div>
      </div>`;
    },

    planets() {
      const sv = OD.save, seen = sv.seenPlanets || {};
      const sb = sv.seenBiomes || {}, hid = (what, hint, cv) => `<div class="card wcard hid"><div class="bgfx"></div>${cv || ''}<h3>Undiscovered</h3><p>${hint}</p><div class="meta"><span>Not here yet: ${what} appears once you meet it on a run</span></div></div>`;
      const bcards = OD.WORLDS.map(w => {
        const ok = OD.biomeUnlocked(w.id);
        if (ok && w.id !== 0 && !sb[w.id]) return hid('This sky', 'A whole new sky, with its own music and dangers.');
        return `<div class="card wcard ${ok ? '' : 'locked'}" style="--c:${w.accent};border-color:${OD.rgba(w.accent, 0.4)}">
          <div class="bgfx" style="background:radial-gradient(circle at 85% 20%, ${OD.rgba(w.neb[1], 0.55)}, transparent 55%),radial-gradient(circle at 10% 90%, ${OD.rgba(w.neb[0], 0.5)}, transparent 55%),linear-gradient(160deg, ${w.bg[0]}, ${w.bg[1]})"></div>
          ${ok ? '' : `<span class="lock">${IC.lock}</span>`}
          <h3 style="color:${w.accent}">${w.name}</h3><p>${w.sub}  ·  ${w.pill}</p>
          <div class="meta"><span>${ok ? 'In your journey' : 'Part of the full game'}</span></div>
        </div>`;
      }).join('');
      const cards = OD.PLANETS.map(p => {
        const e = OD.ENVS[p.skin], ok = OD.planetUnlocked(p.skin), vis = !!seen[p.skin];
        if (ok && !vis) return hid('This planet', 'A planet with its own rules.', `<canvas class="pcv sil" data-skin="${p.skin}" width="150" height="150"></canvas>`);
        const meta = ok ? 'Visited' : 'Full game';
        return `<div class="card wcard ${ok ? '' : 'locked'}" style="--c:${e.accent};border-color:${OD.rgba(e.accent, 0.4)}">
          <div class="bgfx" style="background:radial-gradient(circle at 85% 20%, ${OD.rgba(e.neb[1], 0.55)}, transparent 55%),radial-gradient(circle at 10% 90%, ${OD.rgba(e.neb[0], 0.5)}, transparent 55%),linear-gradient(160deg, ${e.bg[0]}, ${e.bg[1]})"></div>
          <canvas class="pcv ${ok ? '' : 'dim'}" data-skin="${p.skin}" width="150" height="150"></canvas>
          ${ok ? '' : `<span class="lock">${IC.lock}</span>`}
          <h3 style="color:${e.accent}">${p.label}</h3><p>${p.bonus}</p>
          <div class="meta"><span>${['Early', 'Early', 'Mid-run', 'Later', 'Deep', 'Deepest'][p.tier]}</span><span>·</span><span>${meta}</span></div>
        </div>`;
      }).join('');
      return `<div class="head"><button class="iconbtn" data-act="go" data-v="home" aria-label="Back">${IC.back}</button><h2>Journey</h2><div class="pill">${Object.keys(seen).length}/${OD.PLANETS.length}</div></div><div class="list"><h4 class="sub tight" style="margin:6px 2px 0;letter-spacing:.14em">PLANETS</h4>${cards}<h4 class="sub tight" style="margin:14px 2px 0;letter-spacing:.14em">BIOMES</h4>${bcards}</div>`;
    },

    goals() {
      const sv = OD.save;
      const done = OD.CHALLENGES.filter(c => sv.ach[c.id]).length;
      const rows = OD.CHALLENGES.slice().map((c, i) => [c, i]).sort((a, b) => a[0].reward - b[0].reward || a[1] - b[1]).map(x => x[0]).map(c => {
        const d = !!sv.ach[c.id], pr = c.prog ? c.prog(sv.stats, sv) : null;
        const bar = !d && pr ? `<div class="bar"><i style="width:${(pr[0] / pr[1]) * 100}%"></i></div>` : '';
        const cnt = !d && pr && pr[1] > 1 ? ` <small>(${OD.fmt(pr[0])}/${OD.fmt(pr[1])})</small>` : '';
        const tn = c.reward >= 3000 ? 'legend' : c.reward >= 1000 ? 'gold' : c.reward >= 500 ? 'silver' : 'bronze', tl = { legend: 'Legendary', gold: 'Gold', silver: 'Silver', bronze: 'Bronze' }[tn];
        return `<div class="card chal t-${tn} ${d ? 'done' : ''}"><div class="ic gbadge ${d ? 'on' : ''}">${OD.goalBadge(c.id, 58, d)}</div><div class="tx">${d ? `<h4>${c.name}</h4><p>${c.desc}${cnt}</p>${bar}${OD.achExtra(c) ? `<div class="chx">${OD.achExtra(c)}</div>` : ''}` : '<h4 class="hid">Hidden</h4><p class="hid">Play on to uncover it</p>'}</div><div class="rw"><small>${tl}</small><span class="rwchip">${d ? '&#10003; ' : '+'}${OD.fmt(c.reward)}${IC.star.replace('<svg', '<svg width="13" height="13"')}</span></div></div>`;
      }).join('');
      return `<div class="head"><button class="iconbtn" data-act="go" data-v="home" aria-label="Back">${IC.back}</button><h2>Achievements</h2><div class="pill">${done}/${OD.CHALLENGES.length}</div></div><div class="list">${rows}</div>`;
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
        <div class="row"><label>Music sync<small>If the planet pulses before you hear the beat, move this right</small></label><input type="range" min="-100" max="400" step="10" value="${s.sync || 0}" data-vol="sync"></div>
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
      <div class="foot">Halo Run v${OD.VERSION}<br>${OD.save.full ? 'Full game unlocked. Thank you for supporting indie games!' : 'Free version: Aurora Reach'}</div></div>`;
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
      return `<div class="center"><div class="card panel psettings"><h2>Settings</h2>
        <div class="row"><label>Music</label><input type="range" min="0" max="1" step="any" value="${s.music}" data-vol="music"></div>
        <div class="row"><label>Sound effects</label><input type="range" min="0" max="1" step="any" value="${s.sfx}" data-vol="sfx"></div>
        <div class="row"><label>Music sync<small>If the planet pulses before you hear the beat, move this right</small></label><input type="range" min="-100" max="400" step="10" value="${s.sync || 0}" data-vol="sync"></div>
        <div class="row"><label>Haptics</label>${sw('haptics')}</div>
        <div class="row"><label>Screen shake</label>${sw('shake')}</div>
        <div class="row"><label>Trick text<small>Where slick-move callouts appear</small></label>${tpos(s)}</div>
        <div class="row"><label>Graphics<small>Ultra: every pixel, never lowered. Lower it if slow</small></label>${qsel(s)}</div>
        <div class="row"><label>High quality effects<small>Turn off if the game feels slow</small></label>${sw('fx')}</div>
        <div class="row tiprow"><label>Tips during play<small>${tipDesc(s.tips)}</small></label><div class="seg">${[['all', 'All'], ['core', 'Core'], ['off', 'None']].map(([k, n]) => `<button class="${(s.tips || 'all') === k ? 'on' : ''}" data-act="tipset" data-v="${k}">${n}</button>`).join('')}</div></div>
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
      const demo = '';
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

  // The skill icons: the same line glyphs as the power-ups, drawn as a small polished medallion. The glyph is painted white on a spare canvas,
  // then tinted with a light-to-deep gradient, lifted off the background by a soft shadow, haloed by a blur of itself, and given a sheen on its top half.
  const icoA = document.createElement('canvas'), icoB = document.createElement('canvas'); icoA.width = icoA.height = icoB.width = icoB.height = 96;
  const mixW = (hex, k) => { const n = parseInt(hex.slice(1), 16), c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => Math.round(v + (255 - v) * k)); return `rgb(${c[0]},${c[1]},${c[2]})`; };
  const canBlur = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;
  function drawPerkIcon(cv) {
    const [icon, col, st] = cv.dataset.picon.split(':'), g = cv.getContext('2d'), locked = st === 'locked', hex = /^#[0-9a-f]{6}$/i.test(col) ? col : '#9fe6ff';
    g.clearRect(0, 0, 96, 96);
    g.globalAlpha = locked ? 0.4 : 1;
    if (!locked) { g.save(); g.globalCompositeOperation = 'lighter'; OD.gfx.glow(g, 48, 48, cv.dataset.bare === '1' ? 34 : 42, hex, cv.dataset.bare === '1' ? 0.55 : st === 'max' ? 0.9 : st === 'can' ? 0.7 : 0.4); g.restore(); }
    // a fine ring inside the node, the medallion's rim
    if (cv.dataset.bare !== '1') { g.strokeStyle = OD.rgba(locked ? '#8a93b8' : hex, locked ? 0.25 : 0.32); g.lineWidth = 1.2; g.beginPath(); g.arc(48, 48, 39, 0, Math.PI * 2); g.stroke(); }   // (data-bare: just the glyph, with no ring)
    // the glyph, white, on spare canvas A
    const a = icoA.getContext('2d'); a.clearRect(0, 0, 96, 96); OD.game.drawPowerIcon(a, icon, 48, 48, 27, '#ffffff');
    // the tinted body on canvas B: light at the top, the colour in the middle, deeper at the foot
    const b = icoB.getContext('2d'); b.clearRect(0, 0, 96, 96); b.globalCompositeOperation = 'source-over'; b.drawImage(icoA, 0, 0);
    b.globalCompositeOperation = 'source-in';
    const gr = b.createLinearGradient(0, 18, 0, 78); const top = locked ? '#b6bdd8' : mixW(hex, 0.62), mid = locked ? '#8a93b8' : hex, low = locked ? '#5a6285' : mixW(hex, -0.0);
    gr.addColorStop(0, top); gr.addColorStop(0.5, mid); gr.addColorStop(1, locked ? low : OD.rgba(hex, 0.78)); b.fillStyle = gr; b.fillRect(0, 0, 96, 96);
    b.globalCompositeOperation = 'source-over';
    // shadow under the glyph
    if (canBlur) { g.save(); g.globalAlpha *= 0.5; g.filter = 'blur(2.5px) brightness(0)'; g.drawImage(icoA, 0, 3); g.restore(); }
    // a halo: a blur of the tinted glyph, added as light
    if (!locked) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = st === 'max' ? 0.85 : 0.55; if (canBlur) { g.filter = 'blur(5px)'; g.drawImage(icoB, 0, 0); g.filter = 'blur(2px)'; g.globalAlpha *= 0.7; g.drawImage(icoB, 0, 0); } else { for (const [dx, dy] of [[-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5]]) { g.globalAlpha = 0.18; g.drawImage(icoB, dx, dy); } } g.restore(); }
    g.drawImage(icoB, 0, 0);
    // the sheen: white over the upper half of the glyph, fading out
    const sh = icoA.getContext('2d'); sh.globalCompositeOperation = 'source-in'; const sg = sh.createLinearGradient(0, 14, 0, 62); sg.addColorStop(0, 'rgba(255,255,255,0.75)'); sg.addColorStop(1, 'rgba(255,255,255,0)'); sh.fillStyle = sg; sh.fillRect(0, 0, 96, 96); sh.globalCompositeOperation = 'source-over';
    g.save(); g.globalAlpha *= locked ? 0.3 : 0.7; g.drawImage(icoA, 0, 0); g.restore();
    g.globalAlpha = 1;
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
      text: ['Flick your thumb <b>away from the planet</b> to jump to the next bigger orbit, or <b>towards it</b> to jump to the next tighter one.', 'A jump slips you past anything on your orbit.'] },
    { tab: 'Turn', title: 'Tap to turn around', arts: [['tap', 'Tap']],
      text: ['A quick <b>tap</b> anywhere flips your direction around the planet.', 'Only a tap turns you around. Swipes never do, so you can mix them freely.', 'Turning right before a rock or mine is a CLUTCH dodge and pays bonus points.'] },
    { tab: 'Dodge', title: 'Obstacles', gallery: () => ['rock', 'comet', 'mine', 'ribbon', 'shoal'],
      note: 'The obstacles of Aurora Reach. Swipe through them. Every further biome has others, which you will discover and have to adapt to.' },
    { tab: 'Power-ups', title: 'Power-ups', gallery: () => OD.INTRO.filter(i => i.kind === 'power' && !/^Perk/.test(i.tag)).map(i => i.id),
      note: 'Fly through the glowing rings on your orbit to pick them up. Swipe to see what each one does.' },
    { tab: 'Score', title: 'Points and multiplier', arts: [['dust', 'Stardust'], ['graze', 'Near miss'], ['overdrive', 'Nova'], ['combo', 'Multiplier']],
      text: ['<b>Stardust</b> adds to your score and buys skill points for your Skills.', 'Skim close to debris without touching it for a <b>near miss</b>. Near misses fill the ring around the planet.', 'When the ring is full, <b>NOVA</b> ignites: for about five seconds you blaze through debris, nothing can hurt you, everything you smash pays points and your multiplier jumps.', 'Good moves raise your <b>multiplier</b>. The bar shows how long it lasts before it drains.'] },
    { tab: 'Planets', title: 'Planets', arts: [['twin', 'New planet']],
      text: ['Sometimes a <b>new planet</b> drifts past. Jump from your outer orbit onto its ring to move in.', 'Each planet type changes the rules: its orbits, its dangers and its bonuses.'] },
  ];
  function tutHtml() {
    const p = TUT[tutPage];
    return `<div class="tutor"><div class="tuthead"><h2>Tutorial</h2><button class="iconbtn" data-act="tutclose" aria-label="Close">${IC.back}</button></div>
      <div class="tuttabs">${TUT.map((t, i) => `<button class="${i === tutPage ? 'on' : ''}" data-act="tuttab" data-v="${i}">${t.tab}</button>`).join('')}</div>
      ${p.gallery ? galHtml(p) : `<div class="tutbody"><canvas id="tutart" width="440" height="440" aria-hidden="true"></canvas><span class="tutlabel" id="tutlabel"></span>
        <h3>${p.title}</h3><ul>${p.text.map(t => `<li>${t}</li>`).join('')}</ul></div>`}
      <div class="tutnav"><button class="btn" data-act="tutprev" ${tutPage === 0 ? 'disabled' : ''}>Back</button><span class="tutdots">${TUT.map((t, i) => `<i class="${i === tutPage ? 'on' : ''}"></i>`).join('')}</span><button class="btn primary" data-act="tutnext">${tutPage === TUT.length - 1 ? (tutFirst ? 'Continue' : 'Done') : 'Next'}</button></div></div>`;
  }
  // a gallery page: one swipeable card per obstacle or power-up, each with its own looping clip
  function galHtml(p) {
    const ids = p.gallery().filter(id => OD.INTRO_BY_ID[id] && OD.introArt[id]);
    return `<div class="tutbody gal"><h3>${p.title}</h3><p class="galnote">${p.note}</p>
      <div class="galtrack" id="galtrack">${ids.map(id => { const it = OD.INTRO_BY_ID[id]; return `<div class="galslide" data-id="${id}"><canvas width="380" height="380" aria-hidden="true"></canvas><h4>${it.name}</h4><small>${it.tag}</small><ul>${it.todo.slice(0, 2).map(t => `<li>${t}</li>`).join('')}</ul></div>`; }).join('')}</div>
      <div class="galdots" id="galdots">${ids.length > 10 ? `<span class="galcount" id="galcount">1 / ${ids.length}</span>` : ids.map(() => '<i></i>').join('')}</div></div>`;
  }
  function tutRun() {
    if (TUT[tutPage].gallery) { tutGallery(); return; }
    cancelAnimationFrame(tutRaf);
    const cv = document.getElementById('tutart'); if (!cv) return;
    const g = cv.getContext('2d'), lab = document.getElementById('tutlabel'), arts = TUT[tutPage].arts, t0 = performance.now();
    let shown = -1;
    const loop = now => {
      if (!document.body.contains(cv)) return;
      const t = (now - t0) / 1000, i = Math.floor(t / 8) % arts.length;
      if (i !== shown) { shown = i; lab.textContent = arts.length > 1 ? arts[i][1] : ''; lab.style.opacity = arts.length > 1 ? 1 : 0; }
      try { OD.introArt[arts[i][0]](g, cv.width, cv.height, t % 8); } catch (e) { /* art is optional */ }
      tutRaf = requestAnimationFrame(loop);
    };
    tutRaf = requestAnimationFrame(loop);
  }
  function tutGallery() {
    cancelAnimationFrame(tutRaf);
    const track = document.getElementById('galtrack'); if (!track) return;
    const slides = [...track.children], dots = [...document.querySelectorAll('#galdots i')], t0 = performance.now();
    const cur = () => Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / (slides[0].offsetWidth + 14))));
    const cnt = document.getElementById('galcount'), mark = () => { const n = cur(); dots.forEach((d, i) => d.classList.toggle('on', i === n)); if (cnt) cnt.textContent = (n + 1) + ' / ' + slides.length; };
    track.addEventListener('scroll', mark, { passive: true }); mark();
    const loop = now => {
      if (!document.body.contains(track)) return;
      const t = (now - t0) / 1000, n = cur();
      for (const i of [n - 1, n, n + 1]) {   // only the card in view and its neighbours move
        const s = slides[i]; if (!s) continue;
        const cv = s.querySelector('canvas'), r = s.getBoundingClientRect();
        if (r.right < 0 || r.left > innerWidth) continue;
        try { OD.introArt[s.dataset.id](cv.getContext('2d'), cv.width, cv.height, t % 8); } catch (e) { /* art is optional */ }
      }
      tutRaf = requestAnimationFrame(loop);
    };
    tutRaf = requestAnimationFrame(loop);
  }
  function tutGo(i) { tutPage = i; modal.innerHTML = tutHtml(); tutRun(); OD.audio.sfx('click'); }
  function openTutorial(page, first) { tutFirst = first; tutPage = page || 0; openModal(tutHtml()); modal.classList.add('full'); tutRun(); }
  function tutClose() { cancelAnimationFrame(tutRaf); modal.classList.remove('full'); closeModal(); if (tutFirst) { tutFirst = false; askTips(true); } }
  function askTutorial() {
    onboarding = true;
    openModal(`<div class="card panel pw ask welcome"><div class="wl-stars"></div>
      <div class="wl-logo">${haloLogo()}</div>
      <h2>Welcome, pilot</h2>
      <p class="wl-sub">One small light. One quiet planet.<br>A whole galaxy of danger and wonder<br>waiting beyond it.</p>
      <div class="wl-how"><span><b>Tap</b> to turn around</span><span><b>Swipe</b> to leap between orbits</span><span><b>Asteroids</b> and other hazards are deadly: flip early, or jump to another orbit</span><span><b>Stardust</b> buys skill points for your Skills</span><span><b>Graze</b> danger without touching it for bonus points</span><span><b>Multiplier</b> rises with good moves and fades if you stop</span></div>
      <button class="btn primary" data-act="tutyes" style="width:100%">Show me how to play</button>
      <button class="btn" data-act="tutno" style="width:100%;margin-top:10px">Skip, let me fly</button>
      <p class="fine">You can open the tutorial any time in Settings.</p></div>`);
  }
  function askTips(first) {
    onboarding = !!first;
    const cur_ = OD.save.settings.tips || 'all';
    const opt = (k, name, d) => `<button class="card tipopt ${k === cur_ ? 'sel' : ''}" data-act="tipset" data-v="${k}"><h4>${name}</h4><p>${d}</p></button>`;
    openModal(`<div class="card panel pw ask"><h2>How many tips?</h2><p class="sub">While you play, a short pop-up can explain each new thing the first time it appears.</p>
      <div class="tipopts">${opt('all', 'All tips', 'Every new obstacle, power-up and event is explained once. Best for learning.')}${opt('core', 'Core tips only', 'Just the basics: how to steer, the first obstacles, the shield and planets.')}${opt('off', 'No tips', 'Nothing interrupts the game.')}</div>
      <p class="fine">You can change this any time in Settings.</p></div>`);
  }
  function play() {
    const sv = OD.save;
    if (!sv.onboarded) { if (sv.stats.runs > 0) { sv.onboarded = true; sv.tutorialDone = true; OD.persist(); } else { askTutorial(); return; } }
    closeModal();
    OD.audio.unlock();
    // one fluid motion: the view zooms in while the menu drifts off to the sides, then the HUD slides in
    const fromHome = cur === 'home';
    if (fromHome) { const pb = scr.querySelector('.playbtn'); if (pb) pb.classList.add('tapped'); scr.classList.add('leaving'); } else show('hud');
    if (OD.game.start('endless') === false) { scr.classList.remove('leaving'); OD.game.quit(); show('home'); return; }
    theme();
    if (fromHome) setTimeout(() => { if (cur === 'home' && OD.game.state !== 'menu') show('hud'); }, 520);
    if (fromHome) setTimeout(() => { if (cur === 'home' && OD.game.state === 'menu') scr.classList.remove('leaving'); }, 1400);   // if the run never began, the menu comes back instead of staying half-gone
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
    noop() {},
    closem() { closeModal(); },
    closemodal() { closeModal(); },
    speedtest() { const r = OD.game.speedTest(); openModal(`<div class="card panel pw"><h2>Speed test</h2><pre style="text-align:left;white-space:pre-wrap;font:12px/1.5 monospace;margin:8px 0">${Object.entries(r).map(([k, v]) => k + ': ' + v + (typeof v === 'number' && /^\d/.test(k) ? ' ms' : '')).join('\n')}</pre><p class="sub">Lower is better. Send me a screenshot of this.</p><div class="btnrow"><button class="btn primary" data-act="closemodal">Close</button></div></div>`); },
    quality(d) { OD.save.settings.quality = d.v; OD.persist(); OD.audio.sfx('click'); OD.game.applyQuality(); redraw(); },
    trickpos(d) { OD.save.settings.trickPos = d.v; OD.persist(); OD.audio.sfx('click'); redraw(); },
    toggle(d) { const s = OD.save.settings; s[d.v] = !s[d.v]; OD.persist(); redraw(); },
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
      else if (cur === 'settings' || cur === 'psettings') redraw();
      else closeModal();
    },
    replayhints() { OD.save.intro = {}; OD.save.reshow = {}; OD.save.deathLog = []; OD.persist(); toast('Hints will show again as you meet things.'); },
    privacy() { openModal(`<div class="card panel pw"><h2>Privacy</h2><div class="priv"><p>Halo Run collects no personal data, has no ads, no analytics and no accounts. Your scores, unlocks and settings stay on your device.</p><p>The one-time purchase is processed entirely by Google Play. We never see your payment details.</p><p>Questions? Open an issue at github.com/camberr4/orbit-game.</p></div><button class="btn primary" data-act="close" style="width:100%;margin-top:12px">Close</button></div>`); },
    reset() {
      openModal(`<div class="card panel pw"><h2>Reset everything?</h2><p class="sub">This deletes your scores, stardust, skills and achievements. Your purchase is kept.</p><button class="btn" data-act="reset2" style="width:100%;color:#ff8a9a">Yes, reset</button><button class="linkbtn" data-act="close">Cancel</button></div>`);
    },
    reset2() { const full = OD.save.full; Object.assign(OD.save, OD.defaultSave()); OD.save.full = full; OD.persist(); closeModal(); toast('Progress reset. Starting fresh...'); setTimeout(() => location.reload(), 700); },   // (a reload, so it is a true first launch: the loading screen, then the welcome)
    close() { closeModal(); },
    buyfull() { OD.shop.buy().then(ok => { if (ok) onPurchased(); }); },
    thxgo() { closeModal(); OD.audio.sfx('click'); },
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

  // a small, quiet card in the middle of a free run: what waits in the full game (never a button, never in the way)
  let teaseEl = null, teaseT = 0;
  function teaser(o) {
    if (OD.save.full) return;
    const root = document.getElementById('ui'); if (!root) return;
    if (!teaseEl) { teaseEl = document.createElement('div'); teaseEl.className = 'teaser'; root.appendChild(teaseEl); }
    teaseEl.style.setProperty('--ac', o.accent || '#ffd95a');
    teaseEl.innerHTML = `<i class="tz-ico">${IC.star}</i><span class="tz-tx"><small>${o.kicker || 'THE FULL GAME'}</small><b>${o.title}</b><em>${o.sub}</em></span>`;
    teaseEl.classList.remove('show'); void teaseEl.offsetWidth; teaseEl.classList.add('show');
    clearTimeout(teaseT); teaseT = setTimeout(() => { if (teaseEl) teaseEl.classList.remove('show'); }, 4600);
  }
  // ------------------------------------------------------------ paywall
  // A gold button whose lettering is cut out of it: the page's own colours show through the text and the price pill (a canvas drawn over the button;
  // the real text stays in place, invisible, for taps and screen readers)
  function knockoutButton(btn) {
    const cv = btn && btn.querySelector('canvas.ko'); if (!cv) return;
    const draw = () => {
      const w = btn.clientWidth, h = btn.clientHeight; if (!w || !h) return; const d = Math.min(3, window.devicePixelRatio || 1);
      cv.width = w * d; cv.height = h * d; cv.style.width = w + 'px'; cv.style.height = h + 'px';
      const g = cv.getContext('2d'); g.scale(d, d);
      const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#ffe48a'); gr.addColorStop(1, '#ffb347');
      const rad = parseFloat(getComputedStyle(btn).borderTopLeftRadius) || 20;
      g.fillStyle = gr; g.beginPath(); g.roundRect(0, 0, w, h, rad); g.fill();
      const label = btn.querySelector('span:not(.pwshine)'), price = btn.querySelector('b'), cs = getComputedStyle(label);
      g.font = `800 ${cs.fontSize} Outfit, system-ui, sans-serif`; g.textBaseline = 'middle'; g.textAlign = 'left'; g.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
      const lw = g.measureText(label.textContent).width, pcs = price ? getComputedStyle(price) : null, pw = price ? price.getBoundingClientRect().width : 0, ph = price ? price.getBoundingClientRect().height : 0, gap = price ? 14 : 0;
      const x0 = (w - (lw + gap + pw)) / 2, cy = h / 2;
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.fillText(label.textContent, x0, cy + 1);
      if (price) { g.beginPath(); g.roundRect(x0 + lw + gap, cy - ph / 2, pw, ph, ph / 2); g.fill(); g.globalCompositeOperation = 'source-over'; g.fillStyle = '#ffd95a'; g.font = `800 ${pcs.fontSize} Outfit, system-ui, sans-serif`; g.textAlign = 'center'; g.fillText(price.textContent, x0 + lw + gap + pw / 2, cy + 1); }
    };
    draw(); (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(draw); setTimeout(draw, 400);
  }
  function paywall(reason) {
    if (OD.save.full) return;
    const gw = reason === 'next' && lastRes && lastRes.gate != null ? OD.WORLDS[lastRes.gate] : null;
    const head = gw ? ['The journey goes on', `${gw.name} is waiting`, `${gw.sub}. Unlock the full game and fly on.`] : ['The full game', 'Five more unique biomes are waiting', `Five new biomes, ${OD.PLANETS.length - 2} more planets and a final trial are waiting beyond Aurora Reach.`];
    const sk = OD.WORLDS.slice(1);
    const dots = n => '<i class="on"></i>'.repeat(n) + '<i></i>'.repeat(5 - n);
    const cards = sk.map(w => `<div class="pwc" data-w="${w.id}" style="--ac:${w.accent};--c1:${w.neb[0]};--c2:${w.neb[1]}"><canvas width="360" height="520"></canvas><div class="pwcs"></div>
      <span class="pwcl">${IC.lock}</span><div class="pwct"><small>BIOME ${w.id + 1}</small><b>${w.name}</b><em>${w.sub}</em><span class="pwcp">${w.pill}</span><span class="pwrisk"><u>Danger</u>${dots(w.risk)}</span></div></div>`).join('');
    const tile = (ic, big, lab, sm, col) => `<div class="pwf" style="--tc:${col}"><span class="pwfi">${ic}</span><b>${big}</b><span>${lab}</span><small>${sm}</small></div>`;
    const NEWHZ = new Set(OD.WORLDS.slice(1).flatMap(w => w.hazards)); OD.WORLDS[0].hazards.forEach(h => NEWHZ.delete(h));
    const nSongs = 2 * (OD.WORLDS.length - 1) + 1;
    const planetIc = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5.2"/><path d="M3.2 15.2c-1.200-1.800 2.800-5.200 8.800-6.800s10.300-1.200 9.200 1.800M5 17.800c3.500 1.600 9.300-.2 13.500-4.500" opacity=".9"/></svg>';
    const quest = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8.700 9a3.400 3.400 0 1 1 5.400 2.700c-1.300.9-2.100 1.600-2.100 3.100"/><path d="M12 19v.2"/></svg>';
    const warn = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.500 21 19.500H3z"/><path d="M12 9.500v4.500M12 16.800v.2"/></svg>';
    const spike = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3 14 9.5 21 8 16 13l4 5-7-1.5L12 21l-1-4.500L4 18l4-5L3 8l7 1.500z"/></svg>';
    const note = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V6l10-2v12"/><circle cx="6.500" cy="18" r="2.600"/><circle cx="16.500" cy="16" r="2.600"/></svg>';
    const hole = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3.2" fill="currentColor"/><ellipse cx="12" cy="12" rx="9.5" ry="3.6" transform="rotate(-20 12 12)"/></svg>';
    openModal(`<div class="pw2"><button class="pwx" data-act="close" aria-label="Close">&times;</button>
      <div class="pwscroll"><div class="pw2in">
        <div class="pwhero"><div class="pwey"><span></span>${head[0]}<span></span></div><h2>${head[1]}</h2><p>${head[2]}</p></div>
        <div class="pwcar" id="pwcar">${cards}</div>
        <div class="pwdots" id="pwdots">${sk.map(() => '<i></i>').join('')}</div>
        <div class="pwgrid">
          ${tile(planetIc, OD.PLANETS.length - 2, 'more planets', 'calm to deadly, each with its own rules', '#6fb6ff')}
          ${tile(quest, '1', 'final trial', 'waiting at the end of the galaxy', '#ff6a8a')}
          ${tile(warn, NEWHZ.size, 'new dangers', 'every biome fights you differently', '#ff9a4d')}
          ${tile(note, nSongs, 'new songs', 'a soundtrack for every biome, and one for the final trial', '#c27dff')}
        </div>
        <div class="pwtrust"><span>${IC.check}One-time</span><span>${IC.check}No ads</span><span>${IC.check}No subscription</span><span>${IC.check}Yours forever</span></div>
      </div></div>
      <div class="pwbar"><button class="btn gold pwcta" data-act="buyfull"><canvas class="ko"></canvas><span class="pwshine"></span><span>Unlock everything</span><b>${OD.shop.price}</b></button>
        <div class="pwlinks"><button class="linkbtn" data-act="restore">Restore purchase</button><button class="linkbtn" data-act="close">Maybe later</button></div></div>
    </div>`);
    modal.classList.add('full'); knockoutButton(modal.querySelector('.pwcta'));
    // each biome's real picture, painted one at a time so the sheet opens at once
    const car = modal.querySelector('#pwcar'); if (!car) return;
    const els = [...car.children];
    els.forEach((el, i) => setTimeout(() => {
      try {
        const w = OD.WORLDS[+el.dataset.w], cv = el.querySelector('canvas'); if (!cv) return;
        const W = innerWidth, H = innerHeight, off = document.createElement('canvas'); off.width = W; off.height = H; const og = off.getContext('2d');
        og.drawImage(OD.biomes.base(w, W, H), 0, 0, W, H); OD.biomes.draw(og, w, 2.5, W, H, 1, Math.min(W, H) / 400, false, W * 0.35);
        const g = cv.getContext('2d'), k = Math.max(cv.width / W, cv.height / H) * 1.25, sw = cv.width / k, sh = cv.height / k;
        g.drawImage(off, (W - sw) / 2, H * 0.3 - sh / 2, sw, sh, 0, 0, cv.width, cv.height); el.classList.add('ready');
      } catch (e) { el.classList.add('ready'); }
    }, 60 + i * 90));
    // the cards drift along by themselves until you touch them; the dots follow
    const dots2 = [...modal.querySelectorAll('#pwdots i')], startAt = gw ? Math.max(0, gw.id - 1) : 0;
    const cw = () => els[0].offsetWidth + 12, idx = () => Math.max(0, Math.min(els.length - 1, Math.round(car.scrollLeft / cw())));
    const mark = () => { const n = idx(); dots2.forEach((d, i) => d.classList.toggle('on', i === n)); };
    car.scrollLeft = startAt * cw(); mark(); let auto = true, iv = 0;
    car.addEventListener('scroll', mark, { passive: true });
    car.addEventListener('pointerdown', () => { auto = false; }, { passive: true });
    iv = setInterval(() => { if (!car.isConnected) { clearInterval(iv); return; } if (!auto) return; car.scrollTo({ left: ((idx() + 1) % els.length) * cw(), behavior: 'smooth' }); }, 3400);
  }
  function onPurchased() {
    closeModal(); OD.audio.sfx('unlock'); OD.haptic('heavy');
    if (cur !== 'hud') rerender();
    const sk = OD.WORLDS.slice(1), pls = OD.PLANETS.filter(p => p.skin !== 'terra' && p.skin !== 'moon');
    const conf = Array.from({ length: 34 }, (_, i) => `<i style="left:${(i * 29 + 7) % 100}%;--d:${(i % 9) * 0.35}s;--s:${3.2 + (i % 5) * 0.6}s;--c:${['#ffd95a', '#7be8ff', '#ff8ad9', '#b69cff', '#9dff8a', '#fff'][i % 6]};--r:${(i * 47) % 360}deg"></i>`).join('');
    openModal(`<div class="thx"><div class="thx-rays"></div><div class="thx-conf">${conf}</div>
      <div class="thx-in">
        <div class="thx-emblem"><i class="r1"></i><i class="r2"></i><svg viewBox="-50 -50 100 100"><path d="M0 -34 L10 -11 L35 -9 L16 8 L22 33 L0 20 L-22 33 L-16 8 L-35 -9 L-10 -11Z" fill="#ffd95a" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg></div>
        <div class="thx-kick">THANK YOU</div>
        <h1>The whole galaxy<br><b>is yours</b></h1>
        <p>You unlocked the full game, for good. No ads, no subscription.</p>
        <div class="thx-sky">${sk.map((w, i) => `<div style="--ac:${w.accent};--d:${0.7 + i * 0.12}s"><canvas width="168" height="168" data-w="${w.id}"></canvas><span>${w.short}</span></div>`).join('')}</div>
        <div class="thx-lab">${sk.length} NEW BIOMES</div>
        <div class="thx-pl">${pls.map((p, i) => `<canvas width="240" height="240" data-skin="${p.skin}" style="--d:${1.5 + i * 0.07}s"></canvas>`).join('')}</div>
        <div class="thx-lab">${pls.length} NEW PLANETS &nbsp;·&nbsp; AND A FINAL TRIAL WAITING AT THE END</div>
        <button class="btn gold thx-go" data-act="thxgo"><canvas class="ko"></canvas><span class="pwshine"></span><span>Start exploring</span></button>
      </div></div>`);
    modal.classList.add('full'); knockoutButton(modal.querySelector('.thx-go'));
    try { const need = pls.map(p => p.skin).filter(s => !OD.planets.ready(s)); if (need.length) OD.planets.warmNow(need); } catch (e) { /* the planets paint with what they have */ }
    const paint = () => {
      modal.querySelectorAll('canvas[data-skin]').forEach(cv => { try { const g = cv.getContext('2d'); g.clearRect(0, 0, 240, 240); OD.gfx.drawPlanet(g, 120, 120, 92, cv.dataset.skin, 1.5, '#9fe6ff', 3); } catch (e) { /* the planet stays dark */ } });
      modal.querySelectorAll('canvas[data-w]').forEach(cv => { try {   // each biome as its own picture: the real sky, in a round window
        const w = OD.WORLDS[+cv.dataset.w], W = innerWidth, H = innerHeight, off = document.createElement('canvas'); off.width = W; off.height = H; const og = off.getContext('2d');
        og.drawImage(OD.biomes.base(w, W, H), 0, 0, W, H); OD.biomes.draw(og, w, 2.5, W, H, 1, Math.min(W, H) / 400, false, W * 0.35);
        const g = cv.getContext('2d'), S = 168, sz = Math.min(W, H) * 0.62; g.save(); g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 3, 0, Math.PI * 2); g.clip();
        try { g.filter = 'brightness(1.9) saturate(1.35) contrast(1.05)'; } catch (e) { /* plain */ }
        g.drawImage(off, W / 2 - sz / 2, H * 0.34 - sz / 2, sz, sz, 0, 0, S, S); g.filter = 'none';
        const rg = g.createRadialGradient(S * 0.38, S * 0.32, 0, S * 0.5, S * 0.5, S * 0.62); rg.addColorStop(0, OD.rgba(w.neb[1], 0.5)); rg.addColorStop(0.55, OD.rgba(w.neb[0], 0.22)); rg.addColorStop(1, OD.rgba(w.neb[0], 0));
        g.globalCompositeOperation = 'lighter'; g.fillStyle = rg; g.fillRect(0, 0, S, S); g.globalCompositeOperation = 'source-over';
        const sh = g.createLinearGradient(0, 0, S, S); sh.addColorStop(0, 'rgba(255,255,255,0.16)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,20,0.35)'); g.fillStyle = sh; g.fillRect(0, 0, S, S); g.restore();
        g.lineWidth = 3; g.strokeStyle = w.accent; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); g.stroke();
      } catch (e) { /* the window stays empty */ } });
    };
    setTimeout(paint, 30); setTimeout(paint, 700);
    { const inn = modal.querySelector('.thx-in'); if (inn) { inn.style.zoom = ''; const k = Math.min(1, (modal.clientHeight - 4) / inn.scrollHeight); if (k < 1) inn.style.zoom = k.toFixed(3); } }   // short phones: the whole screen shrinks a little to fit
    setTimeout(() => OD.audio.sfx('newhome'), 350);
  }

  // ------------------------------------------------------------ sharing
  // ------------------------------------------------------------ run end
  function onRunEnd(res) {
    lastRes = res;
    if (res.mode === 'zen') res.zen = res.time;
    show(res.win ? 'victory' : 'over');
    pauseBtn.classList.add('hidden');
    if (res.win) return;
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
    if (OD.save.full && !modal.classList.contains('hidden') && modal.querySelector('[data-act="buyfull"]')) onPurchased();
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

  return { internals: { screens, after, acts, scr, modal, IC, show, toast, openModal, closeModal, drawPerkIcon, celebrate, lockout, get cur() { return cur; }, get lastRes() { return lastRes; } }, show, toast, achievement, welcome, paywall, teaser, onPurchased, pause, logo: haloLogo, onRunEnd, back, showIntro, showTile, hideTile, get cur() { return cur; }, openHow: () => openTutorial(0, false) };
})();
