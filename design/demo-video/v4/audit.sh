#!/bin/zsh
# Self-audit of the finished film: technical QA, every highlight moment, and the whole film at a glance.
cd "${0:A:h}"
FF=/Users/farissalkawi/.cache/uv/archive-v0/3NQghPfrUQBnKxYnb7bf5/lib/python3.14/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-x86_64-v9.0.2
V=~/Desktop/KUAT_video/KUAT_film.mp4
uv run --no-project --with numpy python -I qa_video.py $V 2>&1 | grep -v "^Installed"
mkdir -p out/audit && find out/audit -name '*.png' -delete
python3 - > out/audit/times.txt <<'PY'
import json
t = json.load(open('public/timeline.json')); S = t['START']; L = json.load(open('public/voice/lines.json'))
def w(k, word):
    for x in L[k]['words']:
        if (x.get('shown') or x['w']).lower().lstrip('“"').startswith(word.lower()): return S[k] + x['start']
    raise SystemExit(f'missing {word} in {k}')
pts = [('cookie ring', w('o0', 'three') + 0.5), ('top layer', S['o1'] + 2.5), ('cream layer', S['o2'] + 3.0), ('bottom layer', S['o3'] + 3.0),
       ('banner', w('tA', 'bugs') + 0.6), ('bug 2', w('tB', 'batch') + 0.9), ('bug 3', w('tB', 'submit') + 0.9), ('bug 4', w('tB', 'sends') + 0.6),
       ('script', w('tS', 'script') + 0.8), ('KUAT button', w('tS', 'corner') + 0.4), ('comment', S['t1'] + 2.2), ('toast', w('t2', 'sends') + 1.0),
       ('counter', w('c2', 'one') + 0.8), ('suggestion', w('cE', 'evidence') + 0.6), ('confidence', w('cE', 'confident') + 0.5), ('approve', w('cE', 'call') + 0.4),
       ('overrule', w('c3', 'overrule') + 0.8), ('briefing', S['fB'] + 1.6), ('heatmap', S['fH'] + 1.6), ('ideas', S['fI'] + 1.8), ('known', S['fK'] + 1.8),
       ('readiness', S['fL'] + 2.0), ('ghost', w('p2', 'replays') + 0.8), ('tracker', w('fT', 'parcel') + 0.6), ('eat', S['eE'] + 2.9)]
for name, ts in pts: print(f'{ts:.2f}|{name}')
PY
i=0; while IFS='|' read ts name; do i=$((i+1)); n=$(printf %02d $i); $FF -nostdin -y -v error -ss $ts -i $V -frames:v 1 -vf "scale=640:-1" out/audit/$n.png; done < out/audit/times.txt
$FF -y -v error -framerate 1 -i out/audit/%02d.png -vf "tile=5x5" -frames:v 1 out/audit_highlights.jpg
$FF -y -v error -i $V -vf "fps=1/4,scale=320:-1,tile=6x10" -frames:v 1 out/audit_sheet.jpg
cat -n out/audit/times.txt | tr '|' ' '
echo AUDITED
