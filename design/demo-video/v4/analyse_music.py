"""Prints each track's loudness over time (1 bar per second) so the edit can land on its builds and hits."""
import subprocess, sys
import numpy as np
FF = '/Users/farissalkawi/.cache/uv/archive-v0/3NQghPfrUQBnKxYnb7bf5/lib/python3.14/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-x86_64-v9.0.2'
for path in sys.argv[1:]:
    raw = subprocess.run([FF, '-v', 'error', '-i', path, '-ac', '1', '-ar', '22050', '-f', 's16le', '-'], capture_output=True).stdout
    x = np.frombuffer(raw, dtype='<i2').astype(np.float64) / 32768
    sr = 22050
    secs = len(x) // sr
    rms = np.array([np.sqrt(np.mean(x[i * sr:(i + 1) * sr] ** 2)) for i in range(secs)])
    db = 20 * np.log10(np.maximum(rms, 1e-6))
    top = db.max()
    print(f'\n{path}  {secs}s  peak-second {top:.1f} dB')
    for i in range(0, secs, 2):
        d = db[i:i + 2].mean()
        jump = db[i] - db[i - 1] if i else 0
        bar = '#' * max(0, int((d - (top - 30)) / 1.0))
        print(f'{i // 60}:{i % 60:02d} {d:6.1f} {bar}{"  <-- +%.0fdB jump" % jump if jump > 6 else ""}')
