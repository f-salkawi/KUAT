import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api.js'
import AgentTeam from '../components/AgentTeam.jsx'
import Briefing from '../components/Briefing.jsx'
import { Boards, DevSummary } from '../components/DevBoard.jsx'
import ReviewCard from '../components/ReviewCard.jsx'
import TesterReports from '../components/TesterReports.jsx'
import TicketDrawer from '../components/TicketDrawer.jsx'
import { useCookie } from '../kuat/useCookie.js'

const ticketFromHash = () => Number((window.location.hash.match(/^#\/ticket\/(\d+)/) || [])[1]) || null

// The KUAT dashboard is one cookie. Closed, it is the landing page. Twist it open and the three
// layers become the three jobs: testers on top, the agent team in the cream, the humans at the bottom.
export default function Dashboard({ steps, flags, setFlags, health }) {
  const stage = useRef(null)
  const top = useRef(null), mid = useRef(null), bot = useRef(null)
  // One stable object: a new one each render would restart the cookie's drag handlers mid-drag.
  const layers = useMemo(() => ({ top, mid, bot }), [])
  const mouth = useRef(null)
  const hole = useRef(null)
  const [eaten, setEaten] = useState(false)
  const [ticket, setTicket] = useState(ticketFromHash)
  const [busy, setBusy] = useState(false)
  const [openBugs, setOpenBugs] = useState(null)
  const startOpen = (() => { try { return Boolean(ticketFromHash()) || sessionStorage.getItem('kuat-open') === '1' } catch { return false } })()
  const cookie = useCookie({ stage, layers, mouth, hole, startOpen, onEaten: () => {
    setEaten(true)
    api.dashboard().then((d) => setOpenBugs(d.counts.to_fix + d.counts.waiting)).catch(() => {})
  } })

  useEffect(() => { try { sessionStorage.setItem('kuat-open', cookie.state === 'open' ? '1' : '0') } catch { /* private mode */ } }, [cookie.state])
  useEffect(() => {
    const on = () => setTicket(ticketFromHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const openTicket = (id) => { window.location.hash = `#/ticket/${id}` }
  const closeTicket = () => { window.location.hash = '#/' }

  async function demo(kind) {
    if (kind === 'reset' && !window.confirm('Start a fresh test cycle? This clears every report, ticket and decision.')) return
    setBusy(true)
    try {
      if (kind === 'reset') { await api.reset(); setFlags(await api.build()) } else await api.scenario()
    } finally {
      setBusy(false)
    }
  }

  const stageClass = cookie.state === 'eaten' ? 'closed eaten' : cookie.state === 'closed' ? 'closed' : cookie.state === 'open' ? 'open' : 'moving'

  return (
    <>
      <nav className="kbar">
        <div className="kmark" aria-hidden="true"><i className="fa-solid fa-chess-knight" /></div>
        <a className="name" href="#/">KUAT</a>
        <span className="mode">
          {health?.ok && <><span className="live-dot" />{health.mode === 'ai' ? '6 AI agents ready' : 'Rules mode (no AI key)'}</>}
        </span>
        <a className="btn sm" href="#/test" target="_blank" rel="noreferrer">Open the test site <i className="fa-solid fa-arrow-up-right-from-square" /></a>
      </nav>

      <div className={`stage ${stageClass}`} ref={stage}>
        <header className="hero">
          <h1>KUAT.<br /><em>Developers' favourite Oreo.</em></h1>
          <p>Twist it open: testers on top, AI agents in the cream, you decide at the bottom.</p>
        </header>

        <div className="cookie-shadow" aria-hidden="true" />
        <div className="cookie-layers" role={cookie.state === 'closed' ? 'button' : undefined} tabIndex={cookie.state === 'closed' ? 0 : -1}
          aria-label={cookie.state === 'closed' ? 'Twist the cookie open to see the KUAT dashboard' : undefined}
          onKeyDown={(e) => { if (cookie.state === 'closed' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); cookie.open() } }}>
          <section className="layer biscuit" ref={layers.top} aria-label="Top biscuit: testers">
            <div className="card-bg" />
            <div className="face"><div className="edge" /><div className="tex" /><div className="emboss"><div><i className="fa-solid fa-chess-knight" /><span>KUAT</span></div></div></div>
            <div className="inner" inert={cookie.state !== 'open' ? true : undefined}>
              <div className="layer-head">
                <div><div className="lab">Top biscuit · testers</div><h2>What testers are saying</h2></div>
                <div className="row">
                  <a className="btn sm" href="#/test" target="_blank" rel="noreferrer">Open the test site <i className="fa-solid fa-arrow-up-right-from-square" /></a>
                  <button className="btn sm primary" disabled={busy} onClick={() => demo('scenario')}>Load demo testers</button>
                  <button className="btn sm" disabled={busy} onClick={() => demo('reset')}>Reset</button>
                  <button className="btn sm" onClick={cookie.close}>Close the cookie</button>
                </div>
              </div>
              <TesterReports steps={steps} onOpen={openTicket} onDemo={() => demo('scenario')} busy={busy} />
            </div>
          </section>

          <section className="layer cream" ref={layers.mid} aria-label="The cream: agent team">
            <div className="card-bg" />
            <div className="face"><div className="cream-disc" /></div>
            <div className="inner" inert={cookie.state !== 'open' ? true : undefined}>
              <div className="layer-head">
                <div><div className="lab">The cream · agent team</div><h2>Agents at work, live</h2></div>
                <span className="small" style={{ color: 'var(--muted-ink)' }}>They only suggest. Nothing becomes a ticket without a person.</span>
              </div>
              <AgentTeam />
            </div>
          </section>

          <section className="layer biscuit" ref={layers.bot} aria-label="Bottom biscuit: you decide">
            <div className="card-bg" />
            <div className="face"><div className="edge" /><div className="tex" /></div>
            <div className="inner" inert={cookie.state !== 'open' ? true : undefined}>
              <div className="layer-head">
                <div><div className="lab">Bottom biscuit · you decide</div><h2>Approve, fix, prove it</h2></div>
              </div>
              <Briefing />
              <div className="decide">
                <ReviewCard steps={steps} />
                <DevSummary flags={flags} setFlags={setFlags} />
              </div>
              <Boards onOpen={openTicket} />
            </div>
          </section>
        </div>

        <div className="hint">Tap the cookie to <b>twist it open</b>, or drag it down to eat it</div>
      </div>

      <div className="mouth" ref={mouth} aria-hidden="true"><div className="lips"><div className="hole" ref={hole} /></div></div>
      <div className={`end ${eaten ? 'show' : ''}`} role={eaten ? 'dialog' : undefined} aria-hidden={!eaten}>
        <div>
          <h2>Eaten.</h2>
          <p>{openBugs === null ? 'Crumbs: many.' : openBugs === 0 ? 'Bugs: 0. Crumbs: many.' : `Bugs still open: ${openBugs}. Crumbs: many.`} See you next test cycle.</p>
          <button className="btn primary" onClick={() => { setEaten(false); cookie.bake() }}>Bake another</button>
        </div>
      </div>

      {ticket && <TicketDrawer id={ticket} steps={steps} flags={flags} onClose={closeTicket} />}
    </>
  )
}
