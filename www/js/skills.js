'use strict';
// The Skills screen. You buy skill points with stardust (each one costs more than the last), commit to ONE of four paths and spend
// the points on perks inside it. A perk is learned by HOLDING its icon: the outline fills, the icon shakes gently, and when it
// completes a soft ring and a few sparks mark the moment. Resetting refunds every point for a stardust fee.
(() => {
  const U = OD.ui.internals, { screens, after, acts, scr, IC } = U;
  const HOLD_MS = 900;
  let viewTab = 'perks', viewBranch = null, selId = null, infoOpen = false, holdRaf = 0, hold = null;

  const branchOf = id => OD.PERK_BRANCHES.find(b => b.id === id) || { id: 'ability', name: 'Abilities', color: '#9d8cff' };
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
  function pos(p, list) { if (p.branch === 'ability') return { x: p.pos[0], row: p.pos[1] }; const i = list.indexOf(p); return { x: COLS[i], row: ROWS[i] }; }
  const ROW_H = 72, NODE = 56, AROW_H = 88;
  // the activation of a finished path: a ring of light opens, the card flashes and the frame starts to travel round it
  function celebratePath(id) {
    const B = branchOf(id), card = scr.querySelector('.pathcard'), chip = scr.querySelector(`.pchip[data-v="${id}"]`);
    for (const el of [card, chip]) if (el) { el.classList.add('activate'); setTimeout(() => el.classList.remove('activate'), 2400); }
    if (card) { const r = card.getBoundingClientRect(); burst({ getBoundingClientRect: () => r }, B.color, true); setTimeout(() => burst({ getBoundingClientRect: () => r }, '#ffffff', true), 260); }
    OD.audio.sfx('victory'); OD.haptic('heavy');
    U.toast(`<span><b>${B.name}</b> is complete. ${OD.PATH_INFO[id].innate[0]}.</span>`);
  }

  screens.perks = function () {
    const sv = OD.save, ab = viewTab === 'abilities', br = ab ? 'ability' : (viewBranch || 'guard'); if (!ab) viewBranch = br;
    const B = branchOf(br), info = OD.PATH_INFO[br];
    const list = ab ? OD.ABILITIES.slice() : OD.PERKS.filter(p => p.branch === br).sort((a, b) => a.tier - b.tier);
    if (!selId || !list.some(p => p.id === selId)) selId = (list.find(p => check(p).ok) || list[0]).id;
    const chips = OD.PERK_BRANCHES.map(x => {
      const pr = OD.pathProgress(x.id);
      return `<button class="pchip ${br === x.id ? 'on' : ''} ${pr.done ? 'done' : ''}" data-act="pview" data-v="${x.id}" style="--pc:${x.color}"><span class="pframe"></span><canvas width="96" height="96" data-picon="path_${x.id}:${x.color}:${pr.done ? 'max' : pr.learned ? 'can' : 'open'}"></canvas><b>${x.name}</b><small>${pr.done ? 'Complete' : pr.learned + ' / ' + pr.total}</small></button>`;
    }).join('');
    const tabs = `<div class="sktabs"><button class="${ab ? '' : 'on'}" data-act="sktab" data-v="perks"><b>Perks</b><small>always on</small></button><button class="${ab ? 'on' : ''}" data-act="sktab" data-v="abilities"><b>Abilities</b><small>things you do</small></button></div>`;
    const TREE_H = ab ? 56 + 3 * AROW_H + 40 : 68 + Math.max(...list.map((p, i) => ROWS[i])) * ROW_H;
    const px = p => { const q = pos(p, list); return [q.x, TREE_H - 34 - q.row * (ab ? AROW_H : ROW_H)]; };
    let lines = '';
    for (const p of list) for (const r of p.reqs) {
      const q = OD.PERK_BY_ID[r]; if (!q || q.branch !== br) continue;
      const [x1, y1] = px(q), [x2, y2] = px(p), on = OD.perkLevel(r) > 0 && OD.perkLevel(p.id) > 0, open = OD.perkLevel(r) > 0;
      lines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${on ? 'on' : open ? 'open' : ''}"/>`;
    }
    if (ab) { const [x1, y1] = px(OD.PERK_BY_ID.retro), [x2, y2] = px(OD.PERK_BY_ID.afterburner), both = OD.ability('retro') && OD.ability('afterburner'); lines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="link ${both ? 'on' : ''}"/>`; }
    const eqId = OD.equippedMove();
    const nodes = list.map(p => {
      const lv = OD.perkLevel(p.id), c = check(p), [x, y] = px(p), st = lv >= p.max ? 'max' : c.st;
      const pips = ab ? '' : [0, 1, 2].map(i => `<i class="${i < lv ? 'f' : ''}"></i>`).join('');
      const costBadge = c.ok || st === 'open' ? `<em class="sp">${p.sp[lv]}</em>` : '';
      const eq = ab && lv > 0 && (p.id === 'retro' || p.id === 'afterburner') && p.id === eqId ? '<span class="eqtag">ON</span>' : '';
      return `<button class="snode ${st} ${p.id === selId ? 'sel' : ''} ${lv > 0 ? 'has' : ''}" data-perk="${p.id}" style="left:${x}%;top:${((y - NODE / 2) / TREE_H * 100).toFixed(2)}%;--bc:${B.color};--p:${(lv / p.max * 100).toFixed(1)}">
        <svg class="ring" viewBox="0 0 64 64"><circle class="trk" cx="32" cy="32" r="29"/><circle class="fill" cx="32" cy="32" r="29" pathLength="100"/></svg>
        <canvas width="96" height="96" data-picon="${p.icon}:${p.color || B.color}:${st === 'max' ? 'max' : st === 'can' ? 'can' : st === 'open' ? 'open' : st === 'has' ? 'open' : (lv > 0 ? 'open' : 'locked')}"></canvas>${costBadge}${eq}<span class="pips">${pips}</span>${ab ? `<span class="aname">${p.name}</span>` : ''}</button>`;
    }).join('');
    const need = nextCost(), pct = maxed() ? 100 : Math.min(100, Math.round(sv.stardust / need * 100)), can = !maxed() && sv.stardust >= need;
    let card;
    if (ab) card = `<div class="pathcard" style="--pc:${B.color}"><div class="pn"><b>Abilities</b><span>You always have two moves: tap to turn around, swipe to jump one orbit. Everything else you learn here, from the bottom up, and it works in every path.</span></div></div>`;
    else {
      const pr = OD.pathProgress(br);
      card = `<div class="pathcard ${pr.done ? 'done' : ''}" style="--pc:${B.color}"><span class="pframe"></span><div class="pn"><b>${info.name} <em>${info.who}</em></b><span>${info.play}</span></div>
        <ul class="innate ${pr.done ? 'on' : ''}">${info.innate.map(t => `<li>${t}</li>`).join('')}</ul>
        <div class="pathhint">${pr.done ? 'This bonus is active: you have completed the whole path.' : `<b>Complete the path to switch this bonus on:</b> learn every skill in it (${pr.learned} of ${pr.total}) and master its final skill, ${pr.finName} (${pr.finLv} of 3).`}</div></div>`;
    }
    return `<div class="head"><button class="iconbtn" data-act="go" data-v="home" aria-label="Back">${IC.back}</button><h2>Skills</h2><div class="pill sppill" id="sppill"><b>${free()}</b><span>skill point${free() === 1 ? '' : 's'}</span></div></div>
      <div class="list sk"><div class="buysp ${can ? 'ready' : ''}"><div class="bf" style="width:${pct}%"></div><div class="bt"><span class="sdi">${IC.star}${OD.fmt(sv.stardust)}</span>
        <button class="btn sm ${can ? 'gold' : 'off'}" data-act="spbuy">${maxed() ? 'All points bought' : `Buy a skill point <span class="sdi">${IC.star}${OD.fmt(need)}</span>`}</button></div></div>
      ${tabs}${ab ? '' : `<div class="pchips">${chips}</div>`}
      ${card}
      <div class="stree ${ab ? 'ab' : ''}" id="stree" style="${ab ? 'height:' + TREE_H + 'px' : ''}"><svg class="slines" viewBox="0 0 100 ${TREE_H}" preserveAspectRatio="none">${lines}</svg>${nodes}<div class="pinfo" id="pinfo">${infoHtml(selId)}</div></div>
      <div class="sfoot"><div class="holdtip"><b>Tap</b> a skill to read it · <b>hold</b> it to learn it</div>${OD.spSpent() ? `<button class="linkbtn" data-act="spreset">Reset skills <span class="sdi">${IC.star}${OD.fmt(OD.respecCost())}</span></button>` : ''}</div></div>`;
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
    const eff = p.d.map((t, i) => `<li class="${i < lv ? 'got' : i === lv ? 'next' : ''}"><b>${p.max > 1 ? i + 1 : '•'}</b><span>${t}</span><em>${p.sp[i]} SP</em></li>`).join('') + (p.how ? `<li class="how"><b>→</b><span>${p.how}</span></li>` : '');
    const hint = c.ok ? `<div class="hint go">Hold the icon to learn ${p.max > 1 ? 'level ' + (lv + 1) : 'it'} · ${c.cost} SP</div>` : `<div class="hint">${c.why}</div>`;
    const pair = (p.id === 'retro' || p.id === 'afterburner') && OD.ability('retro') && OD.ability('afterburner') && OD.ability(p.id);
    const eqb = pair ? (OD.equippedMove() === p.id ? '<div class="hint go">Equipped. The other one is switched off until you equip it.</div>' : `<button class="btn sm gold" data-act="equip" data-v="${p.id}">Equip</button>`) : '';
    return `<h3 style="color:${p.color || B.color}">${p.name}</h3><ul class="lv">${eff}</ul>${eqb}${hint}`;
  }

  // ---- interactions
  function setSel(id) {
    selId = id; infoOpen = true;
    scr.querySelectorAll('.snode').forEach(n => n.classList.toggle('sel', n.dataset.perk === id));
    const pi = scr.querySelector('#pinfo'); if (pi) pi.innerHTML = infoHtml(id);
    placeInfo();
  }
  // the description sits inside the tree, beside the skill that was tapped (on the side with more room), and never covers the skill itself
  function placeInfo() {
    const tree = scr.querySelector('#stree'), pi = scr.querySelector('#pinfo'), nd = tree && tree.querySelector('.snode.sel');
    if (!pi) return;
    if (!infoOpen || !nd) { pi.classList.remove('show'); return; }
    const tr = tree.getBoundingClientRect(), nr = nd.getBoundingClientRect();
    const cx = nr.left + nr.width / 2 - tr.left, cy = nr.top + nr.height / 2 - tr.top, pw = Math.min(tr.width * 0.64, 220);
    pi.style.width = pw + 'px'; pi.classList.add('show');
    const ph = pi.offsetHeight, right = cx < tr.width / 2;
    const left = Math.max(4, Math.min(tr.width - pw - 4, right ? cx + nr.width / 2 + 8 : cx - nr.width / 2 - 8 - pw));
    const top = Math.max(4, Math.min(tr.height - ph - 4, cy - ph / 2));
    pi.style.left = left + 'px'; pi.style.top = top + 'px';
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
    h.node.style.setProperty('--p', (OD.perkLevel(h.p.id) / h.p.max * 100 + e * 100 / h.p.max).toFixed(1));
    h.node.style.transform = `translate(calc(-50% + ${(Math.sin(t * 61) * amp).toFixed(2)}px), ${(Math.cos(t * 73) * amp * 0.7).toFixed(2)}px) rotate(${(Math.sin(t * 47) * amp * 0.35).toFixed(2)}deg) scale(${(1 + 0.04 * e).toFixed(3)})`;
    if (h.down && now - (h.tick || 0) > 85) { h.tick = now; OD.audio.sfx('dust', 2 + Math.floor(h.prog * 9)); OD.haptic.pulse(h.prog); }   // little pips that climb as the outline fills
    if (h.down && h.prog >= 1) { complete(h); return; }
    if (!h.down && h.prog <= 0) { h.node.classList.remove('holding'); h.node.style.transform = ''; h.node.style.setProperty('--p', (OD.perkLevel(h.p.id) / h.p.max * 100).toFixed(1)); hold = null; return; }
    holdRaf = requestAnimationFrame(holdTick);
  }
  function release() { if (hold && hold.down) { hold.down = false; } }
  function complete(h) {
    hold = null; const p = h.p, sv = OD.save, lv = OD.perkLevel(p.id);
    const c = check(p); if (!c.ok) return;
    const doneBefore = p.branch !== 'ability' && OD.pathDone(p.branch);
    sv.perks[p.id] = lv + 1; if (p.branch === 'ability' && (p.id === 'retro' || p.id === 'afterburner') && !OD.ability(p.id === 'retro' ? 'afterburner' : 'retro')) sv.equip = p.id; OD.persist();
    OD.audio.sfx('skill', lv + 1); OD.haptic(lv + 1 >= 3 ? 'heavy' : 'medium');
    const id = p.id, B = branchOf(p.branch);
    h.node.style.transform = ''; h.node.classList.remove('holding');
    refresh();
    const nd = scr.querySelector(`.snode[data-perk="${id}"]`);
    if (nd) { nd.classList.add('learned'); burst(nd, B.color, lv + 1 >= p.max); }
    if (p.branch === 'ability') U.toast(`<span><b>${p.name}</b> learned. ${p.how}.</span>`);
    else if (!doneBefore && OD.pathDone(p.branch)) celebratePath(p.branch);
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
      tree.addEventListener('pointerdown', e => { if (e.target.closest('.pinfo')) return; const n = e.target.closest('.snode'); if (n) { e.preventDefault(); startHold(n, e); } else if (infoOpen) { infoOpen = false; placeInfo(); } });
      placeInfo();
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) tree.addEventListener(ev, release, true);
      tree.addEventListener('contextmenu', e => e.preventDefault());
    }
  };
  window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release);

  Object.assign(acts, {
    pview(d) { viewBranch = d.v; selId = null; infoOpen = false; refresh(); },
    equip(d) { OD.save.equip = d.v; OD.persist(); OD.audio.sfx('unlock'); OD.haptic('light'); refresh(); setSel(d.v); U.toast(`<span><b>${OD.PERK_BY_ID[d.v].name}</b> equipped.</span>`); },
    sktab(d) { viewTab = d.v; selId = null; infoOpen = false; OD.audio.sfx('click'); refresh(); },
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
      sv.stardust -= cost; sv.perks = {}; sv.path = null; sv.equip = null; OD.persist(); U.closeModal(); OD.audio.sfx('unlock'); viewBranch = null; selId = null; infoOpen = false; refresh();
      U.toast('Skills reset. Choose your path again.');
    },
  });
})();
