#!/bin/zsh
# Turns the rendered 60 fps frames into the final films: scan for glitched frames and re-render them safely,
# render the two soundtracks, encode, master, and make the phone copy. Run from the v4 folder.
set -e
cd "${0:A:h}"
FF=/Users/farissalkawi/.cache/uv/archive-v0/3NQghPfrUQBnKxYnb7bf5/lib/python3.14/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-x86_64-v9.0.2
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
py() { uv run --no-project --with numpy python -I "$@" }
D=~/Desktop/KUAT_video
FR=out/frames60
first=$(ls $FR | head -1); ext=${first##*.}; stem=${first%.*}; digits=${#${stem##*-}}; prefix=${stem%-*}-

echo "== 1. glitch scan"
for pass in 1 2 3; do
  py glitch_scan.py $FR 60 > out/glitches.json
  n=$(python3 -c "import json;print(len(json.load(open('out/glitches.json'))['glitched']))")
  echo "pass $pass: $n glitched frame(s): $(python3 -c "import json;print(json.load(open('out/glitches.json'))['glitched'][:40])")"
  [ "$n" = "0" ] && break
  for i in $(python3 -c "import json;print(' '.join(map(str,json.load(open('out/glitches.json'))['glitched'])))"); do
    name=$(printf "%s%0${digits}d.%s" $prefix $i $ext)
    npx remotion still out/bundle KUAT $FR/$name --frame=$i --gl=swangle --image-format=jpeg --jpeg-quality=94 --browser-executable="$CHROME" --log=error >/dev/null 2>&1 || echo "re-render failed: $i"
  done
done

echo "== 2. soundtracks"
npx remotion render out/bundle KUAT out/voice_mix.wav --codec=wav --browser-executable="$CHROME" --log=error
npx remotion render out/bundle KUAT out/no_voice.wav --codec=wav --props='{"noVoice":true}' --browser-executable="$CHROME" --log=error

echo "== 3. encode"
CHAIN="volume=6.4dB,alimiter=limit=0.84:attack=5:release=60:level=false"
$FF -y -v error -framerate 60 -i "$FR/${prefix}%0${digits}d.$ext" -i out/voice_mix.wav -map 0:v -map 1:a \
  -c:v libx264 -preset medium -crf 16 -pix_fmt yuv420p -g 120 -af "$CHAIN" -c:a aac -b:a 256k -shortest -movflags +faststart $D/KUAT_film.mp4
$FF -y -v error -i $D/KUAT_film.mp4 -i out/no_voice.wav -map 0:v -map 1:a -c:v copy -af "$CHAIN" -c:a aac -b:a 256k -shortest -movflags +faststart $D/KUAT_film_music_only.mp4
$FF -y -v error -i $D/KUAT_film.mp4 -vf "fps=30" -c:v libx265 -preset fast -b:v 1150k -maxrate 1600k -bufsize 3200k -tag:v hvc1 -c:a aac -b:a 96k -movflags +faststart $D/KUAT_film_phone.mp4
ls -la $D
echo "== 4. checks"
$FF -hide_banner -i $D/KUAT_film.mp4 -vn -af loudnorm=I=-15:TP=-1.5:print_format=summary -f null - 2>&1 | grep -E "Input Integrated|Input True Peak"
echo FINALIZED
