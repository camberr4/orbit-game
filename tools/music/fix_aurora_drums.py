#!/usr/bin/env python3
"""Aurora drums, second pass: (1) the riser cut removed the hats from one stretch (about 3.5 s) of the first song: the hats of the two bars before
are laid over it, beat-aligned; (2) a gentle expander on the highs: between the hats the level is pulled down a few dB, so the hiss that sits
under them is quieter but every hat keeps its full level. Run from the repo root: python3 tools/music/fix_aurora_drums.py www/audio/aurora/drums.ogg [...]
(needs numpy, scipy, soundfile, ffmpeg)"""
import subprocess, sys, tempfile, os
import numpy as np, soundfile as sf
from scipy.signal import butter, sosfiltfilt

def highs(x, sr): return sosfiltfilt(butter(4, 2500, 'highpass', fs=sr, output='sos'), x, axis=0)
def env_db(h, sr, blk=0.025):
    n = int(blk * sr); m = h.mean(1); return 10 * np.log10(np.array([np.mean(m[i:i + n] ** 2) for i in range(0, len(m) - n, n)]) + 1e-12)

def fill_gaps(x, sr, bpm, min_len=0.6):
    h = highs(x, sr); e = env_db(sosfiltfilt(butter(4, [6000, 16000], 'bandpass', fs=sr, output='sos'), x, axis=0), sr)
    th = np.percentile(e, 75) - 12; low = e < th; runs = []; i = 0
    while i < len(low):
        if low[i]:
            j = i
            while j < len(low) and low[j]: j += 1
            if (j - i) * 0.025 >= min_len: runs.append((i * 0.025, j * 0.025))
            i = j
        else: i += 1
    bar = 4 * 60 / bpm; y = x.copy()
    for a, b in runs:
        a0, b0 = max(0, a - 0.1), b + 0.1; k = int(np.ceil((b0 - a0) / (2 * bar))) * 2   # a whole number of bars back, at least covering the gap
        src = a0 - k * bar
        if src < 0: continue
        i0, i1 = int(a0 * sr), int(b0 * sr); s0 = int(src * sr); seg = h[s0:s0 + (i1 - i0)]
        if len(seg) < i1 - i0: continue
        fade = np.minimum(1, np.minimum(np.arange(i1 - i0), np.arange(i1 - i0)[::-1]) / (0.08 * sr))[:, None]
        y[i0:i1] = (x[i0:i1] - h[i0:i1]) + h[i0:i1] * (1 - fade) + seg * fade   # the lows (kick, snare body) stay as they are; the highs fade to the copy and back
        print('   hats restored over %.1f-%.1f s (copied from %.1f s)' % (a, b, src))
    return y

def expand(x, sr, depth_db=3.0):
    h = highs(x, sr); low = x - h; e = env_db(h, sr); n = int(0.025 * sr)
    lo, hi = np.percentile(e, 12), np.percentile(e, 45)
    g = np.clip((e - lo) / (hi - lo), 0, 1) * (1 - 10 ** (-depth_db / 20)) + 10 ** (-depth_db / 20)
    gg = np.ones(len(x)); gg[:len(g) * n] = np.repeat(g, n)
    k = int(0.03 * sr); gg = np.convolve(np.pad(gg, (k, k), mode='edge'), np.ones(2 * k + 1) / (2 * k + 1), mode='valid')[:len(x)]
    return low + h * gg[:, None]

BPM = {'aurora': 119, 'aurora_b': 119}
for path in sys.argv[1:]:
    tmp = tempfile.mkdtemp(); wav = os.path.join(tmp, 'in.wav'); res = os.path.join(tmp, 'out.wav')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path, '-ar', '48000', '-ac', '2', wav], check=True)
    x, sr = sf.read(wav); n = len(x); name = os.path.basename(os.path.dirname(path))
    t3 = np.concatenate([x, x, x]); y = expand(fill_gaps(t3, sr, BPM.get(name, 119)), sr)[n:2 * n]
    sf.write(res, y, sr)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', res, '-c:a', 'libvorbis', '-q:a', '5', path], check=True)
    print(path, 'rms', round(float(np.sqrt(np.mean(x ** 2))), 4), '->', round(float(np.sqrt(np.mean(y ** 2))), 4))
