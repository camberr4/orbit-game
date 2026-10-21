#!/usr/bin/env python3
"""
Analyse the music tracks and write www/audio/tracks.json for the game.

  assets/music/aurora.wav          full mix for sector 0   (aurora, dust, ember, glacier, pulsar, void, menu)
  assets/music/aurora_drums.wav    optional stems: _drums, _bass, _synth (or _other)

For each track it measures: exact tempo, the first downbeat, key and scale, energy per bar, and loop points
(whole bars, intro skipped on repeat). Needs: python3, numpy, ffmpeg.   Usage: python3 tools/analyze-music.py
"""
import json, os, re, subprocess, sys, tempfile, wave
import numpy as np

SRC = os.path.join(os.path.dirname(__file__), '..', 'assets', 'music')
OUT = os.path.join(os.path.dirname(__file__), '..', 'www', 'audio')
NAMES = ['aurora', 'dust', 'ember', 'glacier', 'pulsar', 'void']          # sector ids 0..5
HINT = {'aurora': 108, 'dust': 112, 'ember': 118, 'glacier': 114, 'pulsar': 126, 'void': 124, 'menu': 90}
STEMS = ['drums', 'bass', 'synth', 'other']
SR = 22050

def decode(path):
    with tempfile.NamedTemporaryFile(suffix='.wav') as t:
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path, '-ac', '1', '-ar', str(SR), t.name], check=True)
        with wave.open(t.name) as w:
            raw = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    return raw

def encode(src, dst):
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '160k', dst], check=True)

def stft_mag(x, n=1024, hop=256):
    win = np.hanning(n)
    frames = 1 + (len(x) - n) // hop
    idx = np.arange(n)[None, :] + hop * np.arange(frames)[:, None]
    return np.abs(np.fft.rfft(x[idx] * win, axis=1)), hop

def onset_env(x):
    mag, hop = stft_mag(x)
    lm = np.log1p(30 * mag[:, 1:200])
    flux = np.maximum(0, np.diff(lm, axis=0)).sum(axis=1)
    flux = np.concatenate([[0], flux])
    flux -= np.convolve(flux, np.ones(43) / 43, mode='same')
    flux = np.maximum(flux, 0)
    return flux / (flux.max() + 1e-9), SR / hop            # envelope and its frame rate

def comb_score(env, fps, bpm, off):
    period = 60.0 / bpm * fps
    pos = off * fps + np.arange(0, (len(env) - off * fps) / period) * period
    pos = pos[pos < len(env) - 1]
    i = pos.astype(int); f = pos - i
    return float(np.mean(env[i] * (1 - f) + env[i + 1] * f))

def estimate_tempo(env, fps, hint):
    best = (0, hint, 0.0)
    for bpm in np.arange(hint * 0.82, hint * 1.18, 0.1):
        for off in np.arange(0, 60.0 / bpm, 0.01):
            sc = comb_score(env, fps, bpm, off)
            if sc > best[0]: best = (sc, bpm, off)
    _, bpm, off = best
    for b in np.arange(bpm - 0.3, bpm + 0.3, 0.01):             # refine
        for o in np.arange(off - 0.012, off + 0.012, 0.002):
            sc = comb_score(env, fps, b, max(0, o))
            if sc > best[0]: best = (sc, b, max(0, o))
    return best[1], best[2]

def lowpass(x, n=40):
    return np.convolve(x, np.ones(n) / n, mode='same')

def attack_times(x, bpm, off, count=48):
    """Precise attack time of the low-end (kick) around each predicted beat, from the waveform slope."""
    spb = 60.0 / bpm
    lo = lowpass(np.abs(x))
    step = SR // 500                                              # 2 ms
    env = np.sqrt(np.convolve(lo ** 2, np.ones(step) / step, mode='same'))[::step]
    d = np.diff(env, prepend=env[0])
    out = []
    for k in range(count):
        c = (off + k * spb) * 500
        lo_i, hi_i = int(c - 40), int(c + 40)
        if lo_i < 0 or hi_i >= len(d): continue
        out.append(((lo_i + int(np.argmax(d[lo_i:hi_i]))) / 500.0, k))
    return out

def pick_phase(x, bpm, off):
    """The comb fit cannot tell a kick from an off-beat hat: choose the phase with more low-end, then refine."""
    spb = 60.0 / bpm
    best = None
    for cand in (off, (off + spb / 2) % spb):
        t = attack_times(x, bpm, cand, 24)
        sc = sum(np.abs(lowpass(x))[int(a * SR): int(a * SR) + 600].mean() for a, _ in t if a * SR + 600 < len(x))
        if best is None or sc > best[0]: best = (sc, cand)
    cand = best[1]
    t = attack_times(x, bpm, cand, 48)
    if len(t) > 8:
        cand = float(np.median([a - k * spb for a, k in t])) - 0.012
        while cand < 0: cand += spb
    return cand

def downbeat(x, bpm, off):
    """Which of the four beats in a bar carries the most low-end (the kick on beat one)."""
    spb = 60.0 / bpm
    lo = np.abs(lowpass(x))
    score = np.zeros(4)
    for k in range(int((len(x) / SR - off) / spb)):
        i = int((off + k * spb) * SR)
        if i + 1200 < len(lo): score[k % 4] += lo[i:i + 1200].max()
    return int(np.argmax(score))

KEY_MAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KEY_MIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
def estimate_key(x):
    n = 8192; chroma = np.zeros(12)
    freqs = np.fft.rfftfreq(n, 1 / SR)
    ok = (freqs > 65) & (freqs < 2000)
    pc = np.round(12 * np.log2(freqs[ok] / 440) + 69).astype(int) % 12
    for s in range(0, len(x) - n, n * 2):
        m = np.abs(np.fft.rfft(x[s:s + n] * np.hanning(n)))[ok]
        np.add.at(chroma, pc, m)
    best = (-2, 0, 'minor')
    for r in range(12):
        for prof, mode in ((KEY_MAJ, 'major'), (KEY_MIN, 'minor')):
            c = np.corrcoef(chroma, np.roll(prof, r))[0, 1]
            if c > best[0]: best = (c, r, mode)
    return best[1], best[2]

def analyse(key, full, stems):
    x = full if full is not None else sum(stems.values())
    x = x / (np.abs(x).max() + 1e-9)
    dur = len(x) / SR
    env, fps = onset_env(x)
    bpm, off = estimate_tempo(env, fps, HINT.get(key, 110))
    spb = 60.0 / bpm
    off = pick_phase(x, bpm, off)
    db = downbeat(x, bpm, off)
    off = off + db * spb                                           # first downbeat
    while off - 4 * spb >= 0: off -= 4 * spb
    bar = 4 * spb
    nbars = int((dur - off) // bar)
    rms = np.array([np.sqrt(np.mean(x[int((off + b * bar) * SR):int((off + (b + 1) * bar) * SR)] ** 2)) for b in range(nbars)])
    energy = (rms / (np.percentile(rms, 95) + 1e-9)).clip(0, 1)
    intro = next((b for b in range(nbars) if energy[b] > 0.55), 0)
    loop_start_bar = min(intro, 8) // 4 * 4 if nbars > 24 else 0
    end = nbars
    while end > loop_start_bar + 8 and energy[end - 1] < 0.4: end -= 1
    end = loop_start_bar + (end - loop_start_bar) // 4 * 4
    # tempo drift check: compare the grid fit in the two halves of the track
    half = len(env) // 2
    drift = abs(comb_score(env[:half], fps, bpm, off % spb) - comb_score(env[half:], fps, bpm, (off - half / fps) % spb))
    pc, mode = estimate_key(x)
    scale = [0, 2, 3, 5, 7, 8, 10] if mode == 'minor' else [0, 2, 4, 5, 7, 9, 11]
    return {
        'bpm': round(float(bpm), 3), 'offset': round(float(off), 4), 'duration': round(dur, 2),
        'loopStart': round(off + loop_start_bar * bar, 4), 'loopEnd': round(off + end * bar, 4),
        'root': 48 + int(pc), 'scale': scale, 'mode': mode, 'bars': nbars,
        'energy': [round(float(e), 2) for e in energy], 'gridDrift': round(float(drift), 4),
    }

def main():
    os.makedirs(OUT, exist_ok=True)
    tracks = {}
    files = os.listdir(SRC) if os.path.isdir(SRC) else []
    for idx, name in enumerate(NAMES + ['menu']):
        key = str(idx) if name != 'menu' else 'menu'
        def find(suffix=''):
            for f in files:
                if re.fullmatch(re.escape(name + suffix) + r'\.(wav|mp3|flac|m4a|ogg)', f, re.I): return os.path.join(SRC, f)
        full = find(); stems = {s: find('_' + s) for s in STEMS if find('_' + s)}
        if not full and not stems: continue
        print(f'analysing {name} ...')
        fx = decode(full) if full else None
        sx = {s: decode(p) for s, p in stems.items()}
        if sx:
            n = min(len(v) for v in sx.values()); sx = {s: v[:n] for s, v in sx.items()}
        info = analyse(name, fx, sx)
        entry = dict(info)
        if full: encode(full, os.path.join(OUT, name + '.mp3')); entry['file'] = name + '.mp3'
        if stems:
            entry['stems'] = {}
            for s, p in stems.items():
                encode(p, os.path.join(OUT, f'{name}_{s}.mp3')); entry['stems'][s] = f'{name}_{s}.mp3'
        tracks[key] = entry
        flag = '  <-- tempo may drift, regenerate the track' if info['gridDrift'] > 0.08 else ''
        print(f"  {info['bpm']} BPM, first downbeat {info['offset']}s, key {['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][info['root'] % 12]} {info['mode']}, {info['bars']} bars, loop {info['loopStart']}-{info['loopEnd']}s{flag}")
    with open(os.path.join(OUT, 'tracks.json'), 'w') as f: json.dump(tracks, f)
    print(f'wrote {len(tracks)} track(s) to www/audio/tracks.json')

if __name__ == '__main__':
    main()
