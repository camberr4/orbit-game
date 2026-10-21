'use strict';
// Entitlement + Google Play Billing (cordova-plugin-purchase v13).
// One non-consumable product unlocks the full game. The entitlement is cached
// locally so the game still starts offline; Play re-confirms it on every launch.
OD.PRODUCT_ID = 'orbit_full_unlock';
OD.isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

OD.shop = (() => {
  const listeners = [];
  let price = '$1.99';
  let ready = false, busy = false;
  const emit = () => listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } });

  function grant() {
    if (OD.save.full) return;
    OD.save.full = true;
    OD.persist();
    emit();
  }
  function plugin() { return window.CdvPurchase || null; }

  function refresh() {
    const P = plugin(); if (!P) return;
    const { store, Platform } = P;
    const prod = store.get(OD.PRODUCT_ID, Platform.GOOGLE_PLAY);
    if (prod) {
      const offer = prod.getOffer();
      const ph = offer && offer.pricingPhases && offer.pricingPhases[0];
      if (ph && ph.price) price = ph.price;
      if (store.owned(OD.PRODUCT_ID) || prod.owned) grant();
    }
    ready = true;
    emit();
  }

  function setup() {
    const P = plugin(); if (!P || setup.done) return;
    setup.done = true;
    const { store, ProductType, Platform } = P;
    store.register([{ id: OD.PRODUCT_ID, type: ProductType.NON_CONSUMABLE, platform: Platform.GOOGLE_PLAY }]);
    store.when()
      .productUpdated(refresh)
      .receiptUpdated(refresh)
      .approved(tr => { grant(); tr.finish(); })
      .finished(() => { refresh(); });
    store.error(err => {
      busy = false; emit();
      if (err && err.code !== P.ErrorCode.PAYMENT_CANCELLED) console.warn('Billing error', err);
    });
    store.initialize([Platform.GOOGLE_PLAY]).then(() => { refresh(); });
  }

  return {
    get price() { return price; },
    get busy() { return busy; },
    get owned() { return !!OD.save.full; },
    onChange(f) { listeners.push(f); },
    init() {
      if (OD.TEST_UNLOCK || new URLSearchParams(location.search).get('unlock') === '1') grant();
      if (!OD.isNative()) return;
      if (plugin()) setup();
      else {
        document.addEventListener('deviceready', setup, { once: true });
        let tries = 0;
        const iv = setInterval(() => { if (plugin() || ++tries > 40) { clearInterval(iv); setup(); } }, 250);
      }
    },
    async buy() {
      if (OD.save.full) return true;
      if (!OD.isNative()) {   // desktop/dev builds: simulate the purchase so the flow can be tested
        grant(); return true;
      }
      const P = plugin();
      if (!P || !ready) { OD.ui && OD.ui.toast('Store not ready yet. Check your connection and try again.'); return false; }
      const prod = P.store.get(OD.PRODUCT_ID, P.Platform.GOOGLE_PLAY);
      const offer = prod && prod.getOffer();
      if (!offer) { OD.ui && OD.ui.toast('This purchase is unavailable right now.'); return false; }
      busy = true; emit();
      try {
        const err = await P.store.order(offer);
        if (err && err.code !== P.ErrorCode.PAYMENT_CANCELLED) OD.ui && OD.ui.toast('Purchase failed. You have not been charged.');
      } finally { busy = false; emit(); }
      return OD.save.full;
    },
    async restore() {
      const P = plugin();
      if (!OD.isNative()) { OD.ui && OD.ui.toast(OD.save.full ? 'Full game already unlocked.' : 'Nothing to restore on this device.'); return; }
      if (!P) { OD.ui && OD.ui.toast('Store not ready yet.'); return; }
      try { await P.store.restorePurchases(); } catch (e) { /* surfaced through store.error */ }
      refresh();
      OD.ui && OD.ui.toast(OD.save.full ? 'Purchase restored. Welcome back!' : 'No previous purchase found for this account.');
    },
  };
})();
