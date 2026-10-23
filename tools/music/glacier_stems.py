#!/usr/bin/env python3
"""Glacier Drift: cuts the two Suno songs (assets/music/glacier_a, glacier_b) into seamless 16-bar loops of their main groove and merges the
stems into five game layers: drums, bass, keys, synth, colour (percussion folds into drums; guitar, brass, strings and "other" into colour).
The vocal stems are silent and are not used. Both songs end up at exactly 113 BPM (glacier_a was 114.0 BPM, so it is slowed by rubberband).
  glacier_a: C major, kick on the downbeat at 84.37 s (16 bars, the long drop of the song)
  glacier_b: C minor, kick on the downbeat at 102.13 s (16 bars)
Run: python3 tools/music/glacier_stems.py   (needs numpy, soundfile, ffmpeg with rubberband)"""
import os, subprocess
import numpy as np, soundfile as sf

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
BPM = 113.0; BAR = 240 / BPM
XF = 0.012
FILES = {
    'glacier_a': {'drums': '1 Drums', 'bass': '2 Bass', 'guitar': '3 Guitar', 'keyboard': '4 Keyboard', 'percussion': '5 Percussion', 'strings': '6 Strings', 'synth': '7 Synth', 'other': '8 Other'},
    'glacier_b': {'drums': '2 Drums', 'bass': '3 Bass', 'keyboard': '4 Keyboard', 'percussion': '5 Percussion', 'strings': '6 Strings', 'synth': '7 Synth', 'other': '8 Other', 'brass': '9 Brass'},
}
LAYERS = {'drums': ['drums', 'percussion'], 'bass': ['bass'], 'keys': ['keyboard'], 'synth': ['synth'], 'colour': ['other', 'strings', 'guitar', 'brass']}
SETS = {
    'glacier':   dict(src='glacier_a', start=84.37,  bars=16, bpm=114.0),
    'glacier_b': dict(src='glacier_b', start=102.13, bars=16, bpm=113.0),
}
MONO = ('bass',)

def load(cfg, n, tmp):
    wav = f'{tmp}/{n}.wav'
    if not os.path.exists(wav):
        r = BPM / cfg['bpm']   # <1 slows the song down
        af = ['-af', f'rubberband=tempo={r:.6f}:transients=mixed:detector=compound'] if abs(r - 1) > 0.001 else []
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', f'{ROOT}/assets/music/{cfg["src"]}/{FILES[cfg["src"]][n]}.mp3', '-ar', '48000'] + af + [wav], check=True)
    return sf.read(wav)

for name, cfg in SETS.items():
    tmp = f'/tmp/glacier_stems_{name}'; os.makedirs(tmp, exist_ok=True)
    out = f'{ROOT}/www/audio/{name}'; os.makedirs(out, exist_ok=True)
    start = cfg['start'] * cfg['bpm'] / BPM   # the stretched timeline
    mix = {}
    for layer, parts in LAYERS.items():
        acc = None
        for n in parts:
            if n not in FILES[cfg['src']]: continue
            x, sr = load(cfg, n, tmp)
            if x.ndim == 1: x = np.stack([x, x], 1)
            acc = x if acc is None else acc[:len(x)] + x[:len(acc)]
        mix[layer] = acc
    a, b = int(round(start * sr)), int(round((start + cfg['bars'] * BAR) * sr))
    x_ = int(XF * sr); loops = {}
    for layer, x in mix.items():
        seg = x[a:b].copy()
        pre = x[a - x_:a]; fade = np.linspace(0, 1, x_)[:, None]
        seg[-x_:] = seg[-x_:] * np.cos(fade * np.pi / 2) + pre * np.sin(fade * np.pi / 2)
        loops[layer] = seg
    tot = sum(loops.values()); g = min(0.12 / np.sqrt(np.mean(tot ** 2)), 0.8 / np.abs(tot).max())
    print(name, 'loop', round(len(tot) / sr, 3), 's  gain', round(float(g), 3), ' mix rms', round(float(np.sqrt(np.mean((tot * g) ** 2))), 3), 'peak', round(float(np.abs(tot * g).max()), 2))
    for layer, seg in loops.items():
        seg = seg * g
        wav = f'{tmp}/{layer}_loop.wav'; sf.write(wav, seg, sr)
        ac = ['-ac', '1'] if layer in MONO else []
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav] + ac + ['-c:a', 'libvorbis', '-q:a', '5', f'{out}/{layer}.ogg'], check=True)
        print(f'  {layer:7s} rms {np.sqrt(np.mean(seg.mean(1)**2)):.3f} peak {np.abs(seg).max():.2f}')
