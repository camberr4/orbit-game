#!/usr/bin/env python3
"""Aurora Reach: cuts the two Suno songs (assets/music/aurora_a, aurora_b; both 119 BPM, A minor / C major) into seamless
16-bar loops of their main groove and merges the stems into five game layers: drums, bass, keys, synth, colour.
  aurora_a: groove starts at 32.442 s   (the drums enter at 16.306 s, one bar is 2.017 s, the groove follows after 8 bars)
  aurora_b: groove starts at 52.545 s   (drums enter at 36.409 s, the groove starts 8 bars later)
Run: python3 tools/music/aurora_stems.py   (needs numpy, soundfile, ffmpeg)"""
import os, subprocess
import numpy as np, soundfile as sf

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
BPM = 118.99; BAR = 240 / BPM
XF = 0.012
FILES = {'drums': '0 Drums', 'bass': '1 Bass', 'keyboard': '2 Keyboard', 'percussion': '3 Percussion', 'synth': '4 Synth', 'other': '5 Other'}
LAYERS = {'drums': ['drums', 'percussion'], 'bass': ['bass'], 'keys': ['keyboard'], 'synth': ['synth'], 'colour': ['other']}
SETS = {'aurora': dict(src='aurora_a', start=32.442, bars=16), 'aurora_b': dict(src='aurora_b', start=52.545, bars=16)}
MONO = ('bass',)

def load(src, n, tmp):
    wav = f'{tmp}/{n}.wav'
    if not os.path.exists(wav):
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', f'{ROOT}/assets/music/{src}/{FILES[n]}.mp3', '-ar', '48000', wav], check=True)
    return sf.read(wav)

for name, cfg in SETS.items():
    tmp = f'/tmp/aurora_stems_{name}'; os.makedirs(tmp, exist_ok=True)
    out = f'{ROOT}/www/audio/{name}'; os.makedirs(out, exist_ok=True)
    mix = {}
    for layer, parts in LAYERS.items():
        acc = None
        for n in parts:
            x, sr = load(cfg['src'], n, tmp); acc = x if acc is None else acc[:len(x)] + x[:len(acc)]
        mix[layer] = acc
    a = int(round(cfg['start'] * sr)); b = a + int(round(cfg['bars'] * BAR * sr)); x_ = int(XF * sr); loops = {}
    for layer, x in mix.items():
        seg = x[a:b].copy(); pre = x[a - x_:a]; fade = np.linspace(0, 1, x_)[:, None]
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
