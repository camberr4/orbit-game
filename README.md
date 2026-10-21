# Orbit Dodger

A one-thumb arcade game for Android. You are a dot circling a planet: **tap** to flip direction, **hold** to slow time and **release on the golden glow** to jump orbits. Graze debris to build a combo, ignite NOVA, survive boss rings.

* 6 sectors of space (peaceful to deadly) with their own rules, bonuses, dangers and music; 5 modes plus stackable modifiers
* Planet hopping: other planets drift in with their own orbits, jump across and they become your home (each type changes the rules)
* Rare cosmic events (meteor showers, solar flares, gas giants, black holes, supernovas), spinners, wall rings, mines, comets, lasers
* Beat-synced gameplay (procedural music or your own tracks), one new element introduced per run with a popup and a Field Guide
* Drag-to-orbit (default) or slingshot controls, 14 power-ups incl. Warp Jump, near-miss rewards and chains, ghost replay, clip sharing, 38 goals, 36 unlockable cosmetics
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
npm run music            # analyse tracks from assets/music into www/audio (prompts and workflow: docs/MUSIC_BRIEF.md)
npm run aab              # signed release bundle (see docs/PUBLISHING.md)
```

## Ship it
See **[docs/PUBLISHING.md](docs/PUBLISHING.md)**. The in-app product id is `orbit_full_unlock`.
