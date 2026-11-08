"""Final QA on an encoded film: glitched frames, repeated frames inside the slow-motion clips, and the music break."""
import json, pathlib, subprocess, sys
import numpy as np
FF = '/Users/farissalkawi/.cache/uv/archive-v0/3NQghPfrUQBnKxYnb7bf5/lib/python3.14/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-x86_64-v9.0.2'
src, fps = sys.argv[1], 60
tl = json.loads(pathlib.Path('public/timeline.json').read_text())
w, h = 160, 90
raw = subprocess.run([FF, '-v', 'error', '-i', src, '-vf', f'scale={w}:{h},format=gray', '-f', 'rawvideo', '-'], capture_output=True, check=True).stdout
fr = np.frombuffer(raw, dtype=np.uint8).reshape(-1, h, w)
n = len(fr)
d = np.array([np.abs(fr[i].astype(np.int16) - fr[i - 1]).mean() for i in range(1, n)])     # d[i-1] = change into frame i
glitch = [i for i in range(1, n - 1) if d[i - 1] > 5 and d[i] > 5 and np.abs(fr[i + 1].astype(np.int16) - fr[i - 1]).mean() < 0.35 * min(d[i - 1], d[i])]
print('frames', n, '| glitched frames:', glitch)
for name, a, b in [('twist', tl['SCENE']['revealEnd'] + 0.4, tl['SCENE']['revealEnd'] + tl['clips']['twist']['duration'] - 0.2),
                   ('eat', tl['SCENE']['closeEnd'] + 0.5, tl['SCENE']['closeEnd'] + 3.6)]:
    seg = d[int(a * fps):int(b * fps)]
    moving = seg[seg > 0.4]
    frozen = int(((seg < 0.05) & (np.convolve(seg, np.ones(5) / 5, 'same') > 0.6)).sum())
    print(f'{name}: {len(seg)} frames, mean change {seg.mean():.2f}, frozen frames mid-motion: {frozen}')
sr = 48000
x = np.frombuffer(subprocess.run([FF, '-v', 'error', '-i', src, '-ac', '1', '-ar', str(sr), '-f', 's16le', '-'], capture_output=True).stdout, dtype='<i2') / 32768
def db(a, b):
    s = x[int(a * sr):int(b * sr)]
    return 20 * np.log10(np.sqrt(np.mean(s ** 2)) + 1e-9)
B, K = tl['MUSIC_BREAK'], tl['MUSIC_BACK']
print(f'silence {B + 0.08:.2f}-{K - 0.08:.2f}s: {db(B + 0.08, K - 0.08):.1f} dB | slam {K:.2f}-{K + 0.8:.2f}s: {db(K, K + 0.8):.1f} dB | impact {tl["IMPACT"]:.2f}s: {db(tl["IMPACT"], tl["IMPACT"] + 0.4):.1f} dB')
