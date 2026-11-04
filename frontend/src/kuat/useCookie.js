import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

// The cookie that opens into the dashboard. Each layer's open position is its real place on the
// page; the closed cookie is just a transform of it. Only transforms and opacity animate (the GPU
// does that work), and every frame is sampled from smooth curves, so speed never jumps.
const TILT = 58
const DURATION = 1400
const SAMPLES = 60
const NAMES = ['top', 'mid', 'bot']
const LIFT = { top: -90, mid: 0, bot: 34 }   // the top biscuit lifts off, the bottom one drops a little
const STACK = { top: 0, mid: 26, bot: 50 }   // how far apart the layers sit when closed

const clamp = (x) => Math.max(0, Math.min(1, x))
const smooth = (x) => { x = clamp(x); return x * x * x * (x * (6 * x - 15) + 10) }   // smootherstep
const bump = (x) => Math.sin(Math.PI * clamp(x)) ** 2                                // 0 → 1 → 0, soft at both ends

export function useCookie({ stage, layers, mouth, hole, startOpen, onEaten }) {
  const [state, setState] = useState(startOpen ? 'open' : 'closed')   // closed | opening | open | closing | eaten
  const anims = useRef([])
  const stateRef = useRef(state)
  stateRef.current = state

  const geometry = useCallback(() => {
    const st = stage.current
    const disc = Math.min(300, st.clientWidth - 48)
    const hero = st.querySelector('.hero')
    const first = (hero ? hero.offsetTop + hero.offsetHeight : 0) + 50 + disc / 2
    return { disc, centre: Object.fromEntries(NAMES.map((n) => [n, first + STACK[n]])) }
  }, [stage])

  // p = time (0 to 1). k = how much of a cookie it still is (1 = cookie, 0 = card).
  // Only the transform moves; the look cross-fades separately, so nothing is repainted per frame.
  const pose = useCallback((name, p, g) => {
    const el = layers[name].current
    const w = el.offsetWidth, h = el.offsetHeight, cardY = el.offsetTop + h / 2
    const disc = name === 'mid' ? g.disc * 0.967 : g.disc
    const k = 1 - smooth((p - 0.12) / 0.88)
    const twist = name === 'top' ? -360 * smooth(p) : 0       // twists off, keeps spinning, lands flat
    const sx = 1 + (disc / w - 1) * k, sy = 1 + (disc / h - 1) * k
    const dy = (g.centre[name] - cardY) * k + LIFT[name] * bump(p / 0.75)
    return { transform: `translate3d(0px, ${dy}px, 0px) perspective(1000px) rotateX(${TILT * k}deg) rotateZ(${twist}deg) scale(${sx}, ${sy})` }
  }, [layers])

  // The face (ridges and stamp) is drawn as a true circle, un-squashing the layer's scale.
  const sizeFaces = useCallback((g) => {
    for (const n of NAMES) {
      const el = layers[n].current, face = el.querySelector('.face')
      if (!face) continue
      Object.assign(face.style, { width: `${g.disc}px`, height: `${g.disc}px`, margin: `${-g.disc / 2}px 0 0 ${-g.disc / 2}px`,
        transform: `scale(${el.offsetWidth / g.disc}, ${el.offsetHeight / g.disc})` })
    }
  }, [layers])

  const setClosed = useCallback(() => {
    const g = geometry()
    sizeFaces(g)
    for (const n of NAMES) Object.assign(layers[n].current.style, pose(n, 0, g))
    const st = stage.current
    const lowest = g.centre.bot + g.disc * 0.3          // tilted 58°, the cookie's lowest edge is about 0.27 x its width below the centre
    st.style.setProperty('--closed-h', `${lowest + 130}px`)
    const hint = st.querySelector('.hint')
    if (hint) hint.style.top = `${lowest + 56}px`
    const shadow = st.querySelector('.cookie-shadow')
    if (shadow) Object.assign(shadow.style, { top: `${g.centre.bot + g.disc * 0.27}px`, width: `${g.disc * 1.05}px` })
  }, [geometry, sizeFaces, pose, layers, stage])

  const stopAll = () => { anims.current.forEach((a) => a.cancel()); anims.current = [] }

  // Settle the final state before the browser paints, so nothing flashes between frames.
  useLayoutEffect(() => {
    if (state === 'closed') { setClosed(); stopAll() }
    if (state === 'open') {
      for (const n of NAMES) layers[n].current.style.transform = ''
      stopAll()
    }
  }, [state]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the closed cookie right when content loads or the window changes size.
  useEffect(() => {
    const ro = new ResizeObserver(() => { if (stateRef.current === 'closed') setClosed() })
    NAMES.forEach((n) => ro.observe(layers[n].current))
    ro.observe(stage.current)
    return () => ro.disconnect()
  }, [setClosed, layers, stage])

  const play = useCallback((forward) => {
    if (!['open', 'closed'].includes(stateRef.current)) return
    if (!forward) window.scrollTo({ top: 0, behavior: 'smooth' })
    const g = geometry()
    sizeFaces(g)
    stopAll()
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches   // respect the "reduce motion" setting
    const time = (ms) => (calm ? 1 : ms)
    const opts = { duration: time(DURATION), easing: 'linear', fill: 'both', direction: forward ? 'normal' : 'reverse' }
    const all = NAMES.map((n) => layers[n].current.animate(
      Array.from({ length: SAMPLES + 1 }, (_, i) => pose(n, i / SAMPLES, g)), opts))
    const fade = (selector, show, delay, duration) => stage.current.querySelectorAll(selector).forEach((el) =>
      all.push(el.animate([{ opacity: show ? 0 : 1 }, { opacity: show ? 1 : 0 }], { duration: time(duration), delay: time(delay), fill: 'both', easing: 'ease-in-out' })))
    fade('.face', !forward, forward ? 560 : DURATION - 820, 460)
    fade('.card-bg', forward, forward ? 420 : DURATION - 900, 520)
    fade('.inner', forward, forward ? DURATION - 300 : 0, forward ? 500 : 300)
    anims.current = all
    setState(forward ? 'opening' : 'closing')
    Promise.all(all.slice(0, NAMES.length).map((a) => a.finished))
      .then(() => setState(forward ? 'open' : 'closed'))
      .catch(() => {})   // cancelled by a newer animation
  }, [geometry, sizeFaces, pose, layers, stage])

  // Drag the closed cookie: the mouth only comes in when it heads down, and opens wider as it nears.
  useEffect(() => {
    if (state !== 'closed') return undefined
    const st = stage.current
    const wrap = st.querySelector('.cookie-layers')
    let drag = null, queued = false
    const centreOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }
    const mouthSpot = () => ({ x: window.innerWidth / 2, y: window.innerHeight - 28 - 75 })
    const gap = () => { const m = mouthSpot(); return Math.hypot(drag.start.x + drag.dx - m.x, drag.start.y + drag.dy - m.y) }
    const render = () => {
      queued = false
      if (!drag) return
      wrap.style.transform = `translate3d(${drag.dx}px, ${drag.dy}px, 0) rotate(${drag.dx * 0.04}deg)`
      mouth.current.classList.toggle('show', drag.dy > 30)
      hole.current.style.transform = `scaleY(${0.18 + 0.82 * clamp(1 - (gap() - 90) / 330)})`
    }
    const down = (e) => {
      if (!e.target.closest('.layer')) return
      drag = { x: e.clientX, y: e.clientY, dx: 0, dy: 0, moved: false, start: centreOf(layers.mid.current) }
      try { st.setPointerCapture(e.pointerId) } catch { /* synthetic pointer */ }
    }
    const move = (e) => {
      if (!drag) return
      drag.dx = e.clientX - drag.x
      drag.dy = e.clientY - drag.y
      if (!drag.moved && Math.hypot(drag.dx, drag.dy) < 6) return
      if (!drag.moved) { drag.moved = true; st.classList.add('dragging'); st.style.overflow = 'visible'; wrap.style.transition = 'none' }
      if (!queued) { queued = true; requestAnimationFrame(render) }
    }
    const up = () => {
      if (!drag) return
      const d = drag, g = gap()
      drag = null
      st.classList.remove('dragging')
      if (!d.moved) { play(true); return }
      if (d.dy > 30 && g < 140) { eat(d); return }   // decided from where the cookie is, even on a flick faster than a frame
      wrap.style.transition = 'transform .6s cubic-bezier(.3,1.35,.5,1)'
      wrap.style.transform = ''
      mouth.current.classList.remove('show')
      hole.current.style.transform = ''
      setTimeout(() => { st.style.overflow = '' }, 600)
    }
    const eat = (d) => {
      setState('eaten')
      mouth.current.classList.add('show')
      const c = { x: d.start.x + d.dx, y: d.start.y + d.dy }, m = mouthSpot()
      hole.current.style.transform = 'scaleY(1)'
      wrap.style.transition = 'transform .38s cubic-bezier(.55,0,.8,.2), opacity .18s .28s'
      wrap.style.transform = `translate3d(${d.dx + m.x - c.x}px, ${d.dy + m.y - c.y}px, 0) scale(.28) rotate(${d.dx * 0.04 + 25}deg)`
      wrap.style.opacity = '0'
      setTimeout(() => { hole.current.style.transform = ''; mouth.current.classList.add('chomp'); crumbs(m) }, 360)
      setTimeout(() => onEaten?.(), 1100)
    }
    st.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      st.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [state, play]) // eslint-disable-line react-hooks/exhaustive-deps

  // Back from the end screen: a fresh cookie, crumbs swept away.
  const bake = useCallback(() => {
    document.querySelectorAll('.crumb').forEach((c) => c.remove())
    const st = stage.current, wrap = st.querySelector('.cookie-layers')
    Object.assign(wrap.style, { transition: 'none', transform: '', opacity: '' })
    st.style.overflow = ''
    mouth.current.classList.remove('show', 'chomp')
    hole.current.style.transform = ''
    setState('closed')
  }, [stage, mouth, hole])

  return { state, open: () => play(true), close: () => play(false), bake }
}

// Crumbs burst out of the mouth, arc up, fall and settle on the floor of the end screen.
function crumbs(m) {
  const colours = ['#8a6a57', '#6f5242', '#a5826c', '#f2ebdd', '#7c5e4c', '#e6dcc8']
  for (let n = 0; n < 34; n++) {
    const c = document.createElement('div'), size = 7 + Math.random() * 11
    c.className = 'crumb'
    Object.assign(c.style, { width: `${size}px`, height: `${size * (0.6 + Math.random() * 0.5)}px`, background: colours[n % colours.length] })
    document.body.appendChild(c)
    const x0 = m.x - 40 + Math.random() * 80, y0 = m.y - 30
    const x1 = x0 + (Math.random() - 0.5) * 520, apex = y0 - 60 - Math.random() * 160
    const floor = window.innerHeight - size - Math.random() * 6, spin = (Math.random() - 0.5) * 720
    c.animate([
      { transform: `translate(${x0}px, ${y0}px) rotate(0deg)`, easing: 'cubic-bezier(.2,.6,.35,1)' },
      { transform: `translate(${(x0 + x1) / 2}px, ${apex}px) rotate(${spin / 2}deg)`, offset: 0.35, easing: 'cubic-bezier(.55,0,1,.45)' },
      { transform: `translate(${x1}px, ${floor}px) rotate(${spin}deg)`, offset: 0.85, easing: 'ease-out' },
      { transform: `translate(${x1}px, ${floor - 8}px) rotate(${spin}deg)`, offset: 0.93, easing: 'ease-in' },
      { transform: `translate(${x1}px, ${floor}px) rotate(${spin}deg)` },
    ], { duration: 1300 + Math.random() * 500, fill: 'forwards' })
  }
}
