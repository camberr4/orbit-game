'use strict';
// Menus, overlays, paywall and toasts. Screens are plain template strings rendered into #screen.
OD.VERSION = '1.0.0';
OD.ui = (() => {
  const $ = s => document.querySelector(s);
  const scr = $('#screen'), modal = $('#modal'), toasts = $('#toasts'), pauseBtn = $('#pausebtn');
  let cur = 'home', shopTab = 'core', perkScroll = null, shopRaf = 0, lockTimer = 0, countRaf = 0, lastRes = null;

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
        const chips = w.bonus.map(t => `<li class="good">${t}</li>`).concat(w.dangers.map(t => `<li class="bad">${t}</li>`)).join('');
        return `<button class="card wcard ${sel ? 'sel' : ''} ${unlocked ? '' : 'locked'}" style="--c:${w.accent};border-color:${sel ? '#fff' : OD.rgba(w.accent, 0.4)}" data-act="world" data-v="${i}">
          <div class="bgfx" style="background:radial-gradient(circle at 85% 20%, ${OD.rgba(w.neb[1], 0.55)}, transparent 55%),radial-gradient(circle at 10% 90%, ${OD.rgba(w.neb[0], 0.5)}, transparent 55%),linear-gradient(160deg, ${w.bg[0]}, ${w.bg[1]})"></div>
          ${unlocked ? '' : `<span class="lock">${IC.lock}</span>`}
          <div class="risk" title="Danger level ${w.risk} of 5">${stars}<small>${['Peaceful', 'Easy', 'Risky', 'Dangerous', 'Deadly'][w.risk - 1]}</small></div>
          <h3 style="color:${w.accent}">${w.name}</h3><p>${w.sub}</p>
          <ul class="facts">${chips}</ul>
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
        <div class="row aimrow"><label>Jump controls<small>${s.aim === 'drag' ? 'Hold, drag away from the planet for a bigger orbit or towards it for a tighter one, let go. Or just swipe that way for an instant jump.' : 'Hold and release on the golden glow for a speed boost. The next orbit is chosen for you.'}</small></label>
          <div class="seg"><button class="${s.aim === 'drag' ? 'on' : ''}" data-act="aimset" data-v="drag">Drag</button><button class="${s.aim === 'sling' ? 'on' : ''}" data-act="aimset" data-v="sling">Slingshot</button></div></div>
        <div class="row"><label>Haptics</label>${sw('haptics')}</div>
        <div class="row"><label>Screen shake</label>${sw('shake')}</div>
        <div class="row"><label>High quality effects<small>Turn off if the game feels slow</small></label>${sw('fx')}</div>
        <div class="row"><label>Record clips<small>Keep the last few seconds to share after a run</small></label>${sw('clip')}</div>
      </div>
      <div class="card">
        <div class="row"><label>How to play</label><button class="btn sm" data-act="howto">Open</button></div>
        <div class="row"><label>Replay hints<small>Show every explanation pop-up again as things appear</small></label><button class="btn sm" data-act="replayhints">Replay</button></div>
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
        <div class="stats"><div class="stat"><b>${r.grazes}</b><span>Grazes</span></div><div class="stat"><b>${r.tricks || 0}</b><span>Tricks</span></div><div class="stat"><b>×${(+r.maxCombo).toFixed(1)}</b><span>Best multiplier</span></div><div class="stat"><b>${fmtT(r.time)}</b><span>Time</span></div></div>
        <div class="earn">${IC.star}+${OD.fmt(r.stardust)} <small>stardust</small></div>
        ${goalHint()}
        ${r.reshow ? `<div class="gh reshow"><small><b>${OD.INTRO_BY_ID[r.reshow].name}</b> keeps catching you. It will be explained again next run.</small><button class="btn sm" data-act="guideopen" data-v="${r.reshow}">How it works</button></div>` : ''}
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
      // pan the map in any direction by dragging from anywhere, including empty space (mouse and touch), with a little momentum
      if (tv) {
        let id = null, sx = 0, sy = 0, sl = 0, st = 0, moved = false, swallow = false, vx = 0, vy = 0, lx = 0, ly = 0, lt = 0, raf = 0;
        const coast = () => { vx *= 0.94; vy *= 0.94; tv.scrollLeft -= vx; tv.scrollTop -= vy; if (Math.abs(vx) + Math.abs(vy) > 0.4 && document.body.contains(tv)) raf = requestAnimationFrame(coast); };
        tv.addEventListener('pointerdown', e => { cancelAnimationFrame(raf); id = e.pointerId; sx = lx = e.clientX; sy = ly = e.clientY; sl = tv.scrollLeft; st = tv.scrollTop; moved = false; vx = vy = 0; lt = e.timeStamp; });
        tv.addEventListener('pointermove', e => {
          if (e.pointerId !== id) return;
          const dx = e.clientX - sx, dy = e.clientY - sy;
          if (!moved && Math.hypot(dx, dy) > 7) { moved = true; try { tv.setPointerCapture(id); } catch (err) { /* ignore */ } }
          if (!moved) return;
          tv.scrollLeft = sl - dx; tv.scrollTop = st - dy;
          const dt = Math.max(1, e.timeStamp - lt); vx = vx * 0.5 + (e.clientX - lx) / dt * 16 * 0.5; vy = vy * 0.5 + (e.clientY - ly) / dt * 16 * 0.5; vx = Math.max(-34, Math.min(34, vx)); vy = Math.max(-34, Math.min(34, vy)); lx = e.clientX; ly = e.clientY; lt = e.timeStamp;
        });
        const end = e => { if (e.pointerId !== id) return; id = null; if (moved) { swallow = true; setTimeout(() => { swallow = false; }, 60); raf = requestAnimationFrame(coast); } };
        tv.addEventListener('pointerup', end); tv.addEventListener('pointercancel', end);
        tv.addEventListener('click', e => { if (swallow) { e.stopPropagation(); e.preventDefault(); } }, true);
      }
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
        <button class="card aimc" data-act="aimpick" data-v="drag"><canvas id="aimart1" width="480" height="270"></canvas><h4>Drag to aim <span class="rec">Recommended</span></h4><p>Hold anywhere, drag away from the planet (bigger orbit) or towards it (tighter orbit), let go to jump. Or just flick your thumb that way for an instant jump.</p></button>
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
    replayhints() { OD.save.intro = {}; OD.save.reshow = {}; OD.save.deathLog = []; OD.persist(); toast('Hints will show again as you meet things.'); },
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
      <li>${IC.redo}<span><b>HOLD</b> to aim a jump and time slows. <b>Drag away from the planet</b> for the next bigger orbit or <b>towards it</b> for the next tighter one, then let go, or just <b>swipe</b> that way for an instant jump. Drag sideways to cancel. You jump one orbit at a time. Prefer timing? Switch to <b>Slingshot</b> in Settings: release on the <b>golden glow</b> for a speed boost.</span></li>
      <li>${IC.globe}<span>A <b>twin planet</b> sometimes sweeps in. Jump onto its ring for bonus stardust, then jump back before it leaves.</span></li>
      <li>${IC.star}<span><b>GRAZE</b> debris to build your combo. Five grazes ignite <b>NOVA</b>: you smash through everything.</span></li>
      <li>${IC.bag}<span>Collect stardust and power-ups: shield, slow-mo, magnet and phase.</span></li>
      <li>${IC.lock}<span>Every minute or so a black hole drags you in. Hold on for 15 seconds until a planet frees you.</span></li></ul>
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
    tileEl.innerHTML = `<div class="tcard"><canvas id="tileart" width="240" height="240" aria-hidden="true"></canvas>
      <div class="tx"><span class="newtag">${again ? 'REMINDER' : 'NEW'} ${OD.KIND_LABEL[it.kind].toUpperCase()}</span><h3>${it.name}</h3>
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
    res.newAch.forEach((c, i) => setTimeout(() => { toast(`Goal complete: <b>${c.name}</b> +${(c.paid || c.reward)}`); if (i === 0) OD.audio.sfx('unlock'); }, 700 + i * 900));
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
