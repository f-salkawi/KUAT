import subprocess, sys
import numpy as np
FF = '/Users/farissalkawi/.cache/uv/archive-v0/3NQghPfrUQBnKxYnb7bf5/lib/python3.14/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-x86_64-v9.0.2'
sr = 48000
x = np.frombuffer(subprocess.run([FF, '-v', 'error', '-i', sys.argv[1], '-ac', '1', '-ar', str(sr), '-f', 's16le', '-'], capture_output=True).stdout, dtype='<i2') / 32768
def db(a, b):
    s = x[int(a * sr):int(b * sr)]
    return 20 * np.log10(np.sqrt(np.mean(s ** 2)) + 1e-9)
for a, b, what in [(0.5, 1.3, 'before first line'), (1.45, 2.2, 'first line'), (56.6, 57.2, 'montage'), (57.4, 57.9, 'the silence'), (58.0, 58.8, 'music back + human line'),
                   (19.75, 19.95, 'hush before impact'), (20.0, 20.4, 'impact')]:
    print(f'{a:6.2f}-{b:6.2f}s {db(a, b):6.1f} dB  {what}')
