'use strict';
(function boot() {
  const cv = document.getElementById('game');
  OD.debug = /[?&]debug/.test(location.search);
  if (OD.TEST_UNLOCK) {   // testing build: the full game is unlocked; add ?rich to also own every dot/tail/perk and have lots of stardust
    OD.save.full = true;
    if (/[?&]rich/.test(location.search)) {
      for (const k of ['core', 'trail']) OD.save.owned[k] = OD.COSMETICS[k].map(c => c.id);
      OD.save.sp.bought = 120;
      OD.save.stardust = Math.max(OD.save.stardust || 0, 99999);
    }
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
          if (!s.isActive) { if (OD.game.state === 'play') OD.ui.pause(); else OD.audio.suspend(); }
          else OD.audio.resume();
        });
      }
    } catch (e) { /* ignore */ }
  }
  OD.checkChallenges();
  // the loading screen: the planets, the first sky's two songs and the fonts get ready first (never more than a few seconds), so nothing has to load while you play
  const boot = document.getElementById('boot');
  if (boot && !OD.debug) {
    const bar = boot.querySelector('.bbar i'), t0 = performance.now(), n0 = Math.max(1, OD.planets.pending());
    let audioDone = false, fontsDone = false, warmStarted = false, warmDone = false;
    OD.audio.warm().then(() => { audioDone = true; }, () => { audioDone = true; });
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => { fontsDone = true; }, () => { fontsDone = true; });
    const tick = () => {
      const el = performance.now() - t0, planets = 1 - Math.min(1, OD.planets.pending() / n0);
      if (audioDone && fontsDone && planets >= 1 && !warmStarted) { warmStarted = true; OD.game.warmUp(() => { warmDone = true; }); }
      const p = (planets * 0.2 + (audioDone ? 0.35 : Math.min(0.3, el / 12000)) + (fontsDone ? 0.1 : 0.03) + (warmDone ? 0.35 : warmStarted ? 0.12 : 0));
      bar.style.width = Math.round(Math.min(1, p) * 100) + '%';
      if ((audioDone && fontsDone && planets >= 1 && warmDone && el > 900) || el > 12000) { bar.style.width = '100%'; boot.classList.add('gone'); setTimeout(() => boot.remove(), 600); return; }
      setTimeout(tick, 120);
    };
    if (OD.save.full && OD.WORLDS[1]) { try { OD.biomes.prepare(OD.WORLDS[1], innerWidth, innerHeight); } catch (e) { /* ok */ } }   // the second sky's pictures too, when the full game is unlocked: the first sky change then has nothing left to paint
    tick();
  } else if (boot) boot.remove();
  };
  OD.planets.loadBaked(['terra']).then(startUp, startUp);
})();
