"""Narration: one ElevenLabs request per line, with word timings so captions and cuts land exactly on the voice.
The key is read from KNIGHT's .env and never printed. KUAT is written "Kwat" so it is said the way Faris says it."""
import base64, json, pathlib, sys, httpx

VOICE = 'JBFqnCBsd6RMkjVDRZzb'   # George: warm, British storyteller
LINES = [
    ('hook', 'h1', 'Before an app goes live, real people test it. It’s called user acceptance testing.'),
    ('hook', 'h2', 'And their feedback usually looks like this.'),
    ('hook', 'h3', '“Didn’t work.” “It felt weird.” A note in Arabic. Five angry clicks, and no comment at all.'),
    ('hook', 'h4', 'Someone has to turn all of that into clear tickets. By hand, one report at a time.'),
    ('reveal', 'r1', 'Not anymore.'),
    ('reveal', 'r2', 'This is KUAT.'),
    ('oreo', 'o0', 'KUAT is built like an Oreo: three layers, each with one job.'),
    ('oreo', 'o1', 'The top layer is the testers. They report problems in their own words.'),
    ('oreo', 'o2', 'The cream is a team of AI agents. They turn those reports into clear, checked tickets.'),
    ('oreo', 'o3', 'And the bottom layer is you. You decide what happens to every single one.'),
    ('oreo', 'o4', 'People on both sides, AI in the middle. The AI does the work, people make the calls.'),
    ('testers', 'tA', 'Here’s the app being tested: a pretend side-effect form for a drug company, with four bugs hidden in it on purpose.'),
    ('testers', 'tB', 'A button that does nothing. A batch number that won’t accept lower case. A submit button that takes seven seconds, and sends the report twice.'),
    ('testers', 'tS', 'Testers follow a simple script, and the KUAT button is always in the corner when something goes wrong.'),
    ('testers', 't1', 'They describe the problem in their own words, in any language.'),
    ('testers', 't2', 'And if they’re too frustrated to type, KUAT notices the angry clicks and sends the report for them.'),
    ('testers', 't3', 'Every report comes with the tester’s exact clicks, as evidence.'),
    ('agents', 'a1', 'Then the AI agents get to work, and you can watch every step live.'),
    ('agents', 'aT', 'The Translator turns any language into clear English.'),
    ('agents', 'aD', 'The Detective reads the clicks to find the exact step that broke.'),
    ('agents', 'aQ', 'If a report is too vague, it asks the tester one friendly question, and the tester replies right there.'),
    ('agents', 'aS', 'The Spotter notices when several people reported the same problem, and stacks them into one.'),
    ('agents', 'aW', 'The Writer turns it into a proper bug ticket.'),
    ('agents', 'aM', 'And the Mechanic reads the app’s code, and points to the line that probably caused it.'),
    ('control', 'c1', 'But nothing becomes a ticket without a human.'),
    ('control', 'c2', 'You review them one at a time, on purpose. There’s no approve-all button.'),
    ('control', 'cE', 'For each one, KUAT shows its evidence and how confident it is, and you make the call.'),
    ('control', 'c3', 'If the AI got it wrong, you overrule it with one click.'),
    ('features', 'f0', 'Around that, KUAT gives the whole team a clear picture.'),
    ('features', 'fB', 'A plain-English summary of how testing is going.'),
    ('features', 'fH', 'A heatmap showing which steps testers struggle with most.'),
    ('features', 'fI', 'An ideas board, so suggestions don’t get lost among the bugs.'),
    ('features', 'fK', 'Reports matched to problems you already know about.'),
    ('features', 'fL', 'And a launch readiness score, so you know when it’s safe to ship.'),
    ('proof', 'p1', 'Every ticket is ready to paste into Jira, with steps to reproduce taken from what the tester actually did.'),
    ('features', 'fR', 'You can replay any tester’s session, click by click.'),
    ('proof', 'p2', 'When a developer ships a fix, the Ghost tester replays every real report on the new version.'),
    ('proof', 'p3', 'Only when every single one passes can the bug be marked as fixed.'),
    ('features', 'fT', 'And the tester who reported it can follow it, like a parcel, all the way to fixed.'),
    ('close', 'e1', 'Readiness climbs, one proven fix at a time.'),
    ('close', 'e2', 'Messy feedback in. Proven fixes out.'),
    ('end', 'eE', 'And when the test cycle is done? You eat the cookie.'),
    ('end', 'e3', 'KUAT. Developers’ favourite Oreo.'),
]
spoken = lambda t: t.replace('KUAT', 'Kwat')

env = dict(l.split('=', 1) for l in pathlib.Path.home().joinpath('Developer/knight-ai/backend/.env').read_text().splitlines() if '=' in l and not l.startswith('#'))
headers = {'xi-api-key': env['ELEVENLABS_API_KEY'].strip()}
out = pathlib.Path('public/voice')
only = set(sys.argv[1:])
lines = json.loads((out / 'lines.json').read_text()) if (out / 'lines.json').exists() else {}
for i, (scene, key, text) in enumerate(LINES):
    if only and key not in only:
        continue
    body = {'text': spoken(text), 'model_id': 'eleven_multilingual_v2',
            'voice_settings': {'stability': 0.45, 'similarity_boost': 0.8, 'style': 0.35, 'use_speaker_boost': True, 'speed': 1.0},
            'previous_text': spoken(LINES[i - 1][2]) if i else None, 'next_text': spoken(LINES[i + 1][2]) if i + 1 < len(LINES) else None}
    r = httpx.post(f'https://api.elevenlabs.io/v1/text-to-speech/{VOICE}/with-timestamps?output_format=mp3_44100_128', headers=headers, json=body, timeout=120)
    if r.status_code != 200:
        sys.exit(f'{key}: HTTP {r.status_code} {r.text[:300]}')
    j = r.json()
    (out / f'{key}.mp3').write_bytes(base64.b64decode(j['audio_base64']))
    a = j['alignment']
    words, cur, start = [], '', None
    for ch, s, e in zip(a['characters'], a['character_start_times_seconds'], a['character_end_times_seconds']):
        if ch.isspace():
            if cur: words.append({'w': cur, 'start': start, 'end': prev_end}); cur = ''
            continue
        if not cur: start = s
        cur += ch; prev_end = e
    if cur: words.append({'w': cur, 'start': start, 'end': prev_end})
    shown = text.split()
    for w, d in zip(words, shown):
        w['shown'] = d
    lines[key] = {'scene': scene, 'key': key, 'text': text, 'file': f'voice/{key}.mp3', 'duration': a['character_end_times_seconds'][-1], 'words': words}
    print(f'{key} {lines[key]["duration"]:.2f}s  {text}')
(out / 'lines.json').write_text(json.dumps(lines, indent=1, ensure_ascii=False))
