"""Finds stutters (repeated frames during motion) and jumps (sudden big frame changes) in the film."""
import subprocess, sys
import numpy as np
FF = '/Users/farissalkawi/.cache/uv/archive-v0/3NQghPfrUQBnKxYnb7bf5/lib/python3.14/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-x86_64-v9.0.2'
w, h = 160, 90
raw = subprocess.run([FF, '-v', 'error', '-i', sys.argv[1], '-vf', f'scale={w}:{h},format=gray', '-f', 'rawvideo', '-'], capture_output=True).stdout
fr = np.frombuffer(raw, dtype=np.uint8).reshape(-1, h, w).astype(np.float32)
d = np.abs(np.diff(fr, axis=0)).mean(axis=(1, 2))      # change between consecutive frames
fps = 30
stutter, jumps = [], []
for i in range(2, len(d) - 2):
    moving = (d[i - 2] + d[i + 2]) / 2
    if moving > 1.2 and d[i] < 0.12 * moving:          # a frozen frame in the middle of motion
        stutter.append(round((i + 1) / fps, 2))
    if d[i] > 25 and d[i] > 6 * max(d[i - 1], d[i + 1], 0.5):   # a hard visual jump
        jumps.append(round((i + 1) / fps, 2))
print('frames', len(fr))
print('stutters (frozen frame mid-motion) at s:', stutter)
print('hard jumps at s:', jumps)
