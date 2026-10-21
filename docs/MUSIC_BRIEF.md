# Music brief for Suno

The game can play real tracks instead of its built-in synth music, and syncs gameplay to them: hazards spawn on
beats, mines pulse on the beat, the planet and stars pulse with the kick, sound effects play in the track's key,
and the music gets more intense as your combo grows.

## How to make the tracks
* One track per world, **instrumental**, **2.5 to 3.5 minutes**, **constant tempo** (no tempo changes, no live drummer feel).
* In Suno use the **Style of Music** box for the style line and put the structure in the **Lyrics** box (leave it as
  `[Instrumental]` tags only, no words).
* Generate several takes and pick the one with the steadiest groove. Cover or Extend the best take if it drifts.
* Best case: use Suno's **Get Stems** and export **Drums, Bass, Synths/Other** for each track. The game fades these in
  as your combo grows. If you can only get the full mix, that works too.
* Export **WAV** if possible (MP3 is fine). Put files in `assets/music/` named `aurora.wav`, `ember.wav`, ...
  (stems: `aurora_drums.wav`, `aurora_bass.wav`, `aurora_synth.wav`). I analyse each file for exact tempo,
  first-beat offset, key and loudness over time, and wire it up.

## Tracks
Keep the BPM and key close to these (I will measure the real values; they do not need to be perfect).

### 1. Aurora (home world, calm start) : 108 BPM, A minor
Style: `instrumental, synthwave, dreamy space electronic, 108 BPM, A minor, steady four-on-the-floor kick, soft pulsing bass, shimmering arpeggios, airy pads, hopeful, cinematic, strict tempo, no vocals`
Lyrics box:
```
[Instrumental]
[Intro - pads only, 8 bars]
[Verse - soft kick and bass enter, 16 bars]
[Build - arpeggio enters, 8 bars]
[Drop - full groove, 16 bars]
[Breakdown - pads and arpeggio only, 8 bars]
[Drop - full groove, 16 bars]
[Outro - fade to pads, 8 bars]
```

### 2. Ember : 118 BPM, G minor
Style: `instrumental, dark synthwave, driving analog bass, pulsing sequenced arpeggio, tense, volcanic, warm distorted synth stabs, 118 BPM, G minor, tight punchy drums, strict tempo, no vocals`
Lyrics box: same structure as above.

### 3. Glacier : 114 BPM, C major
Style: `instrumental, glacial electronic, crystalline bell arpeggios, glassy pads, clean sub bass, light crisp percussion, cold and serene, 114 BPM, C major, strict tempo, no vocals`

### 4. Void : 124 BPM, E minor
Style: `instrumental, dark techno, hypnotic rolling sub bass, industrial percussion, eerie synth drones, minimal melodic motifs, menacing, 124 BPM, E minor, strict tempo, no vocals`

### 5. Nebula (planned world) : 112 BPM, D dorian
Style: `instrumental, psychedelic electronica, swirling modulated synths, warm bass, glittering arpeggios, wide stereo pads, colorful and dreamy, 112 BPM, D dorian, strict tempo, no vocals`

### 6. Solaris (planned world) : 126 BPM, F lydian
Style: `instrumental, uplifting trance-influenced electronic, bright supersaws, pumping bass, euphoric but clean arpeggios, radiant, 126 BPM, F lydian, strict tempo, no vocals`

### 7. Menu theme : 90 BPM, any minor key
Style: `instrumental, ambient space music, slow evolving pads, soft bell melody, no drums, calm, 90 BPM, loopable, no vocals`

### Optional extras
* **Boss intensity** (Eclipse): for each track, a 60 second take with `same style, much more intense, heavy kick and bass, rising tension` at the same BPM and key, so it can be layered over the main track.
* **Game over sting**: `short 3 second descending synth sting, sad but gentle, no drums`.
* **New record sting**: `short 3 second triumphant rising synth fanfare, bright`.

## How the tracks get into the game (already built)
1. Drop the files in `assets/music/` named by sector: `aurora`, `dust`, `ember`, `glacier`, `pulsar`, `void`, `menu`
   (`.wav`, `.mp3` or `.flac`; optional stems `aurora_drums`, `aurora_bass`, `aurora_synth`, `aurora_other`).
2. Run `npm run music` (needs python3, numpy, ffmpeg). It measures each track's exact tempo, the first downbeat, the key,
   the energy of every bar and good loop points, converts to mp3 and writes `www/audio/tracks.json`.
   It warns if a track's tempo drifts (regenerate that take).
3. That is all. The game then uses the track instead of the built-in synth.

What the game does with a track:
* The beat clock is the track itself: hazards, pulse mines, planet pulses, boss rings and cosmic events spawn on the beat
  (waves on every second beat, events and passing planets on bar starts).
* Output latency is compensated so visuals land with what you hear.
* Live bass analysis makes the planet, orbits and stars pulse with the actual kick.
* With stems: drums fade in with your combo, synths and arps join at higher combos. With a single mix a filter opens instead.
* Slow-mo and holding a jump muffle the music; Nova opens it fully.
* Sound effects are played in the track's detected key and scale.
* Without a file for a sector the built-in synth music plays, so nothing breaks while you generate tracks.
