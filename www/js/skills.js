'use strict';
// The Skills screen. You buy skill points with stardust (each one costs more than the last), commit to ONE of four paths and spend
// the points on perks inside it. A perk is learned by HOLDING its icon: the outline fills, the icon shakes gently, and when it
// completes a soft ring and a few sparks mark the moment. Resetting refunds every point for a stardust fee.
(() => {
  const U = OD.ui.internals, { screens, after, acts, scr, IC } = U;
  const HOLD_MS = 900;
  let viewBranch = null, selId = null, holdRaf = 0, hold = null;

  const branchOf = id => OD.PERK_BRANCHES.find(b => b.id === id);
  const free = () => OD.spFree();
  const maxed = () => (OD.save.sp.bought || 0) >= OD.SP_MAX;
  const nextCost = () => OD.spCost(OD.save.sp.bought || 0);
  // can this perk be learned right now, and if not, why?
  function check(p) {
    const sv = OD.save, lv = OD.perkLevel(p.id);
    if (lv >= p.max) return { ok: false, why: 'Fully learned', st: 'max' };
    if (p.reqs.length && !p.reqs.some(r => OD.perkLevel(r) > 0)) return { ok: false, why: 'Learn ' + p.reqs.map(r => OD.PERK_BY_ID[r].name).join(' or ') + ' first', st: 'locked' };
    const cost = p.sp[lv];
    if (free() < cost) return { ok: false, why: `Needs ${cost} skill point${cost === 1 ? '' : 's'} (you have ${free()})`, st: 'open', cost };
    return { ok: true, st: 'can', cost };
  }
  // the tree is laid out in rows from the seed at the bottom up to the capstones
  const COLS = [50, 24, 76, 24, 76, 50, 50], ROWS = [0, 1, 1, 2, 2, 3, 4];
  function pos(p, list) { const i = list.indexOf(p); return { x: COLS[i], row: ROWS[i] }; }
  const TREE_H = 372, ROW_H = 72, NODE = 56;

  screens.perks = function () {
    const sv = OD.save, br = viewBranch || sv.path || 'guard'; viewBranch = br;
    const B = branchOf(br), info = OD.PATH_INFO[br];
    const list = OD.PERKS.filter(p => p.branch === br).sort((a, b) => a.tier - b.tier);
    if (!selId || !list.some(p => p.id === selId)) selId = (list.find(p => check(p).ok) || list[0]).id;
    const chips = OD.PERK_BRANCHES.map(x => {
      const own = OD.mainPath() === x.id;
      return `<button class="pchip ${br === x.id ? 'on' : ''}" data-act="pview" data-v="${x.id}" style="--pc:${x.color}"><b>${x.name}</b><small>${own ? 'Main path' : OD.PATH_INFO[x.id].who}</small></button>`;
    }).join('');
    // lines first (behind), then the nodes
    const px = p => { const q = pos(p, list); return [q.x, TREE_H - 34 - q.row * ROW_H]; };
    let lines = '';
    for (const p of list) for (const r of p.reqs) {
      const q = OD.PERK_BY_ID[r]; if (!q || q.branch !== br) continue;
      const [x1, y1] = px(q), [x2, y2] = px(p), on = OD.perkLevel(r) > 0 && OD.perkLevel(p.id) > 0, open = OD.perkLevel(r) > 0;
      lines += `<line x1="${x1}%" y1="${y1}" x2="${x2}%" y2="${y2}" class="${on ? 'on' : open ? 'open' : ''}"/>`;
    }
    const nodes = list.map(p => {
      const lv = OD.perkLevel(p.id), c = check(p), [x, y] = px(p), st = lv >= p.max ? 'max' : c.st;
      const pips = [0, 1, 2].map(i => `<i class="${i < lv ? 'f' : ''}"></i>`).join('');
      const costBadge = c.ok || st === 'open' ? `<em class="sp">${p.sp[lv]}</em>` : '';
      return `<button class="snode ${st} ${p.id === selId ? 'sel' : ''} ${lv > 0 ? 'has' : ''}" data-perk="${p.id}" style="left:${x}%;top:${y - NODE / 2}px;--bc:${B.color};--p:${(lv / 3 * 100).toFixed(1)}">
        <svg class="ring" viewBox="0 0 64 64"><circle class="trk" cx="32" cy="32" r="29"/><circle class="fill" cx="32" cy="32" r="29" pathLength="100"/></svg>
        <canvas width="96" height="96" data-picon="${p.icon}:${B.color}:${st === 'max' ? 'max' : st === 'can' ? 'can' : st === 'open' ? 'open' : st === 'has' ? 'open' : (lv > 0 ? 'open' : 'locked')}"></canvas>${costBadge}<span class="pips">${pips}</span></button>`;
    }).join('');
    const innate = info.innate.map(t => `<li>${t}</li>`).join('');
    const committed = OD.mainPath() === br;
    const need = nextCost(), pct = maxed() ? 100 : Math.min(100, Math.round(sv.stardust / need * 100)), can = !maxed() && sv.stardust >= need;
    return `<div class="head"><button class="iconbtn" data-act="go" data-v="home" aria-label="Back">${IC.back}</button><h2>Skills</h2><div class="pill sppill" id="sppill"><b>${free()}</b><span>skill point${free() === 1 ? '' : 's'}</span></div></div>
      <div class="list sk"><div class="buysp ${can ? 'ready' : ''}"><div class="bf" style="width:${pct}%"></div><div class="bt"><span class="sdi">${IC.star}${OD.fmt(sv.stardust)}</span>
        <button class="btn sm ${can ? 'gold' : 'off'}" data-act="spbuy">${maxed() ? 'All points bought' : `Buy a skill point <span class="sdi">${IC.star}${OD.fmt(need)}</span>`}</button></div></div>
      <div class="pchips">${chips}</div>
      <div class="pathcard" style="--pc:${B.color}"><div class="pn"><b>${info.who}</b><span>${info.play}</span></div>
        <ul class="innate ${committed ? 'on' : ''}">${innate}</ul><div class="pnote">${committed ? 'Path bonus active: your main path' : 'Put the most skill points here to make it your main path and get its bonus'}</div></div>
      <div class="stree" id="stree" style="height:${TREE_H}px"><svg class="slines" width="100%" height="${TREE_H}">${lines}</svg>${nodes}</div>
      <div class="pinfo" id="pinfo">${infoHtml(selId)}</div>
      <div class="sfoot">${OD.spSpent() ? `<button class="linkbtn" data-act="spreset">Reset skills <span class="sdi">${IC.star}${OD.fmt(OD.respecCost())}</span></button>` : '<small>Hold an icon to learn it. The path you invest in most gives its bonus.</small>'}</div></div>`;
  };

  // switching tabs, buying and learning redraw the contents in place, without restarting the screen's opening animation, so the sky never shows through
  function refresh() {
    if (U.cur !== 'perks') { OD.ui.show('perks'); return; }
    const l = scr.querySelector('.sk'), y = l ? l.scrollTop : 0;
    scr.innerHTML = screens.perks(); after.perks();
    const l2 = scr.querySelector('.sk'); if (l2) l2.scrollTop = y;
  }

  function infoHtml(id) {
    const p = OD.PERK_BY_ID[id]; if (!p) return '';
    const lv = OD.perkLevel(p.id), c = check(p), B = branchOf(p.branch);
    const eff = p.d.map((t, i) => `<li class="${i < lv ? 'got' : i === lv ? 'next' : ''}"><b>${i + 1}</b><span>${t}</span><em>${p.sp[i]} SP</em></li>`).join('');
    const hint = c.ok ? `<div class="hint go">Hold the icon to learn level ${lv + 1} · ${c.cost} SP</div>` : `<div class="hint">${c.why}</div>`;
    return `<h3 style="color:${B.color}">${p.name}</h3><ul class="lv">${eff}</ul>${hint}`;
  }

  // ---- interactions
  function setSel(id) {
    selId = id;
    scr.querySelectorAll('.snode').forEach(n => n.classList.toggle('sel', n.dataset.perk === id));
    const pi = scr.querySelector('#pinfo'); if (pi) pi.innerHTML = infoHtml(id);
  }
  function startHold(node, ev) {
    const p = OD.PERK_BY_ID[node.dataset.perk];
    setSel(p.id);
    const c = check(p); if (!c.ok) { if (c.st === 'other' || c.st === 'open') OD.audio.sfx('back'); return; }
    OD.audio.unlock(); OD.audio.sfx('charge'); OD.haptic('light');
    hold = { node, p, t0: performance.now(), prog: 0, id: ev.pointerId, down: true };
    node.classList.add('holding');
    cancelAnimationFrame(holdRaf); holdRaf = requestAnimationFrame(holdTick);
    try { node.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
  }
  function holdTick(now) {
    const h = hold; if (!h || !document.body.contains(h.node)) { hold = null; return; }
    if (h.down) h.prog = Math.min(1, (now - h.t0) / HOLD_MS);
    else h.prog = Math.max(0, h.prog - 0.07);   // let go early: the outline drains back
    const e = h.prog * h.prog * (3 - 2 * h.prog), amp = 0.18 + 0.85 * e, t = now / 1000;
    h.node.style.setProperty('--p', (OD.perkLevel(h.p.id) / 3 * 100 + e * 100 / 3).toFixed(1));
    h.node.style.transform = `translate(calc(-50% + ${(Math.sin(t * 61) * amp).toFixed(2)}px), ${(Math.cos(t * 73) * amp * 0.7).toFixed(2)}px) rotate(${(Math.sin(t * 47) * amp * 0.35).toFixed(2)}deg) scale(${(1 + 0.04 * e).toFixed(3)})`;
    if (h.down && now - (h.tick || 0) > 85) { h.tick = now; OD.audio.sfx('dust', 2 + Math.floor(h.prog * 9)); }   // little pips that climb as the outline fills
    if (h.down && h.prog >= 1) { complete(h); return; }
    if (!h.down && h.prog <= 0) { h.node.classList.remove('holding'); h.node.style.transform = ''; h.node.style.setProperty('--p', (OD.perkLevel(h.p.id) / 3 * 100).toFixed(1)); hold = null; return; }
    holdRaf = requestAnimationFrame(holdTick);
  }
  function release() { if (hold && hold.down) { hold.down = false; } }
  function complete(h) {
    hold = null; const p = h.p, sv = OD.save, lv = OD.perkLevel(p.id);
    const c = check(p); if (!c.ok) return;
    const mainBefore = OD.mainPath(); if (!sv.path) sv.path = p.branch;
    sv.perks[p.id] = lv + 1; OD.persist();
    OD.audio.sfx('skill', lv + 1); OD.haptic(lv + 1 >= 3 ? 'heavy' : 'medium');
    const id = p.id, B = branchOf(p.branch);
    h.node.style.transform = ''; h.node.classList.remove('holding');
    refresh();
    const nd = scr.querySelector(`.snode[data-perk="${id}"]`);
    if (nd) { nd.classList.add('learned'); burst(nd, B.color, lv + 1 >= p.max); }
    const mainAfter = OD.mainPath();
    if (mainAfter !== mainBefore) U.toast(`<span><b>${branchOf(mainAfter).name}</b> is now your main path. ${OD.PATH_INFO[mainAfter].innate[0]}.</span>`);
  }
  // a quiet confirmation: a ring that opens and fades, a soft glow and a few slow sparks
  function burst(nd, color, big) {
    const r = nd.getBoundingClientRect(), host = document.body, mk = (cls, css) => { const e = document.createElement('div'); e.className = cls; e.style.cssText = css; host.appendChild(e); setTimeout(() => e.remove(), 1300); return e; };
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    mk('learnring', `left:${cx}px;top:${cy}px;--c:${color}`);
    if (big) mk('learnring r2', `left:${cx}px;top:${cy}px;--c:${color}`);
    for (let i = 0; i < (big ? 12 : 7); i++) {
      const a = Math.random() * Math.PI * 2, d = 34 + Math.random() * 30;
      mk('learnspark', `left:${cx}px;top:${cy}px;--c:${color};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 8}px;animation-delay:${Math.random() * 0.12}s`);
    }
  }

  after.perks = function () {
    scr.querySelectorAll('canvas[data-picon]').forEach(U.drawPerkIcon);
    const tree = scr.querySelector('#stree');
    if (tree) {
      tree.addEventListener('pointerdown', e => { const n = e.target.closest('.snode'); if (n) { e.preventDefault(); startHold(n, e); } });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) tree.addEventListener(ev, release, true);
      tree.addEventListener('contextmenu', e => e.preventDefault());
    }
  };
  window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release);

  Object.assign(acts, {
    pview(d) { viewBranch = d.v; selId = null; refresh(); },
    spbuy() {
      const sv = OD.save;
      if (maxed()) { U.toast('You have bought every skill point.'); return; }
      const cost = nextCost();
      if (sv.stardust < cost) { U.toast('Not enough stardust yet. Keep flying!'); return; }
      sv.stardust -= cost; sv.sp.bought = (sv.sp.bought || 0) + 1; OD.persist(); OD.audio.sfx('buy'); OD.haptic('medium');
      refresh();
      const pill = scr.querySelector('#sppill'); if (pill) { pill.classList.add('bump'); const r = pill.getBoundingClientRect(); burst({ getBoundingClientRect: () => r }, '#ffd95a', false); }
    },
    spreset() {
      const cost = OD.respecCost(), ok = OD.save.stardust >= cost;
      U.openModal(`<div class="card panel pw"><h2>Reset skills?</h2><p class="sub">Every perk is unlearned and you get all your skill points back to spend again. You keep every point you bought.</p>
        <button class="btn ${ok ? 'gold' : 'off'}" data-act="spreset2" style="width:100%">${ok ? `Reset for ${IC.star} ${OD.fmt(cost)}` : `Needs ${OD.fmt(cost)} stardust`}</button><button class="linkbtn" data-act="closem">Cancel</button></div>`);
    },
    spreset2() {
      const sv = OD.save, cost = OD.respecCost();
      if (sv.stardust < cost) return;
      sv.stardust -= cost; sv.perks = {}; sv.path = null; OD.persist(); U.closeModal(); OD.audio.sfx('unlock'); viewBranch = null; selId = null; refresh();
      U.toast('Skills reset. Choose your path again.');
    },
  });
})();
