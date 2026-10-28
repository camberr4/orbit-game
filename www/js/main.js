'use strict';
(function boot() {
  const cv = document.getElementById('game');
  if (OD.save.testGrant) { OD.save.full = false; delete OD.save.testGrant; OD.persist(); }   // an unlock that only a test build had given is not a purchase
  // TEMPORARY (remove before publishing): add ?rich to the address to unlock the full game, own every dot, tail and skill point, and have lots of stardust
  if (/[?&]rich\b/.test(location.search)) {
    OD.save.full = true; OD.save.testGrant = true;
    for (const k of ['core', 'trail']) OD.save.owned[k] = OD.COSMETICS[k].map(c => c.id);
    OD.save.sp.bought = 120; OD.save.stardust = Math.max(OD.save.stardust || 0, 99999);
    OD.persist();
  }
  // the Home world is ready before the first frame (its picture loads in a moment); the others load in the background while you are in the menu
  const startUp = () => {
  if (!OD.planets.ready('terra')) OD.planets.warmNow(['terra']);   // (a development copy without the baked pictures paints it right now)
  OD.planets.warm(['garden', 'moon', 'ocean', 'lava', 'ice', 'crystal', 'toxic', 'gas', 'void']);
  OD.game.init(cv);
  OD.shop.init();
  OD.audio.loadTracks().then(() => { OD.audio.preloadFx(); return Promise.all([OD.audio.preload(String(OD.save.world)), OD.audio.preload('menu'), OD.audio.preload('zen')]); }).then(() => { if (OD.game.state === 'menu') OD.game.menu(); });
  OD.game.menu();
  OD.ui.show('home');

  // First touch unlocks Web Audio (required by mobile browsers / WebView)
  const unlock = () => { OD.audio.unlock(); };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);

  // Native integration (all optional: the game also runs in a plain browser)
  const P = window.Capacitor && window.Capacitor.Plugins;
  if (OD.isNative() && P) {
    try { if (P.StatusBar) { P.StatusBar.hide(); } } catch (e) { /* ignore */ }
    try { if (P.SplashScreen) setTimeout(() => P.SplashScreen.hide(), 250); } catch (e) { /* ignore */ }
    try {
      if (P.App) {
        P.App.addListener('backButton', () => { if (!OD.ui.back()) P.App.exitApp(); });
        P.App.addListener('appStateChange', s => {
          if (!s.isActive) { if (OD.game.warming) OD.audio.suspend(); else if (OD.game.state === 'play') OD.ui.pause(); else OD.audio.suspend(); }
          else OD.audio.resume();
        });
      }
    } catch (e) { /* ignore */ }
  }
  OD.checkChallenges();
  // the loading screen: the planets, the first sky's two songs and the fonts get ready first (never more than a few seconds), so nothing has to load while you play
  const boot = document.getElementById('boot');
  if (boot) {
    const bar = boot.querySelector('.bbar i'), msg = boot.querySelector('.bmsg'), pct = boot.querySelector('.bpct'), t0 = performance.now(), n0 = Math.max(1, OD.planets.pending());
    try { boot.querySelector('.blogo').innerHTML = OD.ui.logo(); } catch (e) { /* the bar still works without it */ }
    let audioDone = false, fontsDone = false, warmStarted = false, warmDone = false, shown = 0, last = t0;
    OD.audio.warm().then(() => { audioDone = true; }, () => { audioDone = true; });
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => { fontsDone = true; }, () => { fontsDone = true; });
    const tick = () => {
      const now = performance.now(), el = now - t0, planetsN = n0 - Math.min(n0, OD.planets.pending()), planets = planetsN / n0, wi = OD.audio.warmInfo;
      if (audioDone && fontsDone && planets >= 1 && !warmStarted) { warmStarted = true; OD.game.warmUp(() => { warmDone = true; }); }
      const aud = audioDone ? 1 : wi.total ? (wi.done + Math.min(0.9, el / 9000)) / (wi.total + 1) : Math.min(0.3, el / 12000), wp = warmDone ? 1 : warmStarted ? OD.game.warmPct : 0;
      const target = Math.min(1, planets * 0.2 + aud * 0.3 + (fontsDone ? 0.08 : 0.02) + wp * 0.42);
      const stage = planets < 1 ? 'Forging worlds  ' + planetsN + ' / ' + n0 : !audioDone ? 'Summoning the soundtrack  ' + Math.min(wi.done, wi.total) + ' / ' + (wi.total || 2) : !fontsDone ? 'Sharpening the edges' : !warmDone ? 'Priming the chaos  ' + Math.round(wp * 100) + '%' : 'Ready';
      const fin = (audioDone && fontsDone && planets >= 1 && warmDone && el > 1100) || el > 12000;
      shown += Math.max(0, target - shown) * Math.min(1, (now - last) / 140); last = now;   // the bar creeps toward where the loading really is, in small steps
      if (fin && shown > 0.985) shown = 1;
      const w = Math.min(1, shown); bar.style.width = (w * 100).toFixed(1) + '%'; pct.textContent = Math.round(w * 100) + '%'; msg.textContent = fin ? 'Ready. Do not blink' : stage;
      if (fin && shown >= 1) { document.body.classList.remove('loading'); boot.classList.add('gone'); setTimeout(() => boot.remove(), 700); setTimeout(() => OD.ui.welcome(), 450); return; }
      setTimeout(tick, 40);
    };
    if (OD.save.full && OD.WORLDS[1]) { try { OD.biomes.prepare(OD.WORLDS[1], innerWidth, innerHeight); } catch (e) { /* ok */ } }   // the second sky's pictures too, when the full game is unlocked: the first sky change then has nothing left to paint
    tick();
  } else { document.body.classList.remove('loading'); if (boot) boot.remove(); }
  };
  OD.planets.loadBaked(['terra']).then(startUp, startUp);
})();
