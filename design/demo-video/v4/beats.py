"""Finds the main track's tempo, beat grid and the exact silence/re-entry around 0:56, for cutting on the beat."""
import json, subprocess
import numpy as np
FF = '/Users/farissalkawi/.cache/uv/archive-v0/3NQghPfrUQBnKxYnb7bf5/lib/python3.14/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-x86_64-v9.0.2'
sr = 22050
raw = subprocess.run([FF, '-v', 'error', '-i', 'public/audio/music_epical02.mp3', '-ac', '1', '-ar', str(sr), '-f', 's16le', '-'], capture_output=True).stdout
x = np.frombuffer(raw, dtype='<i2').astype(np.float64) / 32768
hop = 256
frames = len(x) // hop
energy = np.array([np.sum(x[i * hop:(i + 1) * hop] ** 2) for i in range(frames)])
logE = np.log10(energy + 1e-9)
onset = np.maximum(0, np.diff(logE, prepend=logE[0]))
fps = sr / hop
# Tempo from the onset autocorrelation between 60 and 180 BPM, over 2 s - 54 s.
seg = onset[int(2 * fps):int(54 * fps)]
seg = seg - seg.mean()
ac = np.correlate(seg, seg, mode='full')[len(seg) - 1:]
lags = np.arange(len(ac))
bpm_of = lambda lag: 60 * fps / lag
cands = [(ac[l], bpm_of(l)) for l in range(int(60 * fps / 180), int(60 * fps / 60))]
best = max(cands)
bpm = best[1]
period = 60 / bpm
# Phase: shift of the beat grid that best matches the onsets.
t = np.arange(len(onset)) / fps
phases = np.linspace(0, period, 64, endpoint=False)
score = [onset[np.clip(((np.arange(2, 54, period) + p) * fps).astype(int), 0, len(onset) - 1)].sum() for p in phases]
phase = phases[int(np.argmax(score))]
# Silence and re-entry near 0:56.
rms = np.sqrt(np.convolve(x ** 2, np.ones(int(0.05 * sr)) / int(0.05 * sr), 'same'))
win = np.arange(int(54 * sr), int(60 * sr))
db = 20 * np.log10(rms[win] + 1e-9)
quiet = win[db < -40]
gap_start = quiet[0] / sr if len(quiet) else None
gap_end = quiet[-1] / sr if len(quiet) else None
loud_after = win[(db > -30) & (win > (quiet[-1] if len(quiet) else 0))]
reentry = loud_after[0] / sr if len(loud_after) else None
out = {'bpm': round(bpm, 2), 'period': period, 'phase': phase, 'gap_start': gap_start, 'gap_end': gap_end, 'reentry': reentry,
       'first_sound': float(np.argmax(rms > 10 ** (-40 / 20)) / sr)}
print(json.dumps(out, indent=1))
json.dump(out, open('public/audio/beats.json', 'w'), indent=1)
