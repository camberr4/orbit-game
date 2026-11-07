'use strict';
// The Shop: for now the signature styles (see signature.js) with live previews, bought with stardust. Tap a card to see it on the big stage,
// then buy it or put it on. "Classic" is the plain dot you start with.
(() => {
  const U = OD.ui.internals, { screens, after, acts, scr, IC } = U;
  let sel = null, raf = 0, sts = {};
  const owned = id => id === 'classic' || OD.save.owned.sig.includes(id), worn = id => (OD.save.equipped.sig || 'classic') === id;
  const all = () => [{ id: 'classic', name: 'Classic', tag: 'The plain glowing dot you started with', price: 0 }].concat(OD.sig.LIST);
  OD.styleAffordable = () => OD.sig && OD.sig.LIST.some(s => !owned(s.id) && OD.save.stardust >= s.price);

  function action(it) {
    const sv = OD.save;
    if (owned(it.id)) return worn(it.id) ? `<div class="sigon">${IC.check || ''}Wearing it now</div>` : `<button class="btn primary" data-act="sigequip" data-v="${it.id}">Wear it</button>`;
    const ok = sv.stardust >= it.price;
    return `<button class="btn ${ok ? 'gold' : 'off'}" data-act="sigbuy" data-v="${it.id}">Get it <span class="sdi">${IC.star}${OD.fmt(it.price)}</span></button>${ok ? '' : `<div class="signeed">${OD.fmt(it.price - sv.stardust)} more stardust</div>`}`;
  }
  screens.shop = () => {
    const sv = OD.save, L = all(); if (!sel || !L.some(x => x.id === sel)) sel = sv.equipped.sig || 'classic';
    const it = L.find(x => x.id === sel), lite = OD.sig.isLite();
    sts = {};
    return `<div class="head"><button class="iconbtn" data-act="go" data-v="home" aria-label="Back">${IC.back}</button><h2>Shop</h2><div class="pill">${IC.star}<span>${OD.fmt(sv.stardust)}</span></div></div>
      <div class="list sigl">
        <div class="shopk">DOT STYLES</div>
        <canvas id="sighero" class="sighero"></canvas>
        <div class="signame"><b>${it.name}</b><small>${it.tag}</small></div>
        <div class="sigact">${action(it)}</div>
        ${lite && it.id !== 'classic' ? '<div class="siglite">Shown in its lighter form: your graphics setting is Medium or Low.</div>' : ''}
        <div class="siggrid">${L.map(x => `<button class="sigcard ${x.id === sel ? 'sel' : ''} ${owned(x.id) ? 'own' : ''}" data-act="sigsel" data-v="${x.id}"><canvas data-sigc="${x.id}"></canvas><b>${x.name}</b><em>${worn(x.id) ? 'Wearing' : owned(x.id) ? 'Owned' : IC.star + OD.fmt(x.price)}</em></button>`).join('')}</div>
      </div>`;
  };
  after.shop = () => {
    cancelAnimationFrame(raf);
    const hero = scr.querySelector('#sighero'), cards = [...scr.querySelectorAll('canvas[data-sigc]')], lite = OD.sig.isLite(); let last = 0;
    const loop = now => {
      if (U.cur !== 'shop' || !scr.contains(hero || document.body)) return;
      raf = requestAnimationFrame(loop);
      if (now - last < 33) return; last = now;
      const t = now / 1000;
      if (hero) { const s = sts.hero || (sts.hero = OD.sig.newState()); OD.sig.preview(hero, sel, t, s, { lite, scale: Math.min(1.5, (hero.clientHeight || 220) / 290) }); }
      for (const cv of cards) { const id = cv.dataset.sigc, s = sts[id] || (sts[id] = OD.sig.newState()); OD.sig.preview(cv, id, t + 0.7, s, { lite: true, scale: 0.34 }); }
    };
    raf = requestAnimationFrame(loop);
  };
  Object.assign(acts, {
    sigsel(d) { sel = d.v; OD.audio.sfx('click'); OD.ui.show('shop'); },
    sigbuy(d) {
      const it = OD.sig.BY_ID[d.v], sv = OD.save; if (!it || owned(it.id)) return;
      if (sv.stardust < it.price) { U.toast('Not enough stardust yet. Keep flying!'); return; }
      sv.stardust -= it.price; sv.owned.sig.push(it.id); sv.equipped.sig = it.id; OD.persist(); OD.audio.sfx('unlock'); OD.haptic('medium');
      OD.ui.show('shop'); U.toast(`<span><b>${it.name}</b> is yours. You are wearing it now.</span>`);
    },
    sigequip(d) { const sv = OD.save; if (!owned(d.v)) return; sv.equipped.sig = d.v === 'classic' ? '' : d.v; OD.persist(); OD.audio.sfx('click'); OD.ui.show('shop'); },
  });
})();
