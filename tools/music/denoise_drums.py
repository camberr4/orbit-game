#!/usr/bin/env python3
"""The separated drum stems of the Suno songs carry a flat, white hiss between the hits. This cleans a drums.ogg in place by spectral gating:
the quiet floor of every frequency bin is measured (a low percentile over time), subtracted with a little over-subtraction, and the mask is
smoothed in time so it never flutters. The loop is tiled three times and the middle copy is kept, so the loop point stays seamless.
Run: python3 tools/music/denoise_drums.py www/audio/aurora/drums.ogg [...]   (needs numpy, scipy, soundfile, ffmpeg)"""
import subprocess, sys, tempfile, os
import numpy as np, soundfile as sf
from scipy.signal import stft, istft

def denoise(x, sr, alpha=1.7, beta=0.1, pct=18):
    out = np.zeros_like(x)
    for ch in range(x.shape[1]):
        f, t, Z = stft(x[:, ch], sr, nperseg=2048, noverlap=1536)
        mag = np.abs(Z); floor = np.percentile(mag, pct, axis=1, keepdims=True)
        k = np.ones(9) / 9; floor = np.apply_along_axis(lambda v: np.convolve(v, k, mode='same'), 0, floor)
        mask = np.clip(1 - alpha * floor / (mag + 1e-12), beta, 1)
        for i in range(1, mask.shape[1]): mask[:, i] = np.maximum(mask[:, i], mask[:, i - 1] * 0.55)
        _, y = istft(Z * mask, sr, nperseg=2048, noverlap=1536)
        out[:, ch] = y[:len(x)] if len(y) >= len(x) else np.pad(y, (0, len(x) - len(y)))
    return out

for path in sys.argv[1:]:
    tmp = tempfile.mkdtemp(); wav = os.path.join(tmp, 'in.wav'); res = os.path.join(tmp, 'out.wav')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path, '-ar', '48000', '-ac', '2', wav], check=True)
    x, sr = sf.read(wav); n = len(x)
    y = denoise(np.concatenate([x, x, x]), sr)[n:2 * n]
    sf.write(res, y, sr)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', res, '-c:a', 'libvorbis', '-q:a', '5', path], check=True)
    print(path, 'rms', round(float(np.sqrt(np.mean(x ** 2))), 4), '->', round(float(np.sqrt(np.mean(y ** 2))), 4))
