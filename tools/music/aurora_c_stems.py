#!/usr/bin/env python3
"""Aurora Reach, song C (assets/music/aurora_c, 119.04 BPM, A minor / C major): cuts one 32-bar cycle of the main groove
into seamless loops and merges the stems into the game's five layers (the same as aurora_stems.py does for songs A and B).
The song starts on the beat at 0.037 s; one bar is 2.0161 s. The cycle starts at bar 32 (the groove drops in) and runs
groove, drum break, quiet bars, rising build, then back to the groove at the same place.
Stems: 1 Drums + 5 Percussion -> drums, 2 Bass -> bass, 4 Keyboard + 3 Guitar -> keys, 6 Synth -> synth.
'0 Lead Vocals' is almost silent (rms 0.004), so the colour layer stays a 1 s silence like in songs A and B.
Run: python3 tools/music/aurora_c_stems.py   (needs numpy, soundfile, ffmpeg)"""
import os, shutil, subprocess
import numpy as np, soundfile as sf

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
BPM = 119.04; BAR = 240 / BPM; ORIGIN = 0.037; START_BAR = 32; BARS = 32
XF = 0.012
FILES = {'drums': '1 Drums', 'percussion': '5 Percussion', 'bass': '2 Bass', 'keyboard': '4 Keyboard', 'guitar': '3 Guitar', 'synth': '6 Synth'}
LAYERS = {'drums': ['drums', 'percussion'], 'bass': ['bass'], 'keys': ['keyboard', 'guitar'], 'synth': ['synth']}
MONO = ('bass',)
tmp = '/tmp/aurora_stems_aurora_c'; os.makedirs(tmp, exist_ok=True)
out = f'{ROOT}/www/audio/aurora_c'; os.makedirs(out, exist_ok=True)

def load(n):
    wav = f'{tmp}/{n}.wav'
    if not os.path.exists(wav):
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', f'{ROOT}/assets/music/aurora_c/{FILES[n]}.mp3', '-ar', '48000', wav], check=True)
    return sf.read(wav)

mix = {}
for layer, parts in LAYERS.items():
    acc = None
    for n in parts:
        x, sr = load(n); acc = x if acc is None else acc[:len(x)] + x[:len(acc)]
    mix[layer] = acc
a = int(round((ORIGIN + START_BAR * BAR) * sr)); b = a + int(round(BARS * BAR * sr)); x_ = int(XF * sr); loops = {}
for layer, x in mix.items():
    seg = x[a:b].copy(); pre = x[a - x_:a]; fade = np.linspace(0, 1, x_)[:, None]
    seg[-x_:] = seg[-x_:] * np.cos(fade * np.pi / 2) + pre * np.sin(fade * np.pi / 2)
    loops[layer] = seg
tot = sum(loops.values()); g = min(0.12 / np.sqrt(np.mean(tot ** 2)), 0.8 / np.abs(tot).max())
print('aurora_c loop', round(len(tot) / sr, 3), 's  gain', round(float(g), 3), ' mix rms', round(float(np.sqrt(np.mean((tot * g) ** 2))), 3), 'peak', round(float(np.abs(tot * g).max()), 2))
for layer, seg in loops.items():
    seg = seg * g
    wav = f'{tmp}/{layer}_loop.wav'; sf.write(wav, seg, sr)
    ac = ['-ac', '1'] if layer in MONO else []
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav] + ac + ['-c:a', 'libvorbis', '-q:a', '5', f'{out}/{layer}.ogg'], check=True)
    print(f'  {layer:7s} rms {np.sqrt(np.mean(seg.mean(1)**2)):.3f} peak {np.abs(seg).max():.2f}')
shutil.copy(f'{ROOT}/www/audio/aurora/colour.ogg', f'{out}/colour.ogg')
