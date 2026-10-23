# Biomes

A run is one continuous journey through up to six biomes. Planets are separate: they are random and only bring rules
(see `PLANET_TYPES` in `www/js/game.js`), never a sky or a song.

After `OD.biomeStay(n)` planet switches (3, 4, 5, 6 ... so every stay is longer than the last) the sky changes: the old sky
melts into the new one over five seconds, the new biome's song takes over, and its own sounds begin.

| # | Biome | Look (`www/js/biomes.js`) | Sounds (`AMB_EV` in `www/js/audio.js`) | Songs |
|---|---|---|---|---|
| 0 | Aurora Reach | a pale ringed giant far away, ribbons of green and violet light, shooting stars | glass shimmer, a far-off whale-like call | Aurora A and B (done) |
| 1 | Dust Belt | an amber sun behind haze, dark boulders turning slowly, dust squalls | wind gusts, a boulder knocking | Dust A and B (done, 112 BPM, F minor; `tools/music/dust_stems.py`) |
| 2 | Ember Rift | a dying red star in the corner, glowing cracks in space, rising embers, solar flares | fire crackle, a low roar | Ember A and B |
| 3 | Glacier Drift | ice spires from the edges, cold mist, snow, glints on the ice | a crack that rings, ice chimes, thin wind | needed (2) |
| 4 | Pulsar Storm | a spinning pulsar sweeping two beams, violet thunderclouds, lightning | distant zaps, static, sonar pings | needed (2) |
| 5 | Void Maw | a hole in the sky with a bent ring of light, motes falling in, two pale lights that look back | deep swell, whispers, a slow heartbeat | needed (2) |

Each biome also has a very quiet bed of its own air (`AMB_BED`) and one rare sound every 11 to 25 seconds.

## Delivering songs

Drop stems in `assets/music/<name>/` as before and tell me the name, the BPM and the key. Both songs of a biome must share
a tempo (the game switches between them only in the menu, never in a run). Targets:

| Biome | BPM | Key |
|---|---|---|
| Aurora Reach | 119 | A minor / C major (done) |
| Dust Belt | 112 | F minor (done) |
| Ember Rift | 118 | G minor / D minor (done) |
| Glacier Drift | 113 | C major / C minor (done) |
| Pulsar Storm | 132 | C major / D minor (done) |
| Void Maw | 84 | C minor |

Suno style prompts (add `instrumental`, `strict steady tempo`, and put `vocals, singing, lyrics, fade out, tempo change, key change` in Exclude styles):

1. **Aurora Reach**: "Instrumental ambient electronic, 108 BPM, A minor, shimmering airy pads, soft pulsing sub bass, gentle crystalline arpeggio, light heartbeat kick and soft hi-hats, wide reverb, dreamy and hopeful, seamless loop"
2. **Dust Belt**: "Instrumental downtempo electronic, 96 BPM, D minor, dusty tape-textured drums, shuffled percussion, warm low bass, sparse plucked melody, distant wind pads, tense desert-space mood, steady groove, loopable"
3. **Glacier Drift**: "Instrumental electronic, 100 BPM, E minor, cold glassy bells, icy FM pads, soft clicky percussion, deep rounded bass, slow evolving arpeggio, spacious and serene with an undercurrent of tension, loopable"
4. **Pulsar Storm**: "Instrumental driving synthwave techno, 132 BPM, F# minor, punchy four-on-the-floor kick, rolling sixteenth bassline, bright sequenced arpeggios, electric risers, urgent but clean, energetic, loopable"
5. **Void Maw**: "Instrumental dark ambient with slow beats, 84 BPM, C minor, massive sub drones, sparse deep kick, distant metallic hits, eerie evolving pads, minimal melody, ominous and vast, loopable"

## When the biome changes in a run

The biome changes with a planet change. When the planet that brings it starts to drift in, the next biome is chosen and its song is
fetched (`OD.audio.preload`). When you land, the new sky sweeps in over the old one from the side the planet came from: along a wide
soft front the two skies show through each other and the new sky's layers glide into place at their own speeds (`drawSweep` in
`game.js`, about 6.5 s).

The music hands over on a bar line two bars after you land: the old drums and bass step out under a rising sweep, the old pads ease
out so they are gone exactly on the downbeat, and the new song enters without its beat: the pads swell in with a few bells in the new
key, the bass joins two bars later and the drums four bars later (`beginTransition(now, cross)` in `audio.js`). The game's beat clock
follows the new tempo from that downbeat. A run that ends mid-hand-over settles safely (`abortCross`).

## A second danger in every biome

Each biome has its own signature danger (Ribbon, Tether, Cinder, Ice Lance, Arc Pylons, Void Shade) and now a second, rarer one. They never appear
together, there is at least a 12 second pause after any of them, and the second one only starts after 44 to 60 seconds of a run.

| Biome | Danger | What it does |
|---|---|---|
| Aurora Reach | Light Shoal | seven glowing fish weave across the sky; each one is small, find the gaps |
| Dust Belt | Dust Devil | a whirl of sand wandering between orbits; the core is deadly, the wind around it only spins you the other way round |
| Ember Rift | Fire Blossom | a bud on an orbit opens, faint spokes show where the fire goes, then six slow fireballs fly outward |
| Glacier Drift | Hail Volley | ice shards fall down marked vertical lanes, one after another |
| Pulsar Storm | Ion Coil | a serpent of lightning spirals in towards the planet and back out; the whole body is deadly |
| Void Maw | Rift Twins | two doorways on different orbits; touching one moves you to the other (never hurts, but may drop you next to a hazard) |

Code: `BIZ2` / `BIZ2_T` and the `spawn*` functions in `game.js`, one case each in `tickBiomeHazard`, the collision switch and `drawHazard`;
explanation tiles and illustrations in `intro.js`. Each fades in after its warning and dissolves in its own way when it ends.

## Songs: long arranged loops and DJ-style mixes

Every song is now one long loop of whole bars (24 or 32, 43 to 68 seconds) that takes in a drop, a breakdown and the way back into the drop, cut
by `tools/music/arrange.py` from the Suno stems (the windows were found by `tools/music/arrange_scan.py`: it looks for stretches whose start and
end match in harmony and drum energy, so the loop point is the song carrying on). The window start is nudged by a few milliseconds so that its
kicks sit exactly on its beat grid. All songs of a biome share one tempo: Aurora 119, Dust 112, Ember 118, Glacier 113, Pulsar 132, Void 128 and the
black hole fight 136 BPM.

A new biome (or the boss fight) is mixed in like a DJ would (`beginMix` in `audio.js`):
1. the old song's tempo glides towards the new one's over two bars (far-apart tempos meet halfway, so neither bends far);
2. on the old song's next bar line the new song starts from its first bar at the same tempo, so the two bar lines lie exactly on top of each other;
   the bass is swapped on that downbeat and the beats cross over within a bar;
3. for two bars the old melody layers close (low-pass) while the new ones open (high-pass), so little of the two harmonies is heard together;
4. the new song glides to its own tempo over two bars and the game's beat clock follows, re-anchored on bar lines.
Going back to the menu or retrying after a loss in another biome still fades the old song out to silence and then fades Aurora in.

Test mode: `OD.TEST_TOUR` (util.js; `?notour` turns it off) makes every run walk through the skies, 20 seconds each from Aurora to Void, then the
black hole boss fight with its own song. Remove it before publishing.
