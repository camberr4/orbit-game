#!/usr/bin/env python3
"""Dust Belt: cuts the two Suno songs (assets/music/dust_a, dust_b) into seamless 16-bar loops of their main groove and merges the
stems into five game layers: drums, bass, keys, synth, colour (percussion folds into drums; guitar, brass and "other" into colour).
Both songs are slowed/kept to exactly 112 BPM (dust_a was 113.0 BPM, dust_b 112.0 BPM, measured from the drum beats).
  dust_a: kick on the downbeat at 55.282 s  (16 bars = 33.983 s at its own tempo, stretched by rubberband to 34.286 s)
  dust_b: kick on the downbeat at 55.764 s  (16 bars = 34.285 s)
Both songs repeat every 8 bars, so any 16-bar window of the groove loops cleanly.
Run: python3 tools/music/dust_stems.py   (needs numpy, soundfile, ffmpeg with rubberband)"""
import os, subprocess
import numpy as np, soundfile as sf

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
BPM = 112.0; BAR = 240 / BPM
XF = 0.012
FILES = {
    'dust_a': {'drums': '0 Drums', 'bass': '1 Bass', 'guitar': '2 Guitar', 'keyboard': '3 Keyboard', 'percussion': '4 Percussion', 'synth': '5 Synth', 'other': '6 Other', 'brass': '7 Brass'},
    'dust_b': {'drums': '0 Drums', 'bass': '1 Bass', 'guitar': '2 Guitar', 'keyboard': '3 Keyboard', 'synth': '4 Synth', 'other': '5 Other', 'brass': '6 Brass'},
}
LAYERS = {'drums': ['drums', 'percussion'], 'bass': ['bass'], 'keys': ['keyboard'], 'synth': ['synth'], 'colour': ['other', 'guitar', 'brass']}
SETS = {
    'dust':   dict(src='dust_a', start=55.282, bars=16, bpm=112.997),
    'dust_b': dict(src='dust_b', start=55.764, bars=16, bpm=112.005),
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
    tmp = f'/tmp/dust_stems_{name}'; os.makedirs(tmp, exist_ok=True)
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
