import subprocess, sys
import numpy as np
FF = '/Users/farissalkawi/.cache/uv/archive-v0/3NQghPfrUQBnKxYnb7bf5/lib/python3.14/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-x86_64-v9.0.2'
w, h = 320, 180
src = sys.argv[1]
for a, b in [(22.4, 23.5), (34.6, 35.4), (49.8, 50.4)]:
    raw = subprocess.run([FF, '-v', 'error', '-ss', str(a), '-t', str(b - a), '-i', src, '-vf', f'scale={w}:{h},format=gray', '-f', 'rawvideo', '-'], capture_output=True).stdout
    fr = np.frombuffer(raw, dtype=np.uint8).reshape(-1, h, w).astype(np.float32)
    d = np.abs(np.diff(fr, axis=0)).mean(axis=(1, 2))
    print(f'{a}-{b}s:', ' '.join(f'{x:.1f}' for x in d))
