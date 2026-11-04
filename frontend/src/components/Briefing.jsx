import { useState } from 'react'
import { api } from '../api.js'

// KUAT explains the whole test cycle in plain English. Every number comes from the database;
// the AI only words it, and the card says whether the AI or the rules wrote it.
export default function Briefing() {
  const [brief, setBrief] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function ask() {
    setBusy(true)
    setError('')
    try { setBrief(await api.briefing()) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="briefing">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row" style={{ gap: 12 }}>
          <div className="kmark" aria-hidden="true"><i className="fa-solid fa-chess-knight" /></div>
          <div>
            <div className="lab">KUAT's briefing</div>
            <div className="small muted">The whole test cycle, in plain English</div>
          </div>
        </div>
        <button className="btn sm primary" onClick={ask} disabled={busy}>
          {busy ? <><span className="spinner" /> Thinking...</> : brief ? 'Ask again' : "Ask KUAT how it's going"}
        </button>
      </div>
      {error && <div className="error-text" style={{ marginTop: 10 }}>{error}</div>}
      {brief && (
        <div className="brief-body" key={brief.headline}>
          <h3>{brief.headline}</h3>
          <ul>{brief.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
          <div className="next"><b>Next step:</b> {brief.next_step}</div>
          <div className="small muted">{brief.by === 'ai' ? 'Worded by AI from the live numbers. It is told to use no other numbers.' : 'Built from the live numbers by rules (AI not used).'}</div>
        </div>
      )}
    </div>
  )
}
