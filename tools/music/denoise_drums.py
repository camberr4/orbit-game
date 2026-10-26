#!/usr/bin/env python3
"""The separated drum stems of the Suno songs carry a flat, white hiss between the hits. This cleans a drums.ogg in place by spectral gating:
the quiet floor of every frequency bin is measured (a low percentile over time), subtracted with a little over-subtraction, and the mask is
smoothed in time so it never flutters. The settings are mild on purpose: the hats keep their sparkle, only the hiss under them goes. The loop is tiled three times and the middle copy is kept, so the loop point stays seamless.
Run: python3 tools/music/denoise_drums.py www/audio/aurora/drums.ogg [...]   (needs numpy, scipy, soundfile, ffmpeg)"""
import subprocess, sys, tempfile, os
import numpy as np, soundfile as sf
from scipy.signal import stft, istft, butter, sosfiltfilt

def denoise(x, sr, alpha=1.2, beta=0.3, pct=12):
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

def kill_risers(x, sr, det=None, win=0.25, over=11.0, pad=0.5, cut=0.07):
    """The songs' drum stems also hold white-noise risers and crashes (3 to 4 s of loud hiss over the beat). They are found where the quiet floor of the
    highs (the 20th percentile of the 3-16 kHz level inside a short window) jumps far above its usual value, and the highs (above 2.5 kHz) are pulled down
    there, with soft edges. The kick and the snare body (below that) stay."""
    m = (x if det is None else det).mean(1)   # the riser is looked for in the untouched signal and cut from the cleaned one
    hp = sosfiltfilt(butter(4, [3000, 16000], 'bandpass', fs=sr, output='sos'), m)
    sub = int(0.025 * sr); e = np.array([10 * np.log10(np.mean(hp[i:i + sub] ** 2) + 1e-14) for i in range(0, len(hp) - sub, sub)])
    per = 10;   # ten blocks of 25 ms = one 0.25 s window, exactly
    fl = np.array([np.percentile(e[i:i + per], 20) for i in range(0, len(e) - per, per)])
    md = np.array([np.median(e[i:i + per]) for i in range(0, len(e) - per, per)])[:len(fl)]   # the typical level of the highs inside each window
    base = np.median(fl); mbase = np.median(md); bad = (fl > base + over) | (md > mbase + 7)   # the quiet floor lifted, or the whole level lifted: a riser
    runs, i = [], 0   # only long stretches count as risers (2 s or more); a single loud hat or crash is music
    while i < len(bad):
        if bad[i]:
            j = i
            while j < len(bad) and bad[j]: j += 1
            if j - i >= 8: runs.append((i, j))
            i = j
        else: i += 1
    bad = np.zeros(len(bad), bool)
    for i, j in runs: bad[i:j] = True
    g = np.ones(len(x))
    for i, b in enumerate(bad):
        if b: g[max(0, int((i * win - pad) * sr)):int((i * win + win + pad) * sr)] = cut
    k = int(0.12 * sr); g = np.convolve(np.pad(g, (k, k), mode='edge'), np.ones(2 * k + 1) / (2 * k + 1), mode='valid')[:len(x)]
    low = sosfiltfilt(butter(4, 2500, 'lowpass', fs=sr, output='sos'), x, axis=0)
    print('   riser windows:', ', '.join(f'{i * win:.1f}-{i * win + win:.1f}s' for i, b in enumerate(bad) if b) or 'none')
    return low + (x - low) * g[:, None]

for path in sys.argv[1:]:
    tmp = tempfile.mkdtemp(); wav = os.path.join(tmp, 'in.wav'); res = os.path.join(tmp, 'out.wav')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path, '-ar', '48000', '-ac', '2', wav], check=True)
    x, sr = sf.read(wav); n = len(x)
    t3 = np.concatenate([x, x, x]); y = kill_risers(denoise(t3, sr), sr, t3)[n:2 * n]
    sf.write(res, y, sr)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', res, '-c:a', 'libvorbis', '-q:a', '5', path], check=True)
    print(path, 'rms', round(float(np.sqrt(np.mean(x ** 2))), 4), '->', round(float(np.sqrt(np.mean(y ** 2))), 4))
