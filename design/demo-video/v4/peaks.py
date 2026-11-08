import subprocess, sys
import numpy as np
FF = '/Users/farissalkawi/.cache/uv/archive-v0/3NQghPfrUQBnKxYnb7bf5/lib/python3.14/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-x86_64-v9.0.2'
sr = 48000
x = np.frombuffer(subprocess.run([FF, '-v', 'error', '-i', sys.argv[1], '-ac', '2', '-ar', str(sr), '-f', 's16le', '-'], capture_output=True).stdout, dtype='<i2').reshape(-1, 2) / 32768
w = sr // 4
hot = []
for i in range(0, len(x) - w, w):
    p = np.abs(x[i:i + w]).max()
    if p > 0.97: hot.append((round(i / sr, 2), round(float(p), 3), int((np.abs(x[i:i + w]) > 0.999).sum())))
print('clipped samples total', int((np.abs(x) > 0.999).sum()), 'of', x.size)
print('hot windows (time s, peak, clipped samples):', hot[:30])
