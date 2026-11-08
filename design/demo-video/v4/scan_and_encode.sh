#!/bin/zsh
# Glitch scan + repair over all frames, then the three encodes (soundtracks already rendered).
set -e
cd "${0:A:h}"
FF=/Users/farissalkawi/.cache/uv/archive-v0/3NQghPfrUQBnKxYnb7bf5/lib/python3.14/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-x86_64-v9.0.2
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
D=~/Desktop/KUAT_video
py() { uv run --no-project --with numpy python -I "$@" }
for pass in 1 2 3; do
  py glitch_scan.py out/frames60 60 > out/glitches.json
  n=$(python3 -c "import json;print(len(json.load(open('out/glitches.json'))['glitched']))")
  echo "pass $pass: $n glitched frame(s)"
  [ "$n" = "0" ] && break
  for i in $(python3 -c "import json;print(' '.join(map(str,json.load(open('out/glitches.json'))['glitched'])))"); do
    npx remotion still out/bundle KUAT out/frames60/$(printf "element-%05d.jpeg" $i) --frame=$i --gl=swangle --image-format=jpeg --jpeg-quality=94 --timeout=180000 --browser-executable="$CHROME" --log=error >/dev/null 2>&1 || echo "re-render failed: $i"
  done
done
CHAIN="volume=6.4dB,alimiter=limit=0.84:attack=5:release=60:level=false"
$FF -nostdin -y -v error -framerate 60 -i "out/frames60/element-%05d.jpeg" -i out/voice_mix.wav -map 0:v -map 1:a \
  -c:v libx264 -preset medium -crf 16 -pix_fmt yuv420p -g 120 -af "$CHAIN" -c:a aac -b:a 256k -shortest -movflags +faststart $D/KUAT_film.mp4
$FF -nostdin -y -v error -i $D/KUAT_film.mp4 -i out/no_voice.wav -map 0:v -map 1:a -c:v copy -af "$CHAIN" -c:a aac -b:a 256k -shortest -movflags +faststart $D/KUAT_film_music_only.mp4
$FF -nostdin -y -v error -i $D/KUAT_film.mp4 -vf "fps=30" -c:v libx265 -preset fast -b:v 900k -maxrate 1300k -bufsize 2600k -tag:v hvc1 -c:a aac -b:a 96k -movflags +faststart $D/KUAT_film_phone.mp4
ls -la $D | grep KUAT_film
echo ENCODED
