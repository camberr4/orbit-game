#!/usr/bin/env python3
"""Aurora Reach: composes the stems and renders them with FluidSynth + FluidR3_GM into seamless loops.
Run: python3 tools/music/aurora.py   (needs fluidsynth, fluid-soundfont-gm, ffmpeg, pretty_midi, soundfile, numpy)"""
import os, random, subprocess, sys
import numpy as np, pretty_midi as pm, soundfile as sf

BPM = 108.0
BEAT = 60.0 / BPM
BARS = 32
LOOP = BARS * 4 * BEAT
SR = 44100
SF2 = '/usr/share/sounds/sf2/FluidR3_GM.sf2'
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'www', 'audio', 'aurora')
TMP = '/tmp/aurora_stems'
os.makedirs(OUT, exist_ok=True); os.makedirs(TMP, exist_ok=True)
R = random.Random(7)

# chords: (name, voicing for pad (low to high), bass root)
CH = {
    'Am9':   ([45, 52, 59, 60, 64], 33),
    'Fmaj7': ([41, 48, 57, 60, 64], 29),
    'Cmaj9': ([48, 55, 59, 62, 64], 36),
    'G69':   ([43, 50, 57, 62, 64], 31),
    'F#11':  ([41, 48, 57, 60, 67], 29),
    'Dm9':   ([50, 53, 57, 60, 64], 38),
    'Em7':   ([40, 47, 55, 59, 62], 28),
    'Fmaj9': ([41, 48, 57, 60, 64], 29),
    'Gadd9': ([43, 50, 55, 62, 69], 31),
}
PROG = [  # 4 phrases x 4 chords x 2 bars
    ['Am9', 'Fmaj7', 'Cmaj9', 'G69'],
    ['Am9', 'F#11', 'Dm9', 'Em7'],
    ['Fmaj9', 'Cmaj9', 'Gadd9', 'Am9'],
    ['Dm9', 'Em7', 'Fmaj7', 'Gadd9'],
]
# melody: (midi pitch or None for rest, beats) per chord (8 beats each)
MEL = [
    [[(76, 3), (74, 1), (72, 2), (69, 2)], [(72, 2), (77, 2), (76, 2), (72, 2)], [(79, 3), (76, 1), (74, 2), (72, 2)], [(74, 3), (71, 1), (67, 2), (69, 2)]],
    [[(81, 2), (79, 2), (76, 4)], [(77, 3), (79, 1), (81, 2), (79, 2)], [(77, 2), (74, 2), (72, 2), (74, 2)], [(76, 3), (79, 1), (76, 2), (71, 2)]],
    [[(84, 4), (81, 2), (79, 2)], [(84, 3), (83, 1), (79, 4)], [(83, 4), (81, 2), (79, 2)], [(81, 6), (76, 2)]],
    [[(77, 3), (76, 1), (74, 4)], [(71, 2), (74, 2), (76, 4)], [(72, 3), (69, 1), (72, 4)], [(74, 2), (71, 2), (67, 4)]],
]

def bar_t(b): return b * 4 * BEAT

def chord_list():
    out = []
    for p in range(4):
        for c in range(4):
            out.append((p * 8 + c * 2, PROG[p][c], p, c))
    return out

def mk(program, drum=False):
    m = pm.PrettyMIDI(initial_tempo=BPM)
    inst = pm.Instrument(program=program, is_drum=drum)
    m.instruments.append(inst)
    return m, inst

def cc(inst, num, val, t=0.0): inst.control_changes.append(pm.ControlChange(num, val, t))

def note(inst, p, t0, t1, v):
    inst.notes.append(pm.Note(velocity=int(max(1, min(127, v))), pitch=int(p), start=max(0, t0), end=max(t1, max(0, t0) + 0.06)))

def humanize(): return R.uniform(-0.012, 0.012)

stems = {}

# ---- pad: warm pad + (in the lift) choir on top, long overlapping chords
m, pad = mk(89); cc(pad, 91, 110); cc(pad, 93, 60); cc(pad, 7, 100)
m2 = None
choir = pm.Instrument(program=52); m.instruments.append(choir); cc(choir, 91, 120); cc(choir, 7, 100)
for b, name, ph, ci in chord_list():
    vo = CH[name][0]; t0 = bar_t(b); t1 = bar_t(b + 2) + 0.9
    for i, p in enumerate(vo):
        note(pad, p, t0 + i * 0.03, t1, 52 + (i == 0) * 6)
    if ph in (2, 3):
        for p in (vo[2] + 12, vo[3] + 12, vo[4] + 12 if vo[4] < 70 else vo[4]):
            note(choir, p, t0 + 0.05, bar_t(b + 2) + 1.2, 38 if ph == 3 else 46)
stems['pad'] = m

# ---- harp: rolling arpeggios, each bar a slightly different shape
m, harp = mk(46); cc(harp, 91, 100); cc(harp, 7, 100)
SHAPES = [[0, 2, 4, 3, 5, 4, 2, 3], [0, 1, 3, 4, 3, 2, 4, 5], [0, 2, 3, 5, 4, 3, 2, 1], [1, 3, 5, 4, 6, 5, 3, 2]]
for b, name, ph, ci in chord_list():
    vo = CH[name][0]
    seq = [vo[0] + 12, vo[1] + 12, vo[2], vo[3], vo[4], vo[3] + 12, vo[4] + 12, vo[2] + 12]
    seq = sorted(set([vo[1], vo[2], vo[3], vo[4], vo[2] + 12, vo[3] + 12, vo[4] + 12]))
    for bar in range(2):
        shape = SHAPES[(b + bar + ph) % 4]
        for i, s in enumerate(shape):
            t = bar_t(b + bar) + i * BEAT / 2 + humanize()
            acc = 58 if i % 4 == 0 else 44 if i % 2 == 0 else 36
            note(harp, seq[min(s, len(seq) - 1)], t, t + BEAT * 2.2, acc + R.randint(-4, 4))
stems['harp'] = m

# ---- bass: fretless, root on the bar, a fifth to lean into the next chord
m, bass = mk(35); cc(bass, 91, 60); cc(bass, 7, 110)
for b, name, ph, ci in chord_list():
    root = CH[name][1]; fifth = root + 7
    for bar in range(2):
        t = bar_t(b + bar)
        note(bass, root, t, t + BEAT * 3.2, 62)
        if bar == 1: note(bass, fifth, t + BEAT * 3, t + BEAT * 3.9, 42)
        else: note(bass, root + 12, t + BEAT * 2.5, t + BEAT * 3.3, 38)
stems['bass'] = m

# ---- melody: soft flute, phrased, with a gentle vibrato-ish expression swell
m, mel = mk(73); cc(mel, 91, 120); cc(mel, 7, 105)
for p in range(4):
    for c in range(4):
        t = bar_t(p * 8 + c * 2); beat = 0
        for pitch, ln in MEL[p][c]:
            n0 = t + beat * BEAT + humanize(); n1 = t + (beat + ln) * BEAT - 0.05
            note(mel, pitch, n0, n1, 58 + (4 if ln >= 3 else 0)); beat += ln
stems['melody'] = m

# ---- shimmer: celesta and glockenspiel sparkles, off the beat, chord tones two octaves up
m, cel = mk(8); cc(cel, 91, 127); cc(cel, 7, 100)
gl = pm.Instrument(program=9); m.instruments.append(gl); cc(gl, 91, 127); cc(gl, 7, 95)
for b, name, ph, ci in chord_list():
    vo = CH[name][0]
    pool = [vo[2] + 24, vo[3] + 24, vo[4] + 24, vo[2] + 36, vo[3] + 12]
    pool = [p for p in pool if p <= 100]
    for bar in range(2):
        for k in (R.choice([1.5, 2.5]), R.choice([3.0, 3.5])):
            if R.random() < 0.8:
                t = bar_t(b + bar) + k * BEAT
                note(cel if R.random() < 0.7 else gl, R.choice(pool), t, t + BEAT * 1.5, R.randint(34, 52))
stems['shimmer'] = m

# ---- percussion: a soft pulse, brushed offbeats, a low heartbeat; kept very quiet
m, dr = mk(0, drum=True); cc(dr, 91, 40); cc(dr, 7, 100)
for b in range(BARS):
    for k in range(4):
        t = bar_t(b) + k * BEAT
        if k in (0, 2): note(dr, 36, t + humanize() * 0.5, t + 0.2, 52 if k == 0 else 40)
        note(dr, 42, t + BEAT / 2 + humanize(), t + 0.1, 24)
        if k == 3 and b % 2 == 1: note(dr, 37, t + humanize(), t + 0.1, 34)
    for k in range(8):
        t = bar_t(b) + k * BEAT / 2 + BEAT / 4
        note(dr, 70, t + humanize(), t + 0.05, 18 + (k % 2) * 6)
stems['perc'] = m

GAIN = {'pad': 0.55, 'harp': 0.8, 'bass': 0.6, 'melody': 0.8, 'shimmer': 0.8, 'perc': 0.7}
TARGET_RMS = {'pad': 0.075, 'harp': 0.07, 'bass': 0.09, 'melody': 0.07, 'shimmer': 0.045, 'perc': 0.05}

MONO = ('bass', 'perc', 'melody')

def render(name, midi):
    # three copies back to back; the middle one is steady state and loops with its reverb tails intact
    big = pm.PrettyMIDI(initial_tempo=BPM)
    for inst in midi.instruments:
        ni = pm.Instrument(program=inst.program, is_drum=inst.is_drum)
        for rep in range(3):
            for n in inst.notes: ni.notes.append(pm.Note(n.velocity, n.pitch, n.start + rep * LOOP, n.end + rep * LOOP))
            for c in inst.control_changes:
                if rep == 0: ni.control_changes.append(c)
        big.instruments.append(ni)
    mid = f'{TMP}/{name}.mid'; wav = f'{TMP}/{name}.wav'
    big.write(mid)
    subprocess.run(['fluidsynth', '-ni', '-g', str(GAIN[name]), '-r', str(SR), '-R', '1', '-C', '1',
                    '-o', 'synth.reverb.room-size=0.88', '-o', 'synth.reverb.damp=0.3', '-o', 'synth.reverb.width=0.9', '-o', 'synth.reverb.level=0.75',
                    '-o', 'synth.chorus.level=1.2', '-o', 'synth.chorus.depth=4', '-o', 'synth.chorus.speed=0.25',
                    '-F', wav, SF2, mid], check=True, capture_output=True)
    x, sr = sf.read(wav)
    L = int(round(LOOP * SR))
    seg = x[L:2 * L]
    rms = np.sqrt(np.mean(seg ** 2)); seg = seg * (TARGET_RMS[name] / max(rms, 1e-6))
    pk = np.max(np.abs(seg))
    if pk > 0.9: seg = seg * (0.9 / pk)
    out = f'{TMP}/{name}_loop.wav'; sf.write(out, seg, SR)
    ac = ['-ac', '1'] if name in MONO else []
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', out] + ac + ['-c:a', 'libvorbis', '-q:a', '3', f'{OUT}/{name}.ogg'], check=True)
    return seg

if __name__ == '__main__':
    only = sys.argv[1:] or list(stems)
    for n in only:
        seg = render(n, stems[n])
        c = np.mean(np.abs(np.fft.rfft(seg[:SR * 4, 0] if seg.ndim > 1 else seg[:SR * 4])))
        print(n, 'ok', round(len(seg) / SR, 2), 's', 'peak', round(float(np.max(np.abs(seg))), 3))
