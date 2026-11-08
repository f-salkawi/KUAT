// Building blocks for the KUAT film: backdrop, grain, letterbox, captions, the floating 3D app screen with
// a camera, clicks, highlights and kinetic type. Everything is a pure function of the frame, so renders are exact.
import React from 'react'
import { AbsoluteFill, Audio, Easing, Img, OffthreadVideo, Sequence, interpolate, random, spring, staticFile, useCurrentFrame } from 'remotion'
import { loadFont as loadFraunces } from '@remotion/google-fonts/Fraunces'
import { loadFont as loadInter } from '@remotion/google-fonts/Inter'
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono'
import { FPS, LINES, START, f } from './time'

export const SERIF = loadFraunces('normal', { weights: ['500', '700'], subsets: ['latin'] }).fontFamily
loadFraunces('italic', { weights: ['500'], subsets: ['latin'] })
export const SANS = loadInter('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin'] }).fontFamily
export const MONO = loadMono('normal', { weights: ['400', '600'], subsets: ['latin'] }).fontFamily

export const C = {
  bg: '#0f0b09', choc: '#2a1e19', choc2: '#33251f', line: '#4a372e', cream: '#f2ebdd', card: '#fbf7ef',
  ink: '#1d1411', muted: '#a8998a', mutedInk: '#7d6e60', blue: '#2d63e6', blueSoft: '#7fa6ff', ok: '#5fd38d',
  green: '#9fe0b6', greenBg: '#203a2c', red: '#ff8f98', redBg: '#4b1d22',
}
export const EASE = Easing.bezier(0.2, 0.7, 0.2, 1)
export const EASE_IO = Easing.bezier(0.65, 0, 0.35, 1)
const CL = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
export const ramp = (t, a, b, from = 0, to = 1, easing = EASE) => interpolate(t, [a, b], [from, to], { ...CL, easing })
const lerp = (a, b, p) => a + (b - a) * p

export function useT() {
  return useCurrentFrame() / FPS
}

// ---------- Atmosphere ----------
export const Backdrop = () => {
  const t = useT()
  const x = 50 + Math.sin(t * 0.13) * 10
  const y = 40 + Math.cos(t * 0.1) * 7
  return <AbsoluteFill style={{ background: `radial-gradient(ellipse 75% 65% at ${x}% ${y}%, #2b1e17 0%, #150f0c 46%, #060403 100%)` }} />
}

export const Grain = () => {
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill style={{ backgroundImage: `url(${staticFile('fx/grain.png')})`, backgroundSize: '320px 320px', opacity: 0.075, mixBlendMode: 'overlay',
      backgroundPosition: `${Math.floor(random(`gx${frame}`) * 320)}px ${Math.floor(random(`gy${frame}`) * 320)}px`, pointerEvents: 'none' }} />
  )
}

export const Vignette = ({ strength = 0.62 }) => (
  <AbsoluteFill style={{ background: `radial-gradient(ellipse 85% 80% at 50% 48%, rgba(0,0,0,0) 52%, rgba(0,0,0,${strength}) 100%)`, pointerEvents: 'none' }} />
)

export const Letterbox = ({ openAt }) => {
  const t = useT()
  const h = ramp(t, openAt, openAt + 0.75, 128, 0, EASE_IO)
  if (h <= 0.5) return null
  return (
    <>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: h, background: '#000' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: h, background: '#000' }} />
    </>
  )
}

export const Flash = ({ at, peak = 0.4, dur = 0.35 }) => {
  const t = useT()
  const o = t < at ? 0 : ramp(t, at, at + dur, peak, 0, Easing.out(Easing.quad))
  return o > 0 ? <AbsoluteFill style={{ background: '#fff6e8', opacity: o, pointerEvents: 'none' }} /> : null
}

// ---------- Sound ----------
export const Sfx = ({ at, src, volume = 0.6, dur = 6 }) => (
  <Sequence from={f(at)} durationInFrames={f(dur)} layout="none"><Audio src={staticFile(src)} volume={volume} /></Sequence>
)

// ---------- Captions (word by word, from the voice's own timings) ----------
export const Captions = ({ skip = [] }) => {
  const t = useT()
  const live = Object.keys(START).filter((k) => !skip.includes(k) && t >= START[k] - 0.1 && t <= START[k] + LINES[k].duration + 0.7)
  const key = live.sort((a, b) => START[b] - START[a])[0]   // the newest line wins, so a new line is never held back
  if (!key) return null
  const line = LINES[key]
  const start = START[key]
  const out = ramp(t, start + line.duration + 0.35, start + line.duration + 0.7, 1, 0)
  return (
    <>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 250, opacity: out, background: 'linear-gradient(to top, rgba(0,0,0,.72), rgba(0,0,0,.38) 55%, rgba(0,0,0,0))' }} />
    <div style={{ position: 'absolute', left: 160, right: 160, bottom: 74, textAlign: 'center', opacity: out }}>
      <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 38, lineHeight: 1.35, color: C.cream, textShadow: '0 2px 18px rgba(0,0,0,.85), 0 0 2px rgba(0,0,0,.9)' }}>
        {line.words.map((w, i) => {
          const a = ramp(t, start + w.start - 0.05, start + w.start + 0.18)
          return <span key={i} style={{ opacity: a, display: 'inline-block', transform: `translateY(${(1 - a) * 6}px)`, marginRight: '0.28em' }}>{w.shown || w.w}</span>   // a word appears exactly when it is said
        })}
      </span>
    </div>
    </>
  )
}

// Big cinematic words, each blurring in on its spoken word.
export const BigText = ({ k, size = 86, italic = false, until, y = 0, color = C.cream, weight = 500 }) => {
  const t = useT()
  const line = LINES[k]
  const start = START[k]
  const end = until ?? start + line.duration + 0.6
  const out = ramp(t, end - 0.35, end, 1, 0)
  const zoom = 1 + 0.03 * ramp(t, start, end, 0, 1, Easing.linear)
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: out, transform: `translateY(${y}px) scale(${zoom})` }}>
      <div style={{ maxWidth: 1500, textAlign: 'center', fontFamily: SERIF, fontStyle: italic ? 'italic' : 'normal', fontWeight: weight, fontSize: size, lineHeight: 1.12, color, letterSpacing: '-0.01em' }}>
        {line.words.map((w, i) => {
          const a = ramp(t, start + w.start - 0.06, start + w.start + 0.32)
          return <span key={i} style={{ display: 'inline-block', marginRight: '0.24em', opacity: a, filter: `blur(${(1 - a) * 10}px)`, transform: `translateY(${(1 - a) * 18}px)` }}>{w.shown || w.w}</span>
        })}
      </div>
    </AbsoluteFill>
  )
}

export const SectionLabel = ({ n, text, from, to }) => {
  const t = useT()
  const a = Math.min(ramp(t, from + 0.2, from + 0.8), ramp(t, to - 0.5, to - 0.1, 1, 0))
  if (a <= 0) return null
  return (
    <div style={{ position: 'absolute', left: 96, top: 72, display: 'flex', alignItems: 'center', gap: 18, opacity: a }}>
      <span style={{ fontFamily: MONO, fontSize: 18, color: C.blueSoft, letterSpacing: '0.2em' }}>{n}</span>
      <span style={{ width: 70 * a, height: 1, background: 'rgba(242,235,221,.45)' }} />
      <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 18, letterSpacing: '0.32em', color: 'rgba(242,235,221,.78)' }}>{text}</span>
    </div>
  )
}

// ---------- The floating app screen with a camera ----------
// World coordinates are the app's own CSS pixels (1440 x 900). A camera key moves the point (cx, cy) to the
// centre of the frame at zoom s, easing over `dur` seconds from `at`.
export const focus = (b, fill = 0.62, max = 2.6, dx = 0, dy = 0) =>
  ({ cx: b.x + b.width / 2 + dx, cy: b.y + b.height / 2 + dy, s: Math.min(max, (1920 * fill) / b.width, (1080 * fill) / b.height) })
export const FULL = { cx: 720, cy: 450, s: 1.0 }

function camAt(cams, t) {
  let cur = cams[0]
  for (let i = 1; i < cams.length; i++) {
    const k = cams[i]
    if (t <= k.at) break
    const p = EASE_IO(Math.min(1, (t - k.at) / (k.dur || 1.1)))
    cur = { cx: lerp(cur.cx, k.cx, p), cy: lerp(cur.cy, k.cy, p), s: Math.exp(lerp(Math.log(cur.s), Math.log(k.s), p)) }
  }
  return cur
}

export const Screen = ({ src, srcs, video, videoFrom = 0, holdAfter, holdImg, playbackRate = 1, cams = [FULL], tilt = [7, -9], fadeIn = 0.45, fadeOut = 0, length, children, push = 0.014, sweepAt, glow, dim = 0 }) => {
  const grade = `brightness(${1 - dim}) contrast(1.05) saturate(0.96)`
  const frame = useCurrentFrame()
  const t = frame / FPS
  const cam = camAt(cams, t)
  const s = cam.s * (1 + push * t)
  const enter = fadeIn ? ramp(t, 0, fadeIn) : 1
  const exit = fadeOut && length ? ramp(t, length - fadeOut, length, 1, 0) : 1
  const settle = 1 - Math.min(1, Math.max(0, (s - 1) / 1.4))
  const rx = tilt[0] * settle * (0.55 + 0.45 * (1 - enter))
  const ry = tilt[1] * settle * (0.55 + 0.45 * (1 - enter))
  const sweep = sweepAt === undefined ? null : ramp(t, sweepAt, sweepAt + 1.1, -0.4, 1.4, EASE_IO)
  return (
    <AbsoluteFill style={{ opacity: enter * exit }}>
      {/* Flat 2D only: 3D layers made the graphics chip drop or garble frames on big zoomed screenshots. */}
      <AbsoluteFill style={{ transform: `scale(${0.96 + 0.04 * enter})`, transformOrigin: '50% 50%' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: 1440, height: 900, transformOrigin: '0 0', transform: `translate(${960 - cam.cx * s}px, ${540 - cam.cy * s}px) scale(${s})` }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 18, overflow: 'hidden', background: C.bg,
            boxShadow: `0 60px 140px rgba(0,0,0,.7), 0 0 0 1px rgba(242,235,221,.10)${glow ? `, 0 0 120px ${glow}` : ''}` }}>
            {video && !(holdAfter !== undefined && t >= holdAfter)
              ? <OffthreadVideo src={staticFile(video)} startFrom={f(videoFrom)} playbackRate={playbackRate} muted style={{ width: 1440, height: 900, display: 'block', filter: grade }} />
              : <Img src={staticFile(video ? holdImg : srcs ? (srcs.filter(([a]) => t >= a).slice(-1)[0] || srcs[0])[1] : src)} style={{ width: 1440, height: 900, display: 'block', filter: grade }} />}
            {sweep !== null && sweep > -0.4 && sweep < 1.4 && (
              <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(105deg, rgba(255,255,255,0) ${sweep * 100 - 14}%, rgba(255,248,235,.16) ${sweep * 100}%, rgba(255,255,255,0) ${sweep * 100 + 14}%)` }} />
            )}
          </div>
          {children}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

// A cursor that glides in and clicks, with a ripple and a click sound. Coordinates are world (app) pixels.
export const Click = ({ x, y, at, sound = true, from = [80, 60] }) => {
  const t = useT()
  if (t < at - 0.75 || t > at + 1.2) return null
  const arrive = ramp(t, at - 0.6, at - 0.04, 0, 1, EASE)
  const cx = x + from[0] * (1 - arrive)
  const cy = y + from[1] * (1 - arrive)
  const press = t >= at && t < at + 0.12 ? 0.82 : 1
  const r = ramp(t, at, at + 0.55, 4, 40, Easing.out(Easing.cubic))
  const ro = t >= at ? ramp(t, at, at + 0.55, 0.85, 0) : 0
  const leave = ramp(t, at + 0.7, at + 1.1, 1, 0)
  return (
    <>
      {ro > 0 && <div style={{ position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: '50%', border: '3px solid rgba(127,166,255,.95)', opacity: ro, boxShadow: '0 0 24px rgba(127,166,255,.8)' }} />}
      <svg width="30" height="30" viewBox="0 0 24 24" style={{ position: 'absolute', left: cx - 5, top: cy - 3, transform: `scale(${press})`, transformOrigin: '5px 3px', opacity: leave, filter: 'drop-shadow(0 3px 5px rgba(0,0,0,.55))' }}>
        <path d="M5 2.5l14 8.2-6.2 1.5-3.1 6.3z" fill="#fff" stroke="#111" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      {sound && <Sfx at={at} src="audio/sfx_click.mp3" volume={0.5} dur={0.6} />}
    </>
  )
}

export const Highlight = ({ box, at, until = 99, pad = 8, color = C.blueSoft, radius = 14 }) => {
  const t = useT()
  if (t < at) return null
  const a = Math.min(ramp(t, at, at + 0.35), ramp(t, until - 0.3, until, 1, 0))
  const sc = 1 + 0.06 * (1 - ramp(t, at, at + 0.4))
  return (
    <div style={{ position: 'absolute', left: box.x - pad, top: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2, borderRadius: radius,
      border: `3px solid ${color}`, boxShadow: `0 0 28px ${color}, inset 0 0 18px rgba(127,166,255,.25)`, opacity: a, transform: `scale(${sc})` }} />
  )
}

export const Spring = ({ at, children, from = 1.3, style = {} }) => {
  const frame = useCurrentFrame()
  const s = spring({ frame: frame - f(at), fps: FPS, config: { damping: 14, stiffness: 140, mass: 0.9 } })
  const o = interpolate(frame - f(at), [0, 6], [0, 1], CL)
  return <div style={{ ...style, opacity: o, transform: `${style.transform || ''} scale(${lerp(from, 1, s)})`, filter: `blur(${(1 - o) * 8}px)` }}>{children}</div>
}

export const Knight = ({ size = 150 }) => (
  <div style={{ width: size, height: size, borderRadius: '50%', background: C.choc, boxShadow: `inset 0 0 0 ${size * 0.035}px #46342b, 0 0 0 ${size * 0.06}px rgba(242,235,221,.06), 0 30px 80px rgba(0,0,0,.6)`,
    display: 'grid', placeItems: 'center' }}>
    <span style={{ fontSize: size * 0.74, color: C.cream, lineHeight: 1, transform: `translateY(-${size * 0.03}px)` }}>♞</span>
  </div>
)
