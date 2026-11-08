import subprocess, sys
import numpy as np
FF = '/Users/farissalkawi/.cache/uv/archive-v0/3NQghPfrUQBnKxYnb7bf5/lib/python3.14/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-x86_64-v9.0.2'
sr = 22050
for p in sys.argv[1:]:
    x = np.frombuffer(subprocess.run([FF, '-v', 'error', '-i', p, '-ac', '1', '-ar', str(sr), '-f', 's16le', '-'], capture_output=True).stdout, dtype='<i2') / 32768
    w = int(0.02 * sr)
    rms = np.array([np.sqrt(np.mean(x[i:i + w] ** 2)) for i in range(0, len(x) - w, w)])
    db = 20 * np.log10(rms + 1e-9)
    onset = np.argmax(db > db.max() - 30) * 0.02
    print(f'{p.split("/")[-1]:20} len {len(x)/sr:5.2f}s  onset {onset:5.2f}s  peak {np.argmax(rms)*0.02:5.2f}s  peak {db.max():5.1f} dB')
