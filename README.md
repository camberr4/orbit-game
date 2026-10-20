# Orbit Dodger

A one-thumb arcade game for Android. You are a dot circling a planet: **tap** to flip direction, **hold** to slow time and **release on the golden glow** to jump orbits. Graze debris to build a combo, ignite NOVA, survive boss rings.

* 4 worlds with their own procedural soundtracks, 5 modes (Endless, Daily, Time Attack, Hardcore, Zen)
* Beat-synced hazards: asteroids, comets, pulsing mines, rotating rings, sweeping beams, black holes
* Power-ups, combo system, ghost replay of your best run, clip sharing, 31 goals, 17 unlockable cosmetics
* Free demo (first minute of Aurora) + **one-time US$1.99 unlock** via Google Play Billing. No ads, offline, no data collected

## Tech
HTML5 canvas + Web Audio (all art and music are generated in code, no asset pipeline) wrapped as a native Android app with Capacitor.

```
www/                game (index.html, css, js/*)    js/game.js = engine, ui.js = menus, store.js = billing
android/            Capacitor Android project (portrait, immersive, Play Billing)
assets/ store/      icon + splash sources, Play Store graphics and screenshots
docs/               PUBLISHING.md, STORE_LISTING.md, privacy-policy.md
tools/              serve / smoke test / art + screenshot generators
```

## Develop
```bash
npm install
npm run serve            # http://localhost:8123  (add ?unlock=1 for the full game, ?debug for dev hooks)
npm test                 # headless end-to-end smoke test (needs: npx playwright install chromium)
npm run apk              # debug APK  -> android/app/build/outputs/apk/debug/
npm run aab              # signed release bundle (see docs/PUBLISHING.md)
```

## Ship it
See **[docs/PUBLISHING.md](docs/PUBLISHING.md)**. The in-app product id is `orbit_full_unlock`.
