"""Turns the slow-motion screencast frames into real-speed 30 fps clips, using each frame's true timestamp."""
import json, pathlib, subprocess, sys
FF = '/Users/farissalkawi/.cache/uv/archive-v0/3NQghPfrUQBnKxYnb7bf5/lib/python3.14/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-x86_64-v9.0.2'
for name in sys.argv[1:]:
    d = pathlib.Path('frames') / name
    meta = json.loads((d / 'frames.json').read_text())
    fr, rate = meta['frames'], meta['rate']
    lines = ['ffconcat version 1.0']
    for i, f in enumerate(fr):
        dur = (fr[i + 1]['t'] - f['t']) * rate if i + 1 < len(fr) else 1 / 30
        lines += [f"file '{f['file']}'", f'duration {max(dur, 0.001):.5f}']
    lines.append(f"file '{fr[-1]['file']}'")
    (d / 'list.txt').write_text('\n'.join(lines))
    out = f'public/clips/{name}.mp4'
    subprocess.run([FF, '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', str(d / 'list.txt'), '-vf', 'fps=30,scale=1920:1200:flags=lanczos',
                    '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', '-pix_fmt', 'yuv420p', out], check=True)
    total = (fr[-1]['t'] - fr[0]['t']) * rate
    print(f'{name}: {len(fr)} frames over {total:.2f}s real time -> {out}')
