import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { Tracker } from '../kuat/Panel.jsx'

const KIND = { rage: 'Noticed by KUAT', idea: 'Idea', problem: 'Problem' }

// Top biscuit: what testers are saying, newest first, and what KUAT told each of them back.
// A card opens the ticket it ended up on, so you can follow one report all the way through.
export default function TesterReports({ steps, onOpen, onDemo, busy }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let alive = true
    const load = () => api.reports('').then((r) => alive && setRows(r.slice(0, 14))).catch(() => {})
    load()
    const id = setInterval(load, 1500)
    return () => { alive = false; clearInterval(id) }
  }, [])

  if (!rows) return <div className="empty-note">Loading reports...</div>
  if (!rows.length) {
    return (
      <div className="invite">
        <div>
          <b style={{ font: '500 20px var(--display)' }}>Start the test cycle</b>
          <ol>
            <li>Open the test site and report a side effect, the way a nurse tester would.</li>
            <li>When something feels wrong, press the knight in the corner and say so, in any language.</li>
            <li>Watch the agents work in the cream, then decide at the bottom.</li>
          </ol>
        </div>
        <div className="row">
          <a className="btn primary" href="#/test" target="_blank" rel="noreferrer">Open the test site <i className="fa-solid fa-arrow-up-right-from-square" /></a>
          <button className="btn" disabled={busy} onClick={onDemo}>Or load 9 demo testers</button>
        </div>
      </div>
    )
  }
  return (
    <div className="reports-row">
      {rows.map((r) => {
        const step = steps.find((s) => s.id === r.step_id)
        return (
          <button className="quote" key={r.id} disabled={!r.issue_id} onClick={() => r.issue_id && onOpen(r.issue_id)}
            title={r.issue_id ? 'Open the ticket this report is on' : undefined}>
            <span className="row" style={{ justifyContent: 'space-between' }}>
              <b>{r.tester}</b>
              <span className={`chip ${r.kind === 'rage' ? 'warn' : r.kind === 'idea' ? 'blue' : ''}`}>{KIND[r.kind]}</span>
            </span>
            <span className="said" dir="auto">
              {r.original_text ? `"${r.original_text}"` : <span className="muted">No comment. KUAT spotted fast, repeated clicks and reported them.</span>}
            </span>
            <span className="small muted">Step {r.step_id}{step ? `: ${step.name}` : ''}</span>
            <Tracker message={r.message} />
            <span className={`msg ${r.message.tone}`}>{r.message.text}</span>
          </button>
        )
      })}
    </div>
  )
}
