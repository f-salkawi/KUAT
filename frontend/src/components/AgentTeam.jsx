import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'

export const AGENTS = [
  { name: 'KUAT', icon: 'fa-chess-knight', job: 'runs the team' },
  { name: 'Translator', icon: 'fa-language', job: 'any language in' },
  { name: 'Detective', icon: 'fa-magnifying-glass', job: 'reads the clicks' },
  { name: 'Spotter', icon: 'fa-layer-group', job: 'stacks duplicates' },
  { name: 'Writer', icon: 'fa-pen-nib', job: 'drafts the ticket' },
  { name: 'Mechanic', icon: 'fa-wrench', job: 'suggests the fix' },
]
const LIT_FOR_MS = 2600
const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

// The cream: the agent team, lighting up live as each one posts to the feed.
export default function AgentTeam() {
  const [items, setItems] = useState([])
  const [lit, setLit] = useState({})
  const [, tick] = useState(0)
  const last = useRef(0)

  useEffect(() => {
    let alive = true
    const load = () => api.feed(last.current).then((rows) => {
      if (!alive || !rows.length) return
      const first = last.current === 0
      last.current = rows[rows.length - 1].id
      setItems((old) => [...rows.reverse(), ...old].slice(0, 60))
      if (first) return   // history on page load should not light anyone up
      // Light the agents one after another, in the order they worked.
      rows.slice().reverse().forEach((row, i) => setTimeout(() => setLit((l) => ({ ...l, [row.agent]: Date.now() })), i * 350))
    }).catch(() => {})
    load()
    const id = setInterval(load, 1200)
    const t = setInterval(() => tick((n) => n + 1), 500)
    return () => { alive = false; clearInterval(id); clearInterval(t) }
  }, [])

  const now = Date.now()
  return (
    <>
      <div className="agents">
        {AGENTS.map((a) => (
          <div key={a.name} className={`agent ${now - (lit[a.name] || 0) < LIT_FOR_MS ? 'on' : ''}`}>
            <i className={`fa-solid ${a.icon}`} aria-hidden="true" />
            <b>{a.name}</b>
            <small>{a.job}</small>
          </div>
        ))}
      </div>
      <div className="feed" aria-live="polite">
        {items.length === 0 && <p className="small" style={{ color: 'var(--muted-ink)' }}>Waiting for the first report...</p>}
        {items.map((e) => (
          <div className="feed-item" key={e.id}>
            <span className="who">{e.agent}</span>
            <span dir="auto">{e.message}</span>
            <span className="when">{time(e.at)}</span>
          </div>
        ))}
      </div>
    </>
  )
}
