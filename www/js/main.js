'use strict';
(function boot() {
  const cv = document.getElementById('game');
  OD.debug = /[?&]debug/.test(location.search);
  if (OD.TEST_UNLOCK) {   // testing build: the full game is unlocked; add ?rich to also own every dot/tail/perk and have lots of stardust
    OD.save.full = true;
    if (/[?&]rich/.test(location.search)) {
      for (const k of ['core', 'trail']) OD.save.owned[k] = OD.COSMETICS[k].map(c => c.id);
      for (const p of OD.PERKS) OD.save.perks[p.id] = 3;
      OD.save.stardust = Math.max(OD.save.stardust || 0, 99999);
    }
    OD.persist();
  }
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
          else if (OD.game.state !== 'paused' && OD.game.state !== 'pausing') OD.audio.resume();
        });
      }
    } catch (e) { /* ignore */ }
  }
  OD.checkChallenges();
})();
