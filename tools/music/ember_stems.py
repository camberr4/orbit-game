#!/usr/bin/env python3
"""Ember Rift: cuts the Suno stems (assets/music/ember/*.mp3, 118 BPM, G minor) into one seamless 20-bar loop of the main groove
and merges them into five game layers: drums, bass, keys, synth, colour (percussion, strings, brass and "other" are folded into
drums and colour). Run: python3 tools/music/ember_stems.py   (needs numpy, soundfile, ffmpeg)"""
import os, subprocess
import numpy as np, soundfile as sf

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SRC = os.path.join(ROOT, 'assets', 'music', 'ember'); OUT = os.path.join(ROOT, 'www', 'audio', 'ember'); TMP = '/tmp/ember_stems'
os.makedirs(OUT, exist_ok=True); os.makedirs(TMP, exist_ok=True)
BPM = 118.0; BAR = 240 / BPM
START = 77.407          # downbeat of the first bar of the drop (kick onsets measured on the drums stem)
BARS = 20               # the drop plus its fill: ends on a turnaround, right before the breakdown
XF = 0.012              # seconds of crossfade at the seam, only to remove clicks
LAYERS = {'drums': ['drums', 'percussion'], 'bass': ['bass'], 'keys': ['keyboard'], 'synth': ['synth'], 'colour': ['other', 'strings', 'brass']}
MONO = ('bass',)

def load(n):
    wav = f'{TMP}/{n}.wav'
    if not os.path.exists(wav): subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', f'{SRC}/{n}.mp3', '-ar', '48000', wav], check=True)
    x, sr = sf.read(wav); return x, sr

mix = {}
for layer, parts in LAYERS.items():
    acc = None
    for n in parts:
        x, sr = load(n); acc = x if acc is None else acc[:len(x)] + x[:len(acc)]
    mix[layer] = acc
a, b = int(round(START * sr)), int(round((START + BARS * BAR) * sr))
x_ = int(XF * sr)
loops = {}
for layer, x in mix.items():
    seg = x[a:b].copy()
    pre = x[a - x_:a]; fade = np.linspace(0, 1, x_)[:, None]   # blend the last few ms into what preceded the loop start
    seg[-x_:] = seg[-x_:] * np.cos(fade * np.pi / 2) + pre * np.sin(fade * np.pi / 2)
    loops[layer] = seg
tot = sum(loops.values()); g = min(0.5 / np.sqrt(np.mean(tot.mean(1) ** 2)) * 0.12 / 0.12, 0.8 / np.abs(tot).max())
print('loop', round(len(tot) / sr, 3), 's  gain', round(float(g), 3), ' mix rms', round(float(np.sqrt(np.mean((tot * g) ** 2))), 3), 'peak', round(float(np.abs(tot * g).max()), 2))
for layer, seg in loops.items():
    seg = seg * g
    wav = f'{TMP}/{layer}_loop.wav'; sf.write(wav, seg, sr)
    ac = ['-ac', '1'] if layer in MONO else []
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav] + ac + ['-c:a', 'libvorbis', '-q:a', '5', f'{OUT}/{layer}.ogg'], check=True)
    print(f'{layer:7s} rms {np.sqrt(np.mean(seg.mean(1)**2)):.3f} peak {np.abs(seg).max():.2f}')
