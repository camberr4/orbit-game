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
HINT = {'aurora': 108, 'dust': 112, 'ember': 118, 'glacier': 114, 'pulsar': 126, 'void': 124, 'menu': 90, 'zen': 72}
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

def attack_times(x, bpm, off, count=None):
    """Attack time of the low-end (kick) around each predicted beat, from the waveform slope: [(time, k, strength)]."""
    spb = 60.0 / bpm
    lo = lowpass(np.abs(x), 60)                                   # kick band, below the arps and hats
    step = SR // 500                                              # 2 ms
    env = np.sqrt(np.convolve(lo ** 2, np.ones(step) / step, mode='same'))[::step]
    d = np.diff(env, prepend=env[0])
    out = []
    total = int((len(x) / SR - off) / spb) - 1
    for k in range(total if count is None else min(count, total)):
        c = (off + k * spb) * 500
        lo_i, hi_i = int(c - 40), int(c + 40)
        if lo_i < 0 or hi_i >= len(d): continue
        j = int(np.argmax(d[lo_i:hi_i]))
        out.append(((lo_i + j) / 500.0, k, float(d[lo_i + j])))
    return out

def kick_phase(x, bpm):
    """Beat phase from the kick alone: onsets in the 20-150 Hz band only, so arps, hats and pads cannot pull it off the beat."""
    n, hop = 2048, 256
    win = np.hanning(n)
    frames = 1 + (len(x) - n) // hop
    idx = np.arange(n)[None, :] + hop * np.arange(frames)[:, None]
    e = np.abs(np.fft.rfft(x[idx] * win, axis=1))[:, 2:14].sum(axis=1)
    flux = np.maximum(0, np.diff(e, prepend=e[0]))
    flux = flux / (flux.max() + 1e-9)
    fps = SR / hop
    spb = 60.0 / bpm
    best = (-1, 0.0)
    for off in np.arange(0, spb, 0.004):
        sc = comb_score(flux, fps, bpm, off)
        if sc > best[0]: best = (sc, off)
    return float(best[1] + (n / 2) / SR - 0.004 + 0.03) % spb   # window centre = time of the attack (+ measured bias)

def downbeat(x, bpm, off):
    """Which of the four beats in a bar carries the most low-end (the kick on beat one)."""
    spb = 60.0 / bpm
    lo = np.abs(lowpass(x, 60))
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
    key = re.sub(r'_[b-d]$', '', key)
    x = full if full is not None else sum(stems.values())
    x = x / (np.abs(x).max() + 1e-9)
    dur = len(x) / SR
    env, fps = onset_env(x)
    bpm, off = estimate_tempo(env, fps, HINT.get(key, 110))
    spb = 60.0 / bpm
    off = kick_phase(x, bpm)
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
    # phrases: the song cut into equal bar-aligned chunks (8 bars) so the game can re-sequence them while you play.
    # Each start is snapped to the real kick attack nearby, so even a slightly drifting take lines up on the beat.
    P = 8 if nbars >= 24 else 4
    lo = lowpass(np.abs(x)); step = SR // 500
    kenv = np.sqrt(np.convolve(lo ** 2, np.ones(step) / step, mode='same'))[::step]; kd = np.diff(kenv, prepend=kenv[0])
    def snap(t):
        i0, i1 = int((t - 0.07) * 500), int((t + 0.07) * 500)
        if i0 < 0 or i1 >= len(kd): return t
        j = int(np.argmax(kd[i0:i1])); return round((i0 + j) / 500.0 - 0.012, 4) if kd[i0 + j] > 0.02 * (kd.max() + 1e-9) else t
    phrases = []
    for i in range(nbars // P):
        e = float(np.mean(energy[i * P:(i + 1) * P]))
        flag = 'intro' if i == 0 and e < 0.5 else 'outro' if i == nbars // P - 1 and e < 0.45 else ''
        phrases.append([snap(off + i * P * bar), round(e, 2), flag])
    # tempo drift check: does the kick grid still fit in the second half of the track?
    h = len(x) // 2
    p1, p2 = kick_phase(x[:h], bpm), kick_phase(x[h:], bpm)
    drift = abs(((p2 - (p1 - h / SR)) % spb + spb / 2) % spb - spb / 2)
    pc, mode = estimate_key(x)
    scale = [0, 2, 3, 5, 7, 8, 10] if mode == 'minor' else [0, 2, 4, 5, 7, 9, 11]
    return {
        'bpm': round(float(bpm), 3), 'offset': round(float(off), 4), 'duration': round(dur, 2),
        'loopStart': round(off + loop_start_bar * bar, 4), 'loopEnd': round(off + end * bar, 4),
        'phraseBars': P, 'phrases': phrases,
        'root': 48 + int(pc), 'scale': scale, 'mode': mode, 'bars': nbars,
        'energy': [round(float(e), 2) for e in energy], 'gridDrift': round(float(drift), 4),
    }

def find_file(files, base):
    for f in files:
        if re.fullmatch(re.escape(base) + r'\.(wav|mp3|flac|m4a|ogg)', f, re.I): return os.path.join(SRC, f)

def analyse_variant(files, base, hint_key, out_name):
    """One take (a full mix and/or stems). Returns the tracks.json entry for it."""
    full = find_file(files, base)
    stems = {s: find_file(files, f'{base}_{s}') for s in STEMS if find_file(files, f'{base}_{s}')}
    if not full and not stems: return None
    fx = decode(full) if full else None
    sx = {s: decode(p) for s, p in stems.items()}
    if sx:
        n = min(len(v) for v in sx.values()); sx = {s: v[:n] for s, v in sx.items()}
    entry = analyse(hint_key, fx, sx)
    if full: encode(full, os.path.join(OUT, out_name + '.mp3')); entry['file'] = out_name + '.mp3'
    if stems:
        entry['stems'] = {}
        for s, p in stems.items():
            encode(p, os.path.join(OUT, f'{out_name}_{s}.mp3')); entry['stems'][s] = f'{out_name}_{s}.mp3'
    return entry

def main():
    os.makedirs(OUT, exist_ok=True)
    tracks = {}
    files = os.listdir(SRC) if os.path.isdir(SRC) else []
    for idx, name in enumerate(NAMES + ['menu', 'zen']):
        key = str(idx) if idx < len(NAMES) else name
        variants = []
        for suffix in ('', '_b', '_c', '_d'):             # extra takes of the same sector at the same BPM and key
            e = analyse_variant(files, name + suffix, name, name + suffix)
            if e: variants.append(e); print(f'analysed {name}{suffix}')
        if not variants: continue
        entry = dict(variants[0])                          # the first take sets the beat grid; others are re-timed to it
        entry['variants'] = variants
        tracks[key] = entry
        for i, info in enumerate(variants):
            flag = '  <-- tempo may drift, regenerate this take' if info['gridDrift'] > 0.03 else ''
            print(f"  take {i + 1}: {info['bpm']} BPM, first downbeat {info['offset']}s, key {['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][info['root'] % 12]} {info['mode']}, {info['bars']} bars, {len(info['phrases'])} phrases{flag}")
        if len(variants) > 1:
            d = max(abs(v['bpm'] - variants[0]['bpm']) for v in variants)
            if d > 3: print(f'  note: takes differ by {d:.1f} BPM; they are time-stretched slightly to fit, regenerate if it sounds off')
    # ambient layers and stings for events (no tempo needed): assets/music/fx/<name>.wav
    fxdir = os.path.join(SRC, 'fx'); fxout = os.path.join(OUT, 'fx'); fx = {}
    if os.path.isdir(fxdir):
        os.makedirs(fxout, exist_ok=True)
        for f in os.listdir(fxdir):
            m = re.fullmatch(r'(.+)\.(wav|mp3|flac|m4a|ogg)', f, re.I)
            if m: encode(os.path.join(fxdir, f), os.path.join(fxout, m.group(1) + '.mp3')); fx[m.group(1)] = 'fx/' + m.group(1) + '.mp3'; print('fx', m.group(1))
    if fx: tracks['fx'] = fx
    with open(os.path.join(OUT, 'tracks.json'), 'w') as f: json.dump(tracks, f)
    print(f'wrote {len(tracks)} entr(ies) to www/audio/tracks.json')

if __name__ == '__main__':
    main()
