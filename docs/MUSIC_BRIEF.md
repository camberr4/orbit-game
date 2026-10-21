# Music brief for Suno

The game plays real tracks instead of its built-in synth music and syncs gameplay to them (spawns, pulses, boss rings,
events, sound effects in the track's key). A short song lasts a long run because the game cuts it into 8-bar phrases and
re-sequences them live (see "How it works" at the end).

## What to make (in priority order)

**1. Required: 7 tracks.** One per sector plus the menu. Each 2.5 to 3.5 minutes.
`aurora`, `dust`, `ember`, `glacier`, `pulsar`, `void`, `menu`

**2. Strongly recommended: a second take for each sector (6 more).** Same BPM and key as take one but a different melody and
different section order: `aurora_b`, `dust_b`, ... The game mixes phrases from both takes, so the music stays fresh in long runs.
You can add `_c` and `_d` the same way.

**3. Nice to have: `zen`** (slow ambient, no drums) for Zen mode, and short event sounds in a folder `fx/`:
`blackhole`, `supernova`, `boss`, `hop`, `gameover`, `record` (details below).

**4. Best quality: stems.** In Suno use *Get Stems* and export Drums, Bass and Synths/Other for each main track
(`aurora_drums`, `aurora_bass`, `aurora_synth`). The drums and synths fade in with your multiplier. A single full mix also works
(the music then opens up with a filter instead).

Files go in `assets/music/` (`.wav` preferred, `.mp3` fine). Then `npm run music`, then push or tell me.

## Settings that work for every track
* **Exclude styles** box (very important): `vocals, singing, lyrics, choir, spoken word, rap, fade out, tempo change, key change, live drums, jazz brushes`
* Always say **instrumental** and **strict tempo / steady tempo** and the exact **BPM** and **key** in the Style box.
* Put the section plan in the **Lyrics** box using the tags below. Suno follows section tags loosely, so generate 5 to 10 takes
  and keep the one with the steadiest groove and the clearest difference between quiet and loud parts.
* Ask for **clear contrast**: quiet sections and big drops that are obviously different in energy. The game picks phrases by energy,
  so contrast is what makes the music react.
* Ask for a **clean, spacious mix**: little reverb on drums, nothing loud in the 1 to 3 kHz vocal range, so the game's sound effects sit on top.
* **No fade-out**, no long silence at the end. Sections should start and end cleanly on bar lines.
* Avoid artist names. Describe the sound instead.

Section plan to paste into the Lyrics box (adjust the bracket text per track):
```
[Instrumental]
[Intro - atmospheric pads only, no drums, 8 bars]
[Verse A - light kick and bass enter, restrained, 8 bars]
[Verse B - same groove with a simple melody, 8 bars]
[Build - arpeggio and snare roll rise in energy, 8 bars]
[Drop - full groove, biggest energy, 16 bars]
[Breakdown - drums drop out, pads and melody only, 8 bars]
[Build - rising again, 8 bars]
[Drop - full groove with a variation, 16 bars]
[Outro - clean ending on the downbeat, no fade, 4 bars]
```

## The seven main tracks

### aurora (Aurora Reach, peaceful): 108 BPM, A minor
Style: `instrumental, dreamy space synthwave, 108 BPM, steady tempo, A minor, four-on-the-floor soft kick, round pulsing sub bass, shimmering plucked arpeggios, wide airy pads, gentle bell lead, hopeful, floating, cinematic, clean modern mix, spacious`
Feel: weightless, glowing, calm but forward-moving. Think a slow orbit around a bright planet.
Take B: `same style and key but a different arpeggio pattern and a new simple lead melody, 108 BPM`.

### dust (Dust Belt): 112 BPM, F minor
Style: `instrumental, dusty desert electronica, 112 BPM, steady tempo, F minor, rolling tom and shaker percussion, warm analog bass, plucked oud-like arpeggio, wide reverb pads, restless adventurous mood, tight modern mix`
Feel: rocky, nomadic, a little tense. Percussive more than melodic.

### ember (Ember Rift): 118 BPM, G minor
Style: `instrumental, dark synthwave, 118 BPM, steady tempo, G minor, driving analog saw bass, pulsing sequenced arpeggio, tight punchy electronic drums, warm distorted synth stabs, tense and volcanic, rising heat, clean powerful mix`
Feel: urgent, hot, heavy. Strong sidechain pump on the bass.

### glacier (Glacier Drift): 114 BPM, C major
Style: `instrumental, glacial electronic, 114 BPM, steady tempo, C major, crystalline bell arpeggios, glassy pads, clean sub bass, light crisp percussion with ticking hats, cold serene beautiful, minimal and precise, spacious mix`
Feel: icy, sparkling, quiet but not sleepy. Big space between notes.

### pulsar (Pulsar Storm): 126 BPM, D minor
Style: `instrumental, high-energy electro trance, 126 BPM, steady tempo, D minor, pounding kick, rolling offbeat bass, electric sequenced arpeggios, crackling risers and noise sweeps, short bright saw lead phrases, urgent and stormy, clean powerful mix`
Feel: fast, electric, relentless. Many risers into drops.

### void (Void Maw): 124 BPM, E minor
Style: `instrumental, dark minimal techno, 124 BPM, steady tempo, E minor, hypnotic rolling sub bass, industrial metallic percussion, eerie evolving synth drones, sparse menacing motifs, vast empty space, tense, clean dry mix`
Feel: oppressive and hypnotic. Fewer notes, more weight.

### menu (menu screen): 90 BPM, minor
Style: `instrumental, ambient space music, 90 BPM, slow evolving pads, soft glassy bell melody, subtle sub swell, no drums, calm, mysterious, loopable, no vocals`
For this one use only: `[Intro] [Section A 16 bars] [Section B 16 bars] [Section A 16 bars]`. It loops, so no drops.

## Optional extras

### zen (Zen mode): 72 BPM, any key
Style: `instrumental, slow meditative ambient, 72 BPM, warm evolving pads, soft sine bell melody, very gentle sub, no drums, no percussion, floating, peaceful, long sustained notes, loopable`
Same structure as the menu track.

### Event sounds (put in `assets/music/fx/`, no tempo needed)
Make these as short instrumental tracks and trim in any editor. Names must match.
* `blackhole.wav` (20 to 30 s, loops): `dark ambient drone, deep sub bass swell, slowly pulsing low rumble, distant swirling metallic textures, ominous, no rhythm, no melody, seamless loop`
* `supernova.wav` (8 to 10 s): `cinematic riser, rising white noise and rising pitched synth tension, accelerating pulses, builds to a peak and stops abruptly, no impact, no drums`
* `boss.wav` (20 s, loops): `tense dramatic drone and low pulsing strings, rising pressure, no rhythm, no melody, ominous, seamless loop`
* `hop.wav` (4 s): `short airy whoosh and rising shimmer that resolves into a warm soft chord, transition between planets, magical, no drums`
* `gameover.wav` (3 s): `short descending synth sting, soft and sad but not harsh, ends with a fading low tone, no drums`
* `record.wav` (3 s): `short triumphant rising synth fanfare with bright bells, celebratory, ends on a clean major chord`

## How it works (so you know what to aim for)
1. `npm run music` measures each track's exact tempo, the first downbeat (from the kick alone), the key and the loudness of every bar,
   cuts the track into 8-bar phrases and snaps each phrase to the real kick. It warns if a take's tempo drifts.
2. During a run, one bar before each phrase boundary the game picks the next phrase from the pool (all takes of that sector):
   quiet phrases when you are calm, the biggest drops when your multiplier is high or a boss, event or Nova is on. It avoids recent
   phrases and favours the song's natural next phrase. The intro plays once at the start, the outro is never used.
3. Phrases join on the downbeat with a short equal-power crossfade that starts one beat early using the song's own lead-in. A take
   with a slightly different tempo is re-timed to the grid.
4. The beat clock is the music: hazards, mines, boss rings and events spawn on beats and bars. Output latency is compensated.
5. Live bass analysis makes the planet, orbits and sky pulse with the real kick. Slow-mo and aiming muffle the music; Nova opens it.
6. Sound effects play in each track's detected key. If a sector has no track, the built-in synth music plays instead.
