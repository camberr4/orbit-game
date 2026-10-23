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
* There are four paths (Guard, Score, Control, Fortune) and all of them are always open. The path you have put the most skill points into is your **main path** and only it gives its free bonus (see `OD.PATH_INFO`, `OD.mainPath`); a tie goes to the one you started first.
* **Reset** refunds every point for `150 + 25 * points spent` stardust. You keep every point you bought.
* You learn a perk by **holding** its icon: the outline fills, the icon shakes gently, then a ring and a few sparks mark it (`www/js/skills.js`).
* Old saves: the first time the new version loads, everything spent in the old tree (and old boosters) is refunded as stardust (`OD.migrateSkills`).

## End of a run
A reel of badges (medals for how you flew, goals, new planets, a new best), one at a time with a chime that climbs a step each time, then a calm
summary. See `www/js/results.js`. Medals are defined in `OD.MEDALS`.

## Menu and play
The view zooms in on play and out on pause (`vz` in `game.js`), the menu drifts to the sides, the HUD slides in and away.

## Pacing numbers
* Planet switches come from the score of the run: `OD.planetScoreAt(n)` = 20,000 + 30,000 n + 7,500 n² (20k, 57.5k, 110k, 177.5k, 260k ...). `?pscale=0.05` shrinks them for testing.
* The multiplier: every gain is x0.6 (`MULT_UP`), it holds for 4 s (`MULT_HOLD`) and then drains at 0.32 per second (`MULT_DRAIN`). All in `game.js`.
* Every run starts on the Home world, which never returns; the Garden world can appear once per run.
* Power-ups: a kind you are already full of is much less likely, the last four kinds are skipped, and after four runs every kind can appear.
