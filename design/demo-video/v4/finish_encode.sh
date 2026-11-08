#!/bin/zsh
# Re-runs the finishing steps after the frame scan: the music-only soundtrack (with a longer timeout), then the encodes.
set -e
cd "${0:A:h}"
FF=/Users/farissalkawi/.cache/uv/archive-v0/3NQghPfrUQBnKxYnb7bf5/lib/python3.14/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-x86_64-v9.0.2
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
D=~/Desktop/KUAT_video
npx remotion render out/bundle KUAT out/no_voice.wav --codec=wav --props='{"noVoice":true}' --timeout=180000 --concurrency=1 --browser-executable="$CHROME" --log=error
CHAIN="volume=6.4dB,alimiter=limit=0.84:attack=5:release=60:level=false"
$FF -y -v error -framerate 60 -i "out/frames60/element-%05d.jpeg" -i out/voice_mix.wav -map 0:v -map 1:a \
  -c:v libx264 -preset medium -crf 16 -pix_fmt yuv420p -g 120 -af "$CHAIN" -c:a aac -b:a 256k -shortest -movflags +faststart $D/KUAT_film.mp4
$FF -y -v error -i $D/KUAT_film.mp4 -i out/no_voice.wav -map 0:v -map 1:a -c:v copy -af "$CHAIN" -c:a aac -b:a 256k -shortest -movflags +faststart $D/KUAT_film_music_only.mp4
$FF -y -v error -i $D/KUAT_film.mp4 -vf "fps=30" -c:v libx265 -preset fast -b:v 900k -maxrate 1300k -bufsize 2600k -tag:v hvc1 -c:a aac -b:a 96k -movflags +faststart $D/KUAT_film_phone.mp4
ls -la $D | grep KUAT_film
$FF -hide_banner -i $D/KUAT_film.mp4 -vn -af loudnorm=I=-15:TP=-1.5:print_format=summary -f null - 2>&1 | grep -E "Input Integrated|Input True Peak"
echo ENCODED
