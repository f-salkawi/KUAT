// KUAT — the film, A to Z. Chapters: the problem, the reveal, the tester, the agents, the human, everything around it,
// the proof, the ending. Every scene is timed from the narration (public/timeline.json) and the music's beat grid.
import React from 'react'
import { AbsoluteFill, Audio, Easing, Img, Sequence, getInputProps, interpolate, staticFile } from 'remotion'
import meta from '../public/meta.json'
import data from '../public/data.json'
import { BigText, C, Captions, Click, EASE, EASE_IO, FULL, Flash, Highlight, Knight, Letterbox, MONO, SANS, SERIF, Screen,
  SectionLabel, Sfx, Spring, Vignette, focus, ramp, useT } from './kit'
import { CLIPS, END, FPS, IMPACT, LINES, MUSIC_BACK, MUSIC_BREAK, SCENE, START, f, lineEnd, word } from './time'

export { FPS, END }
const box = (shot, k) => meta.shots[shot].boxes[k]
const shot = (n) => meta.shots[n].file
const Seq = ({ from, to, children }) => <Sequence from={f(from)} durationInFrames={Math.max(1, f(to) - f(from))}>{children}</Sequence>
const fix = data.issue.fix
const READY = [data.readyBefore.score, data.readyAfter.score, data.readyAfter.launch_at]
const Backdrop = () => {
  const t = useT()
  const x = 50 + Math.sin(t * 0.13) * 10, y = 40 + Math.cos(t * 0.1) * 7
  return <AbsoluteFill style={{ background: `radial-gradient(ellipse 75% 65% at ${x}% ${y}%, #2b1e17 0%, #150f0c 46%, #060403 100%)` }} />
}

// ---------- Music: calmer, ducked deep under the voice, hushed before the hit, silent at the break ----------
const SPANS = Object.keys(START).map((k) => [START[k], lineEnd(k)])
function musicVolume(t) {
  let base = 0.3
  if (t >= IMPACT - 4.6) base = ramp(t, IMPACT - 4.6, IMPACT - 2.1, 0.3, 0.16, Easing.linear)      // tension builds into "Not anymore."
  if (t >= IMPACT - 2.1) base = ramp(t, IMPACT - 2.1, IMPACT - 1.6, 0.16, 0.02, Easing.linear)
  if (t >= IMPACT - 0.05) base = ramp(t, IMPACT - 0.05, IMPACT + 0.2, 0.02, 0.62, Easing.linear)
  if (t >= IMPACT + 1.5) base = ramp(t, IMPACT + 1.5, IMPACT + 4, 0.62, 0.42, Easing.linear)
  if (t >= SCENE.agentsEnd - 0.3 && t < MUSIC_BREAK) base = 0.56
  if (t >= MUSIC_BACK - 0.05) base = ramp(t, MUSIC_BACK + 0.6, MUSIC_BACK + 1.8, 0.6, 0.42, Easing.linear)
  if (t >= SCENE.proofEnd - 0.5) base = ramp(t, SCENE.proofEnd - 0.5, SCENE.closeEnd, 0.42, 0.14, Easing.linear) * ramp(t, SCENE.closeEnd, SCENE.eatEnd - 0.4, 1, 0, Easing.linear)
  const duck = Math.max(0, ...SPANS.map(([a, b]) => Math.min(ramp(t, a - 0.25, a + 0.05), ramp(t, b + 0.1, b + 0.6, 1, 0))))
  const depth = t > MUSIC_BACK - 0.1 && t < MUSIC_BACK + 0.8 ? 0.25 : 0.6
  return base * (1 - depth * duck) * ramp(t, END - 4.5, END - 0.3, 1, 0, Easing.linear)
}

// ---------- Shared pieces ----------
// A feature title: big serif name with a small index, top left.
const Tag = ({ at, until, n, title, sub, tone = C.blueSoft }) => {
  const t = useT()
  if (t < at - 0.05 || t > until + 0.05) return null
  const a = Math.min(ramp(t, at, at + 0.45), ramp(t, until - 0.3, until, 1, 0))
  return (
    <div style={{ position: 'absolute', left: 96, top: 118, opacity: a, transform: `translateY(${(1 - a) * 14}px)`, maxWidth: 720,
      background: 'rgba(13,9,7,.88)', border: '1px solid rgba(242,235,221,.13)', borderRadius: 18, padding: '16px 26px 18px', boxShadow: '0 24px 60px rgba(0,0,0,.6)' }}>
      <div style={{ fontFamily: MONO, fontSize: 16, color: tone, letterSpacing: '.2em', marginBottom: 6 }}>{n}</div>
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 44, lineHeight: 1.05, color: C.cream }}>{title}</div>
      {sub && <div style={{ marginTop: 8, fontFamily: SANS, fontSize: 21, color: 'rgba(242,235,221,.78)' }}>{sub}</div>}
    </div>
  )
}

// ---------- 0. Cold open: the mess ----------
const HAND = word('h4', 'hand')
const QUOTES = [
  { at: word('h3', 'Didn'), x: 200, y: 200, rot: -5, who: 'Dani · step 2', text: '“Didn’t work.”' },
  { at: word('h3', 'It'), x: 1140, y: 180, rot: 4, who: 'Hana · step 5', text: '“It felt weird.”' },
  { at: word('h3', 'note'), x: 210, y: 590, rot: 3, who: 'Farah · step 3', text: data.farah.original_text, rtl: true },
  { at: word('h3', 'comment') - 0.15, x: 700, y: 385, rot: -2, who: 'Comment', empty: true },
]
const CLICKS = (() => { const a = word('h3', 'Five'), c = word('h3', 'clicks'); return [a, word('h3', 'angry'), c, c + 0.24, c + 0.48] })()
function shake(t) {
  let x = 0, y = 0
  for (const at of [...QUOTES.map((q) => q.at), CLICKS[0]]) {
    if (t < at) continue
    const a = 6 * Math.exp(-(t - at) * 11)
    x += a * Math.sin((t - at) * 70 + at); y += a * Math.cos((t - at) * 63 + at * 2)
  }
  return [x, y]
}
const QuoteCard = ({ q }) => {
  const t = useT()
  if (t < q.at - 0.05) return null
  const gone = ramp(t, HAND - 0.15, HAND + 0.55)
  const dim = ramp(t, START.h4, START.h4 + 0.7, 1, 0.62)
  const caret = Math.floor(t * 2.2) % 2 === 0
  return (
    <div style={{ position: 'absolute', left: q.x, top: q.y, opacity: (1 - gone) * dim, filter: gone > 0 ? `blur(${gone * 14}px)` : 'none' }}>
      <Spring at={q.at} style={{ transform: `rotate(${q.rot}deg)` }}>
        <div style={{ background: C.card, color: C.ink, borderRadius: 18, padding: '22px 34px 24px', minWidth: 300, boxShadow: '0 34px 80px rgba(0,0,0,.6)' }}>
          <div style={{ fontFamily: SANS, fontSize: 18, fontWeight: 600, color: C.mutedInk, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10 }}>{q.who}</div>
          {q.empty
            ? <div style={{ width: 400, height: 66, borderRadius: 10, border: '2px solid #d8ccb6', display: 'flex', alignItems: 'center', padding: '0 16px', fontFamily: SANS, fontSize: 26, color: '#b3a693' }}>
                <span style={{ width: 2, height: 30, background: caret ? C.ink : 'transparent', marginRight: 10 }} />No comment.
              </div>
            : <div dir={q.rtl ? 'rtl' : 'ltr'} style={{ fontFamily: q.rtl ? '"Geeza Pro", "Noto Naskh Arabic", Arial' : SERIF, fontStyle: q.rtl ? 'normal' : 'italic', fontSize: q.rtl ? 50 : 66, lineHeight: 1.16 }}>{q.text}</div>}
        </div>
      </Spring>
    </div>
  )
}
const FiveClicks = () => {
  const t = useT()
  if (t < CLICKS[0] - 0.5) return null
  const n = CLICKS.filter((c) => t >= c).length
  const gone = ramp(t, HAND - 0.15, HAND + 0.55)
  const dim = ramp(t, START.h4, START.h4 + 0.7, 1, 0.62)
  const last = CLICKS.filter((c) => t >= c).slice(-1)[0] ?? -9
  const press = t - last < 0.1 ? 0.95 : 1
  const pop = 1 + 0.35 * Math.exp(-(t - last) * 9)
  return (
    <div style={{ position: 'absolute', left: 1130, top: 590, width: 470, height: 200, opacity: ramp(t, CLICKS[0] - 0.5, CLICKS[0] - 0.15) * (1 - gone) * dim, filter: gone > 0 ? `blur(${gone * 14}px)` : 'none' }}>
      <div style={{ position: 'absolute', left: 0, top: 40, padding: '24px 38px', borderRadius: 16, background: '#fff', color: '#1d3a6e', fontFamily: SANS, fontWeight: 700, fontSize: 32,
        boxShadow: '0 26px 60px rgba(0,0,0,.55)', transform: `scale(${press})` }}>Add medicine</div>
      {CLICKS.map((c, i) => {
        if (t < c) return null
        const r = ramp(t, c, c + 0.5, 6, 70, Easing.out(Easing.cubic))
        return <div key={i} style={{ position: 'absolute', left: 150 - r, top: 82 - r, width: r * 2, height: r * 2, borderRadius: '50%', border: `3px solid ${C.red}`, opacity: ramp(t, c, c + 0.5, 0.9, 0) }} />
      })}
      <svg width="34" height="34" viewBox="0 0 24 24" style={{ position: 'absolute', left: 146, top: 80, transform: `scale(${press})`, filter: 'drop-shadow(0 3px 5px rgba(0,0,0,.6))' }}>
        <path d="M5 2.5l14 8.2-6.2 1.5-3.1 6.3z" fill="#fff" stroke="#111" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      {n > 0 && <div style={{ position: 'absolute', left: 345, top: 18, fontFamily: SERIF, fontWeight: 700, fontSize: 92, color: C.red, transform: `scale(${pop})`, textShadow: '0 0 30px rgba(255,143,152,.5)' }}>×{n}</div>}
      {CLICKS.map((c, i) => <Sfx key={i} at={c} src="audio/sfx_click.mp3" volume={0.5} dur={0.5} />)}
    </div>
  )
}
const Hook = () => {
  const t = useT()
  const [x, y] = shake(t)
  const push = 1 + 0.05 * ramp(t, START.h3, SCENE.hookEnd, 0, 1, Easing.linear)
  return (
    <AbsoluteFill>
      <BigText k="h1" size={82} until={START.h2 - 0.15} />
      <BigText k="h2" size={82} until={START.h3 - 0.05} />
      <AbsoluteFill style={{ transform: `translate(${x}px, ${y}px) scale(${push})` }}>
        {QUOTES.map((q, i) => <QuoteCard key={i} q={q} />)}
        <FiveClicks />
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

// ---------- 1. Reveal ----------
const Title = () => {
  const t = useT()
  if (t < IMPACT || t > SCENE.revealEnd + 0.1) return null
  const exit = ramp(t, SCENE.revealEnd - 0.3, SCENE.revealEnd + 0.05, 0, 1, EASE_IO)
  const track = ramp(t, IMPACT, IMPACT + 1.4, 0.32, 0.04, EASE)
  const sweep = ramp(t, IMPACT + 0.35, IMPACT + 1.6, -0.3, 1.3, EASE_IO)
  const sub = ramp(t, word('r2', 'KUAT') + 0.1, word('r2', 'KUAT') + 0.6)
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: 1 - exit, transform: `scale(${1 + 0.35 * exit})`, filter: exit > 0 ? `blur(${exit * 10}px)` : 'none' }}>
      <Spring at={IMPACT} from={0.6}><Knight size={150} /></Spring>
      <div style={{ marginTop: 26, fontFamily: SERIF, fontWeight: 700, fontSize: 210, lineHeight: 1, letterSpacing: `${track}em`, color: 'transparent',
        backgroundImage: `linear-gradient(100deg, ${C.cream} ${sweep * 100 - 18}%, #fffaf0 ${sweep * 100}%, ${C.cream} ${sweep * 100 + 18}%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text',
        opacity: ramp(t, IMPACT, IMPACT + 0.25) }}>KUAT.</div>
      <div style={{ marginTop: 18, fontFamily: SANS, fontWeight: 600, fontSize: 24, letterSpacing: '0.34em', color: C.muted, opacity: sub, transform: `translateY(${(1 - sub) * 10}px)` }}>USER ACCEPTANCE TESTING, UNTANGLED</div>
    </AbsoluteFill>
  )
}

// ---------- 2. The Oreo, explained ----------
const LAYERS = [
  { key: 'top', box: { x: 154, y: 78, width: 1132, height: 332 }, label: 'TESTERS', sub: 'bring the reports', at: START.o1, until: START.o2 - 0.1 },
  { key: 'cream', box: { x: 154, y: 426, width: 1132, height: 293 }, label: 'AI AGENTS', sub: 'do the heavy lifting', at: START.o2, until: START.o3 - 0.1 },
  { key: 'bottom', box: { x: 154, y: 735, width: 1132, height: 161 }, label: 'YOU', sub: 'make every decision', at: START.o3, until: SCENE.diagramAt + 0.5 },
]
const ClosedCookie = ({ from }) => {
  const cookie = box('landing', 'cookie')
  return (
    <Screen src={shot('landing')} fadeIn={0.35} push={0.01} cams={[{ ...FULL, s: 1.0 }, { at: 0.4, dur: 3.2, ...focus(cookie, 0.5, 2.0, 0, 30) }]}>
      <Highlight box={{ x: cookie.x - 20, y: cookie.y - 20, width: cookie.width + 40, height: cookie.height + 40 }} at={word('o0', 'three') - from} until={SCENE.twistAt - from + 0.3} radius={999} />
    </Screen>
  )
}
const Twist = ({ from }) => {
  const len = CLIPS.twist.duration
  return (
    <Screen video={CLIPS.twist.file} holdAfter={len - 1 / FPS} holdImg="clips/twist60_last.png" fadeIn={0.2} push={0}
      cams={[{ cx: 720, cy: 430, s: 1.12 }, { at: len - 0.25, dur: 1.4, cx: 700, cy: 470, s: 0.9 }]}>
      {LAYERS.map((l) => <OreoLabel key={l.key} l={l} from={from} />)}
    </Screen>
  )
}
const OreoLabel = ({ l, from }) => {
  const t = useT() + from
  if (t < l.at - 0.1) return null
  const a = ramp(t, l.at - 0.1, l.at + 0.35)
  const active = t < l.until ? 1 : 0.45
  return (
    <>
      <Highlight box={l.box} at={l.at - from} until={l.until - from + 0.2} pad={6} radius={22} />
      <div style={{ position: 'absolute', left: -232, width: 214, top: l.box.y + l.box.height / 2 - 40, opacity: a * active, transform: `translateX(${(1 - a) * -24}px)`, textAlign: 'right' }}>
        <div style={{ background: 'rgba(15,11,9,.94)', border: '1px solid rgba(242,235,221,.22)', borderRadius: 12, padding: '10px 16px', boxShadow: '0 12px 30px rgba(0,0,0,.5)' }}>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 21, letterSpacing: '.2em', color: C.cream }}>{l.label}</div>
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 19, color: C.muted }}>{l.sub}</div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: -18, top: l.box.y + l.box.height / 2, width: l.box.x + 18, height: 2, background: C.blueSoft, opacity: a * active, boxShadow: '0 0 10px rgba(127,166,255,.8)' }} />
    </>
  )
}
// The idea in one picture: people on both sides, AI in the middle.
const OreoDiagram = ({ from }) => {
  const t = useT() + from
  const join = ramp(t, from, from + 0.9, 0, 1, EASE_IO)
  const people = ramp(t, word('o4', 'People') - 0.1, word('o4', 'People') + 0.4)
  const ai = ramp(t, word('o4', 'AI') - 0.1, word('o4', 'AI') + 0.4)
  const idea = ramp(t, word('o4', 'does') - 0.35, word('o4', 'does') + 0.25)
  const layer = (i, bg, fg, title, sub, glow) => (
    <div style={{ position: 'relative', width: 980, height: i === 1 ? 128 : 150, borderRadius: i === 1 ? 20 : 34, background: bg, color: fg, display: 'flex', alignItems: 'center', padding: '0 46px', gap: 30,
      transform: `translateY(${(i - 1) * 70 * (1 - join)}px)`, boxShadow: glow ? `0 0 0 3px ${glow}, 0 0 70px ${glow}` : '0 30px 70px rgba(0,0,0,.55)',
      border: i === 1 ? 'none' : '1px solid #4a372e' }}>
      <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 52, width: 330 }}>{title}</span>
      <span style={{ fontFamily: SANS, fontSize: 28, opacity: 0.85 }}>{sub}</span>
    </div>
  )
  const peopleGlow = people > 0 ? `rgba(242,235,221,${0.55 * people * (1 - ai * 0.6)})` : null
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: ramp(t, from, from + 0.4) }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
        {layer(0, `linear-gradient(180deg, #3a2a23, ${C.choc})`, C.cream, 'Testers', 'people · bring the reports', peopleGlow)}
        {layer(1, C.cream, C.ink, 'AI agents', 'investigate, translate, write, suggest', ai > 0 ? `rgba(127,166,255,${0.85 * ai})` : null)}
        {layer(2, `linear-gradient(180deg, #3a2a23, ${C.choc})`, C.cream, 'You', 'people · make every decision', peopleGlow)}
      </div>
      {[312, 618].map((y) => (
        <React.Fragment key={y}>
          <div style={{ position: 'absolute', left: 436, top: y + 8, height: 134, width: 14, borderLeft: `3px solid ${C.cream}`, borderTop: `3px solid ${C.cream}`, borderBottom: `3px solid ${C.cream}`, borderRadius: '8px 0 0 8px', opacity: people * 0.85 }} />
          <div style={{ position: 'absolute', left: 296, top: y + 60, fontFamily: SANS, fontWeight: 700, fontSize: 22, letterSpacing: '.3em', color: C.cream, opacity: people }}>PEOPLE</div>
        </React.Fragment>
      ))}
      <div style={{ position: 'absolute', left: 1470, top: 523, fontFamily: SANS, fontWeight: 700, fontSize: 24, letterSpacing: '.3em', color: C.blueSoft, opacity: ai }}>← AI</div>
      <div style={{ position: 'absolute', bottom: 185, fontFamily: SERIF, fontStyle: 'italic', fontSize: 40, color: C.cream, opacity: idea }}>The AI does the work. People make the calls.</div>
    </AbsoluteFill>
  )
}

// ---------- 3. Chapter 01: the tester ----------
const ArabicChip = ({ at }) => {
  const t = useT()
  if (t < at) return null
  const a = ramp(t, at, at + 0.5)
  return (
    <div style={{ position: 'absolute', left: 110, top: 560, opacity: a, transform: `translateX(${(1 - a) * -60}px)` }}>
      <div style={{ background: C.card, color: C.ink, borderRadius: 16, padding: '18px 26px', boxShadow: '0 30px 70px rgba(0,0,0,.6)', maxWidth: 560 }}>
        <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, letterSpacing: '.12em', color: C.mutedInk, marginBottom: 6 }}>FARAH · IN ARABIC</div>
        <div dir="rtl" style={{ fontFamily: '"Geeza Pro", Arial', fontSize: 36 }}>{data.farah.original_text}</div>
      </div>
    </div>
  )
}
const TRAIL = [
  { k: 'CLICK', v: 'Cardiolex 10 mg', tone: C.cream },
  { k: 'CLICK', v: 'Add medicine  ×5', tone: C.cream },
  { k: 'FOUND', v: data.issue.reports[2]?.facts?.[0]?.summary || "'Add medicine' was clicked 5 times and nothing happened", tone: C.red },
  { k: 'FOUND', v: data.issue.reports[2]?.facts?.[1]?.summary || 'Rage clicks', tone: C.red },
]
const Evidence = ({ from }) => {
  const t = useT() + from
  const at = START.t3
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 1180, background: C.choc, borderRadius: 26, border: `1px solid ${C.line}`, padding: '40px 52px', boxShadow: '0 60px 140px rgba(0,0,0,.7)',
        opacity: ramp(t, from, from + 0.35), transform: `scale(${0.95 + 0.05 * ramp(t, from, from + 0.7)})` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 26 }}>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 18, letterSpacing: '.3em', color: C.blueSoft }}>CLICK TRAIL · ATTACHED AUTOMATICALLY</div>
          <div style={{ fontFamily: MONO, fontSize: 18, color: C.muted }}>step 2 · Other medicines</div>
        </div>
        {TRAIL.map((r, i) => {
          const a = ramp(t, at + 0.1 + i * 0.3, at + 0.45 + i * 0.3)
          return (
            <div key={i} style={{ display: 'flex', gap: 26, alignItems: 'baseline', padding: '14px 0', borderTop: i ? `1px solid ${C.line}` : 'none', opacity: a, transform: `translateX(${(1 - a) * -24}px)` }}>
              <span style={{ fontFamily: MONO, fontSize: 20, color: r.tone === C.red ? C.red : C.muted, width: 90 }}>{r.k}</span>
              <span style={{ fontFamily: r.tone === C.red ? SANS : MONO, fontSize: r.tone === C.red ? 30 : 28, fontWeight: r.tone === C.red ? 600 : 400, color: r.tone }}>{r.v}</span>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}
const Testers = ({ from }) => {
  const add = box('rage', 'add'), toast = box('rage', 'toast'), kn = box('form', 'knight')
  const dbl = { ...box('bug_double', 'refs'), height: 74 }
  const bugs = [
    { at: word('tB', 'button'), shot: 'rage', b: focus(add, 0.3, 2.3), n: 'BUG 1 OF 4', title: 'Add medicine does nothing' },
    { at: word('tB', 'batch'), shot: 'bug_batch', b: focus(box('bug_batch', 'error'), 0.7, 1.9, 0, 60), n: 'BUG 2 OF 4', title: 'Lower-case batch rejected', hl: box('bug_batch', 'error') },
    { at: word('tB', 'submit'), shot: 'bug_slow', b: focus(box('bug_slow', 'submit'), 0.32, 2.2, -120), n: 'BUG 3 OF 4', title: 'Submit takes 7 seconds', hl: box('bug_slow', 'submit') },
    { at: word('tB', 'sends'), shot: 'bug_double', b: focus(dbl, 0.7, 1.9), n: 'BUG 4 OF 4', title: 'Sends twice: a duplicate', hl: dbl },
  ]
  const s1 = from, s2 = bugs[0].at - 0.25, s3 = START.tS - 0.1, sKn = word('tS', 'KUAT') - 0.05, s4 = START.t1 - 0.1, s5 = START.t2 - 0.05, s6 = START.t3 - 0.05
  const k1 = word('t2', 'KUAT'), k2 = word('t2', 'clicks')
  const script = box('panel_home', 'script')
  return (
    <>
      <Seq from={s1} to={s2}>
        <Screen src={shot('form')} dim={0.14} sweepAt={0.3} cams={[{ ...FULL, s: 0.96 }, { at: 1.4, dur: 3.2, ...focus(box('form', 'card'), 0.9, 1.25, 0, -40) }]}>
          <Highlight box={box('form', 'banner')} at={word('tA', 'bugs') - s1} until={s2 - s1} color={C.red} radius={6} pad={2} />
        </Screen>
        <Tag at={START.tA + 0.25 - s1} until={s2 - s1} n="THE APP UNDER TEST" title="Northwind SafeReport" sub="A made-up pharma side-effect form, five steps." />
      </Seq>
      {bugs.map((g, i) => {
        const a = i ? g.at - 0.2 : s2, b = bugs[i + 1] ? bugs[i + 1].at - 0.2 : s3
        return (
          <Seq key={i} from={a} to={b}>
            <Screen src={shot(g.shot)} dim={0.14} fadeIn={0.18} tilt={[3, i % 2 ? 5 : -5]} cams={[{ ...g.b, s: g.b.s * 0.9 }, { at: 0.05, dur: 1.0, ...g.b }]}>
              {g.hl && <Highlight box={g.hl} at={0.35} until={b - a} color={C.red} />}
              {i === 0 && [0.45, 0.62, 0.79].map((c, j) => <Click key={j} x={add.x + add.width / 2} y={add.y + add.height / 2} at={c} from={j ? [0, 0] : [70, 50]} />)}
            </Screen>
            <Tag at={0} until={b - a} n={g.n} title={g.title} tone={C.red} />
          </Seq>
        )
      })}
      <Seq from={s3} to={sKn}>
        <Screen src={shot('panel_home')} dim={0.1} fadeIn={0.2} cams={[focus({ ...script, height: 330 }, 0.86, 1.75), { at: 0.2, dur: 2.2, ...focus({ ...script, height: 330 }, 0.8, 1.85) }]}>
          <Highlight box={{ ...script, y: script.y - 8, height: 330 }} at={0.2} until={sKn - s3} />
        </Screen>
        <Tag at={0.2} until={sKn - s3} n="GUIDED TESTING" title="A script to follow" sub="Each step says what to do, and what should happen." />
      </Seq>
      <Seq from={sKn} to={s4}>
        <Screen src={shot('form')} dim={0.14} fadeIn={0.2} cams={[focus(kn, 0.2, 2.2, -60), { at: 0.2, dur: 0.9, ...focus(kn, 0.16, 2.7, -70) }]}>
          <Click x={kn.x + kn.width / 2} y={kn.y + kn.height / 2} at={word('tS', 'corner') - sKn} />
        </Screen>
        <Tag at={0.15} until={s4 - sKn} n="THE KUAT BUTTON" title="Always one click away" />
      </Seq>
      <Seq from={s4} to={s5}>
        <Screen src={shot('panel_problem')} dim={0.1} fadeIn={0.2} tilt={[3, -6]} cams={[focus(box('panel_problem', 'panel'), 0.86, 1.3, -50), { at: 0.6, dur: 1.2, ...focus(box('panel_problem', 'text'), 0.5, 1.9, -300) }]}>
          <Highlight box={box('panel_problem', 'text')} at={0.9} until={s5 - s4} />
        </Screen>
        <ArabicChip at={word('t1', 'language') - s4 - 0.1} />
        <Tag at={0.15} until={s5 - s4} n="IN THEIR OWN WORDS" title="Any language" />
      </Seq>
      <Seq from={s5} to={s6}>
        <Screen src={shot('rage')} dim={0.14} fadeIn={0.2} cams={[focus(box('rage', 'card'), 0.8, 1.3), { at: 0.6, dur: 1.3, ...focus(add, 0.3, 2.5) },
          { at: word('t2', 'sends') - s5 - 0.35, dur: 1.0, ...focus(toast, 0.55, 1.85) }]}>
          {[k1, k1 + 0.24, word('t2', 'angry'), word('t2', 'angry') + 0.22, k2].map((at, i) => (
            <Click key={i} x={add.x + add.width / 2 + (i % 2) * 6} y={add.y + add.height / 2} at={at - s5} from={i ? [0, 0] : [80, 60]} />
          ))}
          <Highlight box={toast} at={word('t2', 'sends') - s5 + 0.5} until={s6 - s5} color={C.red} />
        </Screen>
        <Tag at={0.2} until={s6 - s5} n="RAGE-CLICK DETECTOR" title="Reported for them" />
      </Seq>
      <Seq from={s6} to={SCENE.testersEnd}><Evidence from={s6} /></Seq>
      <Sfx at={from - 1.06} src="audio/sfx_whoosh.mp3" volume={0.3} dur={1.5} />
    </>
  )
}

// ---------- 4. Chapter 02: the agents ----------
const AGENTS = [
  { key: 'aT', name: 'Translator', job: 'any language → clear English' },
  { key: 'aD', name: 'Detective', job: 'reads the clicks, asks if vague' },
  { key: 'aS', name: 'Spotter', job: 'stacks duplicates' },
  { key: 'aW', name: 'Writer', job: 'drafts the ticket' },
  { key: 'aM', name: 'Mechanic', job: 'reads the code' },
]
const fade = (t, a, b) => Math.min(ramp(t, a, a + 0.3), ramp(t, b - 0.25, b, 1, 0))
const Center = ({ children, gap = 26 }) => <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap, padding: 60 }}>{children}</div>
const Label = ({ children, color = C.blueSoft }) => <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 18, letterSpacing: '.3em', color }}>{children}</div>
const Translate = ({ t, at }) => {
  const m = ramp(t, word('aT', 'clear') - 0.4, word('aT', 'clear') + 0.3, 0, 1, EASE_IO)
  return (
    <Center gap={12}>
      <Label>FARAH’S REPORT · STEP 3</Label>
      <div style={{ position: 'relative', height: 160, width: 1400, display: 'grid', placeItems: 'center' }}>
        <div dir="rtl" style={{ position: 'absolute', fontFamily: '"Geeza Pro", Arial', fontSize: 70, color: C.cream, opacity: 1 - m, filter: m > 0 ? `blur(${m * 12}px)` : 'none', transform: `translateY(${-m * 30}px)` }}>{data.farah.original_text}</div>
        <div style={{ position: 'absolute', fontFamily: SERIF, fontSize: 60, color: C.cream, opacity: m, filter: m < 1 ? `blur(${(1 - m) * 12}px)` : 'none', transform: `translateY(${(1 - m) * 30}px)`, textAlign: 'center' }}>{data.farah.text}</div>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 22, color: C.muted, opacity: ramp(t, at + 0.2, at + 0.6) }}>Arabic → English, in the app’s own words (“batch number”)</div>
    </Center>
  )
}
const Investigate = ({ t, at }) => {
  const scan = ramp(t, at + 0.3, word('aD', 'step') + 0.2, 0, 1, EASE_IO)
  const found = ramp(t, word('aD', 'exact') - 0.1, word('aD', 'exact') + 0.3)
  return (
    <Center gap={20}>
      <Label>THE DETECTIVE READS THE CLICK TRAIL</Label>
      <div style={{ position: 'relative', width: 1220, padding: '30px 38px', borderRadius: 18, background: 'rgba(15,11,9,.55)', border: `1px solid ${C.line}` }}>
        {['step 1 · click “Cardiolex 10 mg”   ✓', 'step 2 · type “Ibuprofen”   ✓', 'step 2 · click “Add medicine” ×5   → nothing changed'].map((l, i) => (
          <div key={i} style={{ fontFamily: MONO, fontSize: 26, lineHeight: 1.8, color: i === 2 ? C.red : C.muted }}>{l}</div>
        ))}
        <div style={{ marginTop: 14, fontFamily: SANS, fontWeight: 600, fontSize: 36, color: C.cream, opacity: found }}>Found it: step 2, the Add medicine button.</div>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${scan * 100}%`, width: 3, background: C.blueSoft, boxShadow: '0 0 30px rgba(127,166,255,.9)', opacity: scan > 0 && scan < 1 ? 1 : 0 }} />
      </div>
    </Center>
  )
}
const REPLY = 'The confirmation page never says when the email will arrive'
const Question = ({ t, at }) => {
  const q = data.hana.follow_up || ''
  const n = Math.floor(ramp(t, at + 0.3, at + 2.6, 0, q.length, Easing.linear))
  const r = Math.floor(ramp(t, START.aS - 1.9, START.aS - 0.6, 0, REPLY.length, Easing.linear))
  return (
    <Center gap={20}>
      <Label>VAGUE REPORT · “IT FELT WEIRD.”</Label>
      <div style={{ alignSelf: 'flex-start', marginLeft: 70, maxWidth: 1060, background: C.cream, color: C.ink, borderRadius: '26px 26px 26px 6px', padding: '24px 32px', fontFamily: SERIF, fontSize: 34, lineHeight: 1.3, boxShadow: '0 30px 80px rgba(0,0,0,.5)' }}>
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 15, letterSpacing: '.16em', color: C.mutedInk, marginBottom: 6 }}>DETECTIVE → TESTER</div>
        {q.slice(0, n)}<span style={{ opacity: n < q.length ? 1 : 0 }}>▍</span>
      </div>
      <div style={{ alignSelf: 'flex-end', marginRight: 70, maxWidth: 900, background: C.blue, color: '#fff', borderRadius: '26px 26px 6px 26px', padding: '20px 28px', fontFamily: SANS, fontSize: 28, opacity: r > 0 ? 1 : 0, boxShadow: '0 30px 80px rgba(0,0,0,.5)' }}>
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 14, letterSpacing: '.16em', opacity: 0.75, marginBottom: 4 }}>TESTER REPLIES, IN THE SAME PANEL</div>
        {REPLY.slice(0, r)}
      </div>
    </Center>
  )
}
const STACKED = [
  { who: 'You', text: '(no comment) · rage clicks' },
  { who: 'You', text: '“I pressed Add medicine loads of times…”' },
  { who: 'Dani', text: '“Didn’t work.”' },
]
const Stack = ({ t }) => {
  const m = ramp(t, word('aS', 'stacks') - 0.1, word('aS', 'stacks') + 0.8, 0, 1, EASE_IO)
  return (
    <Center>
      <div style={{ position: 'relative', width: 900, height: 330 }}>
        {STACKED.map((r, i) => (
          <div key={i} style={{ position: 'absolute', left: 120, top: 70, width: 660, padding: '22px 30px', borderRadius: 18, background: C.card, color: C.ink, boxShadow: '0 24px 60px rgba(0,0,0,.55)',
            transform: `translate(${(i - 1) * 300 * (1 - m)}px, ${(i - 1) * 22 * m - (1 - m) * 10}px) rotate(${(i - 1) * 6 * (1 - m)}deg) scale(${1 - (2 - i) * 0.04 * m})`, zIndex: i }}>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, letterSpacing: '.12em', color: C.mutedInk }}>{r.who.toUpperCase()} · STEP 2</div>
            <div style={{ fontFamily: SERIF, fontSize: 32 }}>{r.text}</div>
          </div>
        ))}
        <div style={{ position: 'absolute', right: 30, top: 10, fontFamily: SANS, fontWeight: 700, fontSize: 24, color: C.cream, background: C.blue, borderRadius: 999, padding: '10px 20px',
          opacity: ramp(t, word('aS', 'one') - 0.2, word('aS', 'one') + 0.2), zIndex: 5 }}>3 reports → 1 problem</div>
      </div>
    </Center>
  )
}
const Write = ({ t, at }) => {
  const title = data.issue.title
  const n = Math.floor(ramp(t, at + 0.15, at + 1.4, 0, title.length, Easing.linear))
  return (
    <Center gap={20}>
      <div style={{ display: 'flex', gap: 12 }}>
        {[data.issue.ticket_key, data.issue.severity, 'Step 2: Other medicines', '3 reports'].map((c, i) => (
          <span key={i} style={{ fontFamily: SANS, fontWeight: 600, fontSize: 22, padding: '8px 16px', borderRadius: 999, background: i === 1 ? C.redBg : 'rgba(242,235,221,.08)', color: i === 1 ? C.red : C.cream, border: `1px solid ${C.line}` }}>{c}</span>
        ))}
      </div>
      <div style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 64, color: C.cream, textAlign: 'center', maxWidth: 1300, minHeight: 150 }}>{title.slice(0, n)}<span style={{ opacity: n < title.length ? 1 : 0 }}>▍</span></div>
    </Center>
  )
}
const CODE = fix.code.split('\n').slice(0, 5)
const Mechanic = ({ t }) => {
  const hl = ramp(t, word('aM', 'points') - 0.1, word('aM', 'points') + 0.3)
  const cause = ramp(t, word('aM', 'cause') - 0.15, word('aM', 'cause') + 0.4)
  return (
    <div style={{ position: 'absolute', inset: 0, padding: '46px 60px' }}>
      <div style={{ fontFamily: MONO, fontSize: 18, color: C.muted, marginBottom: 14 }}>{fix.file}</div>
      <div style={{ background: '#120d0b', borderRadius: 16, border: `1px solid ${C.line}`, padding: '20px 0' }}>
        {CODE.map((l, i) => {
          const bad = l.includes('dead_add_medicine')
          return (
            <div key={i} style={{ fontFamily: MONO, fontSize: 25, lineHeight: 1.65, color: bad ? '#ffd9dc' : '#d8cdbb', padding: '0 30px', whiteSpace: 'pre',
              background: bad ? `rgba(255,143,152,${0.18 * hl})` : 'transparent', boxShadow: bad ? `inset 4px 0 0 rgba(255,143,152,${hl})` : 'none' }}>
              <span style={{ color: '#6f6152', marginRight: 26 }}>{String(i + 1).padStart(2, ' ')}</span>{l.replace(/^ {0,4}/, '')}
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: 22, opacity: cause, transform: `translateY(${(1 - cause) * 12}px)`, display: 'flex', gap: 16, alignItems: 'baseline' }}>
        <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 18, letterSpacing: '.2em', color: C.red, whiteSpace: 'nowrap' }}>LIKELY CAUSE</span>
        <span style={{ fontFamily: SANS, fontSize: 26, color: C.cream }}>{fix.likely_cause}</span>
      </div>
    </div>
  )
}
const AgentBoard = ({ from }) => {
  const t = useT() + from
  const STAGES = [
    ['aT', START.aT - 0.1, START.aD - 0.1, <Translate key="tr" t={t} at={START.aT} />],
    ['aD', START.aD - 0.1, START.aQ - 0.1, <Investigate key="in" t={t} at={START.aD} />],
    ['aD', START.aQ - 0.1, START.aS - 0.1, <Question key="q" t={t} at={START.aQ} />],
    ['aS', START.aS - 0.1, START.aW - 0.1, <Stack key="st" t={t} />],
    ['aW', START.aW - 0.1, START.aM - 0.1, <Write key="wr" t={t} at={START.aW} />],
    ['aM', START.aM - 0.1, SCENE.agentsEnd + 0.3, <Mechanic key="me" t={t} />],
  ]
  const live = STAGES.find(([, a, b]) => t >= a && t < b)?.[0]
  return (
    <AbsoluteFill style={{ opacity: ramp(t, from, from + 0.45) }}>
      <div style={{ position: 'absolute', left: 170, right: 170, top: 150, height: 570, background: `linear-gradient(180deg, ${C.choc2}, ${C.choc})`, borderRadius: 28,
        border: `1px solid ${C.line}`, boxShadow: '0 70px 150px rgba(0,0,0,.7)', overflow: 'hidden' }}>
        {STAGES.map(([, a, b, el]) => { const o = fade(t, a, b); return o > 0 ? <div key={a} style={{ position: 'absolute', inset: 0, opacity: o, transform: `scale(${0.97 + 0.03 * o})` }}>{el}</div> : null })}
      </div>
      <div style={{ position: 'absolute', left: 170, right: 170, top: 760, display: 'flex', gap: 22 }}>
        {AGENTS.map((g, i) => {
          const on = live === g.key
          const seen = t >= START[g.key] - 0.1
          return (
            <div key={g.name} style={{ flex: 1, borderRadius: 18, padding: '18px 22px', background: on ? C.cream : 'rgba(42,30,25,.85)', border: `1px solid ${on ? C.cream : C.line}`,
              boxShadow: on ? '0 0 60px rgba(242,235,221,.25)' : 'none', opacity: seen ? 1 : 0.42, transform: `translateY(${on ? -8 : 0}px)` }}>
              <div style={{ fontFamily: MONO, fontSize: 15, color: on ? C.mutedInk : C.muted }}>0{i + 1}</div>
              <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 32, color: on ? C.ink : C.cream }}>{g.name}</div>
              <div style={{ fontFamily: SANS, fontSize: 17, color: on ? C.mutedInk : C.muted }}>{g.job}</div>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}
const Agents = ({ from }) => {
  const b = START.aT - 0.15
  return (
    <>
      <Seq from={from} to={b}>
        <Screen src={shot('agents')} sweepAt={0.3} cams={[focus(box('agents', 'layer'), 0.95, 1.15), { at: 0.4, dur: 1.4, ...focus(box('agents', 'feed'), 0.85, 1.6, 0, -40) }]} />
        <Tag at={0.2} until={b - from} n="LIVE" title="The agents, at work" sub="Every step they take shows up in a live feed." />
      </Seq>
      <Seq from={b} to={SCENE.agentsEnd}><AgentBoard from={b} /></Seq>
      <Sfx at={from - 1.06} src="audio/sfx_whoosh.mp3" volume={0.3} dur={1.5} />
    </>
  )
}

// ---------- 5. Montage into the silence ----------
const CUTS = [['testers', 'farah', 0.5, 1.9], ['agents', 'feed', 0.75, 1.6], ['ticket', 'title', 0.55, 1.9], ['mechanic', 'mech', 0.75, 1.5], ['ghost_pass', 'ghost', 0.75, 1.6]]
const Montage = ({ from }) => {
  const n = Math.max(1, Math.min(CUTS.length, Math.floor((MUSIC_BREAK - from) / 0.49923)))
  const step = (MUSIC_BREAK - from) / n
  return (
    <>
      {CUTS.slice(0, n).map(([s, k, fill, max], i) => (
        <Seq key={i} from={from + i * step} to={from + (i + 1) * step}>
          <Screen src={shot(s)} fadeIn={0} push={0.18} tilt={[3, i % 2 ? 6 : -6]} cams={[focus(box(s, k), fill, max)]} />
          <Flash at={0} peak={0.1} dur={0.1} />
        </Seq>
      ))}
      {CUTS.slice(0, n).map((_, i) => <Sfx key={i} at={from + i * step - 0.9} src="audio/sfx_whoosh.mp3" volume={i ? 0.22 : 0.32} dur={1.5} />)}
    </>
  )
}

// ---------- 6. Chapter 03: the human ----------
const R = (k) => box('review', k)
const Human = ({ from }) => {
  const card = R('card'), counter = R('counter'), conf = R('confidence'), approve = R('approve'), over = R('overrule'), obs = R('overButtons'), ob = obs[0]
  const top = { x: card.x + 10, y: card.y + 10, width: card.width - 20, height: 330 }
  const suggest = { x: 199, y: conf.y - 26, width: card.width - 38, height: 120 }
  const rowBox = { x: over.x - 6, y: ob.y - 6, width: obs[1].x + obs[1].width - over.x + 12, height: ob.height + 12 }
  return (
    <>
      <Screen src={shot('review')} fadeIn={0.12} sweepAt={0.15} glow="rgba(242,235,221,.08)"
        cams={[focus(R('decide'), 0.98, 1.0), { at: 0.9, dur: 2.0, ...focus(R('decide'), 0.86, 1.18) },
          { at: START.c2 - from - 0.2, dur: 1.1, ...focus(top, 0.8, 1.85) },
          { at: START.cE - from - 0.2, dur: 1.1, ...focus(suggest, 0.62, 2.3) },
          { at: word('cE', 'call') - from - 0.2, dur: 0.9, ...focus({ ...approve, width: 520 }, 0.4, 2.2, 0, -20) },
          { at: START.c3 - from - 0.1, dur: 1.0, ...focus(rowBox, 0.5, 2.2) }]}>
        <Highlight box={counter} at={word('c2', 'One') - from + 0.15} until={START.cE - from} radius={10} />
        <Highlight box={suggest} at={word('cE', 'evidence') - from} until={word('cE', 'call') - from} />
        <Highlight box={conf} at={word('cE', 'confident') - from} until={word('cE', 'call') - from} color={C.ok} radius={999} pad={4} />
        <Highlight box={approve} at={word('cE', 'call') - from} until={START.c3 - from} />
        <Highlight box={rowBox} at={word('c3', 'overrule') - from} until={SCENE.controlEnd - from} />
        <Click x={ob.x + ob.width / 2} y={ob.y + ob.height / 2} at={word('c3', 'one') - from} />
      </Screen>
      <Flash at={0} peak={0.2} dur={0.4} />
    </>
  )
}

// ---------- 7. Chapter 04: everything around it ----------
const AROUND = ['AI briefing', 'Problem heatmap', 'Ideas board', 'Known issues', 'Launch readiness']
const AroundCard = ({ from }) => {
  const t = useT() + from
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: SERIF, fontSize: 92, color: C.cream, opacity: ramp(t, from, from + 0.5), transform: `translateY(${(1 - ramp(t, from, from + 0.6)) * 20}px)` }}>Everything around it.</div>
      <div style={{ display: 'flex', gap: 18, marginTop: 44 }}>
        {AROUND.map((name, i) => {
          const a = ramp(t, from + 0.5 + i * 0.22, from + 0.85 + i * 0.22)
          return <div key={name} style={{ fontFamily: SANS, fontWeight: 600, fontSize: 26, color: C.cream, padding: '14px 24px', borderRadius: 999, border: '1px solid rgba(242,235,221,.25)', background: 'rgba(42,30,25,.8)', opacity: a, transform: `translateY(${(1 - a) * 16}px)` }}>{name}</div>
        })}
      </div>
    </AbsoluteFill>
  )
}
const Around = ({ from }) => {
  const a = START.fB - 0.1, b = START.fH - 0.1, c = START.fI - 0.1, d = START.fK - 0.1, e = START.fL - 0.1, end = SCENE.aroundEnd
  const heat = box('ready_before', 'heat'), ideas = box('boards', 'ideas'), gabe = box('known', 'gabe'), meterArea = { x: 760, y: 50, width: 500, height: 150 }
  return (
    <>
      <Seq from={from} to={a}><AroundCard from={from} /></Seq>
      <Seq from={a} to={b}>
        <Screen src={shot('briefing')} fadeIn={0.25} sweepAt={0.4} cams={[focus(box('briefing', 'briefing'), 0.9, 1.3), { at: 0.5, dur: 1.6, ...focus(box('briefing', 'body'), 0.8, 1.6, 0, 20) }]}>
          <Highlight box={box('briefing', 'body')} at={0.8} until={b - a} />
        </Screen>
        <Tag at={0.15} until={b - a} n="AI BRIEFING" title="The whole cycle, in plain English" />
      </Seq>
      <Seq from={b} to={c}>
        <Screen src={shot('ready_before')} fadeIn={0.25} cams={[focus(heat, 0.7, 1.6, 0, 30), { at: 0.4, dur: 1.2, ...focus(heat, 0.62, 2.0, 0, 20) }]}>
          <Highlight box={heat} at={0.6} until={c - b} color={C.red} />
        </Screen>
        <Tag at={0.15} until={c - b} n="PROBLEM HEATMAP" title="Where testers struggle" sub="In words and counts, never colour alone." />
      </Seq>
      <Seq from={c} to={d}>
        <Screen src={shot('boards')} fadeIn={0.25} cams={[focus(box('boards', 'boards'), 0.92, 1.25), { at: 0.5, dur: 1.2, ...focus(ideas, 0.7, 1.9) }]}>
          <Highlight box={ideas} at={0.8} until={d - c} />
        </Screen>
        <Tag at={0.15} until={d - c} n="IDEAS BOARD" title="No suggestion gets lost" />
      </Seq>
      <Seq from={d} to={e}>
        <Screen src={shot('known')} fadeIn={0.25} cams={[focus(box('known', 'layer'), 0.95, 1.2), { at: 0.5, dur: 1.2, ...focus(gabe, 0.75, 2.0) }]}>
          <Highlight box={gabe} at={0.8} until={e - d} />
        </Screen>
        <Tag at={0.15} until={e - d} n="KNOWN ISSUES" title="Matched to UAT-7" sub={data.gabe?.message?.text} />
      </Seq>
      <Seq from={e} to={end}>
        <Screen src={shot('ready_before')} fadeIn={0.25} sweepAt={0.5} cams={[focus(meterArea, 0.75, 1.9), { at: 0.6, dur: 1.4, ...focus(meterArea, 0.68, 2.2) }]}>
          <Highlight box={meterArea} at={0.7} until={end - e} color={C.ok} />
        </Screen>
        <Tag at={0.15} until={end - e} n="LAUNCH READINESS" title="Safe to ship?" sub={`Launch at ${READY[2]}+, with no critical bugs open.`} tone={C.ok} />
      </Seq>
      <Sfx at={from - 1.06} src="audio/sfx_whoosh.mp3" volume={0.28} dur={1.5} />
    </>
  )
}

// ---------- 8. Chapter 05: the proof ----------
const JiraCard = ({ at }) => {
  const t = useT()
  if (t < at) return null
  const a = ramp(t, at, at + 0.55)
  const lines = data.jira.split('\n').filter(Boolean).slice(0, 7)
  return (
    <div style={{ position: 'absolute', right: 90, top: 210, width: 760, opacity: a, transform: `translateX(${(1 - a) * 120}px) rotate(${(1 - a) * 4}deg)` }}>
      <div style={{ background: C.card, borderRadius: 18, padding: '22px 28px', boxShadow: '0 40px 90px rgba(0,0,0,.65)' }}>
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, letterSpacing: '.2em', color: C.blue, marginBottom: 10 }}>COPIED IN JIRA FORMAT</div>
        {lines.map((l, i) => <div key={i} style={{ fontFamily: MONO, fontSize: 18, lineHeight: 1.55, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l}</div>)}
      </div>
    </div>
  )
}
const Crop = ({ src, b, x, y, w, label, tone, at, children }) => {
  const t = useT()
  const s = w / b.width
  const a = ramp(t, at, at + 0.45)
  return (
    <div style={{ position: 'absolute', left: x, top: y, opacity: a, transform: `translateY(${(1 - a) * 30}px)` }}>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 20, letterSpacing: '.22em', color: tone, marginBottom: 14 }}>{label}</div>
      <div style={{ position: 'relative', width: w, height: b.height * s, borderRadius: 18, overflow: 'hidden', boxShadow: `0 40px 100px rgba(0,0,0,.65), 0 0 0 2px ${tone}55` }}>
        <Img src={staticFile(src)} style={{ position: 'absolute', left: -b.x * s, top: -b.y * s, width: 1440 * s, height: 900 * s }} />
        {children}
      </div>
    </div>
  )
}
const Readiness = ({ from }) => {
  const t = useT() + from
  const v = ramp(t, from + 0.3, word('e1', 'climbs') + 0.9, READY[0], READY[1], EASE_IO)
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: ramp(t, from, from + 0.4) }}>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 22, letterSpacing: '.4em', color: C.muted }}>LAUNCH READINESS</div>
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 260, lineHeight: 1, color: C.cream, marginTop: 10, textShadow: '0 0 80px rgba(95,211,141,.25)' }}>
        {Math.round(v)}<span style={{ fontSize: 80, color: C.muted }}> / 100</span>
      </div>
      <div style={{ position: 'relative', width: 1100, height: 16, borderRadius: 8, background: 'rgba(242,235,221,.1)', marginTop: 34 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${v}%`, borderRadius: 8, background: `linear-gradient(90deg, ${C.red}, #ecd08e, ${C.ok})`, boxShadow: '0 0 30px rgba(95,211,141,.5)' }} />
        <div style={{ position: 'absolute', left: `${READY[2]}%`, top: -14, bottom: -14, width: 2, background: C.cream, opacity: 0.6 }} />
        <div style={{ position: 'absolute', left: `${READY[2]}%`, top: 34, transform: 'translateX(-50%)', fontFamily: MONO, fontSize: 18, color: C.muted, whiteSpace: 'nowrap' }}>launch at {READY[2]}+</div>
      </div>
      <div style={{ marginTop: 70, fontFamily: SANS, fontSize: 24, color: C.muted, opacity: ramp(t, word('e1', 'proven') - 0.1, word('e1', 'proven') + 0.4) }}>
        A fix only counts once the Ghost has proven it.
      </div>
    </AbsoluteFill>
  )
}
const Proof = ({ from }) => {
  const tk = 'ticket', jiraAt = word('p1', 'Jira')
  const copy = box(tk, 'copy'), title = box(tk, 'title'), steps = box(tk, 'steps')
  const rA = START.fR - 0.15, dA = START.p2 - 0.1, gA = word('p2', 'Ghost') - 0.3, sA = START.p3 - 0.15, fA = word('p3', 'fixed') + 0.28, tA = START.fT - 0.15, eA = START.e1 - 0.1
  const sw = box('deploy_before', 'sw'), btn = box('deploy_before', 'btn')
  const ghost = box('ghost_pass', 'ghost'), mark = box('ghost_pass', 'mark')
  const cropW = 800, gs = cropW / ghost.width
  const report = box('tester_fixed', 'report')
  return (
    <>
      <Seq from={from} to={rA}>
        <Screen src={shot(tk)} dim={0.06} sweepAt={0.25} cams={[focus(box(tk, 'drawer'), 0.95, 1.05), { at: 0.6, dur: 1.2, ...focus(title, 0.8, 1.75, 0, 40) },
          { at: jiraAt - from - 0.55, dur: 0.8, ...focus(copy, 0.3, 2.0, 160) }, { at: word('p1', 'steps') - from - 0.2, dur: 1.2, ...focus(steps, 0.55, 1.55, 160, 120) }]}>
          <Click x={copy.x + copy.width / 2} y={copy.y + copy.height / 2} at={jiraAt - from + 0.1} />
        </Screen>
        <JiraCard at={jiraAt - from + 0.35} />
        <Tag at={0.2} until={jiraAt - from - 0.3} n="THE TICKET" title="Jira-ready" />
      </Seq>
      <Seq from={rA} to={dA}>
        <Screen video={CLIPS.replay.file} videoFrom={0.4} holdAfter={CLIPS.replay.duration - 0.45} holdImg={shot('replay')} fadeIn={0.25} tilt={[3, -5]}
          cams={[focus(box('replay', 'modal'), 0.95, 1.25)]} />
        <Tag at={0.15} until={dA - rA} n="REPLAY" title="Their exact clicks" sub="On the build they used." />
      </Seq>
      <Seq from={dA} to={gA}>
        <Screen srcs={[[0, shot('deploy_before')], [word('p2', 'fix') - dA + 0.15, shot('deploy_after')]]} fadeIn={0.2} cams={[focus(sw, 0.62, 1.9)]}>
          <Click x={btn.x + btn.width / 2} y={btn.y + btn.height / 2} at={word('p2', 'fix') - dA} />
        </Screen>
        <Tag at={0.15} until={gA - dA} n="DEPLOY" title="The developer ships a fix" />
      </Seq>
      <Seq from={gA} to={sA}>
        <Screen src={shot('ghost_pass')} dim={0.06} fadeIn={0.2} sweepAt={word('p2', 'replays') - gA} glow="rgba(95,211,141,.12)" cams={[focus(ghost, 0.8, 1.4), { at: 0.8, dur: 2.4, ...focus(ghost, 0.66, 1.62) }]}>
          <Highlight box={ghost} at={word('p2', 'replays') - gA} until={sA - gA} color={C.ok} />
        </Screen>
        <Tag at={0.15} until={sA - gA} n="THE GHOST TESTER" title="Replays every real trail" tone={C.ok} />
      </Seq>
      <Seq from={sA} to={fA}>
        <AbsoluteFill>
          <Crop src={shot('ghost_fail')} b={ghost} x={110} y={190} w={cropW} label="OLD BUILD · STILL FAILING" tone={C.red} at={0} />
          <Crop src={shot('ghost_pass')} b={ghost} x={1010} y={190} w={cropW} label="NEW BUILD · EVERY TRAIL PASSES" tone={C.ok} at={word('p3', 'passes') - sA - 0.2}>
            <Click x={(mark.x - ghost.x + mark.width / 2) * gs} y={(mark.y - ghost.y + mark.height / 2) * gs} at={word('p3', 'fixed') - sA} />
          </Crop>
        </AbsoluteFill>
      </Seq>
      <Seq from={fA} to={tA}>
        <Screen src={shot('fixed')} dim={0.06} fadeIn={0.15} sweepAt={0.2} glow="rgba(95,211,141,.18)" cams={[focus(box('fixed', 'banner'), 0.62, 1.7, 0, -40)]} />
        <Flash at={0} peak={0.16} dur={0.35} />
      </Seq>
      <Seq from={tA} to={eA}>
        <Screen src={shot('tester_fixed')} dim={0.1} fadeIn={0.25} sweepAt={0.4} cams={[focus(box('tester_fixed', 'panel'), 0.9, 1.3, -40), { at: 0.4, dur: 1.4, ...focus(report, 0.5, 2.1) }]}>
          <Highlight box={report} at={word('fT', 'parcel') - tA} until={eA - tA} color={C.ok} />
        </Screen>
        <Tag at={0.2} until={eA - tA} n="TESTER TRACKER" title="Tracked like a parcel" sub="Sent → checked → decided → fixed." tone={C.ok} />
      </Seq>
      <Seq from={eA} to={SCENE.proofEnd}><Readiness from={eA} /></Seq>
      <Sfx at={from - 1.06} src="audio/sfx_whoosh.mp3" volume={0.3} dur={1.5} />
    </>
  )
}

// ---------- 9. Close ----------
const MessyProven = ({ from }) => {
  const t = useT() + from
  const left = ramp(t, word('e2', 'Messy') - 0.1, word('e2', 'Messy') + 0.5)
  const right = ramp(t, word('e2', 'Proven') - 0.1, word('e2', 'Proven') + 0.5)
  const chips = ['“Didn’t work.”', '“It felt weird.”', data.farah.original_text, '×5 clicks']
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: 959, top: 260, width: 2, height: 560 * ramp(t, from, from + 0.8), background: 'rgba(242,235,221,.25)' }} />
      <div style={{ position: 'absolute', left: 130, width: 700, top: 300, opacity: left, filter: left < 1 ? `blur(${(1 - left) * 10}px)` : 'none' }}>
        <div style={{ fontFamily: SERIF, fontSize: 82, color: C.cream, lineHeight: 1.05 }}>Messy feedback <em>in.</em></div>
        <div style={{ position: 'relative', height: 260, marginTop: 30 }}>
          {chips.map((c, i) => (
            <div key={i} dir={i === 2 ? 'rtl' : 'ltr'} style={{ position: 'absolute', left: [10, 330, 40, 400][i], top: [10, 40, 130, 150][i], transform: `rotate(${[-6, 5, 3, -4][i]}deg)`, fontFamily: i === 2 ? '"Geeza Pro", Arial' : SERIF,
              fontStyle: i === 2 ? 'normal' : 'italic', fontSize: 30, color: C.ink, background: C.card, borderRadius: 12, padding: '10px 18px', opacity: 0.75, boxShadow: '0 16px 30px rgba(0,0,0,.5)' }}>{c}</div>
          ))}
        </div>
      </div>
      <div style={{ position: 'absolute', left: 1090, width: 700, top: 300, opacity: right, filter: right < 1 ? `blur(${(1 - right) * 10}px)` : 'none' }}>
        <div style={{ fontFamily: SERIF, fontSize: 82, color: C.cream, lineHeight: 1.05 }}>Proven fixes <em>out.</em></div>
        <div style={{ marginTop: 40, display: 'inline-flex', alignItems: 'center', gap: 18, background: C.greenBg, border: `1px solid ${C.ok}`, borderRadius: 18, padding: '20px 28px', boxShadow: '0 0 60px rgba(95,211,141,.2)' }}>
          <span style={{ width: 44, height: 44, borderRadius: '50%', background: C.ok, color: C.greenBg, display: 'grid', placeItems: 'center', fontFamily: SANS, fontWeight: 800, fontSize: 28 }}>✓</span>
          <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 30, color: C.green }}>{data.issue.ticket_key} · Fixed, proven by the Ghost</span>
        </div>
      </div>
    </AbsoluteFill>
  )
}

// ---------- 10. The eat ----------
const BITE = 2.92
const Eat = ({ from }) => (
  <>
    <Screen video={CLIPS.eat.file} holdAfter={CLIPS.eat.duration - 1 / FPS} holdImg="clips/eat60_last.png" tilt={[2, -3]} fadeIn={0.35} fadeOut={0.45} length={SCENE.eatEnd - from} push={0.01} cams={[{ cx: 720, cy: 470, s: 1.03 }]} />
    <Sfx at={BITE - 0.28} src="audio/sfx_crunch.mp3" volume={1} dur={1.2} />
    <Sequence from={f(BITE - 0.2)} durationInFrames={f(1.6)} layout="none">
      <Audio src={staticFile('audio/sfx_cookies.mp3')} startFrom={f(2.3)} volume={(fr) => 0.8 * interpolate(fr, [0, f(1.0), f(1.6)], [1, 1, 0], { extrapolateRight: 'clamp' })} />
    </Sequence>
  </>
)

// ---------- 11. End card ----------
const EndCard = ({ from }) => {
  const t = useT() + from
  const sweep = ramp(t, from + 0.5, from + 1.9, -0.3, 1.3, EASE_IO)
  const tag = ramp(t, word('e3', 'Developers') - 0.1, word('e3', 'Developers') + 0.5)
  const by = ramp(t, lineEnd('e3') + 0.2, lineEnd('e3') + 0.9)
  const out = ramp(t, END - 1.6, END - 0.2, 1, 0)
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: out }}>
      <Spring at={0} from={0.7}><Knight size={130} /></Spring>
      <div style={{ marginTop: 28, fontFamily: SERIF, fontWeight: 700, fontSize: 190, lineHeight: 1, color: 'transparent', opacity: ramp(t, from, from + 0.3),
        backgroundImage: `linear-gradient(100deg, ${C.cream} ${sweep * 100 - 18}%, #fffaf0 ${sweep * 100}%, ${C.cream} ${sweep * 100 + 18}%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text' }}>KUAT.</div>
      <div style={{ marginTop: 18, fontFamily: SERIF, fontStyle: 'italic', fontSize: 58, color: C.cream, opacity: tag, transform: `translateY(${(1 - tag) * 14}px)` }}>Developers’ favourite Oreo.</div>
      <div style={{ marginTop: 46, fontFamily: SANS, fontWeight: 500, fontSize: 22, letterSpacing: '.28em', color: C.muted, opacity: by }}>BUILT BY FARIS SALKAWI</div>
    </AbsoluteFill>
  )
}

// ---------- The film ----------
// --props='{"noVoice":true}' renders the music and effects only, for Faris to record his own voice over.
export const Film = () => {
  const { noVoice } = getInputProps()
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Backdrop />
      <Seq from={0} to={SCENE.hookEnd}><Hook /></Seq>
      <BigText k="r1" size={124} italic until={IMPACT - 0.02} />
      <Title />
      <Seq from={SCENE.revealEnd} to={SCENE.twistAt}><ClosedCookie from={SCENE.revealEnd} /></Seq>
      <Seq from={SCENE.twistAt} to={SCENE.diagramAt}><Twist from={SCENE.twistAt} /></Seq>
      <Seq from={SCENE.diagramAt} to={SCENE.oreoEnd}><OreoDiagram from={SCENE.diagramAt} /></Seq>
      <Testers from={SCENE.oreoEnd} />
      <Agents from={SCENE.testersEnd} />
      <Montage from={SCENE.agentsEnd} />
      <Seq from={MUSIC_BACK} to={SCENE.controlEnd}><Human from={MUSIC_BACK} /></Seq>
      <Around from={SCENE.controlEnd} />
      <Proof from={SCENE.aroundEnd} />
      <Seq from={SCENE.proofEnd} to={SCENE.closeEnd}><MessyProven from={SCENE.proofEnd} /></Seq>
      <Seq from={SCENE.closeEnd} to={SCENE.eatEnd}><Eat from={SCENE.closeEnd} /></Seq>
      <Seq from={SCENE.eatEnd} to={END}><EndCard from={SCENE.eatEnd} /></Seq>

      <SectionLabel n="01" text="THE TESTER" from={SCENE.oreoEnd} to={SCENE.testersEnd} />
      <SectionLabel n="02" text="THE AGENTS" from={SCENE.testersEnd} to={SCENE.agentsEnd} />
      <SectionLabel n="03" text="THE HUMAN" from={MUSIC_BACK} to={SCENE.controlEnd} />
      <SectionLabel n="04" text="EVERYTHING AROUND IT" from={SCENE.controlEnd} to={SCENE.aroundEnd} />
      <SectionLabel n="05" text="THE PROOF" from={SCENE.aroundEnd} to={SCENE.proofEnd} />

      <Flash at={IMPACT} peak={0.4} dur={0.45} />
      <Seq from={MUSIC_BREAK} to={MUSIC_BACK}><AbsoluteFill style={{ background: '#000' }} /></Seq>
      <Vignette />
      <Letterbox openAt={IMPACT} />
      <Captions skip={['h1', 'h2', 'r1', 'r2', 'e2', 'e3']} />

      <Audio src={staticFile('audio/music_film.wav')} volume={(fr) => musicVolume(fr / FPS)} />
      {!noVoice && Object.keys(START).map((k) => (
        <Sequence key={k} from={f(START[k])} durationInFrames={f(LINES[k].duration + 0.6)} layout="none"><Audio src={staticFile(LINES[k].file)} volume={1} /></Sequence>
      ))}
      <Sfx at={0.25} src="audio/sfx_heartbeat.mp3" volume={0.8} dur={3.5} />
      <Sequence from={f(IMPACT - 0.98 + 0.55)} durationInFrames={f(4.3)} layout="none">
        <Audio src={staticFile('audio/sfx_impact.mp3')} startFrom={f(0.55)} volume={(fr) => 0.9 * interpolate(fr, [0, 8], [0, 1], { extrapolateRight: 'clamp' })} />
      </Sequence>
      <Sfx at={SCENE.revealEnd - 0.6} src="audio/sfx_riser.mp3" volume={0.35} dur={6.7} />
    </AbsoluteFill>
  )
}
