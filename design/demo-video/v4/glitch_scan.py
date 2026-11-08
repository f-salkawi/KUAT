"""Scans a rendered image sequence for glitched frames.

A real cut changes the picture once and it stays changed. A glitch (garbled tiles, a black or half-drawn frame)
differs from BOTH neighbours while the neighbours still match each other. Those frames are listed so they can be
re-rendered with the safe software renderer. Usage: python glitch_scan.py <frames dir> [fps]
"""
import json, pathlib, subprocess, sys
import numpy as np

FF = '/Users/farissalkawi/.cache/uv/archive-v0/3NQghPfrUQBnKxYnb7bf5/lib/python3.14/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-x86_64-v9.0.2'
d = pathlib.Path(sys.argv[1])
fps = float(sys.argv[2]) if len(sys.argv) > 2 else 60
files = sorted(p for p in d.iterdir() if p.suffix in ('.jpeg', '.jpg', '.png'))
digits = len(files[0].stem.split('-')[-1])
prefix = files[0].stem[: -digits]
w, h = 160, 90                      # small and uint8: 10k frames fit easily in memory
raw = subprocess.run([FF, '-v', 'error', '-framerate', str(fps), '-start_number', files[0].stem[-digits:].lstrip('0') or '0', '-i', str(d / f'{prefix}%0{digits}d{files[0].suffix}'),
                      '-vf', f'scale={w}:{h},format=gray', '-f', 'rawvideo', '-'], capture_output=True, check=True).stdout
fr = np.frombuffer(raw, dtype=np.uint8).reshape(-1, h, w)
n = len(fr)
diff = lambda a, b: float(np.abs(fr[a].astype(np.int16) - fr[b]).mean())
bad = set()
lum = fr.reshape(n, -1).mean(axis=1)
tl = json.loads(pathlib.Path('public/timeline.json').read_text())
blackout = (tl['MUSIC_BREAK'] * fps - 2, tl['MUSIC_BACK'] * fps + 2)
for i in range(1, n - 1):
    a, b, c = diff(i - 1, i), diff(i, i + 1), diff(i - 1, i + 1)
    if a > 5 and b > 5 and c < 0.35 * min(a, b):                    # one odd frame between two that agree
        bad.add(i)
    if i < n - 2:
        a2, mid, b2, c2 = diff(i - 1, i), diff(i, i + 1), diff(i + 1, i + 2), diff(i - 1, i + 2)
        if a2 > 5 and b2 > 5 and c2 < 0.35 * min(a2, b2) and mid < 0.5 * min(a2, b2):   # two odd frames in a row
            bad.update([i, i + 1])
    if lum[i] < 4 and lum[i - 1] > 15 and lum[i + 1] > 15 and not (blackout[0] <= i <= blackout[1]):   # a lone black frame
        bad.add(i)
bad = sorted(bad)
print(json.dumps({'frames': n, 'glitched': bad, 'files': [files[i].name for i in bad]}))
