import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import Highlight from './Highlight.jsx'

const ACTION_LABEL = {
  approve: 'Approve as bug',
  merge: 'Merge as duplicate',
  to_idea: 'Move to ideas',
  link_known: 'Link to known ticket',
  dismiss: 'Not a problem',
}

// The manager's queue: one item at a time, on purpose. There is no "approve all", in the UI or the API.
export default function ReviewCard({ steps }) {
  const [data, setData] = useState(null)   // null until the first answer, so the empty state never flashes
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [accuracy, setAccuracy] = useState(null)

  const load = useCallback(() => {
    api.queue().then(setData).catch(() => {})
    api.dashboard().then((d) => setAccuracy(d.ai_accuracy)).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(() => { if (!busy) load() }, 2000)
    return () => clearInterval(id)
  }, [load, busy])

  async function decide(action) {
    setBusy(true)
    setError('')
    try {
      await api.decide(data.item.id, action)
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const item = data?.item
  const s = item?.suggestion || {}
  const step = steps.find((x) => x.id === item?.step_id)
  const words = s.evidence?.words || []
  const others = Object.keys(ACTION_LABEL).filter((a) => a !== s.action && (a !== 'link_known' || s.known_key) && (a !== 'merge' || s.merge_into))
  const pct = Math.round((s.confidence || 0) * 100)

  return (
    <div className="panel-box review stack" style={{ gap: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div className="lab">Manager · review queue</div>
          <div className="small muted" style={{ marginTop: 4 }}>One report at a time. KUAT suggests, you decide.</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ font: '500 20px var(--display)' }}>{item ? `1 of ${data.remaining + 1}` : data ? 'Queue clear' : ''}</div>
          {accuracy?.total > 0 && <div className="small muted">AI agreed with you {accuracy.agreed} of {accuracy.total} times</div>}
        </div>
      </div>

      {data && !item && <div className="empty-note">Nothing waiting for you. New reports land here after the agents have checked them.</div>}

      {item && (
        <div className="stack" style={{ gap: 14, animation: 'rise .45s var(--ease)' }} key={item.id}>
          <div className="row">
            <span className="chip">Step {item.step_id}: {step?.name}</span>
            {item.severity && <span className={`chip ${item.severity}`}>{item.severity}</span>}
            <span className="chip">{item.reports.length} report{item.reports.length !== 1 ? 's' : ''}</span>
          </div>
          <h3>{item.title}</h3>
          {item.ticket?.summary && <p className="muted small" style={{ margin: 0 }}>{item.ticket.summary}</p>}

          <div className="suggest stack" style={{ gap: 10 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <b>KUAT suggests: {ACTION_LABEL[s.action] || s.action}
                {s.action === 'merge' && item.merge_target && ` into ${item.merge_target.ticket_key || '#' + item.merge_target.id}`}
                {s.action === 'link_known' && ` ${s.known_key}`}</b>
              <span className="row" style={{ gap: 6 }}>
                {s.low_confidence && <span className="chip warn">AI unsure: please check</span>}
                <span className="chip blue">{pct}% confident</span>
              </span>
            </div>
            <div className={`conf ${s.low_confidence ? 'low' : ''}`}><span style={{ width: `${pct}%` }} /></div>
            {s.warning && <span className="chip warn" style={{ alignSelf: 'flex-start' }}>{s.warning}</span>}
            <ul style={{ margin: 0, paddingLeft: 18 }} className="small">{(s.reasons || []).map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>

          <div className="stack" style={{ gap: 8 }}>
            <div className="lab">What testers said</div>
            {item.reports.map((r) => (
              <div className="said-box" key={r.id}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <b className="small">{r.tester}</b>
                  {r.kind === 'rage' && <span className="chip warn">silent rage-click report</span>}
                  {r.language && r.language !== 'English' && <span className="chip">from {r.language}</span>}
                </div>
                <div style={{ marginTop: 4 }} dir="auto">
                  {r.text ? <Highlight text={r.text} words={words} /> : <span className="muted">(no comment, click trail only)</span>}
                </div>
                {r.language && r.language !== 'English' && r.original_text !== r.text && <div className="small muted" dir="auto">Original: {r.original_text}</div>}
                {(r.facts || []).map((f, i) => <div key={i} className="small muted">Click trail: {f.summary}</div>)}
              </div>
            ))}
          </div>

          {error && <div className="error-text">{error}</div>}
          <div className="stack" style={{ gap: 8 }}>
            <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={() => decide(s.action)}>
              <i className="fa-solid fa-check" /> {ACTION_LABEL[s.action] || 'Accept'}
            </button>
            <div className="row" style={{ gap: 6 }}>
              <span className="small muted">Or overrule in one click:</span>
              {others.map((a) => <button key={a} className="btn sm" disabled={busy} onClick={() => decide(a)}>{ACTION_LABEL[a]}</button>)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
