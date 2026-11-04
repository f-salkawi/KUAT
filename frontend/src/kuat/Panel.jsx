import { useEffect, useState } from 'react'
import { api } from '../api.js'

export const TESTERS = ['You', 'Amira', 'Ben', 'Chen', 'Dani', 'Eli', 'Farah']

// Like a parcel tracker: where the tester's report is now, so they always feel heard.
export function Tracker({ message }) {
  const idea = message.tone === 'idea'
  const labels = idea ? ['Sent', 'Checked', 'On the ideas board'] : ['Sent', 'Checked', 'Decided', 'Fixed']
  const reached = idea ? 3 : message.stage || 1
  return (
    <span className="tracker" style={{ gridTemplateColumns: `repeat(${labels.length}, 1fr)` }} aria-label={`Progress: ${labels[reached - 1]}`}>
      {labels.map((l, i) => <span key={l} className={i < reached ? 'done' : ''}>{l}</span>)}
    </span>
  )
}

// The tester's side of KUAT: two big choices, nothing else to learn.
// Every report carries the click trail since the last report, automatically.
export default function Panel({ open, onClose, tester, setTester, steps, currentStep, passed, recorder, flags, initialView }) {
  const [view, setView] = useState('home')
  const [text, setText] = useState('')
  const [stepId, setStepId] = useState(currentStep)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [mine, setMine] = useState([])
  const [answers, setAnswers] = useState({})

  useEffect(() => { if (open) { setView(initialView || 'home'); setStepId(currentStep); setError('') } }, [open, initialView, currentStep])

  useEffect(() => {
    if (!open) return undefined
    let alive = true
    const load = () => api.reports(tester).then((rows) => alive && setMine(rows)).catch(() => {})
    load()
    const id = setInterval(load, 1500)
    return () => { alive = false; clearInterval(id) }
  }, [open, tester])

  if (!open) return null

  async function send(kind) {
    setSending(true)
    setError('')
    try {
      await api.report({ kind, tester, step_id: Number(stepId) || null, text, trail: kind === 'idea' ? [] : recorder.trail(),
        build: { ...flags, browser: navigator.userAgent.includes('Chrome') ? 'Chrome' : 'Browser' } })
      if (kind !== 'idea') recorder.clear()   // the next report starts with a clean trail
      setText('')
      setView('sent')
    } catch (e) {
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  async function answer(report) {
    const value = (answers[report.id] || '').trim()
    if (!value) return
    try {
      await api.answer(report.id, value)
      setAnswers((a) => ({ ...a, [report.id]: '' }))
    } catch (e) {
      setError(e.message)
    }
  }

  const stepPicker = (
    <label className="stack" style={{ gap: 6 }}>
      <span className="small muted">Which step were you on?</span>
      <select className="input" value={stepId || ''} onChange={(e) => setStepId(e.target.value)}>
        {steps.map((s) => <option key={s.id} value={s.id} style={{ color: '#1d1411' }}>{s.id}. {s.name}</option>)}
      </select>
    </label>
  )

  const form = (kind) => (
    <div className="stack">
      <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setView('home')}><i className="fa-solid fa-arrow-left" /> Back</button>
      <h2>{kind === 'idea' ? 'Share an idea' : 'Report a problem'}</h2>
      {stepPicker}
      <label className="stack" style={{ gap: 6 }}>
        <span className="small muted">{kind === 'idea' ? 'Your idea' : 'What happened?'}</span>
        <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} autoFocus
          placeholder={kind === 'idea' ? 'It would be great if...' : "Even 'it didn't work' is fine. KUAT checks your clicks to work out the rest."} />
      </label>
      {kind !== 'idea' && <p className="small muted" style={{ margin: 0 }}>Your clicks since your last report are attached, so the team can see exactly what happened.</p>}
      {error && <div className="error-text">{error}</div>}
      <button className="btn primary" disabled={sending || !text.trim()} onClick={() => send(kind)}>
        {sending ? 'Sending...' : kind === 'idea' ? 'Save idea' : 'Send report'}
      </button>
    </div>
  )

  return (
    <>
      <div className="kpanel-back" onClick={onClose} />
      <aside className="kpanel" aria-label="KUAT feedback panel">
        <div className="kpanel-head">
          <div className="kmark"><i className="fa-solid fa-chess-knight" /></div>
          <div style={{ flex: 1 }}>
            <div style={{ font: '700 18px var(--display)' }}>KUAT</div>
            <label className="small muted">Testing as{' '}
              <select value={tester} onChange={(e) => setTester(e.target.value)} aria-label="Tester name">
                {TESTERS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
          </div>
          <button className="btn sm" onClick={onClose} aria-label="Close panel"><i className="fa-solid fa-xmark" /></button>
        </div>

        <div className="kpanel-body">
          {view === 'home' && (
            <>
              <div>
                <h2>How did it go?</h2>
                <p className="small muted" style={{ margin: '4px 0 0' }}>Tell us in your own words, in any language.</p>
              </div>
              <button className="choice" onClick={() => setView('problem')}>
                <i className="fa-solid fa-triangle-exclamation" />
                <span><b>Report a problem</b><span className="small muted">Something broke, felt slow or looked wrong</span></span>
              </button>
              <button className="choice" onClick={() => setView('idea')}>
                <i className="fa-regular fa-lightbulb" />
                <span><b>Share an idea</b><span className="small muted">Not broken, but it could be better</span></span>
              </button>
              <div>
                <div className="lab" style={{ marginBottom: 6 }}>Your test script</div>
                {steps.map((s) => (
                  <div key={s.id} className={`script-step ${currentStep === s.id ? 'now' : ''} ${passed.includes(s.id) ? 'done' : ''}`}>
                    <span className="n">{passed.includes(s.id) ? <i className="fa-solid fa-check" /> : s.id}</span>
                    <span>{s.instruction}<br /><span className="small muted">Expected: {s.expected}</span></span>
                  </div>
                ))}
              </div>
            </>
          )}
          {view === 'problem' && form('problem')}
          {view === 'idea' && form('idea')}
          {view === 'sent' && (
            <div className="stack" style={{ textAlign: 'center', padding: '10px 0' }}>
              <h2>Thank you!</h2>
              <p className="muted" style={{ margin: 0 }}>The agents are checking it now. You'll see what happens to it below.</p>
              <button className="btn" style={{ alignSelf: 'center' }} onClick={() => setView('home')}>Send another</button>
            </div>
          )}

          <div className="stack" style={{ gap: 10 }}>
            <div className="lab">Your reports</div>
            {mine.length === 0 && <p className="small muted" style={{ margin: 0 }}>Nothing yet.</p>}
            {mine.map((r) => (
              <div className="my-report" key={r.id}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="chip">{r.kind === 'rage' ? 'Noticed by KUAT' : r.kind === 'idea' ? 'Idea' : 'Problem'}</span>
                  <span className="small muted">step {r.step_id}</span>
                </div>
                {r.original_text && <div style={{ marginTop: 8 }} dir="auto">"{r.original_text}"</div>}
                <Tracker message={r.message} />
                <div className={`msg ${r.message.tone}`}>{r.message.text}</div>
                {r.status === 'needs_info' && (
                  <div className="row" style={{ marginTop: 8, flexWrap: 'nowrap' }}>
                    <input className="input" placeholder="Your answer" value={answers[r.id] || ''}
                      onChange={(e) => setAnswers((a) => ({ ...a, [r.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && answer(r)} />
                    <button className="btn sm primary" onClick={() => answer(r)}>Reply</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </aside>
    </>
  )
}
