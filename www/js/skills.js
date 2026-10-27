'use strict';
// The Skills screen. You buy skill points with stardust (each one costs more than the last), spend them in any of three paths and spend
// the points on perks inside it. A perk is learned by HOLDING its icon: the outline fills, the icon shakes gently, and when it
// completes a soft ring and a few sparks mark the moment. Resetting refunds every point for a stardust fee.
(() => {
  const U = OD.ui.internals, { screens, after, acts, scr, IC } = U;
  const HOLD_MS = 900;
  let viewBranch = null, selId = null, infoOpen = false, holdRaf = 0, hold = null, tap = null;

  const branchOf = id => OD.PERK_BRANCHES.find(b => b.id === id) || { id: 'ability', name: 'Abilities', color: '#9d8cff' };
  const free = () => OD.spFree();
  const maxed = () => false;   // there is no cap on skill points: they just cost more and more
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
  // One tree for everything, a flat picture: a hub in the middle and the three paths as arms pointing out like a Y. Each arm is the same
  // shape (a root, two branches that each continue once, and a capstone); the path's one ability hangs beside the end of its right-hand branch.
  const DW = 354, NODE = 40;
  // The paths grow upwards from the hub at the bottom, side by side: a root, two branches that each continue once, and a capstone on top.
  // The big abilities sit in the gaps between the paths, a little above the skill that opens them.
  const COLX = { guard: 60, control: 177, fortune: 294 };
  const SLOT = [[0, 0], [-26, 80], [26, 80], [-26, 160], [26, 160], [0, 240]];   // [sideways, height] for the perks, in the order of the list
  const ABPOS = { shock: [118.5, 120], retro: [118.5, 200], draw: [235.5, 120], afterburner: [235.5, 200] };
  const HUBUP = -62;   // the hub sits this far below the roots
  let HUB = [177, 300], DH = 360;
  // every node's place, fitted to the screen: spread sideways to use the whole width, with the height following from the paths
  function layoutTree(all) {
    const d = {};
    all.forEach((list, bi) => list.forEach((p, i) => { d[p.id] = [COLX[OD.PERK_BRANCHES[bi].id] + SLOT[i][0], SLOT[i][1]]; }));
    for (const a of OD.ABILITIES) d[a.id] = ABPOS[a.id] || [177, 120];
    d.__hub = [177, HUBUP];
    let top = -1e9, bot = 1e9, mx = 1; for (const id in d) { top = Math.max(top, d[id][1]); bot = Math.min(bot, d[id][1]); mx = Math.max(mx, Math.abs(d[id][0] - 177)); }
    const m = NODE / 2 + 8, sx = (DW / 2 - m) / mx; DH = Math.round(top - bot + 2 * m);
    const out = {}; for (const id in d) out[id] = [DW / 2 + (d[id][0] - 177) * sx, m + (top - d[id][1])];
    HUB = out.__hub; delete out.__hub;
    return out;
  }
  // the activation of a finished path: a ring of light opens, the card flashes and the frame starts to travel round it
  function celebratePath(id) {
    const B = branchOf(id), card = scr.querySelector('.pathcard'), chip = scr.querySelector(`.pchip[data-v="${id}"]`);
    for (const el of [card, chip]) if (el) { el.classList.add('activate'); setTimeout(() => el.classList.remove('activate'), 2400); }
    if (card) { const r = card.getBoundingClientRect(); burst({ getBoundingClientRect: () => r }, B.color, true); setTimeout(() => burst({ getBoundingClientRect: () => r }, '#ffffff', true), 260); }
    OD.audio.sfx('victory'); OD.haptic('heavy');
    U.toast(`<span><b>${B.name}</b> is complete. ${OD.PATH_INFO[id].innate[0]}.</span>`);
  }

  const pathCard = br => {
    const B = branchOf(br), info = OD.PATH_INFO[br], pr = OD.pathProgress(br);
    return `<div class="pathcard ${pr.done ? 'done' : ''}" style="--pc:${B.color}"><span class="pframe"></span><div class="pn"><b>${info.name} <em>${info.who}</em><i class="pprog">${pr.done ? 'Complete' : pr.learned + ' / ' + pr.total}</i></b></div>
        <ul class="innate ${pr.done ? 'on' : ''}">${info.innate.map(t => `<li>${t}</li>`).join('')}</ul>
        <div class="pathhint">${pr.done ? 'This bonus is active: the whole path is complete.' : `<b>Finish the whole path</b> (every skill, all levels) to switch these on${pr.left.length === 1 ? `. Last one: ${pr.left[0]}` : ''}.`}</div></div>`;
  };
  const pathOf = p => p.branch === 'ability' ? p.path : p.branch;
  screens.perks = function () {
    const sv = OD.save, br = viewBranch || 'guard'; viewBranch = br;
    const all = OD.PERK_BRANCHES.map(b => OD.PERKS.filter(p => p.branch === b.id).sort((a, b) => a.tier - b.tier));
    const listOf = p => all[OD.PERK_BRANCHES.findIndex(b => b.id === p.branch)];
    const every = all.flat().concat(OD.ABILITIES);
    if (!selId || !OD.PERK_BY_ID[selId]) selId = (every.find(p => check(p).ok) || every[0]).id;
    const chips = OD.PERK_BRANCHES.map(x => {
      const pr = OD.pathProgress(x.id);
      return `<button class="pchip ${br === x.id ? 'on' : ''} ${pr.done ? 'done' : ''}" data-act="pview" data-v="${x.id}" style="--pc:${x.color}"><span class="pframe"></span><canvas width="96" height="96" data-picon="path_${x.id}:${x.color}:${pr.done ? 'max' : pr.learned ? 'can' : 'open'}"></canvas><b>${x.name}</b><small>${pr.done ? 'Complete' : pr.learned + ' / ' + pr.total}</small></button>`;
    }).join('');
    const LAY = layoutTree(all), P = p => LAY[p.id];
    let lines = '';
    const seg = (a, b, col, st) => { lines += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="${st}" style="--lc:${col}"/>`; };
    for (const b of OD.PERK_BRANCHES) { const root = all[OD.PERK_BRANCHES.indexOf(b)][0]; seg(HUB, P(root), b.color, OD.perkLevel(root.id) > 0 ? 'on' : 'open'); }   // from the hub to each arm
    for (const p of every) for (const r of p.reqs) {
      const q = OD.PERK_BY_ID[r]; if (!q) continue;
      const col = branchOf(pathOf(p)).color || '#9d8cff', st = OD.perkLevel(r) > 0 && OD.perkLevel(p.id) > 0 ? 'on' : OD.perkLevel(r) > 0 ? 'open' : '';
      seg(P(q), P(p), col, st);
    }
    const eqId = OD.equippedMove();
    const nodes = every.map(p => {
      const lv = OD.perkLevel(p.id), c = check(p), [x, y] = P(p), st = lv >= p.max ? 'max' : c.st, B = branchOf(pathOf(p)), isA = p.branch === 'ability';
      const pips = isA ? '' : Array.from({ length: p.max }, (_, i) => i).map(i => `<i class="${i < lv ? 'f' : ''}"></i>`).join('');
      const costBadge = c.ok || st === 'open' ? `<em class="sp">${p.sp[lv]}</em>` : '';
      const eq = isA && lv > 0 && (p.id === 'retro' || p.id === 'afterburner') && p.id === eqId ? '<span class="eqtag">ON</span>' : '';
      const col = p.color || B.color;
      return `<button class="snode ${isA ? 'abil' : ''} ${st} ${p.id === selId ? 'sel' : ''} ${lv > 0 ? 'has' : ''}" data-perk="${p.id}" style="left:${(x / DW * 100).toFixed(3)}%;top:${(y / DH * 100).toFixed(3)}%;--bc:${col};--p:${(lv / p.max * 100).toFixed(1)}">
        <svg class="ring" viewBox="0 0 64 64"><circle class="trk" cx="32" cy="32" r="29"/><circle class="fill" cx="32" cy="32" r="29" pathLength="100"/></svg>
        <canvas width="96" height="96" data-picon="${p.icon}:${col}:${st === 'max' ? 'max' : st === 'can' ? 'can' : st === 'open' ? 'open' : st === 'has' ? 'open' : (lv > 0 ? 'open' : 'locked')}"></canvas>${costBadge}${eq}<span class="pips">${pips}</span></button>`;
    }).join('');
    const need = nextCost(), pct = Math.min(100, Math.round(sv.stardust / need * 100)), can = sv.stardust >= need;
    return `<div class="head"><button class="iconbtn" data-act="go" data-v="home" aria-label="Back">${IC.back}</button><h2>Skills</h2><div class="pill sppill" id="sppill"><b>${free()}</b><span>skill point${free() === 1 ? '' : 's'}</span></div></div>
      <div class="list sk"><div class="buysp ${can ? 'ready' : ''}"><div class="bf" style="width:${pct}%"></div><div class="bt"><span class="sdi">${IC.star}${OD.fmt(sv.stardust)}</span>
        <button class="btn sm ${can ? 'gold' : 'off'}" data-act="spbuy">Buy a skill point <span class="sdi">${IC.star}${OD.fmt(need)}</span></button></div></div>
      ${pathCard(br)}
      <div class="stree uni" id="stree" style="aspect-ratio: ${DW} / ${DH}; --ar: ${(DW / DH).toFixed(4)}"><div class="szoom" id="szoom"><svg class="slines" viewBox="0 0 ${DW} ${DH}" preserveAspectRatio="none">${lines}</svg><div class="shub" style="left:${(HUB[0] / DW * 100).toFixed(3)}%;top:${(HUB[1] / DH * 100).toFixed(3)}%"><canvas width="168" height="168"></canvas></div>${nodes}</div><div class="szbtns"><button data-act="zin" aria-label="Zoom in">+</button><button data-act="zout" aria-label="Zoom out">&minus;</button></div><div class="pinfo" id="pinfo">${infoHtml(selId)}</div></div>
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
  function setSel(id, show = true) {
    selId = id; infoOpen = show;
    { const q = OD.PERK_BY_ID[id], pb = q && pathOf(q); if (pb && pb !== viewBranch) { viewBranch = pb; const old = scr.querySelector('.pathcard'); if (old) { old.outerHTML = pathCard(pb); } } }
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
    const cx = nr.left + nr.width / 2 - tr.left, cy = nr.top + nr.height / 2 - tr.top, pw = Math.min(tr.width * 0.7, 240);
    pi.style.width = pw + 'px'; pi.classList.add('show');
    const ph = pi.offsetHeight, gap = 10, nw = nr.width / 2 + gap, nh = nr.height / 2 + gap + 8;
    const fitsX = x => x >= 4 && x + pw <= tr.width - 4, fitsY = y => y >= 4 && y + ph <= tr.height - 4;
    const clampX = x => Math.max(4, Math.min(tr.width - pw - 4, x)), clampY = y => Math.max(4, Math.min(tr.height - ph - 4, y));
    // beside the skill if there is room on that side, otherwise below or above it: never over the skill itself
    let left, top; const right = cx + nw, leftS = cx - nw - pw;
    if (cx < tr.width / 2 && fitsX(right)) { left = right; top = clampY(cy - ph / 2); }
    else if (fitsX(leftS)) { left = leftS; top = clampY(cy - ph / 2); }
    else if (fitsX(right)) { left = right; top = clampY(cy - ph / 2); }
    else if (fitsY(cy + nh)) { left = clampX(cx - pw / 2); top = cy + nh; }
    else { left = clampX(cx - pw / 2); top = clampY(cy - nh - ph); }
    pi.style.left = left + 'px'; pi.style.top = top + 'px';
  }
  function startHold(node, ev) {
    const p = OD.PERK_BY_ID[node.dataset.perk];
    setSel(p.id, false);   // the description waits: it shows on a quick tap, and never while you hold to learn
    const c = check(p); if (!c.ok) { if (c.st === 'other' || c.st === 'open') OD.audio.sfx('back'); tap = { p, t0: performance.now(), cancelled: false }; return; }   // (cannot be learned now: a quick tap still shows what it does)
    OD.audio.unlock(); OD.audio.sfx('charge'); OD.haptic('light');
    hold = { node, p, t0: performance.now(), prog: 0, id: ev.pointerId, down: true };
    node.classList.add('holding'); if (infoOpen) { infoOpen = false; placeInfo(); }
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
  function release() {
    if (tap) { if (!tap.cancelled && performance.now() - tap.t0 < 320) setSel(tap.p.id, true); tap = null; }
    if (hold && hold.down) {
      if (!hold.cancelled && performance.now() - hold.t0 < 280 && hold.prog < 0.35) setSel(hold.p.id, true);   // a quick tap: show what this skill does
      hold.down = false;
    }
  }
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
    if (p.branch === 'ability') U.toast(lv + 1 > 1 ? `<span><b>${p.name}</b> level ${lv + 1}: slide your finger while it is on to hop between orbits.</span>` : `<span><b>${p.name}</b> learned. ${p.how}.</span>`);
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

  // zoom and pan: pinch with two fingers (or use the wheel or the + and - buttons), drag with one finger when zoomed in
  const ZMIN = 0.85, ZMAX = 2.4, zm = { z: 1, x: 0, y: 0 }, ptrs = new Map();
  let gest = null;
  function clampZoom(tree) {
    const w = tree.clientWidth, h = tree.clientHeight; zm.z = Math.max(ZMIN, Math.min(ZMAX, zm.z));
    if (zm.z <= 1) { zm.x = w * (1 - zm.z) / 2; zm.y = h * (1 - zm.z) / 2; }   // smaller than the screen: stays centred
    else { zm.x = Math.max(w * (1 - zm.z), Math.min(0, zm.x)); zm.y = Math.max(h * (1 - zm.z), Math.min(0, zm.y)); }
  }
  function applyZoom() { const tree = scr.querySelector('#stree'), z = scr.querySelector('#szoom'); if (!tree || !z) return; clampZoom(tree); tree.style.touchAction = zm.z > 1.02 ? 'none' : 'pan-y'; z.style.transform = `translate(${zm.x.toFixed(1)}px, ${zm.y.toFixed(1)}px) scale(${zm.z.toFixed(3)})`; placeInfo(); }
  function zoomAt(factor, px, py) {   // px, py: the point (in the tree's own pixels) that stays still
    const z0 = zm.z, z1 = Math.max(ZMIN, Math.min(ZMAX, z0 * factor)), k = z1 / z0;
    zm.x = px - (px - zm.x) * k; zm.y = py - (py - zm.y) * k; zm.z = z1; applyZoom();
  }
  // everything in the tree scales with the width it is given: nodes, rings, badges and the hub grow on tablets and shrink a little on small phones
  function fitTree() {
    const tree = scr.querySelector('#stree'); if (!tree) return;
    tree.style.setProperty('--ts', Math.max(0.82, Math.min(1.6, tree.clientWidth / DW)).toFixed(3));
    applyZoom();
  }
  window.addEventListener('resize', () => { if (U.cur === 'perks') fitTree(); });
  after.perks = function () {
    scr.querySelectorAll('canvas[data-picon]').forEach(U.drawPerkIcon);
    { const hc = scr.querySelector('.shub canvas'); if (hc) {   // our own dot, with the tail and style you have equipped, sits in the middle of the tree
      const g = hc.getContext('2d'), acc = (OD.WORLDS[0] && OD.WORLDS[0].accent) || '#9fe6ff'; g.clearRect(0, 0, 168, 168);
      g.save(); g.globalCompositeOperation = 'lighter'; OD.gfx.glow(g, 84, 84, 80, acc, 0.85); OD.gfx.glow(g, 84, 84, 42, '#ffffff', 0.35); g.restore();
      try { OD.gfx.drawCore(g, 84, 84, 3.8, OD.save.equipped.core, 0, acc); } catch (e) { g.fillStyle = '#fff'; g.beginPath(); g.arc(84, 84, 14, 0, Math.PI * 2); g.fill(); }
    } }
    const tree = scr.querySelector('#stree');
    if (tree) {
      fitTree();
      const local = e => { const r = tree.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      tree.addEventListener('pointerdown', e => {
        if (e.target.closest('.pinfo') || e.target.closest('.szbtns')) return;
        ptrs.set(e.pointerId, local(e));
        if (ptrs.size === 2) {   // a pinch: whatever was being held is let go
          if (hold) hold.cancelled = true; if (tap) tap.cancelled = true; release(); const [a, b] = [...ptrs.values()], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          gest = { pinch: true, d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, z0: zm.z, px: (mid[0] - zm.x) / zm.z, py: (mid[1] - zm.y) / zm.z };
          return;
        }
        if (ptrs.size > 2) return;
        const [lx, ly] = local(e); gest = { pinch: false, sx: lx, sy: ly, x0: zm.x, y0: zm.y, moved: false, id: e.pointerId };
        const n = e.target.closest('.snode'); if (n) { e.preventDefault(); startHold(n, e); } else if (infoOpen) { infoOpen = false; placeInfo(); }
      });
      tree.addEventListener('pointermove', e => {
        if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, local(e));
        if (!gest) return;
        if (gest.pinch && ptrs.size >= 2) {
          const [a, b] = [...ptrs.values()], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
          zm.z = Math.max(ZMIN, Math.min(ZMAX, gest.z0 * d / gest.d0)); zm.x = mid[0] - gest.px * zm.z; zm.y = mid[1] - gest.py * zm.z; applyZoom();
        } else if (!gest.pinch && e.pointerId === gest.id && zm.z > 1) {   // one finger, zoomed in: drag the picture (a hold in progress is let go)
          const [lx, ly] = local(e), dx = lx - gest.sx, dy = ly - gest.sy;
          if (!gest.moved && Math.hypot(dx, dy) > 9) { gest.moved = true; if (hold) hold.cancelled = true; if (tap) tap.cancelled = true; release(); }
          if (gest.moved) { zm.x = gest.x0 + dx; zm.y = gest.y0 + dy; applyZoom(); }
        }
      });
      const endPtr = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2 && gest && gest.pinch) gest = null; if (!ptrs.size) gest = null; };
      for (const ev of ['pointerup', 'pointercancel']) tree.addEventListener(ev, endPtr, true);
      tree.addEventListener('wheel', e => { e.preventDefault(); const [lx, ly] = local(e); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, lx, ly); }, { passive: false });
      placeInfo();
      if (!document._skDismiss) {   // a tap anywhere else on the screen puts the description away too, so the whole tree is in view again
        document._skDismiss = true;
        document.addEventListener('pointerdown', e => { if (U.cur !== 'perks' || !infoOpen) return; if (e.target.closest('.snode') || e.target.closest('.pinfo') || e.target.closest('.szbtns')) return; infoOpen = false; placeInfo(); }, true);
      }
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) tree.addEventListener(ev, release, true);
      tree.addEventListener('contextmenu', e => e.preventDefault());
    }
  };
  window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release);

  Object.assign(acts, {
    zin() { const t = scr.querySelector('#stree'); if (t) zoomAt(1.3, t.clientWidth / 2, t.clientHeight / 2); },
    zout() { const t = scr.querySelector('#stree'); if (t) zoomAt(1 / 1.3, t.clientWidth / 2, t.clientHeight / 2); },
    pview(d) { viewBranch = d.v; selId = null; infoOpen = false; refresh(); },
    equip(d) { OD.save.equip = d.v; OD.persist(); OD.audio.sfx('unlock'); OD.haptic('light'); refresh(); setSel(d.v); U.toast(`<span><b>${OD.PERK_BY_ID[d.v].name}</b> equipped.</span>`); },
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
