#!/usr/bin/env python3
"""Aurora Reach: dreamy space synthwave, 108 BPM, A minor, four on the floor.
A numpy synth renders six stems (kick, hats, bass, pad, arp, lead) into seamless 32-bar loops. The arrangement lives inside
the stems (groove, lift, breakdown, build with risers and fills), so any combination of them sounds like a produced track.
Run: python3 tools/music/aurora_electro.py [stem ...]   (needs numpy, scipy, soundfile, ffmpeg)"""
import os, subprocess, sys
from functools import lru_cache
import numpy as np
from scipy import signal
import soundfile as sf

SR = 44100
BPM = 108.0
BEAT = 60.0 / BPM
BARS = 32
LOOP = BARS * 4 * BEAT
L = int(round(LOOP * SR))
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'www', 'audio', 'aurora')
TMP = '/tmp/aurora_electro'
os.makedirs(OUT, exist_ok=True); os.makedirs(TMP, exist_ok=True)
rng = np.random.default_rng(11)
mtof = lambda m: 440.0 * 2 ** ((m - 69) / 12)
bar_t = lambda b: b * 4 * BEAT

# ------------------------------------------------------------------ harmony
CH = {  # pad voicing (low to high), bass root
    'Am9': ([45, 52, 57, 60, 64], 33), 'Fmaj7': ([41, 48, 57, 60, 64], 29), 'Cmaj9': ([48, 52, 59, 62, 67], 36), 'G69': ([43, 50, 57, 62, 66], 31),
    'F#11': ([41, 48, 57, 60, 67], 29), 'Dm9': ([50, 53, 57, 60, 64], 38), 'Em7': ([40, 47, 55, 59, 62], 28), 'Fmaj9': ([41, 48, 57, 60, 64], 29),
    'Gadd9': ([43, 50, 55, 62, 69], 31),
}
PROG = [['Am9', 'Fmaj7', 'Cmaj9', 'G69'], ['Am9', 'F#11', 'Dm9', 'Em7'], ['Fmaj9', 'Cmaj9', 'Gadd9', 'Am9'], ['Dm9', 'Em7', 'Fmaj7', 'Gadd9']]
# lead hook per phrase: (midi, start beat within the 32-beat phrase, length in beats)
HOOK = [
    [(76, .5, 1.5), (74, 2, .5), (72, 2.5, 1.5), (69, 4, 1.5), (72, 5.5, .5), (74, 6, 2), (72, 8.5, 1.5), (77, 10, 1), (76, 11, .5), (74, 11.5, .5), (72, 12, 1.5), (69, 13.5, .5), (72, 14, 2),
     (79, 16.5, 1.5), (76, 18, .5), (74, 18.5, 1), (72, 19.5, .5), (76, 20, 2), (74, 22, .5), (72, 22.5, 1.5), (74, 24.5, 1.5), (71, 26, .5), (67, 26.5, 1.5), (69, 28, 1), (71, 29, 1), (74, 30, 2)],
    [(81, 0, 1), (79, 1, .5), (76, 1.5, 1), (79, 2.5, .5), (81, 3, 1), (84, 4, 1.5), (81, 5.5, .5), (79, 6, 2), (77, 8, 1.5), (79, 9.5, .5), (81, 10, 1), (84, 11, 1), (81, 12, .5), (79, 12.5, .5), (77, 13, 1), (76, 14, 2),
     (77, 16, 1), (74, 17, .5), (77, 17.5, 1), (81, 18.5, 1.5), (79, 20, 1), (77, 21, 1), (74, 22, 2), (76, 24, 1.5), (79, 25.5, .5), (83, 26, 1.5), (81, 27.5, .5), (79, 28, 1), (76, 29, 1), (71, 30, 2)],
    [(84, 0, 2), (83, 2, .5), (81, 2.5, .5), (79, 3, 1), (81, 4, 2), (77, 6, 2), (79, 8, 2), (84, 10, 2), (83, 12, 1), (79, 13, 1), (76, 14, 2),
     (83, 16, 2), (81, 18, 1), (83, 19, 1), (79, 20, 2), (74, 22, 2), (81, 24, 3), (76, 27, 1), (72, 28, 2), (69, 30, 2)],
    [(77, 0, 3), (76, 3, 1), (74, 4, 4), (71, 8, 2), (74, 10, 2), (76, 12, 4), (72, 16, 3), (69, 19, 1), (72, 20, 2), (76, 22, 2), (74, 24, 2), (71, 26, 2), (67, 28, 2), (69, 30, 2)],
]
def chords(): return [(p * 8 + c * 2, PROG[p][c], p, c) for p in range(4) for c in range(4)]
def kick_on(bar): return not (24 <= bar < 28)

# ------------------------------------------------------------------ dsp helpers
@lru_cache(maxsize=None)
def _sos(kind, fc, order):
    fc = min(fc, SR * 0.45)
    return signal.butter(order, fc / (SR / 2), kind, output='sos')
def lp(x, fc, order=2): return signal.sosfilt(_sos('low', int(fc), order), x)
def hp(x, fc, order=2): return signal.sosfilt(_sos('high', int(fc), order), x)
def bp(x, lo, hi): return signal.sosfilt(signal.butter(2, [lo / (SR / 2), hi / (SR / 2)], 'band', output='sos'), x)
def polyblep(ph, dt):
    out = np.zeros_like(ph)
    m = ph < dt; t = ph[m] / dt[m]; out[m] = t + t - t * t - 1
    m = ph > 1 - dt; t = (ph[m] - 1) / dt[m]; out[m] = t * t + t + t + 1
    return out
def saw(f, n, ph0=0.0, cents=None):
    fr = np.full(n, f) if cents is None else f * 2 ** (cents / 1200)
    ph = (ph0 + np.cumsum(fr) / SR) % 1.0
    return 2 * ph - 1 - polyblep(ph, fr / SR)
def adsr(n, a, d, s, r):
    t = np.arange(n) / SR
    e = np.where(t > a, s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)), t / max(a, 1e-4))
    return e * np.clip((n / SR - t) / max(r, 1e-4), 0, 1)
def sat(x, drive): return np.tanh(x * drive) / np.tanh(drive)
def place(buf, x, t0, pan=0.0, g=1.0):
    i = int(round(t0 * SR))
    if i < 0: x = x[-i:]; i = 0
    if i >= buf.shape[0] or len(x) == 0: return
    n = min(len(x), buf.shape[0] - i)
    buf[i:i + n, 0] += x[:n] * np.cos((pan + 1) * np.pi / 4) * 1.4142 * g
    buf[i:i + n, 1] += x[:n] * np.sin((pan + 1) * np.pi / 4) * 1.4142 * g
def make_ir(sec=2.8, damp=3200, pre=0.022):
    n = int(sec * SR); t = np.arange(n) / SR
    ir = np.zeros((n, 2))
    for c in range(2):
        nz = rng.standard_normal(n) * np.exp(-t / (sec * 0.2))
        ir[:, c] = lp(nz, damp) * (1 - np.exp(-t / 0.03))
    ir[: int(pre * SR)] = 0
    return ir / np.sqrt((ir ** 2).sum() / 2)
IR = make_ir()
def reverb(x, amt):
    return np.stack([signal.fftconvolve(x[:, c], IR[:, c])[: x.shape[0]] for c in range(2)], 1) * amt * 0.11
def pingpong(x, time, fb=0.4, taps=7, tone=2400):
    d = int(time * SR); out = np.zeros_like(x)
    xl = lp(x[:, 0] + x[:, 1], tone) * 0.5
    for k in range(1, taps + 1):
        s = d * k
        if s < len(x): out[s:, k % 2] += xl[: len(x) - s] * fb ** k
    return out
def stereo_lp(b, fc): return np.stack([lp(b[:, 0], fc), lp(b[:, 1], fc)], 1)
TOTAL = 3 * L + 3 * SR
def new(): return np.zeros((TOTAL, 2))
def reps(): return range(3)
def duck(depth_by_bar, tau=0.2):
    t = np.arange(TOTAL) / SR
    ph = (t % BEAT); bar = ((t % LOOP) // (4 * BEAT)).astype(int)
    dep = np.array([depth_by_bar(b) for b in range(BARS)])[bar]
    pre = 1 - np.exp(-ph / 0.006)
    return (1 - dep * np.exp(-ph / tau)) * (0.35 + 0.65 * pre) * np.clip((BEAT - ph) / 0.012 + 0.0, 0, 1) + 0 if False else 1 - dep * np.exp(-ph / tau) * (1 - 0 * pre)
def humanize(): return rng.normal(0, 0.006)

# ------------------------------------------------------------------ stems
def snare(n=0.3):
    k = int(n * SR); t = np.arange(k) / SR
    body = np.sin(2 * np.pi * 185 * t) * np.exp(-t / 0.05) * 0.45
    nz = bp(rng.standard_normal(k), 1300, 3600) * np.exp(-t / 0.09)
    return lp(body + nz * 0.9, 5200)
def clap():
    k = int(0.4 * SR); t = np.arange(k) / SR
    env = sum(np.exp(-np.clip(t - o, 0, None) / 0.011) * (t >= o) for o in (0, 0.012, 0.025)) * 0.5 + np.exp(-t / 0.12) * 0.55 * (t >= 0.03)
    return bp(rng.standard_normal(k), 1000, 3000) * env
def kick_stem():
    buf = new()
    n = int(0.55 * SR); t = np.arange(n) / SR
    f = 46 + 95 * np.exp(-t / 0.032)
    k = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.23)
    k += 0.3 * lp(rng.standard_normal(n), 1400) * np.exp(-t / 0.005)
    k = sat(lp(k, 3500), 1.5)
    cl, sn = clap(), snare()
    boom_n = int(2.4 * SR); tb = np.arange(boom_n) / SR
    boom = np.sin(2 * np.pi * (38 + 40 * np.exp(-tb / 0.25)) * tb) * np.exp(-tb / 0.8)
    for r in reps():
        for b in range(BARS):
            for q in range(4):
                t0 = r * LOOP + bar_t(b) + q * BEAT
                if kick_on(b): place(buf, k, t0 + humanize() * 0.3, 0, 0.95 if q == 0 else 0.82)
                if q in (1, 3) and kick_on(b) and not (b % 8 == 7 and q == 3): place(buf, cl, t0 + humanize(), 0.05, 0.3)
            if b % 8 == 0 and b in (0, 16): place(buf, boom, r * LOOP + bar_t(b), 0, 0.5)
            if b == 24: place(buf, boom, r * LOOP + bar_t(b), 0, 0.45)
            if b % 8 == 7 or b == 31:   # fills: a snare roll that speeds up into the next phrase
                for i in range(8 if b == 31 else 4):
                    step = BEAT / 4 if b != 31 else BEAT / 2 if i < 4 else BEAT / 4
                    tt = bar_t(b) + 3 * BEAT + (i * BEAT / 4 if b != 31 else (i * BEAT / 4) * 1.0)
                    if b == 31: tt = bar_t(b) + 2 * BEAT + i * BEAT / 4
                    place(buf, sn, r * LOOP + tt, 0, 0.18 + 0.05 * i)
    buf = buf * 1.0
    return buf
def hats_stem():
    buf = new()
    n = int(0.3 * SR); t = np.arange(n) / SR
    ch = lp(hp(rng.standard_normal(n), 6000), 9000) * np.exp(-t / 0.02)
    oh = lp(hp(rng.standard_normal(n), 5600), 8500) * np.exp(-t / 0.085)
    crash_n = int(3.2 * SR); tc = np.arange(crash_n) / SR
    crash = lp(hp(rng.standard_normal(crash_n), 3500), 8000) * np.exp(-tc / 0.9)
    for r in reps():
        for b in range(BARS):
            ph = b // 8
            for k in range(16):
                t0 = r * LOOP + bar_t(b) + k * BEAT / 4 + humanize() * 0.5
                if not kick_on(b) and k % 4 != 0: continue
                if k % 4 == 2: place(buf, oh, t0, 0.12, 0.5)
                elif k % 2 == 1 or (ph == 2 and k % 4 == 0): place(buf, ch, t0, -0.1, 0.16 + 0.1 * (k % 4 == 3) + 0.04 * rng.random())
            if b in (0, 16): place(buf, crash, r * LOOP + bar_t(b), 0, 0.3)
        for b0 in (14, 30):   # riser into the next phrase
            n_r = int(2 * 4 * BEAT * SR); tr = np.arange(n_r) / SR; u = tr / tr[-1]
            nz = rng.standard_normal(n_r)
            sweep = np.zeros(n_r)
            for lo, hi_, w in ((300, 1200, 1.0), (900, 3500, 0.7), (2500, 6500, 0.4)):
                sweep += bp(nz, lo, hi_) * w * u ** 2.2
            place(buf, sweep * 0.5 * np.minimum(1, (1 - u) * 18), r * LOOP + bar_t(b0), 0, 0.5)
    return buf[:, :1].repeat(2, 1) * 0 + buf
def bass_stem():
    buf = new()
    for r in reps():
        for b, name, ph, ci in chords():
            root = CH[name][1] + 12
            for bar in range(2):
                bb = b + bar
                if not kick_on(bb):
                    n = int(4 * BEAT * SR * 0.98); f = mtof(root - 12)
                    x = np.sin(2 * np.pi * f * np.arange(n) / SR) * adsr(n, 0.05, 0.8, 0.8, 0.3)
                    place(buf, x * 0.7, r * LOOP + bar_t(bb)); continue
                pat = [0, 0, 12, 0, 0, 12, 0, 7] if ph < 2 else [0, 12, 0, 12, 0, 7, 0, 12]
                if ph >= 2 and bar == 1: pat = [0, 0, 12, 0, 0, 12, 7, 5]
                if ph == 3 and bb % 8 == 7: pat = [0, 0, 0, 0, 7, 7, 12, 12]
                for i, o in enumerate(pat):
                    t0 = r * LOOP + bar_t(bb) + i * BEAT / 2; n = int(BEAT / 2 * SR * 0.96)
                    f = mtof(root + o); tt = np.arange(n) / SR
                    saw_part = lp(saw(f, n) * 0.55 + saw(f * 1.003, n, 0.4) * 0.3, 260 + 260 * (o == 12) + 120 * (ph >= 2), 3)
                    sub = np.sin(2 * np.pi * f * 0.5 * tt) if f > 40 else 0
                    x = (saw_part * 0.9 + sub * 0.55) * adsr(n, 0.006, 0.25, 0.65, 0.04)
                    place(buf, sat(x, 2.2), t0 + humanize() * 0.3)
    t = np.arange(TOTAL) / SR; ph = t % BEAT
    d = 1 - 0.6 * np.exp(-ph / 0.19) * np.where(np.array([kick_on(b) for b in range(BARS)])[((t % LOOP) // (4 * BEAT)).astype(int)], 1, 0)
    return stereo_lp(buf * d[:, None], 2600)
def pad_stem():
    buf = new()
    t = np.arange(TOTAL) / SR
    for r in reps():
        for b, name, ph, ci in chords():
            vo = CH[name][0]; n = int((8 * BEAT + 1.4) * SR); tt = np.arange(n) / SR
            cut = [650, 800, 1000, 1250][ph] + 120 * ci            # the filter opens as the track builds
            lfo = 1 + 0.25 * np.sin(2 * np.pi * 0.11 * tt + ci)
            for i, p in enumerate(vo):
                f = mtof(p)
                for dc, pan in ((-13, -0.85), (-7, -0.5), (-2, -0.15), (3, 0.2), (8, 0.55), (14, 0.9)):
                    drift = dc + 2.5 * np.sin(2 * np.pi * (0.07 + 0.02 * i) * tt + rng.random() * 6)
                    v = saw(f, n, ph0=rng.random(), cents=drift)
                    x = v * adsr(n, 1.1, 1.0, 0.85, 1.3)
                    x = lp(x, cut) if False else x
                    place(buf, lp(x, cut, 2), r * LOOP + bar_t(b), pan, 0.045)
            sub = np.sin(2 * np.pi * mtof(vo[0]) * tt) * adsr(n, 1.2, 1.0, 0.8, 1.3)
            place(buf, sub, r * LOOP + bar_t(b), 0, 0.12)
            air = lp(hp(rng.standard_normal(n), 400), 1800) * adsr(n, 1.4, 1.0, 0.5, 1.3)
            place(buf, air, r * LOOP + bar_t(b), 0, 0.012 * (1 + ph))
    ph_ = t % BEAT; barI = ((t % LOOP) // (4 * BEAT)).astype(int)
    kon = np.array([kick_on(b) for b in range(BARS)])[barI]
    d = 1 - (0.5 * kon + 0.12 * (~kon)) * np.exp(-ph_ / 0.21)
    return sat(stereo_lp(buf * d[:, None], 3800), 1.3)
def arp_stem():
    buf = new()
    for r in reps():
        for b, name, ph, ci in chords():
            vo = CH[name][0]
            tones = sorted(set(vo[1:] + [x + 12 for x in vo[2:]]))
            tones = [t for t in tones if 52 <= t <= 79]
            for bar in range(2):
                bb = b + bar
                shape = [(0, 2, 1, 3, 2, 4, 3, 5), (0, 1, 2, 4, 3, 2, 1, 3), (1, 3, 2, 4, 3, 5, 4, 2)][(bb + ph) % 3]
                if not kick_on(bb) and bb % 2 == 0: continue
                grow = (bb % 8) / 7
                for k in range(16):
                    p = tones[min(shape[k % 8], len(tones) - 1)]
                    if ph == 2 and k % 8 == 7: p += 12
                    t0 = r * LOOP + bar_t(bb) + k * BEAT / 4 + humanize() * 0.4; n = int(0.24 * SR)
                    f = mtof(p); tt = np.arange(n) / SR
                    x = saw(f, n) * 0.6 + saw(f * 1.005, n, 0.3) * 0.4
                    e = np.exp(-tt / (0.06 + 0.04 * grow))
                    x = (lp(x, 1100 + 500 * ph, 2) * (1 - e) + lp(x, 2400 + 1700 * grow + 600 * ph, 2) * e) * adsr(n, 0.002, 0.09, 0.12, 0.05)
                    acc = 1.0 if k % 4 == 0 else 0.7 if k % 2 == 0 else 0.55
                    place(buf, x, t0, -0.3 + 0.6 * ((k % 8) / 7), 0.17 * acc * (0.85 + 0.3 * rng.random()))
    t = np.arange(TOTAL) / SR; ph_ = t % BEAT
    d = 1 - 0.4 * np.exp(-ph_ / 0.15)
    return buf * d[:, None]
def lead_stem():
    buf = new()
    for r in reps():
        for p in range(4):
            for pitch, st, ln in HOOK[p]:
                t0 = r * LOOP + p * 8 * 4 * BEAT + st * BEAT + humanize()
                n = int((ln * BEAT + 0.6) * SR); tt = np.arange(n) / SR
                f = mtof(pitch - 12) * 2 ** ((rng.normal(0, 3)) / 1200)
                vib = 7 * np.clip((tt - 0.25) / 0.5, 0, 1) * np.sin(2 * np.pi * 5.2 * tt)
                phs = 2 * np.pi * np.cumsum(f * 2 ** (vib / 1200)) / SR
                idx = 1.9 * np.exp(-tt / 0.5)
                x = np.sin(phs + idx * np.sin(2 * phs)) * 0.75 + np.sin(phs * 0.5) * 0.3 + np.sin(phs * 2.003) * 0.12 * np.exp(-tt / 0.3)
                body = lp(saw(f, n) * 0.5 + saw(f * 1.004, n, 0.5) * 0.4, 1500) * adsr(n, 0.04, 0.4, 0.5, 0.2) * 0.35
                x = lp(x + body, 3400)
                env = np.minimum(1, tt / 0.007) * (0.3 + 0.7 * np.exp(-tt / (0.9 if p < 3 else 1.5))) * np.clip((ln * BEAT + 0.4 - tt) / 0.5, 0, 1)
                place(buf, x * env, t0, 0.08, 0.36 * (0.9 + 0.2 * rng.random()))
    return buf

STEMS = {  # builder, reverb, delay, target rms, mono, final lowpass
    'kick': (kick_stem, 0.06, 0.0, 0.046, True, 12000),
    'hats': (hats_stem, 0.12, 0.10, 0.018, True, 9500),
    'bass': (bass_stem, 0.0, 0.0, 0.055, True, 5000),
    'pad':  (pad_stem, 0.95, 0.0, 0.075, False, 6500),
    'arp':  (arp_stem, 0.6, 0.6, 0.07, False, 6000),
    'lead': (lead_stem, 0.9, 0.7, 0.08, False, 5500),
}
def ramp(*pts):   # per-bar gain from (bar, value) points, smoothly interpolated
    xs, ys = zip(*pts); return np.interp(np.arange(BARS), xs, ys)
ARR = {   # the arrangement: how loud each layer is in each of the 32 bars (groove, lift, breakdown, build)
    'arp':  ramp((0, .7), (7, .9), (8, .95), (15, 1.05), (16, 1.2), (23, 1.2), (24, .6), (27, .6), (28, .9), (31, 1.05)),
    'lead': ramp((0, .85), (7, .9), (8, .95), (15, 1.0), (16, 1.2), (23, 1.2), (24, 1.0), (31, 1.0)),
    'pad':  ramp((0, .9), (7, .95), (8, 1.0), (15, 1.05), (16, 1.2), (23, 1.2), (24, 1.15), (27, 1.15), (28, 1.0), (31, 1.0)),
    'hats': ramp((0, .6), (3, .7), (7, .85), (8, .95), (15, 1.0), (16, 1.2), (23, 1.2), (24, .4), (27, .4), (28, 1.0), (31, 1.0)),
    'bass': ramp((0, .85), (7, .9), (8, .95), (15, 1.0), (16, 1.1), (23, 1.1), (24, .85), (31, .95)),
}
def arrange(name, dry):
    if name not in ARR: return dry
    t = (np.arange(dry.shape[0]) / SR) % LOOP
    centers = (np.arange(BARS) + 0.5) * 4 * BEAT
    g = np.interp(t, np.concatenate([centers - LOOP, centers, centers + LOOP]), np.tile(ARR[name], 3))
    return dry * g[:, None]
def render(name):
    fn, rv, dl, target, mono, fc = STEMS[name]
    dry = arrange(name, fn())
    wet = dry.copy()
    if rv: wet += reverb(dry, rv)
    if dl: wet += pingpong(dry, BEAT * 0.75) * dl
    if mono: wet = np.repeat(wet.mean(1, keepdims=True), 2, 1)
    wet = stereo_lp(wet, fc)
    seg = wet[L:2 * L]; seg = seg - seg.mean(0)
    seg *= target / max(np.sqrt(np.mean(seg ** 2)), 1e-9)
    pk = np.abs(seg).max()
    if pk > 0.9: seg *= 0.9 / pk
    wav = f'{TMP}/{name}.wav'; sf.write(wav, seg, SR)
    ac = ['-ac', '1'] if mono else []
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav] + ac + ['-c:a', 'libvorbis', '-q:a', '4', f'{OUT}/{name}.ogg'], check=True)
    m = seg.mean(1); sp = np.abs(np.fft.rfft(m[:SR * 20])) ** 2; fr = np.fft.rfftfreq(SR * 20, 1 / SR)
    print(f'{name:5s} rms {np.sqrt(np.mean(m**2)):.3f} peak {pk:.2f} >2k {100*sp[fr>2000].sum()/sp.sum():.1f}% >5k {100*sp[fr>5000].sum()/sp.sum():.2f}%', flush=True)
if __name__ == '__main__':
    for n in (sys.argv[1:] or STEMS): render(n)
