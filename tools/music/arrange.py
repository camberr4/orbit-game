#!/usr/bin/env python3
"""Long song loops. Each song is cut from its Suno stems as one stretch of whole bars taken from its most intense part (no breakdowns; 12 to 24
bars), found with INTENSE=1 tools/music/arrange_scan.py. The
windows were found by tools/music/arrange_scan.py: they start and end where the song's own harmony and drum energy match, so the loop point
sounds exactly like the song carrying on. The stems are merged into five game layers (drums, bass, keys, synth, colour), a tiny crossfade
at the seam removes clicks, and every song of a biome is sped up or slowed down (rubberband) to the biome's common tempo.
Run: python3 tools/music/arrange.py [name ...]   (needs numpy, soundfile, ffmpeg with rubberband)"""
import os, sys, subprocess
import numpy as np, soundfile as sf, scipy.signal as ss

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
XF = 0.012
MONO = ('bass',)
STD = {'drums': ['drums', 'percussion'], 'bass': ['bass'], 'keys': ['keyboard'], 'synth': ['synth'], 'colour': ['other']}
def lay(colour): d = dict(STD); d['colour'] = colour; return d
# name: src folder, file per stem, layers, the song's own tempo, the biome's tempo, window start in the song's own time (s), bars
SONGS = {
    'aurora':    dict(src='aurora_a', files={'drums': '0 Drums', 'bass': '1 Bass', 'keyboard': '2 Keyboard', 'percussion': '3 Percussion', 'synth': '4 Synth', 'other': '5 Other'},
                      layers=STD, bpm0=118.99, bpm=118.99, start=0.170 + 65 * 240 / 118.99, bars=24),
    'aurora_b':  dict(src='aurora_b', files={'drums': '0 Drums', 'bass': '1 Bass', 'keyboard': '2 Keyboard', 'percussion': '3 Percussion', 'synth': '4 Synth', 'other': '5 Other'},
                      layers=STD, bpm0=118.99, bpm=118.99, start=0.104 + 27 * 240 / 118.99, bars=24),
    'dust':      dict(src='dust_a', files={'drums': '0 Drums', 'bass': '1 Bass', 'guitar': '2 Guitar', 'keyboard': '3 Keyboard', 'percussion': '4 Percussion', 'synth': '5 Synth', 'other': '6 Other', 'brass': '7 Brass'},
                      layers=lay(['other', 'guitar', 'brass']), bpm0=112.997, bpm=112.0, start=0.059 + 20 * 240 / 112.997, bars=24),
    'dust_b':    dict(src='dust_b', files={'drums': '0 Drums', 'bass': '1 Bass', 'guitar': '2 Guitar', 'keyboard': '3 Keyboard', 'synth': '4 Synth', 'other': '5 Other', 'brass': '6 Brass'},
                      layers=lay(['other', 'guitar', 'brass']), bpm0=112.005, bpm=112.0, start=0.052 + 65 * 240 / 112.005, bars=24),
    'ember':     dict(src='ember', files={n: n for n in ['drums', 'bass', 'brass', 'keyboard', 'other', 'percussion', 'strings', 'synth']},
                      layers=lay(['other', 'strings', 'brass']), bpm0=118.0, bpm=118.0, start=0.119 + 40 * 240 / 118.0, bars=16),
    'ember_b':   dict(src='ember_b', files={n: n for n in ['drums', 'bass', 'guitar', 'keyboard', 'other', 'percussion', 'synth']},
                      layers=lay(['other', 'guitar']), bpm0=121.0, bpm=118.0, start=0.176 + 9 * 240 / 121.0, bars=24),
    'glacier':   dict(src='glacier_a', files={'drums': '1 Drums', 'bass': '2 Bass', 'guitar': '3 Guitar', 'keyboard': '4 Keyboard', 'percussion': '5 Percussion', 'strings': '6 Strings', 'synth': '7 Synth', 'other': '8 Other'},
                      layers=lay(['other', 'strings', 'guitar', 'brass']), bpm0=114.0, bpm=113.0, start=0.159 + 41 * 240 / 114.0, bars=12),
    'glacier_b': dict(src='glacier_b', files={'drums': '2 Drums', 'bass': '3 Bass', 'keyboard': '4 Keyboard', 'percussion': '5 Percussion', 'strings': '6 Strings', 'synth': '7 Synth', 'other': '8 Other', 'brass': '9 Brass'},
                      layers=lay(['other', 'strings', 'guitar', 'brass']), bpm0=113.0, bpm=113.0, start=0.183 + 49 * 240 / 113.0, bars=14),
    'pulsar':    dict(src='pulsar_a', files={'drums': '1 Drums', 'bass': '2 Bass', 'keyboard': '3 Keyboard', 'percussion': '4 Percussion', 'synth': '5 Synth', 'other': '6 Other'},
                      layers=STD, bpm0=132.0, bpm=132.0, start=1.530 + 18 * 240 / 132.0, bars=24),
    'pulsar_b':  dict(src='pulsar_b', files={'drums': '1 Drums', 'bass': '2 Bass', 'keyboard': '3 Keyboard', 'percussion': '4 Percussion', 'synth': '5 Synth', 'other': '6 Other'},
                      layers=STD, bpm0=131.0, bpm=132.0, start=1.431 + 83 * 240 / 131.0, bars=24),
    'void':      dict(src='void_a', files={'drums': '2 Drums', 'bass': '3 Bass', 'guitar': '4 Guitar', 'keyboard': '5 Keyboard', 'percussion': '6 Percussion', 'strings': '7 Strings', 'synth': '8 Synth', 'other': '9 Other', 'brass': '10 Brass'},
                      layers=lay(['other', 'strings', 'guitar', 'brass']), bpm0=128.0, bpm=128.0, start=0.042 + 38 * 240 / 128.0, bars=24),
    'void_b':    dict(src='void_b', files={'drums': '1 Drums', 'bass': '2 Bass', 'guitar': '3 Guitar', 'keyboard': '4 Keyboard', 'percussion': '5 Percussion', 'strings': '6 Strings', 'synth': '7 Synth', 'other': '8 Other', 'brass': '9 Brass'},
                      layers=lay(['other', 'strings', 'guitar', 'brass']), bpm0=127.0, bpm=128.0, start=0.242 + 29 * 240 / 127.0, bars=24),
    'blackhole': dict(src='blackhole_a', files={'drums': '1 Drums', 'bass': '2 Bass', 'guitar': '3 Guitar', 'keyboard': '4 Keyboard', 'percussion': '5 Percussion', 'strings': '6 Strings', 'synth': '7 Synth', 'other': '8 Other'},
                      layers=lay(['other', 'strings', 'guitar']), bpm0=136.0, bpm=136.0, start=0.483 + 79 * 240 / 136.0, bars=16),
}

def load(cfg, n, tmp):
    wav = f'{tmp}/{n}.wav'
    if not os.path.exists(wav):
        r = cfg['bpm'] / cfg['bpm0']   # <1 slows the song down
        af = ['-af', f'rubberband=tempo={r:.6f}:transients=mixed:detector=compound'] if abs(r - 1) > 0.001 else []
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', f'{ROOT}/assets/music/{cfg["src"]}/{cfg["files"][n]}.mp3', '-ar', '48000'] + af + [wav], check=True)
    x, sr = sf.read(wav)
    return (np.stack([x, x], 1) if x.ndim == 1 else x), sr

for name in (sys.argv[1:] or SONGS):
    cfg = SONGS[name]; bar = 240 / cfg['bpm']
    tmp = f'/tmp/arrange_{name}'; os.makedirs(tmp, exist_ok=True)
    out = f'{ROOT}/www/audio/{name}'; os.makedirs(out, exist_ok=True)
    start = cfg['start'] * cfg['bpm0'] / cfg['bpm']   # the window start on the stretched timeline
    mix = {}
    for layer, parts in cfg['layers'].items():
        acc = None
        for n in parts:
            if n not in cfg['files']: continue
            x, sr = load(cfg, n, tmp); acc = x if acc is None else acc[:len(x)] + x[:len(acc)]
        mix[layer] = acc
    # beat-phase refinement: the window is shifted by a few milliseconds so that the kicks of its first 16 bars start exactly on its beat grid (the
    # start of a kick is found where its low-passed waveform first rises, not at the peak of its envelope). Two songs cut this way can be laid on
    # top of each other in a DJ mix without a flam between their kicks.
    if 'drums' in mix:
        d = mix['drums'].mean(1); sos = ss.butter(3, 150 / (sr / 2), 'low', output='sos'); lo = np.abs(ss.sosfiltfilt(sos, d))
        sm = np.convolve(lo, np.ones(int(0.002 * sr)) / int(0.002 * sr), 'same'); a0 = int(start * sr); n16 = int(16 * bar * sr)
        seg = sm[a0 - int(0.1 * sr): a0 + n16]; hop = 64; env = np.maximum(0, np.diff(seg[:len(seg) // hop * hop].reshape(-1, hop).mean(1), prepend=0)); beat = 60 / cfg['bpm']
        thr = env.max() * 0.35; pk = [i for i in range(1, len(env) - 1) if env[i] > thr and env[i] >= env[i - 1] and env[i] > env[i + 1]]
        ons = []
        for i in pk:
            c = i * hop; lo_i, hi_i = max(0, c - int(0.12 * sr)), min(len(seg), c + int(0.05 * sr)); w = seg[lo_i:hi_i]; m = w.max()
            j = int(np.argmax(w > 0.18 * m)); ons.append((lo_i + j) / sr - 0.1)
        if len(ons) >= 8:
            ons = np.array(ons); ang = np.angle(np.mean(np.exp(2j * np.pi * ons / beat))); dsh = ang / (2 * np.pi) * beat
            if abs(dsh) < 0.06: start += dsh - 0.004; print('  beat-phase refinement', round(dsh * 1000, 1), 'ms from', len(ons), 'kicks')
    a, b = int(round(start * sr)), int(round((start + cfg['bars'] * bar) * sr)); x_ = int(XF * sr); loops = {}
    for layer, x in mix.items():
        seg = x[a:b].copy(); pre = x[a - x_:a]; fade = np.linspace(0, 1, x_)[:, None]
        seg[-x_:] = seg[-x_:] * np.cos(fade * np.pi / 2) + pre * np.sin(fade * np.pi / 2)   # the loop's last few ms blend into what came before its start, so the seam is the song carrying on
        loops[layer] = seg
    tot = sum(loops.values()); g = min(0.12 / np.sqrt(np.mean(tot ** 2)), 0.8 / np.abs(tot).max())   # every song sits at the same loudness
    print(name, 'loop', round(len(tot) / sr, 3), 's', cfg['bars'], 'bars  gain', round(float(g), 3), ' mix rms', round(float(np.sqrt(np.mean((tot * g) ** 2))), 3), 'peak', round(float(np.abs(tot * g).max()), 2))
    for layer, seg in loops.items():
        seg = seg * g
        wav = f'{tmp}/{layer}_loop.wav'; sf.write(wav, seg, sr)
        ac = ['-ac', '1'] if layer in MONO else []
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav] + ac + ['-c:a', 'libvorbis', '-q:a', '4', f'{out}/{layer}.ogg'], check=True)
