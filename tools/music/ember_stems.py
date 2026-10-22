#!/usr/bin/env python3
"""Ember Rift: cuts the Suno stems into seamless loops of their main groove and merges them into five game layers: drums, bass,
keys, synth, colour (percussion, strings, brass, guitar and "other" are folded into drums and colour).
  ember   = assets/music/ember/*.mp3,   118 BPM, G minor, 20 bars
  ember_b = assets/music/ember_b/*.mp3, 121 BPM, D minor, slowed 2.5% with rubberband to match 118 BPM, 16 bars
Run: python3 tools/music/ember_stems.py   (needs numpy, soundfile, ffmpeg with rubberband)"""
import os, subprocess
import numpy as np, soundfile as sf

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
BPM = 118.0; BAR = 240 / BPM
XF = 0.012              # seconds of crossfade at the seam, only to remove clicks
SETS = {
    'ember':   dict(src='ember',   out='ember',   start=77.407,  bars=20, stretch=None,     layers={'drums': ['drums', 'percussion'], 'bass': ['bass'], 'keys': ['keyboard'], 'synth': ['synth'], 'colour': ['other', 'strings', 'brass']}),
    'ember_b': dict(src='ember_b', out='ember_b', start=114.078, bars=16, stretch=118 / 121.0, layers={'drums': ['drums', 'percussion'], 'bass': ['bass'], 'keys': ['keyboard'], 'synth': ['synth'], 'colour': ['other', 'guitar']}),
}
MONO = ('bass',)

def load(cfg, n, tmp):
    wav = f'{tmp}/{n}.wav'
    if not os.path.exists(wav):
        af = ['-af', f'rubberband=tempo={cfg["stretch"]:.6f}:transients=mixed:detector=compound'] if cfg['stretch'] else []
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', f'{ROOT}/assets/music/{cfg["src"]}/{n}.mp3', '-ar', '48000'] + af + [wav], check=True)
    x, sr = sf.read(wav); return x, sr

for name, cfg in SETS.items():
    tmp = f'/tmp/ember_stems_{name}'; os.makedirs(tmp, exist_ok=True)
    out = f'{ROOT}/www/audio/{cfg["out"]}'; os.makedirs(out, exist_ok=True)
    mix = {}
    for layer, parts in cfg['layers'].items():
        acc = None
        for n in parts:
            x, sr = load(cfg, n, tmp); acc = x if acc is None else acc[:len(x)] + x[:len(acc)]
        mix[layer] = acc
    a, b = int(round(cfg['start'] * sr)), int(round((cfg['start'] + cfg['bars'] * BAR) * sr))
    x_ = int(XF * sr); loops = {}
    for layer, x in mix.items():
        seg = x[a:b].copy()
        pre = x[a - x_:a]; fade = np.linspace(0, 1, x_)[:, None]   # blend the last few ms into what preceded the loop start
        seg[-x_:] = seg[-x_:] * np.cos(fade * np.pi / 2) + pre * np.sin(fade * np.pi / 2)
        loops[layer] = seg
    tot = sum(loops.values()); g = min(0.12 / np.sqrt(np.mean(tot ** 2)), 0.8 / np.abs(tot).max())   # both songs sit at the same loudness
    print(name, 'loop', round(len(tot) / sr, 3), 's  gain', round(float(g), 3), ' mix rms', round(float(np.sqrt(np.mean((tot * g) ** 2))), 3), 'peak', round(float(np.abs(tot * g).max()), 2))
    for layer, seg in loops.items():
        seg = seg * g
        wav = f'{tmp}/{layer}_loop.wav'; sf.write(wav, seg, sr)
        ac = ['-ac', '1'] if layer in MONO else []
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav] + ac + ['-c:a', 'libvorbis', '-q:a', '5', f'{out}/{layer}.ogg'], check=True)
        print(f'  {layer:7s} rms {np.sqrt(np.mean(seg.mean(1)**2)):.3f} peak {np.abs(seg).max():.2f}')
