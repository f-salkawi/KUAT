"""Lists the ElevenLabs voices on the account (names only; the key is read from KNIGHT's .env and never printed)."""
import pathlib, httpx
env = dict(l.split('=', 1) for l in pathlib.Path.home().joinpath('Developer/knight-ai/backend/.env').read_text().splitlines() if '=' in l and not l.startswith('#'))
h = {'xi-api-key': env['ELEVENLABS_API_KEY'].strip()}
for v in httpx.get('https://api.elevenlabs.io/v1/voices', headers=h, timeout=30).json()['voices']:
    l = v.get('labels') or {}
    print(f"{v['name'][:30]:30} {v['voice_id']}  {l.get('accent','')}, {l.get('gender','')}, {l.get('age','')}, {l.get('descriptive', l.get('description',''))}, {l.get('use_case','')}")
sub = httpx.get('https://api.elevenlabs.io/v1/user/subscription', headers=h, timeout=30).json()
print('\ncharacters used', sub.get('character_count'), 'of', sub.get('character_limit'), '| tier', sub.get('tier'))
