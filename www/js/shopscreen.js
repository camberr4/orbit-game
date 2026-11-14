'use strict';
// The Shop: for now the signature styles (see signature.js) with live previews, bought with stardust. Tap a card to see it on the big stage,
// then buy it or put it on. "Classic" is the plain dot you start with.
(() => {
  const U = OD.ui.internals, { screens, after, acts, scr, IC } = U;
  let sel = null, raf = 0, sts = {}, tab = 'styles';
  const TEST_ALL_TAILS = true;   // TEMPORARY, for testing: every tail counts as owned. Set to false before release.
  const owned = id => TEST_ALL_TAILS || id === 'classic' || OD.save.owned.sig.includes(id), worn = id => (OD.save.equipped.sig || 'classic') === id;
  const all = () => [{ id: 'classic', name: 'Classic', tag: 'The plain glowing tail you started with', price: 0 }].concat(OD.sig.LIST);
  OD.styleAffordable = () => OD.sig && (OD.sig.LIST.some(s => !owned(s.id) && OD.save.stardust >= s.price) || OD.BOOSTERS.some(b => (OD.save.boosters[b.id] || 0) === 0 && OD.save.stardust >= b.price));
  OD.boostersReady = () => OD.BOOSTERS.filter(b => (OD.save.boosters[b.id] || 0) > 0 && !OD.save.boosterOff[b.id]);

  // buying, choosing or switching a tab redraws the contents in place: the screen itself is not restarted, so nothing flashes
  function refresh() {
    if (U.cur !== 'shop') { OD.ui.show('shop'); return; }
    const l = scr.querySelector('.list'), y = l ? l.scrollTop : 0;
    scr.innerHTML = screens.shop(); after.shop();
    const l2 = scr.querySelector('.list'); if (l2) l2.scrollTop = y;
  }
  function action(it) {
    const sv = OD.save;
    if (owned(it.id)) return worn(it.id) ? `<div class="sigon">${IC.check || ''}Wearing it now</div>` : `<button class="btn primary" data-act="sigequip" data-v="${it.id}">Wear it</button>`;
    const ok = sv.stardust >= it.price;
    return `<button class="btn ${ok ? 'gold' : 'off'}" data-act="sigbuy" data-v="${it.id}">Get it <span class="sdi">${IC.star}${OD.fmt(it.price)}</span></button>${ok ? '' : `<div class="signeed">${OD.fmt(it.price - sv.stardust)} more stardust</div>`}`;
  }
  const tabsHtml = () => `<div class="shoptabs"><button class="${tab === 'styles' ? 'on' : ''}" data-act="shoptab" data-v="styles">Custom tails</button><button class="${tab === 'boosters' ? 'on' : ''}" data-act="shoptab" data-v="boosters">Boosters${OD.boostersReady().length ? '<i></i>' : ''}</button></div>`;
  const head = sv => `<div class="head"><button class="iconbtn" data-act="go" data-v="home" aria-label="Back">${IC.back}</button><h2>Shop</h2><div class="pill">${IC.star}<span>${OD.fmt(sv.stardust)}</span></div></div>`;
  function boostersPage() {
    const sv = OD.save, ready = OD.boostersReady();
    return `${head(sv)}<div class="list sigl">${tabsHtml()}
      <div class="shopk">BOOSTERS</div>
      <div class="shopsub">Used up at the start of your next run. Switch one off to keep it for later.</div>
      <div class="bstlist">${OD.BOOSTERS.map(b => {
        const n = sv.boosters[b.id] || 0, off = !!sv.boosterOff[b.id], ok = sv.stardust >= b.price, full = n >= OD.BOOSTER_MAX;
        return `<div class="bst ${n ? 'has' : ''} ${n && off ? 'off' : ''}" style="--bc:${b.color}"><canvas class="bico" data-bico="${b.icon}:${b.color}" width="96" height="96"></canvas>
          <div class="bt"><b>${OD.t(b.name)}${n ? ` <em>×${n}</em>` : ''}</b><small>${OD.t(b.desc)}</small>${n ? `<label class="bsw"><button class="switch ${off ? '' : 'on'}" data-act="boosttoggle" data-v="${b.id}" aria-label="Use ${b.name} next run"></button><span>${off ? 'Kept for later' : 'Used next run'}</span></label>` : ''}</div>
          <button class="btn sm ${full ? 'off' : ok ? 'gold' : 'off'}" data-act="boostbuy" data-v="${b.id}">${full ? 'Full' : `${IC.star}${OD.fmt(b.price)}`}</button></div>`;
      }).join('')}</div>
      <div class="shopsub">${ready.length ? OD.t('Ready for your next run: {0}', `<b>${ready.map(b => OD.t(b.name)).join(', ')}</b>`) : 'Nothing is ready for your next run yet.'}</div>
    </div>`;
  }
  screens.shop = () => {
    const sv = OD.save; if (tab === 'boosters') return boostersPage();
    const L = all(); if (!sel || !L.some(x => x.id === sel)) sel = sv.equipped.sig || 'classic';
    const it = L.find(x => x.id === sel), lite = OD.sig.isLite();
    return `${head(sv)}
      <div class="list sigl">${tabsHtml()}
        <div class="shopk">CUSTOM TAILS</div>
        <canvas id="sighero" class="sighero"></canvas>
        <div class="signame"><b>${it.name}</b><small>${it.tag}</small></div>
        <div class="sigact">${action(it)}</div>
        ${lite && it.id !== 'classic' ? '<div class="siglite">Shown in its lighter form: your graphics setting is Medium or Low.</div>' : ''}
        <div class="siggrid">${L.map(x => `<button class="sigcard ${x.id === sel ? 'sel' : ''} ${owned(x.id) ? 'own' : ''}" data-act="sigsel" data-v="${x.id}"><canvas data-sigc="${x.id}"></canvas><b>${x.name}</b><em>${worn(x.id) ? 'Wearing' : owned(x.id) ? 'Owned' : IC.star + OD.fmt(x.price)}</em></button>`).join('')}</div>
      </div>`;
  };
  after.shop = () => {
    cancelAnimationFrame(raf);
    if (tab === 'boosters') { scr.querySelectorAll('canvas[data-bico]').forEach(cv => { const [ic, col] = cv.dataset.bico.split(':'), g = cv.getContext('2d'); g.clearRect(0, 0, 96, 96); g.save(); g.globalCompositeOperation = 'lighter'; try { OD.gfx.glow(g, 48, 48, 44, col, 0.55); } catch (e) { /* the glow is optional */ } g.restore(); try { OD.game.drawPowerIcon(g, ic, 48, 48, 28, col); } catch (e) { /* the icon is optional */ } }); return; }
    let heroOn = true;
    const hero = scr.querySelector('#sighero'), cards = [...scr.querySelectorAll('canvas[data-sigc]')], lite = OD.sig.isLite(); let last = 0;
    const paint = now => {
      const t = now / 1000;
      if (hero && heroOn) { const s = sts.hero || (sts.hero = OD.sig.newState()); OD.sig.preview(hero, sel, t, s, { lite, scale: 1.12, follow: 0.62 }); }   // as large as in a run: the view follows the dot
      const vh = window.innerHeight;
      if (hero) { const r = hero.getBoundingClientRect(); heroOn = r.bottom > 0 && r.top < vh; }
      for (const cv of cards) {   // only the cards on screen are drawn (and each of those once at least, so none is ever blank)
        const r = cv.getBoundingClientRect(); if ((r.bottom < -20 || r.top > vh + 20) && cv._drawn) continue; cv._drawn = true;
        const id = cv.dataset.sigc, s = sts[id] || (sts[id] = OD.sig.newState()); OD.sig.preview(cv, id, t + 0.7, s, { lite, scale: 0.66, follow: 0.86 });
      }
    };
    const loop = now => {
      if (U.cur !== 'shop' || !scr.contains(hero || document.body)) return;
      raf = requestAnimationFrame(loop);
      if (now - last < 33) return; last = now;
      paint(now);
    };
    paint(performance.now());   // the first picture is drawn at once, so a redraw never shows empty previews
    raf = requestAnimationFrame(loop);
  };
  Object.assign(acts, {
    sigsel(d) { if (sel === d.v) return; sel = d.v; sts.hero = null; OD.audio.sfx('click'); refresh(); },
    sigbuy(d) {
      const it = OD.sig.BY_ID[d.v], sv = OD.save; if (!it || owned(it.id)) return;
      if (sv.stardust < it.price) { U.toast('Not enough stardust yet. Keep flying!'); return; }
      sv.stardust -= it.price; sv.owned.sig.push(it.id); sv.equipped.sig = it.id; OD.persist(); OD.audio.sfx('unlock'); OD.haptic('medium');
      sts.hero = null; refresh(); U.toast('<span>' + OD.t('{0} is yours. You are wearing it now.', `<b>${OD.t(it.name)}</b>`) + '</span>');
    },
    shoptab(d) { if (tab === d.v) return; tab = d.v; OD.audio.sfx('click'); refresh(); },
    gobst() { tab = 'boosters'; OD.ui.show('shop'); },
    boostbuy(d) {
      const b = OD.BOOSTERS.find(x => x.id === d.v), sv = OD.save; if (!b) return;
      if ((sv.boosters[b.id] || 0) >= OD.BOOSTER_MAX) { U.toast('You are stocked up on that one.'); return; }
      if (sv.stardust < b.price) { U.toast('Not enough stardust yet. Keep flying!'); return; }
      sv.stardust -= b.price; sv.boosters[b.id] = (sv.boosters[b.id] || 0) + 1; sv.boosterOff[b.id] = false; OD.persist(); OD.audio.sfx('buy'); OD.haptic('light');
      refresh(); U.toast('<span>' + OD.t('{0} is ready for your next run.', `<b>${OD.t(b.name)}</b>`) + '</span>');
    },
    boosttoggle(d) { const sv = OD.save; sv.boosterOff[d.v] = !sv.boosterOff[d.v]; OD.persist(); OD.audio.sfx('click'); refresh(); },
    sigequip(d) { const sv = OD.save; if (!owned(d.v)) return; sv.equipped.sig = d.v === 'classic' ? '' : d.v; OD.persist(); OD.audio.sfx('click'); sts.hero = null; refresh(); },
  });
})();
