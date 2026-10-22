# Orbit Dodger

A one-thumb arcade game for Android. You are a dot circling a planet: **tap** to flip direction, **hold** to slow time and **release on the golden glow** to jump orbits. Graze debris to build a combo, ignite NOVA, survive boss rings.

* One continuous run that drifts from planet to planet: 10 planet types (calm to deadly), each changing the rules, colours and dangers, drawn from a pool that grows with your best score; 5 modes plus stackable modifiers
* Planet hopping: other planets drift in with their own orbits, jump across and they become your home (each type changes the rules)
* Rare cosmic events (meteor showers, solar flares, gas giants, black holes, supernovas), spinners, wall rings, mines, comets, lasers
* Beat-synced gameplay on a generative score that never restarts: sectors change its key and mood, planets and events bend it, combos open its layers; one new element introduced per run with a popup and a Field Guide
* Swipe and hold-and-slide controls, 14 power-ups incl. Warp Jump, near-miss rewards and chains, clip sharing, 38 goals, 16 dots, 19 tails, a 20-perk tree with 3 levels each and one-run boosters
* Free demo of 5 runs + **one-time US$1.99 unlock** via Google Play Billing. No ads, offline, no data collected

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
npm run music            # optional: analyse your own tracks (tools/analyze-music.py); the built-in score is generated live
npm run aab              # signed release bundle (see docs/PUBLISHING.md)
```

## Ship it
See **[docs/PUBLISHING.md](docs/PUBLISHING.md)**. The in-app product id is `orbit_full_unlock`.
