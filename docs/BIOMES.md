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
| Pulsar Storm | 132 | F# minor |
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
