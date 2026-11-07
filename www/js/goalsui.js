// The run goals on screen: a small glass card at the start of a run listing the three goals, then three compact chips on the right
// (a progress ring and a count; a chip opens to show its goal for a moment whenever it moves). Fed by game.js (see OD.GOALS in data.js).
OD.ui.goals = (() => {
  const COL = ['#7be8ff', '#c79bff', '#ff9bdc'], DONE = '#9dffb0';
  let root = null, card = null, chips = [], tCard = 0, tPulse = [0, 0, 0];
  const esc = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const ring = (c, p) => `<svg class="gring" viewBox="0 0 24 24"><circle class="gt" cx="12" cy="12" r="9"/><circle class="gf" cx="12" cy="12" r="9" pathLength="100" style="stroke:${c};stroke-dasharray:${Math.round(p * 100)} 100"/><path class="gck" d="M7.5 12.5l3 3 6-6.5"/></svg>`;
  const fmt = n => OD.fmt ? OD.fmt(n) : String(n);
  function build(list, resumed) {
    clear();
    root = document.createElement('div'); root.id = 'goals';
    root.innerHTML = `<div class="gcard"><div class="gk">RUN GOALS</div>${list.map((g, i) => `<div class="gr ${g.done ? 'done' : ''}" style="--gc:${g.done ? DONE : COL[g.t]};--gi:${i}"><span class="gdot"></span><span class="gtx">${esc(g.text)}</span><b class="gpay">+${g.pay}</b></div>`).join('')}<div class="gsub">Finish them for extra stardust</div></div>
      <div class="gchips">${list.map((g, i) => `<div class="gchip ${g.done ? 'done' : ''}" style="--gc:${g.done ? DONE : COL[g.t]}">${ring(g.done ? DONE : COL[g.t], g.cur / g.n)}<span class="gtx">${esc(g.text)}</span><b class="gn">${fmt(g.cur)}/${fmt(g.n)}</b></div>`).join('')}</div>`;
    document.body.appendChild(root);
    card = root.querySelector('.gcard'); chips = Array.from(root.querySelectorAll('.gchip'));
    root._list = list;
    requestAnimationFrame(() => requestAnimationFrame(() => { if (card) card.classList.add('in'); }));
    clearTimeout(tCard); tCard = setTimeout(() => { if (card) { card.classList.remove('in'); card.classList.add('out'); } }, resumed ? 2600 : 4600);
  }
  function clear() { clearTimeout(tCard); tPulse.forEach(clearTimeout); if (root) root.remove(); root = card = null; chips = []; }
  return {
    start: build, clear,
    end() { if (root) { root.classList.add('gone'); const r = root; setTimeout(() => { if (r === root) clear(); }, 600); } },
    update(i, cur, n, done) {
      const c = chips[i]; if (!c) return;
      const g = root._list[i], col = done ? DONE : COL[g.t];
      c.style.setProperty('--gc', col); c.classList.toggle('done', !!done);
      const f = c.querySelector('.gf'); if (f) { f.style.stroke = col; f.style.strokeDasharray = Math.round(Math.min(1, cur / n) * 100) + ' 100'; }
      c.querySelector('.gn').textContent = fmt(cur) + '/' + fmt(n);
      const r = card && card.querySelectorAll('.gr')[i]; if (r && done) { r.classList.add('done'); r.style.setProperty('--gc', DONE); }
      // open the chip for a moment so the goal can be read, longer when it was just finished
      c.classList.add('open'); if (done) c.classList.add('pop');
      clearTimeout(tPulse[i]); tPulse[i] = setTimeout(() => { c.classList.remove('open', 'pop'); }, done ? 2800 : 1500);
    },
  };
})();
