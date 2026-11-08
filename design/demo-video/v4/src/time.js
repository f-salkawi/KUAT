// The voice is the master clock. timeline.py places every line from its real duration and fits the music around it;
// this file only reads that plan. Every visual cue sits on a word or on the music's beat grid.
import TL from '../public/timeline.json'
import lines from '../public/voice/lines.json'

export const FPS = TL.fps
export const END = TL.END
export const START = TL.START
export const SCENE = TL.SCENE
export const IMPACT = TL.IMPACT
export const MUSIC_BREAK = TL.MUSIC_BREAK
export const MUSIC_BACK = TL.MUSIC_BACK
export const CLIPS = TL.clips
export const LINES = lines
export const f = (s) => Math.round(s * FPS)
export const lineEnd = (k) => START[k] + lines[k].duration

const clean = (s) => (s || '').toLowerCase().replace(/[^a-z0-9؀-ۿ-]/g, '')
// Absolute time (s) of the nth word in a line that starts with `w`.
export const word = (k, w, nth = 0) => {
  const hits = lines[k].words.filter((x) => clean(x.shown || x.w).startsWith(clean(w)))
  const hit = hits[nth] || hits[0]
  if (!hit) throw new Error(`word "${w}" not in line ${k}`)
  return START[k] + hit.start
}

export const beat = (t) => TL.PHASE + Math.round((t - TL.PHASE) / TL.PERIOD) * TL.PERIOD
export const BEAT = TL.PERIOD
