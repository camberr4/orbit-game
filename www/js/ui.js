'use strict';
// Menus, overlays, paywall and toasts. Screens are plain template strings rendered into #screen.
OD.VERSION = '1.0.0';
OD.ui = (() => {
  const $ = s => document.querySelector(s);
  const scr = $('#screen'), modal = $('#modal'), toasts = $('#toasts'), pauseBtn = $('#pausebtn');
  let cur = 'home', shopTab = 'core', perkScroll = null, shopRaf = 0, lockTimer = 0, countRaf = 0, lastRes = null;

  const IC = {
    gear: '<svg viewBox="0 0 24 24"><path d="M19.4 13a7.9 7.9 0 0 0 0-2l2-1.6a.5.5 0 0 0 .1-.6l-1.9-3.3a.5.5 0 0 0-.6-.2l-2.4 1a7.7 7.7 0 0 0-1.7-1l-.4-2.5a.5.5 0 0 0-.5-.4h-3.8a.5.5 0 0 0-.5.4l-.4 2.5c-.6.2-1.2.6-1.7 1l-2.4-1a.5.5 0 0 0-.6.2L2.6 8.8a.5.5 0 0 0 .1.6l2 1.6a7.9 7.9 0 0 0 0 2l-2 1.6a.5.5 0 0 0-.1.6l1.9 3.3c.1.2.4.3.6.2l2.4-1c.5.4 1.1.8 1.7 1l.4 2.5c0 .2.2.4.5.4h3.8c.3 0 .5-.2.5-.4l.4-2.5c.6-.2 1.2-.6 1.7-1l2.4 1c.2.1.5 0 .6-.2l1.9-3.3a.5.5 0 0 0-.1-.6zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg>',
    globe: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 9h-3a15.7 15.7 0 0 0-1.4-6A8 8 0 0 1 18.9 11zM12 4c.8 1 1.8 3.2 2 7H10c.2-3.800 1.200-6 2-7zM5.100 13h3a15.700 15.700 0 0 0 1.400 6A8 8 0 0 1 5.100 13zm3-2h-3a8 8 0 0 1 4.400-6 15.700 15.700 0 0 0-1.400 6zM12 20c-.8-1-1.800-3.200-2-7h4c-.2 3.800-1.200 6-2 7zm2.500-1a15.700 15.700 0 0 0 1.400-6h3a8 8 0 0 1-4.400 6z"/></svg>',
    tree: '<svg viewBox="0 0 24 24"><path d="M12 22v-6M12 16c-3 0-5-2-5-5 0-1.500.600-2.800 1.600-3.600C8.500 4.800 10 3 12 3s3.500 1.800 3.400 4.400c1 .8 1.600 2.100 1.600 3.600 0 3-2 5-5 5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    bag: '<svg viewBox="0 0 24 24"><path d="m12 2 2.4 5.600L20 10l-5.600 2.400L12 18l-2.400-5.600L4 10l5.600-2.400zM19 15l1 2.400 2.400 1-2.400 1-1 2.400-1-2.400-2.400-1 2.400-1z"/></svg>',
    trophy: '<svg viewBox="0 0 24 24"><path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.900V17h3v2H8v-2h3v-2.100A5 5 0 0 1 8.300 12H8a4 4 0 0 1-4-4V5h3zm-1 4v1a2 2 0 0 0 1 1.700V7zm12 0h-1v2.700A2 2 0 0 0 18 8z"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="m12 1.500 2.600 7.900 7.900 2.600-7.900 2.600L12 22.500l-2.600-7.900L1.500 12l7.900-2.600z"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3z"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m9 16.200-3.500-3.500L4 14.100l5 5 11-11-1.400-1.400z"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M20 11H7.800l5.600-5.600L12 4l-8 8 8 8 1.400-1.400L7.800 13H20z"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    redo: '<svg viewBox="0 0 24 24"><path d="M17.700 6.300A8 8 0 1 0 20 12h-2a6 6 0 1 1-1.800-4.200L13 11h7V4z"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M18 16a3 3 0 0 0-2.400 1.200L8.900 13.700a3 3 0 0 0 0-3.400l6.700-3.500A3 3 0 1 0 15 5a3 3 0 0 0 .1.800L8.400 9.300a3 3 0 1 0 0 5.400l6.700 3.500A3 3 0 1 0 18 16z"/></svg>',
    home: '<svg viewBox="0 0 24 24"><path d="M12 3 2 12h3v8h5v-6h4v6h5v-8h3z"/></svg>',
    book: '<svg viewBox="0 0 24 24"><path d="M5 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a1 1 0 0 1 1-1zm1 2v12h11V5zm0 14h11v-.5H6z"/></svg>',
  };
  // the cheapest thing you could buy next (cosmetics and the next level of any unlocked perk), for the shop's goal bar and the end-of-run hint
  function nextGoal(scope) {
    const sv = OD.save, c = [];
    if (scope !== 'perks') for (const k of ['core', 'trail']) for (const it of OD.COSMETICS[k]) if (!sv.owned[k].includes(it.id)) c.push({ name: it.name, price: it.price, kind: k });
    if (scope !== 'shop') for (const p of OD.PERKS) { const lv = OD.perkLevel(p.id); if (lv < 3 && OD.perkOpen(p)) c.push({ name: p.name + (lv ? ' ' + (lv + 1) : ''), price: p.cost[lv], kind: 'perk' }); }
    if (!c.length) return null;
    const aff = c.filter(x => x.price > sv.stardust).sort((a, b) => a.price - b.price);
    return aff[0] || c.sort((a, b) => b.price - a.price)[0];
  }
  OD.nextGoal = nextGoal;
  const sd = n => `<span class="sdi">${IC.star}${OD.fmt(n)}</span>`;

  // ------------------------------------------------------------ plumbing
  function theme() {
    const w = OD.game.world, s = document.documentElement.style;
    s.setProperty('--a', w.accent); s.setProperty('--a2', w.accent2 === '#ffffff' ? '#7ac8ff' : w.accent2); s.setProperty('--danger', w.danger);
  }
  function show(name, resetScroll) {
    cur = name; theme();
    scr.className = 'screen s-' + name;
    scr.innerHTML = screens[name]();
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
  function openModal(html) { modal.innerHTML = html; modal.classList.remove('hidden'); }
  function closeModal() { modal.classList.add('hidden'); modal.innerHTML = ''; }
  const modeLocked = m => !OD.save.full && !OD.MODES[m].free;
  const fmtT = s => { s = Math.floor(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  // ------------------------------------------------------------ screens
  const screens = {
    hud: () => '',

    home() {
      const sv = OD.save, w = OD.game.world, mode = sv.mode, m = OD.MODES[mode];
      const dayInfo = mode === 'daily' ? dailyLine() : '';
      const chips = OD.MODE_ORDER.map(k => `<button class="chip ${k === mode ? 'on' : ''}" data-act="mode" data-v="${k}">${modeLocked(k) ? IC.lock : ''}${OD.MODES[k].name}</button>`).join('');
      const bestTxt = mode === 'zen' ? `Longest calm <b>${fmtT(sv.best.zen)}</b>` : mode === 'daily' ? '' : `Best <b>${OD.fmt(sv.best[mode] || 0)}</b>`;
      const challengesNew = OD.CHALLENGES.some(c => !sv.ach[c.id] && c.prog && c.prog(sv.stats, sv)[0] >= c.prog(sv.stats, sv)[1]);
      return `
      <div class="topbar">
        <div class="pill">${IC.star}<span>${OD.fmt(sv.stardust)}</span></div>
        <button class="iconbtn" data-act="go" data-v="settings" aria-label="Settings">${IC.gear}</button>
      </div>
      <div class="logo"><h1>ORBIT</h1><p>DODGER</p></div>
      <div class="spacer"></div>
      <div class="bottom">
        ${sv.full ? '' : `<button class="demo-ribbon" data-act="paywall" data-v="ribbon">FREE DEMO <b>·</b> ${OD.freeLeft()} of ${OD.FREE_RUNS} runs left <b>·</b> Unlock ${OD.shop.price}</button>`}
        <div class="chips">${chips}</div>
        <div class="modeinfo">${m.desc}<br>${dayInfo || bestTxt}</div>
        <button class="btn primary big" data-act="play">${IC.play} PLAY</button>
        <div class="pillrow"><button class="worldpill" data-act="go" data-v="worlds"><i></i>${mode === 'daily' ? "Today's sector · " : ''}${(mode === 'daily' ? dailyWorld() : w).short}</button>
        ${mode === 'daily' || mode === 'zen' ? '' : `<button class="worldpill mods ${sv.mods.length ? 'on' : ''}" data-act="mods">${sv.full ? '' : IC.lock}Modifiers${sv.mods.length ? ' ×' + modMul().toFixed(2).replace(/0$/, '') : ''}</button>`}</div>
        <div class="nav">
          <button class="navbtn" data-act="go" data-v="worlds">${IC.globe}Sectors</button>
          <button class="navbtn" data-act="go" data-v="shop">${IC.bag}Shop</button>
          <button class="navbtn" data-act="go" data-v="perks">${IC.tree}Perks</button>
          <button class="navbtn" data-act="go" data-v="goals">${IC.trophy}Goals${challengesNew ? '<span class="dot"></span>' : ''}</button>
          <button class="navbtn" data-act="go" data-v="guide">${IC.book}Guide</button>
        </div>
      </div>`;
    },

    worlds() {
      const sv = OD.save;
      const cards = OD.WORLDS.map((w, i) => {
        const unlocked = OD.worldUnlocked(i), sel = sv.world === i;
        let meta;
        if (unlocked) meta = `Best ${OD.fmt(sv.bestWorld[i] || 0)}`;
        else if (!sv.full) meta = 'Full game';
        else meta = `Score ${OD.fmt(w.unlockScore)} in ${OD.WORLDS[i - 1].short}`;
        const stars = Array.from({ length: 5 }, (_, k) => `<i class="${k < w.risk ? 'on' : ''}"></i>`).join('');
        const chips = w.bonus.map(t => `<span class="chp good">${t}</span>`).concat(w.dangers.map(t => `<span class="chp bad">${t}</span>`)).join('');
        return `<button class="card wcard ${sel ? 'sel' : ''} ${unlocked ? '' : 'locked'}" style="--c:${w.accent};border-color:${sel ? '#fff' : OD.rgba(w.accent, 0.4)}" data-act="world" data-v="${i}">
          <div class="bgfx" style="background:radial-gradient(circle at 85% 20%, ${OD.rgba(w.neb[1], 0.55)}, transparent 55%),radial-gradient(circle at 10% 90%, ${OD.rgba(w.neb[0], 0.5)}, transparent 55%),linear-gradient(160deg, ${w.bg[0]}, ${w.bg[1]})"></div>
          ${unlocked ? '' : `<span class="lock">${IC.lock}</span>`}
          <div class="risk" title="Danger level ${w.risk} of 5">${stars}<small>${['Peaceful', 'Easy', 'Risky', 'Dangerous', 'Deadly'][w.risk - 1]}</small></div>
          <h3 style="color:${w.accent}">${w.name}</h3><p>${w.sub}</p>
          <div class="chips2">${chips}</div>
          <div class="meta"><span>${w.bpm} BPM</span><span>·</span><span>${meta}</span></div>
        </button>`;
      }).join('');
      return `<div class="head"><button class="iconbtn" data-act="go" data-v="home" aria-label="Back">${IC.back}</button><h2>Sectors</h2></div><div class="list">${cards}</div>`;
    },

    perks() {
      const sv = OD.save, g = nextGoal('perks'), T = OD.TREE;
      const all = OD.PERKS.reduce((a, p) => a + OD.perkLevel(p.id), 0);
      const col = p => OD.PERK_BRANCHES.find(b => b.id === p.branch).color;
      const chips = OD.PERK_BRANCHES.map(x => `<button class="chip" data-act="pjump" data-v="${x.id}" style="--a:${x.color}">${x.name}</button>`).join('');
      const curve = (x1, y1, x2, y2, on, c) => `<path d="M${x1} ${y1} C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}" class="${on ? 'on' : ''}" style="--lc:${c}"/>`;
      let lines = '';
      for (const p of OD.PERKS) {
        if (!p.reqs.length) lines += curve(T.origin[0], T.origin[1], p.pos[0], p.pos[1], true, col(p));
        for (const r of p.reqs) { const q = OD.PERK_BY_ID[r]; lines += curve(q.pos[0], q.pos[1], p.pos[0], p.pos[1], OD.perkLevel(r) > 0, col(p)); }
      }
      const nds = OD.PERKS.map(p => {
        const lv = OD.perkLevel(p.id), open = OD.perkOpen(p), cost = lv < 3 ? p.cost[lv] : 0;
        const st = lv >= 3 ? 'max' : !open ? 'locked' : sv.stardust >= cost ? 'can' : 'open';
        const pips = [0, 1, 2].map(i => `<i class="${i < lv ? 'f' : ''}"></i>`).join('');
        return `<button class="pnode ${st} ${p.tier === 3 ? 'cap' : ''}" data-act="perk" data-v="${p.id}" style="left:${p.pos[0]}px;top:${p.pos[1]}px;--bc:${col(p)}"><canvas width="96" height="96" data-picon="${p.icon}:${col(p)}:${st}"></canvas><span class="pips">${pips}</span><em>${p.name}</em></button>`;
      }).join('');
      const goal = g ? `<div class="goal ${sv.stardust >= g.price ? 'ready' : ''}"><div class="gl"><small>${sv.stardust >= g.price ? 'READY TO LEARN' : 'NEXT PERK'}</small><b>${g.name}</b></div><div class="bar"><i style="width:${Math.min(100, Math.round(sv.stardust / g.price * 100))}%"></i></div><div class="gr">${OD.fmt(Math.min(sv.stardust, g.price))} / ${OD.fmt(g.price)}</div></div>` : '<div class="goal ready"><div class="gl"><small>COMPLETE</small><b>Every perk is maxed.</b></div></div>';
      return `<div class="head"><button class="iconbtn" data-act="go" data-v="home" aria-label="Back">${IC.back}</button><h2>Perks</h2><div class="pill">${IC.star}<span>${OD.fmt(sv.stardust)}</span></div></div>
        ${goal}<div class="chips pbr">${chips}</div><p class="sub tight">${all}/${OD.PERKS.length * 3} levels learned. Drag the map around. Perks work in every run except the daily.</p>
        <div class="treeview" id="treeview"><div class="tmap" style="width:${T.w}px;height:${T.h}px"><svg viewBox="0 0 ${T.w} ${T.h}" width="${T.w}" height="${T.h}">${lines}</svg><div class="seed" style="left:${T.origin[0]}px;top:${T.origin[1]}px"></div>${nds}</div></div>`;
    },

    shop() {
      const sv = OD.save, g = nextGoal('shop');
      const tabs = [['core', 'Dots'], ['trail', 'Tails'], ['boost', 'Boosters']].map(([k, n]) => `<button class="chip ${k === shopTab ? 'on' : ''}" data-act="tab" data-v="${k}">${n}</button>`).join('');
      const goalPct = g ? Math.min(100, Math.round(sv.stardust / g.price * 100)) : 100;
      const goal = g ? `<div class="goal ${sv.stardust >= g.price ? 'ready' : ''}"><div class="gl"><small>${sv.stardust >= g.price ? 'READY TO BUY' : 'NEXT GOAL'}</small><b>${g.name}</b></div><div class="bar"><i style="width:${goalPct}%"></i></div><div class="gr">${OD.fmt(Math.min(sv.stardust, g.price))} / ${OD.fmt(g.price)}</div></div>` : '<div class="goal ready"><div class="gl"><small>COMPLETE</small><b>You own everything. Legend.</b></div></div>';
      let body;
      if (shopTab === 'core' || shopTab === 'trail') {
        const items = OD.COSMETICS[shopTab];
        body = '<div class="grid">' + items.map(it => {
          const owned = sv.owned[shopTab].includes(it.id), eq = sv.equipped[shopTab] === it.id;
          let act;
          if (eq) act = '<div class="tag">Equipped</div>';
          else if (owned) act = `<button class="btn sm" data-act="equip" data-v="${it.id}">Equip</button>`;
          else if (!sv.full) act = `<button class="btn sm" data-act="paywall" data-v="shop">${IC.lock} ${OD.fmt(it.price)}</button>`;
          else act = `<button class="btn sm ${sv.stardust >= it.price ? 'gold' : 'off'}" data-act="buy" data-v="${it.id}">${sd(it.price)}</button>`;
          return `<div class="card item ${eq ? 'eq' : ''} ${!owned && it.price >= 4000 ? 'epic' : ''}"><canvas width="240" height="192" data-prev="${shopTab}:${it.id}"></canvas><h4>${it.name}</h4>${act}</div>`;
        }).join('') + '</div>';
      } else {
        body = '<div class="blist">' + OD.BOOSTERS.map(b => {
          const n = sv.boosters[b.id] || 0, off = sv.boosterOff[b.id];
          return `<div class="card booster"><canvas width="96" height="96" data-picon="${b.icon}:${b.color}:open"></canvas><div class="tx"><h4>${b.name}${n ? ` <span class="cnt">×${n}</span>` : ''}</h4><p>${b.desc}</p></div><div class="ac">${n ? `<button class="btn sm ${off ? '' : 'on'}" data-act="boosttoggle" data-v="${b.id}">${off ? 'Off' : 'Armed'}</button>` : ''}<button class="btn sm ${sv.stardust >= b.price && sv.full ? 'gold' : 'off'}" data-act="boostbuy" data-v="${b.id}">${sd(b.price)}</button></div></div>`;
        }).join('') + '<p class="sub tight">An armed booster is used up at the start of your next run (not in the daily). Up to ' + OD.BOOSTER_MAX + ' of each.</p></div>';
      }
      return `<div class="head"><button class="iconbtn" data-act="go" data-v="home" aria-label="Back">${IC.back}</button><h2>Shop</h2><div class="pill">${IC.star}<span>${OD.fmt(sv.stardust)}</span></div></div>
        <div class="shophero"><canvas id="hero" width="640" height="150"></canvas></div>${goal}
        <div class="tabs">${tabs}</div><div class="list">${body}</div>`;
    },

    goals() {
      const sv = OD.save;
      const done = OD.CHALLENGES.filter(c => sv.ach[c.id]).length;
      const rows = OD.CHALLENGES.slice().sort((a, b) => (sv.ach[a.id] ? 1 : 0) - (sv.ach[b.id] ? 1 : 0)).map(c => {
        const d = !!sv.ach[c.id], pr = c.prog ? c.prog(sv.stats, sv) : null;
        const bar = !d && pr ? `<div class="bar"><i style="width:${(pr[0] / pr[1]) * 100}%"></i></div>` : '';
        const cnt = !d && pr && pr[1] > 1 ? ` <small>(${OD.fmt(pr[0])}/${OD.fmt(pr[1])})</small>` : '';
        return `<div class="card chal ${d ? 'done' : ''}"><div class="ic">${d ? IC.check : IC.trophy}</div><div class="tx"><h4>${c.name}</h4><p>${c.desc}${cnt}</p>${bar}</div><div class="rw">${d ? '' : '+' + c.reward + IC.star.replace('<svg', '<svg width="13" height="13"')}</div></div>`;
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
        <div class="row"><label>Music</label><input type="range" min="0" max="1" step="0.05" value="${s.music}" data-vol="music"></div>
        <div class="row"><label>Sound effects</label><input type="range" min="0" max="1" step="0.05" value="${s.sfx}" data-vol="sfx"></div>
        <div class="row aimrow"><label>Jump controls<small>${s.aim === 'drag' ? 'Hold, drag toward an orbit, let go. A quick jump gives a small boost.' : 'Hold and release on the golden glow for a speed boost. The next orbit is chosen for you.'}</small></label>
          <div class="seg"><button class="${s.aim === 'drag' ? 'on' : ''}" data-act="aimset" data-v="drag">Drag</button><button class="${s.aim === 'sling' ? 'on' : ''}" data-act="aimset" data-v="sling">Slingshot</button></div></div>
        <div class="row"><label>Haptics</label>${sw('haptics')}</div>
        <div class="row"><label>Screen shake</label>${sw('shake')}</div>
        <div class="row"><label>High quality effects<small>Turn off if the game feels slow</small></label>${sw('fx')}</div>
        <div class="row"><label>Record clips<small>Keep the last few seconds to share after a run</small></label>${sw('clip')}</div>
      </div>
      <div class="card">
        <div class="row"><label>How to play</label><button class="btn sm" data-act="howto">Open</button></div>
        <div class="row"><label>Restore purchase</label><button class="btn sm" data-act="restore">Restore</button></div>
        <div class="row"><label>Privacy</label><button class="btn sm" data-act="privacy">Read</button></div>
        <div class="row"><label>Reset progress<small>Deletes scores, unlocks and stardust</small></label><button class="btn sm" data-act="reset" style="color:#ff8a9a">Reset</button></div>
      </div>
      ${OD.save.full ? '' : `<button class="btn gold" data-act="paywall" data-v="settings">Unlock full game · ${OD.shop.price}</button>`}
      <div class="foot">Orbit Dodger v${OD.VERSION}<br>${OD.save.full ? 'Full game unlocked. Thank you for supporting indie games!' : 'Free demo'}</div></div>`;
    },

    pause: () => `<div class="center"><div class="card panel"><h2>Paused</h2>
      <div class="btnrow" style="flex-direction:column;align-items:stretch">
        <button class="btn primary" data-act="resume">${IC.play} Resume</button>
        <button class="btn" data-act="restart">${IC.redo} Restart</button>
        <button class="btn ghost" data-act="quit">${IC.home} Menu</button>
      </div></div></div>`,

    over() {
      const r = lastRes, sv = OD.save;
      const title = r.reason === 'time' ? 'Time up' : r.mode === 'zen' ? 'Session ended' : 'Run over';
      const big = r.mode === 'zen' ? fmtT(r.zen || 0) : '0';
      const ach = r.newAch.map(c => `<span class="mini">${IC.check.replace('<svg', '<svg width="12" height="12" style="vertical-align:-2px"')} ${c.name} <b style="color:var(--gold)">+${(c.paid || c.reward)}</b></span>`).join('');
      const worldMsg = r.worldUnlocked >= 0 ? `<div class="mini" style="background:rgba(255,217,90,.2);border-color:var(--gold)">New sector unlocked: <b>${OD.WORLDS[r.worldUnlocked].name}</b></div>` : '';
      const daily = r.dailyInfo ? `<div class="best" style="margin-top:6px">Daily streak <b style="color:var(--gold)">${r.dailyInfo.streak} day${r.dailyInfo.streak === 1 ? '' : 's'}</b>${r.bonus ? ` · bonus +${r.bonus}` : ''}</div>` : '';
      const demo = sv.full ? '' : `<div class="best" style="margin-top:12px">${OD.freeLeft()} free run${OD.freeLeft() === 1 ? '' : 's'} left</div><button class="btn gold" data-act="paywall" data-v="over" style="width:100%;margin-top:8px">Unlock full game · ${OD.shop.price}</button>`;
      return `<div class="center"><div class="card panel"><h2>${title}</h2>
        <div class="final" id="finalscore">${r.mode === 'zen' ? fmtT(r.time) : big}</div>
        ${r.newBest ? '<span class="newbest">NEW BEST</span>' : `<div class="best">Best ${r.mode === 'zen' ? fmtT(r.best) : OD.fmt(r.best)}</div>`}
        ${daily}
        <div class="stats"><div class="stat"><b>${r.grazes}</b><span>Grazes</span></div><div class="stat"><b>×${(+r.maxCombo).toFixed(1)}</b><span>Best multiplier</span></div><div class="stat"><b>${fmtT(r.time)}</b><span>Time</span></div></div>
        <div class="earn">${IC.star}+${OD.fmt(r.stardust)} <small>stardust</small></div>
        ${goalHint()}
        ${tipHtml(r)}
        <div class="chipwrap">${worldMsg}${ach}</div>
        <div class="btnrow" style="flex-direction:column;align-items:stretch">
          <button class="btn primary" data-act="restart" id="retry">${IC.redo} Retry</button>
          <div class="btnrow" style="margin:0">
            <button class="btn sm ${r.hasClip ? '' : 'hidden'}" id="shareclip" data-act="share">${IC.share} Share</button>
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
    guide() {
      scr.querySelectorAll('canvas[data-gicon]').forEach(cv => { try { OD.introArt[cv.dataset.gicon](cv.getContext('2d'), 76, 76, 1.2); } catch (e) { /* art is optional */ } });
    },
    shop() {
      const w = OD.WORLDS[OD.save.world] || OD.WORLDS[0], G = OD.gfx;
      cancelAnimationFrame(shopRaf);
      const prev = [...scr.querySelectorAll('canvas[data-prev]')], icons = [...scr.querySelectorAll('canvas[data-picon]')], hero = scr.querySelector('#hero');
      icons.forEach(drawPerkIcon);
      const f = { trail: G.previewTrail, core: G.previewCore };
      let last = 0;
      const loop = now => {
        if (cur !== 'shop' || !scr.contains(hero || document.body)) return;
        shopRaf = requestAnimationFrame(loop);
        if (now - last < 33) return; last = now;
        const t = now / 1000;
        prev.forEach(cv => { const [kind, id] = cv.dataset.prev.split(':'); f[kind](cv, id, w.accent, t); });
        if (hero) G.previewHero(hero, OD.save.equipped.trail, OD.save.equipped.core, w.accent, t);
      };
      shopRaf = requestAnimationFrame(loop);
    },
    perks() {
      cancelAnimationFrame(shopRaf);
      scr.querySelectorAll('canvas[data-picon]').forEach(drawPerkIcon);
      const tv = scr.querySelector('#treeview'), T = OD.TREE;
      if (tv) { tv.scrollLeft = perkScroll ? perkScroll[0] : (T.w - tv.clientWidth) / 2; tv.scrollTop = perkScroll ? perkScroll[1] : T.h; }
      perkScroll = null;
      // drag to pan with a mouse (touch scrolls natively)
      if (tv) { let sx = 0, sy = 0, dx = 0, dy = 0, down = false; tv.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') { down = true; sx = e.clientX; sy = e.clientY; dx = tv.scrollLeft; dy = tv.scrollTop; } }); window.addEventListener('pointermove', e => { if (down) { tv.scrollLeft = dx - (e.clientX - sx); tv.scrollTop = dy - (e.clientY - sy); } }); window.addEventListener('pointerup', () => { down = false; }); }
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
  function dailyWorld() { return OD.WORLDS[OD.dayNumber(OD.todayKey()) % OD.WORLDS.length]; }
  function dailyLine() {
    const d = OD.save.daily, today = OD.todayKey();
    const done = d.last === today;
    return `Streak <b>${d.streak && (done || OD.dayNumber(today) - OD.dayNumber(d.last) === 1) ? d.streak : 0}</b> · Today's best <b>${OD.fmt(d.bestDay === today ? d.bestScore : 0)}</b>`;
  }

  // ------------------------------------------------------------ actions
  let aimRaf = 0;
  function stopAimArt() { cancelAnimationFrame(aimRaf); }
  function askAim() {
    openModal(`<div class="card panel pw"><h2>How do you want to jump?</h2><p class="sub">Pick a style. You can change it any time in Settings.</p>
      <div class="aimcards">
        <button class="card aimc" data-act="aimpick" data-v="drag"><canvas id="aimart1" width="480" height="270"></canvas><h4>Drag to aim <span class="rec">Recommended</span></h4><p>Hold, drag toward the orbit you want and let go. A quick jump gives a small boost.</p></button>
        <button class="card aimc" data-act="aimpick" data-v="sling"><canvas id="aimart2" width="480" height="270"></canvas><h4>Slingshot timing</h4><p>Hold and release on the golden glow for a speed boost. The next orbit is chosen for you.</p></button>
      </div></div>`);
    const cvs = [['aim_drag', document.getElementById('aimart1')], ['aim_sling', document.getElementById('aimart2')]], t0 = performance.now();
    const loop = now => {
      if (!document.body.contains(cvs[0][1])) return;
      for (const [id, cv] of cvs) { try { OD.introArt[id](cv.getContext('2d'), cv.width, cv.height, (now - t0) / 1000 + 0.3); } catch (e) { /* art is optional */ } }
      aimRaf = requestAnimationFrame(loop);
    };
    aimRaf = requestAnimationFrame(loop);
  }
  function play() {
    const sv = OD.save;
    if (!sv.aimAsked) { askAim(); return; }
    let mode = sv.mode;
    if (modeLocked(mode)) { paywall('mode'); return; }
    let w = sv.world;
    if (!OD.worldUnlocked(w)) w = 0;
    closeModal();
    OD.audio.unlock();
    OD.game.setWorld(mode === 'daily' ? dailyWorld().id : w);
    show('hud');
    if (OD.game.start(mode, w) === false) { OD.game.quit(); show('home'); return; }
    theme();
  }
  function pause() {
    if (OD.game.pause()) pauseBtn.classList.add('hidden');   // the pause menu opens once time has eased to a stop
  }
  const acts = {
    play,
    pause,
    resume() { show('hud'); OD.game.resume(); },
    restart() {
      closeModal(); show('hud'); OD.game.setWorld(OD.game.world.id);
      if (OD.game.start(OD.game.mode(), OD.game.world.id) === false) { OD.game.quit(); show('home'); return; }
      theme();
    },
    introok() { closeIntro(); },
    tileok() { OD.game.endIntro(); },
    aimset(d) { OD.save.settings.aim = d.v; OD.persist(); show('settings'); },
    aimpick(d) { OD.save.settings.aim = d.v; OD.save.aimAsked = true; OD.persist(); stopAimArt(); closeModal(); play(); },
    guideopen(d) { showIntro(d.v, false); },
    quit() { OD.game.quit(); show('home'); },
    go(d) { if (d.v === 'home' && ['over', 'pause'].includes(cur)) { OD.game.quit(); } show(d.v); },
    mode(d) {
      if (modeLocked(d.v)) { OD.save.mode = d.v; OD.persist(); rerender(); paywall('mode'); return; }
      OD.save.mode = d.v; OD.persist(); rerender();
    },
    world(d) {
      const i = +d.v;
      if (!OD.worldUnlocked(i)) {
        if (!OD.save.full) paywall('world'); else toast(`Score <b>${OD.fmt(OD.WORLDS[i].unlockScore)}</b> in ${OD.WORLDS[i - 1].name} to unlock ${OD.WORLDS[i].name}`);
        return;
      }
      OD.save.world = i; OD.persist(); OD.game.setWorld(i); OD.audio.preload(String(i)); OD.audio.startMusic(OD.WORLDS[i], { menu: true }); show('worlds');
    },
    tab(d) { shopTab = d.v; show('shop'); },
    pjump(d) { const tv = scr.querySelector('#treeview'), p = OD.PERKS.find(x => x.branch === d.v && x.tier === 0); if (tv && p) tv.scrollTo({ left: p.pos[0] - tv.clientWidth / 2, top: p.pos[1] - tv.clientHeight * 0.5, behavior: 'smooth' }); },
    equip(d) { OD.save.equipped[shopTab] = d.v; OD.persist(); OD.audio.sfx('click'); show('shop'); },
    buy(d) {
      const it = OD.COSMETICS[shopTab].find(x => x.id === d.v), sv = OD.save;
      if (sv.stardust < it.price) { toast('Not enough stardust yet. Keep flying!'); return; }
      sv.stardust -= it.price; sv.owned[shopTab].push(it.id); sv.equipped[shopTab] = it.id;
      OD.audio.sfx('unlock'); OD.persist(); show('shop');
      const done = OD.checkChallenges(); done.forEach(c => toast(`Goal complete: <b>${c.name}</b> +${(c.paid || c.reward)}`));
    },
    perk(d) {
      const p = OD.PERK_BY_ID[d.v], sv = OD.save, lv = OD.perkLevel(p.id), open = OD.perkOpen(p), reqNames = p.reqs.map(r => OD.PERK_BY_ID[r].name).join(' or ');
      const pips = [0, 1, 2].map(i => `<i class="${i < lv ? 'f' : ''}"></i>`).join('');
      const eff = p.d.map((t, i) => `<li class="${i < lv ? 'got' : i === lv ? 'next' : ''}"><b>Level ${i + 1}</b> ${t}</li>`).join('');
      let act;
      if (lv >= 3) act = '<div class="tag">Maxed out</div>';
      else if (!open) act = `<div class="tag">Needs ${reqNames}</div>`;
      else if (!sv.full) act = `<button class="btn gold" data-act="paywall" data-v="shop">${IC.lock} Unlock the full game</button>`;
      else act = `<button class="btn ${sv.stardust >= p.cost[lv] ? 'gold' : 'off'}" data-act="perkbuy" data-v="${p.id}">${lv ? 'Upgrade' : 'Learn'} ${sd(p.cost[lv])}</button>`;
      openModal(`<div class="card panel perk" style="--bc:${OD.PERK_BRANCHES.find(b => b.id === p.branch).color}"><div class="phead"><canvas width="96" height="96" id="pmodalicon"></canvas><div><h2>${p.name}</h2><span class="pips big">${pips}</span></div></div><ul class="plist">${eff}</ul><div class="btnrow">${act}<button class="btn" data-act="closem">Close</button></div></div>`);
      const cv = modal.querySelector('#pmodalicon'), g = cv.getContext('2d'), col = OD.PERK_BRANCHES.find(b => b.id === p.branch).color;
      g.save(); g.globalCompositeOperation = 'lighter'; OD.gfx.glow(g, 48, 48, 44, col, 0.7); g.restore(); OD.game.drawPowerIcon(g, p.icon, 48, 48, 28, col);
    },
    perkbuy(d) {
      const p = OD.PERK_BY_ID[d.v], sv = OD.save, lv = OD.perkLevel(p.id);
      if (lv >= 3 || !OD.perkOpen(p)) return;
      if (sv.stardust < p.cost[lv]) { toast('Not enough stardust yet. Keep flying!'); return; }
      sv.stardust -= p.cost[lv]; sv.perks[p.id] = lv + 1; OD.persist(); OD.audio.sfx('unlock'); closeModal(); { const tv = scr.querySelector('#treeview'); perkScroll = tv ? [tv.scrollLeft, tv.scrollTop] : null; } show('perks');
      toast(`<b>${p.name}</b> level ${lv + 1}`);
    },
    closem() { closeModal(); },
    boostbuy(d) {
      const b = OD.BOOSTERS.find(x => x.id === d.v), sv = OD.save;
      if (!sv.full) { paywall('shop'); return; }
      if ((sv.boosters[b.id] || 0) >= OD.BOOSTER_MAX) { toast('You are stocked up on that one.'); return; }
      if (sv.stardust < b.price) { toast('Not enough stardust yet. Keep flying!'); return; }
      sv.stardust -= b.price; sv.boosters[b.id] = (sv.boosters[b.id] || 0) + 1; OD.persist(); OD.audio.sfx('buy'); rerender();
    },
    boosttoggle(d) { const sv = OD.save; sv.boosterOff[d.v] = !sv.boosterOff[d.v]; OD.persist(); OD.audio.sfx('click'); rerender(); },
    toggle(d) { const s = OD.save.settings; s[d.v] = !s[d.v]; OD.persist(); show('settings'); },
    paywall(d) { paywall(d.v); },
    restore() { OD.shop.restore(); },
    howto() { openModal(howHtml()); },
    privacy() { openModal(`<div class="card panel pw"><h2>Privacy</h2><div class="priv"><p>Orbit Dodger collects no personal data, has no ads, no analytics and no accounts. Your scores, unlocks and settings stay on your device.</p><p>The one-time purchase is processed entirely by Google Play. We never see your payment details.</p><p>Questions? Open an issue at github.com/camberr4/orbit-game.</p></div><button class="btn primary" data-act="close" style="width:100%;margin-top:12px">Close</button></div>`); },
    mods() { if (!OD.save.full) { paywall('mode'); return; } openModal(modsHtml()); },
    modtoggle(d) {
      const sv = OD.save, i = sv.mods.indexOf(d.v);
      if (i >= 0) sv.mods.splice(i, 1);
      else { if (sv.mods.length >= 2) { toast('Two modifiers at most. Tap one to remove it.'); return; } sv.mods.push(d.v); }
      OD.persist(); modal.innerHTML = modsHtml(); rerender();
    },
    reset() {
      openModal(`<div class="card panel pw"><h2>Reset everything?</h2><p class="sub">This deletes your scores, stardust, cosmetics and goals. Your purchase is kept.</p><button class="btn" data-act="reset2" style="width:100%;color:#ff8a9a">Yes, reset</button><button class="linkbtn" data-act="close">Cancel</button></div>`);
    },
    reset2() { const full = OD.save.full; Object.assign(OD.save, OD.defaultSave()); OD.save.full = full; OD.persist(); closeModal(); show('home'); toast('Progress reset.'); },
    close() { closeModal(); },
    buyfull() { OD.shop.buy().then(ok => { if (ok) onPurchased(); }); },
    share: shareClip,
  };
  function howHtml() {
    return `<div class="card panel pw how"><h2>How to play</h2><ul>
      <li>${IC.play}<span><b>TAP</b> to flip your direction around the planet.</span></li>
      <li>${IC.redo}<span><b>HOLD</b> to aim a jump and time slows. <b>Drag toward the orbit next to yours</b> and let go to jump there, or drag back onto your own orbit to cancel. You jump one orbit at a time. Prefer timing? Switch to <b>Slingshot</b> in Settings: release on the <b>golden glow</b> for a speed boost.</span></li>
      <li>${IC.globe}<span>A <b>twin planet</b> sometimes sweeps in. Jump onto its ring for bonus stardust, then jump back before it leaves.</span></li>
      <li>${IC.star}<span><b>GRAZE</b> debris to build your combo. Five grazes ignite <b>NOVA</b>: you smash through everything.</span></li>
      <li>${IC.bag}<span>Collect stardust and power-ups: shield, slow-mo, magnet and phase.</span></li>
      <li>${IC.lock}<span>Every 90 seconds a boss ring appears. Stay on the open orbit.</span></li></ul>
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
  function showTile(id) {
    const it = OD.INTRO_BY_ID[id];
    if (!it) { OD.game.endIntro(); return; }
    tileEl.className = 'tile k-' + it.kind;
    tileEl.innerHTML = `<div class="tcard"><canvas id="tileart" width="240" height="240" aria-hidden="true"></canvas>
      <div class="tx"><span class="newtag">NEW ${OD.KIND_LABEL[it.kind].toUpperCase()}</span><h3>${it.name}</h3>
      <p class="look">${it.look}</p><ul>${it.todo.slice(0, 3).map(t => `<li>${t}</li>`).join('')}</ul></div>
      <button class="btn sm primary" data-act="tileok">Got it</button></div>`;
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
      over: ['Unlock Orbit Dodger', 'Six sectors, five modes and every cosmetic. One purchase, forever.'],
      mode: ['Unlock this mode', 'The full game includes Daily, Time Attack, Hardcore and Zen.'],
      world: ['Unlock all sectors', 'Each sector has its own rules, bonuses, music and dangers.'],
      shop: ['Unlock the shop', 'Spend your stardust on trails, planets and debris styles.'],
    };
    const [h, sub] = heads[reason] || heads.over;
    const li = (t, s) => `<li>${IC.check}<span>${t} <small>${s}</small></span></li>`;
    openModal(`<div class="card panel pw"><h2>${h}</h2><p class="sub">${sub}</p><ul>
      ${li(OD.WORLDS.length + ' sectors', 'peaceful to deadly, with new dangers')}
      ${li('5 game modes', 'Daily, Time Attack, Hardcore, Zen')}
      ${li(OD.ownedTotal() + ' cosmetics', 'trails, planets, debris')}
      ${li(OD.CHALLENGES.length + ' goals', 'with stardust rewards')}
      ${li('Ghost runs and clips', 'race your best, share the replay')}
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
  async function shareClip() {
    const r = lastRes, clip = OD.game.clip;
    const msg = `I scored ${OD.fmt(r.score)} in Orbit Dodger! Can you beat it?`;
    try {
      const P = window.Capacitor && window.Capacitor.Plugins;
      if (OD.isNative() && P && P.Share) {
        let url;
        if (clip && P.Filesystem) {
          const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(clip.blob); });
          const file = await P.Filesystem.writeFile({ path: `orbit-dodger-${Date.now()}.webm`, data: b64, directory: 'CACHE' });
          url = file.uri;
        }
        await P.Share.share({ title: 'Orbit Dodger', text: msg, url, dialogTitle: 'Share your run' });
      } else if (clip) {
        const a = document.createElement('a'); a.href = URL.createObjectURL(clip.blob); a.download = 'orbit-dodger-run.webm'; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      } else if (navigator.share) await navigator.share({ text: msg });
      OD.save.stats.shares++;
      const done = OD.checkChallenges(); done.forEach(c => toast(`Goal complete: <b>${c.name}</b> +${(c.paid || c.reward)}`));
    } catch (e) { /* user cancelled the share sheet */ }
  }

  // ------------------------------------------------------------ run end
  function onRunEnd(res) {
    lastRes = res;
    if (res.mode === 'zen') res.zen = res.time;
    show('over');
    pauseBtn.classList.add('hidden');
    if (res.newBest) { OD.audio.sfx('record'); OD.audio.fx('record'); } else OD.audio.fx('gameover');
    res.newAch.forEach((c, i) => setTimeout(() => { toast(`Goal complete: <b>${c.name}</b> +${(c.paid || c.reward)}`); OD.audio.sfx('unlock'); }, 700 + i * 900));
    if (!OD.save.full && OD.freeLeft() <= 0) setTimeout(() => { if (cur === 'over') paywall('demo'); }, 900);
  }
  function clipReady(ok) { const b = $('#shareclip'); if (b) b.classList.toggle('hidden', !ok); }

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
    if (cur === 'pause') { acts.resume(); return true; }
    if (cur === 'over') { acts.quit(); return true; }
    if (cur !== 'home') { show('home'); return true; }
    return false;
  }

  return { show, toast, paywall, pause, onRunEnd, clipReady, back, showIntro, showTile, hideTile, get cur() { return cur; }, openHow: () => openModal(howHtml()) };
})();
