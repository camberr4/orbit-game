# How the game fits together (Halo Run)

## A run
One continuous run. You circle a planet, hop between planets, and every few planets the whole sky changes into a new biome.
* **Planets** are random and only bring a rule (and a score bonus): see `PLANET_TYPES` in `www/js/game.js`.
* **Biomes** (six, `OD.WORLDS`) bring the sky (`www/js/biomes.js`), the song, the ambient sounds and a set of dangers. A biome change comes after
  `OD.biomeStay(n)` planet switches: 3, 4, 5, 6 ...
* The bottom of the screen shows two pills: the biome (with dots for the planets left in it) and the planet.

## Power-ups (what you pick up in a run)
Shown as a stack at the bottom left. Each row is an icon, a ring, a short name and a count.

| Kind | What it is | Stacking | Power-ups |
|---|---|---|---|
| **Timed** | a ring that drains, with the seconds left | another one adds time, up to double | Reaper, Amplifier, Brake, Double, Slow-Mo, Magnet, Phase, Prism, Fortune, **Surge**, **Wingman**, **Stasis** |
| **Charge** | kept until used, shown as a full ring and x N | shields up to 2 (3 on the Guard path), Guardian 4, lives 3, boost jumps 6, Aegis 2 | Shield, Guardian, Extra Life, Boost Jumps, **Aegis** |
| **Instant** | fires when you touch it, no row | n/a | Alchemy, Overload, Bomb, Jackpot, Pulse, **Vortex** |
| **Perk** | whole run, a dashed ring and the level | up to level 3 | the five run perks |

New ones: **Surge** (3.5 s dash, invulnerable, a stardust trail), **Wingman** (a second dot opposite you that gathers stardust and takes a hit),
**Stasis** (hazards freeze for 4.5 s, grazes pay double), **Vortex** (a 6 s gravity well that eats hazards and gathers stardust),
**Aegis** (blocks a deadly hit and blasts everything nearby).

## Skills (the only thing stardust buys)
* **Skill points** are bought with stardust. The n-th point costs `round(55 * 1.075^n / 5) * 5`: 55, 60, 65 ... about 920 for the 40th (max 40).
  A normal run earns roughly 60 to 120 stardust, so the first skill comes within a run or two, a capstone in about 35 runs, and a full path in
  about 120 runs.
* A **perk** has three levels. Levels cost 1 to 5 skill points by tier (`SPT` in `www/js/data.js`).
* There are three paths, all always open: **Bastion** (defence), **Meridian** (movement) and **Fortuna** (power-ups). Each has six perks, grows upward from the hub, and has a free bonus (`OD.PATH_INFO`) that switches on once every perk in it is fully learned. Abilities sit in the gaps between the paths: Shockwave (Bastion), Retro Thrust and Afterburner (Meridian), Lucky Draw (Fortuna).
* **Reset** refunds every point for `150 + 25 * points spent` stardust. You keep every point you bought.
* You learn a perk by **holding** its icon: the outline fills, the icon shakes gently, then a ring and a few sparks mark it (`www/js/skills.js`).
* Old saves: the first time the new version loads, everything spent in the old tree (and old boosters) is refunded as stardust (`OD.migrateSkills`).

## End of a run
A reel of badges (medals for how you flew, goals, new planets, a new best), one at a time with a chime that climbs a step each time, then a calm
summary. See `www/js/results.js`. Medals are defined in `OD.MEDALS`.

## Menu and play
The view zooms in on play and out on pause (`vz` in `game.js`), the menu drifts to the sides, the HUD slides in and away.

## Pacing numbers
* Planet switches come from the score of the run: `OD.planetScoreAt(n)` = 20,000 + 40,000 n + 10,000 n² (20k, 70k, 140k, 230k, 340k ...). `?pscale=0.05` shrinks them for testing.
* The multiplier: every gain is x0.6 (`MULT_UP`), it holds for 4 s (`MULT_HOLD`) and then drains at 0.32 per second (`MULT_DRAIN`). All in `game.js`.
* Every run starts on the Home world, which never returns; the Garden world can appear once per run.
* Power-ups: a kind you are already full of is much less likely, the last four kinds are skipped, and after four runs every kind can appear.

## For the final version
* A loading screen should paint every planet map (`OD.planets.warmNow([...])`) and fetch the music stems before the menu opens. For now only the Home world is painted before the first frame and the rest are painted in the background (a planet waits to spawn until its picture is ready).
* The game always opens in Aurora Reach, and every run starts there on the Home world.

## Bringing players in, back, and to the full game
* **The free taste** (`tasteOK`, `endTaste` in `game.js`): once a day a free player's first new planet of a run brings the next biome for 60 seconds
  (its sky, song and dangers), with a countdown in the biome pill. Then the sky sweeps back to Aurora and a card names the price. Not in the first two
  runs. The real gate at the edge of Aurora is unchanged.
* **The share card** (`www/js/share.js`): the share button on the results screen draws a 1080 x 1350 picture of the run (the biome's sky and planet,
  the score) and hands it to the system share sheet (Capacitor Share + Filesystem; in a browser, Web Share or a download).
* **The daily challenge** (`OD.daily`, `OD.DAILY_POOL` in `data.js`): one task a day from the date, the same for everybody, with bronze, silver and
  gold targets paying 20, 40 and 80 stardust once each. It is played in ordinary runs; the best single run of the day counts. Shown as a pill on the
  menu, a line on the run-goals card and a line on the results screen.
* **The reminder and the rating** (`www/js/engage.js`): an optional local notification at 18:30 on the next three days (off by default, offered once
  after the first daily medal, a switch in Settings), and Google's in-app review dialog after a new best (at least 8 runs, 2 days after the first
  start, at most 3 times, 60 days apart). Neither sends anything anywhere.
* **Cool-down mode** (`setHeat` in `game.js`, `watchHeat` in `MainActivity.java`): Android reports how warm the phone is; while it is warm the game
  caps the frame rate (60, then 45), draws fewer pixels and thins its particles, and returns to normal when the phone has cooled.
