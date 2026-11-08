#!/bin/zsh
# Turns the v3 recording into: a narrated MP4 with music, a music-only MP4 for Faris's own voiceover, and a timed script.
set -e
cd "${0:A:h}"
FF=/Users/farissalkawi/.cache/uv/archive-v0/3NQghPfrUQBnKxYnb7bf5/lib/python3.14/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-x86_64-v9.0.2
IN=$(ls video3/*.webm)
DUR=$($FF -i "$IN" 2>&1 | sed -n 's/.*Duration: \([0-9:.]*\).*/\1/p' | awk -F: '{print $1*3600+$2*60+$3}')
echo "video $DUR s"
uv run --no-project --with numpy python -I audio.py music "$DUR" music.wav
uv run --no-project --with numpy python -I audio.py mix "$DUR" voice3/lines.json music.wav mix.wav music_only.wav
OUTDIR=~/Desktop/KUAT_video
mkdir -p $OUTDIR
$FF -y -loglevel error -i "$IN" -i mix.wav -map 0:v -map 1:a -c:v libx264 -crf 20 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 160k -shortest -movflags +faststart $OUTDIR/KUAT_demo_v3_voice_music.mp4
$FF -y -loglevel error -i "$IN" -i music_only.wav -map 0:v -map 1:a -c:v libx264 -crf 20 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 160k -shortest -movflags +faststart $OUTDIR/KUAT_demo_v3_music_only.mp4
python3 - <<'PY' > ~/Desktop/KUAT_video/KUAT_voiceover_script.txt
import json
lines = json.load(open('voice3/lines.json'))
print('KUAT demo voiceover script (time in the video, then the line). Read it in your own words.\n')
for l in lines:
    s = int(l['t'] / 1000)
    print(f"[{s // 60}:{s % 60:02d}] {l['text']}")
PY
ls -la $OUTDIR
