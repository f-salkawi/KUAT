"""The film's master clock. Places every narration line from its real duration, then fits the music around it:
whole bars of Epical Drums 02 are repeated (so the beat never breaks) until the track's silence-and-slam lands on
"But nothing becomes a ticket without a human." and its natural ending lands on the end card.
Writes public/timeline.json (read by src/time.js) and the music plan used by music_build.py.
"""
import json, math, pathlib

L = json.loads(pathlib.Path('public/voice/lines.json').read_text())
CLIPS = json.loads(pathlib.Path('public/clips/clips.json').read_text())
B = json.loads(pathlib.Path('public/audio/beats.json').read_text())
PERIOD, PHASE = B['period'], B['phase']
BAR = 4 * PERIOD
TRACK_BREAK, TRACK_BACK, TRACK_END = 57.306, 57.985, 115.9      # silence starts, music slams back, sound ends

def after_beat(t):   # first beat at or after t
    return PHASE + math.ceil((t - PHASE) / PERIOD) * PERIOD

START, SCENE = {}, {}
t = 0.0
def put(key, at=None, gap=0.0):
    global t
    t = at if at is not None else t + gap
    START[key] = round(t, 3)
    t += L[key]['duration']

put('h1', at=1.4); put('h2', gap=0.5); put('h3', gap=0.38); put('h4', gap=0.5)
SCENE['hookEnd'] = round(t + 0.35, 3)
put('r1', gap=0.6)
IMPACT = round(after_beat(t + 0.28), 3)
put('r2', at=IMPACT + 0.75)
SCENE['revealEnd'] = round(after_beat(t + 0.15), 3)
put('o0', at=SCENE['revealEnd'] + 0.35)                       # "Why an Oreo?" over the closed cookie
SCENE['twistAt'] = round(after_beat(t + 0.2), 3)              # then it twists open, to music alone
twist = CLIPS['twist']['duration']
put('o1', at=SCENE['twistAt'] + twist + 0.05); put('o2', gap=0.5); put('o3', gap=0.5)
SCENE['diagramAt'] = round(t + 0.35, 3)                       # "People on both sides. AI in the middle."
put('o4', at=SCENE['diagramAt'] + 0.3)
SCENE['oreoEnd'] = round(after_beat(t + 0.8), 3)
put('tA', at=SCENE['oreoEnd'] + 0.3); put('tB', gap=0.55); put('tS', gap=0.6)
put('t1', gap=0.5); put('t2', gap=0.45); put('t3', gap=0.4)
SCENE['testersEnd'] = round(after_beat(t + 0.45), 3)
put('a1', at=SCENE['testersEnd'] + 0.25)
for k, g in [('aT', 0.45), ('aD', 0.45), ('aQ', 0.35), ('aS', 0.6), ('aW', 0.35), ('aM', 0.35)]:
    put(k, gap=g)
SCENE['agentsEnd'] = round(t + 0.55, 3)

# Stretch the track before its break by whole bars so the slam lands on the human line.
need = SCENE['agentsEnd'] + 1.25 + (TRACK_BACK - TRACK_BREAK) - TRACK_BACK
bars1 = max(0, math.ceil(need / BAR))
MUSIC_BACK = round(TRACK_BACK + bars1 * BAR, 3)
MUSIC_BREAK = round(MUSIC_BACK - (TRACK_BACK - TRACK_BREAK), 3)
put('c1', at=MUSIC_BACK); put('c2', gap=0.5); put('cE', gap=0.45); put('c3', gap=0.45)
SCENE['controlEnd'] = round(after_beat(t + 0.55), 3)
put('f0', at=SCENE['controlEnd'] + 0.25)
for k in ['fB', 'fH', 'fI', 'fK', 'fL']:
    put(k, gap=0.45)
SCENE['aroundEnd'] = round(after_beat(t + 0.5), 3)
put('p1', at=SCENE['aroundEnd'] + 0.3); put('fR', gap=0.5); put('p2', gap=0.5); put('p3', gap=0.45); put('fT', gap=0.55); put('e1', gap=0.5)
SCENE['proofEnd'] = round(after_beat(t + 0.5), 3)
put('e2', at=SCENE['proofEnd'] + 0.3)
SCENE['closeEnd'] = round(after_beat(t + 0.45), 3)
cookie = next(w['start'] for w in L['eE']['words'] if w['w'].lower().startswith('cookie'))
put('eE', at=max(SCENE['closeEnd'] + 0.1, SCENE['closeEnd'] + 2.92 - cookie))   # "cookie" lands on the bite (2.92 s into the clip)
eat = CLIPS['eat']['duration']
SCENE['eatEnd'] = round(after_beat(max(SCENE['closeEnd'] + min(eat, 5.6), t + 0.6)), 3)
put('e3', at=SCENE['eatEnd'] + 0.55)
END = round(t + 5.2, 3)

# Stretch the track after its break by whole bars so its natural ending lands at the end.
bars2 = max(0, round((END - 0.6 - (MUSIC_BACK + TRACK_END - TRACK_BACK)) / BAR))
plan = {
    'bar': BAR,
    'loop1': {'at': 44.0, 'bars': bars1},     # repeat the bars just before 0:44 (steady drums, before the build-down)
    'loop2': {'at': 90.0, 'bars': bars2},     # repeat the bars just before 1:30 (sustained section)
}
out = {'fps': 60, 'START': START, 'SCENE': SCENE, 'IMPACT': IMPACT, 'MUSIC_BREAK': MUSIC_BREAK, 'MUSIC_BACK': MUSIC_BACK, 'END': END,
       'PERIOD': PERIOD, 'PHASE': PHASE, 'music': plan, 'clips': CLIPS}
pathlib.Path('public/timeline.json').write_text(json.dumps(out, indent=1))
print(json.dumps({'END': END, 'IMPACT': IMPACT, 'MUSIC_BACK': MUSIC_BACK, 'bars': [bars1, bars2], 'montage': round(MUSIC_BREAK - SCENE['agentsEnd'], 2), 'SCENE': SCENE}, indent=1))
