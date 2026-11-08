"""Builds frame-exact 60 fps clips from the captured screencast frames.

For every output frame (1/60 s apart) it picks the newest source frame whose real timestamp has been reached,
so the clip plays at the intended speed with no repeated or skipped frames (the old concat route forced 25 fps).
speed = how much faster than the capture the clip plays: 5 for the 0.2x slow-motion captures (real speed),
2.5 for a half-speed slow-motion look, 1 for real-time captures. Times below are in final-clip seconds.
"""
import json, os, pathlib, shutil, subprocess, sys

FF = '/Users/farissalkawi/.cache/uv/archive-v0/3NQghPfrUQBnKxYnb7bf5/lib/python3.14/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-x86_64-v9.0.2'
FPS = 60
CLIPS = {   # name: (source, speed, start, end) with end=None meaning to the last frame
    'twist': ('twist', 5.0, 0.12, None),
    'eat': ('eat', 2.5, 0.2, None),
    'replay': ('replay', 1.0, 0.25, 6.6),
}

out_meta = {}
for name, (src, speed, start, end) in CLIPS.items():
    d = pathlib.Path('frames') / src
    meta = json.loads((d / 'frames.json').read_text())
    fr = meta['frames']
    t0 = fr[0]['t']
    total = (fr[-1]['t'] - t0) / speed                    # final seconds = real capture seconds / speed
    end = total if end is None else min(end, total)
    n = int((end - start) * FPS)
    seq = pathlib.Path('frames') / f'{name}_seq60'
    shutil.rmtree(seq, ignore_errors=True)
    seq.mkdir(parents=True)
    j, used = 0, set()
    for k in range(n):
        target = t0 + (start + k / FPS) * speed
        while j + 1 < len(fr) and fr[j + 1]['t'] <= target:
            j += 1
        used.add(j)
        os.symlink((d / fr[j]['file']).resolve(), seq / f'{k:05d}.jpg')
    outfile = f'public/clips/{name}60.mp4'
    subprocess.run([FF, '-y', '-v', 'error', '-framerate', str(FPS), '-i', str(seq / '%05d.jpg'), '-vf', 'scale=1920:1200:flags=lanczos,format=yuv420p',
                    '-c:v', 'libx264', '-crf', '13', '-preset', 'slow', '-g', '30', outfile], check=True)
    out_meta[name] = {'file': f'clips/{name}60.mp4', 'duration': n / FPS, 'distinct_frames': len(used), 'frames': n}
    print(f'{name}: {n} frames ({n / FPS:.2f}s), {len(used)} distinct source frames, source {len(fr)} frames over {total:.2f}s at {speed}x')
pathlib.Path('public/clips/clips.json').write_text(json.dumps(out_meta, indent=1))
