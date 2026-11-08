"""Builds the film's music bed from Epical Drums 02: repeats whole bars (beat-grid aligned, short crossfade) at the two
points in public/timeline.json, then calms it down: gentle low-pass for the harsh cymbals, light compression for the
drum hits. The result is public/audio/music_film.wav."""
import json, pathlib, subprocess
import numpy as np

FF = '/Users/farissalkawi/.cache/uv/archive-v0/3NQghPfrUQBnKxYnb7bf5/lib/python3.14/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-x86_64-v9.0.2'
SR = 44100
tl = json.loads(pathlib.Path('public/timeline.json').read_text())
PERIOD, PHASE, BAR = tl['PERIOD'], tl['PHASE'], tl['music']['bar']

raw = subprocess.run([FF, '-v', 'error', '-i', 'public/audio/music_epical02.mp3', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
x = np.frombuffer(raw, dtype='<f4').reshape(-1, 2).astype(np.float64)

def snap(t):
    return PHASE + round((t - PHASE) / PERIOD) * PERIOD

def repeat_bars(x, at, bars):
    """Inserts `bars` whole bars at `at`, built from the bars just before it (repeated as often as needed).
    Every splice keeps the length exact (so the beat grid never shifts) and blends 30 ms of what would have
    played next into the incoming audio, so no splice clicks."""
    if bars <= 0:
        return x
    p = int(round(snap(at) * SR))
    bar = BAR * SR
    avail = max(1, int((p / SR - 2.5) // BAR))            # bars available after the track's silent intro
    m = min(bars, avail)
    start = p - int(round(m * bar))
    cf = int(0.03 * SR)
    fade_in = np.sin(np.linspace(0, np.pi / 2, cf))[:, None]
    fade_out = np.cos(np.linspace(0, np.pi / 2, cf))[:, None]
    pieces, cont, left = [], p, int(round(bars * bar))     # cont = where the audio before the next splice ended
    while left > 0:
        take = min(left, p - start)
        piece = x[start:start + take].copy()
        piece[:cf] = x[cont:cont + cf] * fade_out + piece[:cf] * fade_in
        pieces.append(piece)
        cont, left = start + take, left - take
    tail = x[p:].copy()
    tail[:cf] = x[cont:cont + cf] * fade_out + tail[:cf] * fade_in
    return np.concatenate([x[:p], *pieces, tail])

m = tl['music']
x = repeat_bars(x, m['loop2']['at'], m['loop2']['bars'])   # later point first, so the earlier position is unchanged
x = repeat_bars(x, m['loop1']['at'], m['loop1']['bars'])
tmp = pathlib.Path('public/audio/_music_raw.wav')
subprocess.run([FF, '-y', '-v', 'error', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-i', '-', '-c:a', 'pcm_f32le', str(tmp)], input=x.astype('<f4').tobytes(), check=True)
subprocess.run([FF, '-y', '-v', 'error', '-i', str(tmp), '-af',
                'highpass=f=35,lowpass=f=7000,acompressor=threshold=0.1:ratio=2.5:attack=20:release=250,volume=-1dB',
                '-c:a', 'pcm_s16le', 'public/audio/music_film.wav'], check=True)
tmp.unlink()
print(f'music_film.wav: {len(x) / SR:.2f}s (bars added: {m["loop1"]["bars"]} + {m["loop2"]["bars"]}), film END {tl["END"]}s')
