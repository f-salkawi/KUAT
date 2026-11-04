import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import ReportSite from '../demo/ReportSite.jsx'
import { START, actionsFromTrail, reduce } from '../demo/reportEngine.js'
import { runGhost } from '../kuat/ghost.js'

const SPEED = 0.35 // replays run faster than real time; the caption shows the real wait

// The Mechanic writes plain text with ``` code blocks: show the code as code, not as backticks.
function WithCode({ text }) {
  return String(text || '').split('```').map((part, i) => (i % 2
    ? <pre key={i}>{part.replace(/^[a-z]*\n/i, '').trim()}</pre>
    : part.trim() && <div key={i} style={{ whiteSpace: 'pre-wrap' }}>
      {part.trim().split('`').map((bit, j) => (j % 2 ? <code key={j}>{bit}</code> : bit))}
    </div>))
}

// The ticket in Jira's own text format, so a developer can paste it straight into a Jira issue.
export function jiraText(issue, step) {
  const t = issue.ticket || {}
  const lines = [
    `h2. ${issue.title}`,
    `*Severity:* ${issue.severity || 'n/a'} | *UAT step:* ${issue.step_id}. ${step?.name || ''} | *Reports:* ${t.reports} from ${(t.testers || []).join(', ')}`,
    '', t.summary || '', '',
    'h3. Steps to reproduce (from the tester\'s click trail)',
    ...(t.steps_to_reproduce || []).map((x) => `# ${x}`),
    '', `*Expected:* ${t.expected || ''}`, `*Actual:* ${t.actual || ''}`,
  ]
  if (issue.fix) lines.push('', 'h3. Suggested fix (KUAT Mechanic, a suggestion only)', `*Likely cause:* ${issue.fix.likely_cause}`, `*Change:* ${issue.fix.suggested_change}`)
  lines.push('', 'h3. What testers said', ...(t.comments || []).map((c) => `* ${c.tester}: "${c.text}"${c.original && c.original !== c.text ? ` (original: ${c.original})` : ''}`))
  lines.push('', `_Approved by a person in KUAT. Environment: ${t.environment || 'unknown'}._`)
  return lines.join('\n')
}

// Re-runs a tester's exact clicks, on the build they were using, so the developer watches the bug happen.
function Replay({ report, onClose }) {
  const [state, setState] = useState(START)
  const [highlight, setHighlight] = useState(null)
  const [caption, setCaption] = useState('Starting replay...')
  const stateRef = useRef(START)
  const flags = report.build || {}

  useEffect(() => {
    const timers = []
    const later = (ms, fn) => timers.push(setTimeout(fn, ms))
    const apply = (action) => {
      const result = reduce(stateRef.current, action, flags)
      stateRef.current = result.state
      setState(result.state)
      for (const e of result.effects) {
        if (e.type === 'error') setCaption(`Error shown: "${e.detail.message}"`)
        if (e.type === 'noop') setCaption(`'${e.detail.label}' was clicked and nothing happened`)
        if (e.type === 'response' && e.detail.latency_ms > 1500) setCaption(`Sent after ${(e.detail.latency_ms / 1000).toFixed(1)} s (replay sped up)`)
      }
      if (result.schedule) {
        setCaption(`Waiting for the safety database... (real wait: ${(result.schedule.after_ms / 1000).toFixed(1)} s)`)
        later(result.schedule.after_ms * SPEED, () => apply(result.schedule.action))
      }
    }
    const actions = actionsFromTrail(report.trail || [])
    let at = 400
    let prev = actions[0]?.t || 0
    actions.forEach(({ t, action, target, label }, i) => {
      at += Math.min(Math.max(t - prev, 250), 900)
      prev = t
      later(at, () => { setHighlight(target); setCaption(`${i + 1}/${actions.length}: ${label || target}`) })
      later(at + 250, () => apply(action))
    })
    later(at + 3200, () => setHighlight(null))
    return () => timers.forEach(clearTimeout)
  }, [report]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal stack" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ font: '500 24px var(--display)' }}>Replay: {report.tester}'s session</h2>
            <span className="small" style={{ color: 'var(--muted-ink)' }}>Their exact clicks, on the build they used</span>
          </div>
          <button className="btn sm light" onClick={onClose}>Close</button>
        </div>
        <span className="chip" style={{ alignSelf: 'flex-start', background: 'var(--ink)', color: 'var(--cream)' }}>{caption}</span>
        <div style={{ pointerEvents: 'none', borderRadius: 14, overflow: 'hidden', border: '1px solid #e1d6c2' }}>
          <ReportSite state={state} act={() => {}} change={() => {}} highlight={highlight} />
        </div>
      </div>
    </div>
  )
}

// Copy with the modern clipboard API, then the older one; if both are blocked, the caller shows the text.
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true } catch { /* blocked: try the older way */ }
  const area = Object.assign(document.createElement('textarea'), { value: text })
  Object.assign(area.style, { position: 'fixed', opacity: '0' })
  document.body.appendChild(area)
  area.select()
  const ok = document.execCommand('copy')
  area.remove()
  return ok
}

export default function TicketDrawer({ id, steps, flags, onClose }) {
  const [issue, setIssue] = useState(null)
  const [replay, setReplay] = useState(null)
  const [ghost, setGhost] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [manualJira, setManualJira] = useState('')

  const load = () => api.issue(id).then((x) => { setIssue(x); setGhost((g) => g || x.ghost) }).catch((e) => setError(e.message))
  useEffect(() => { setIssue(null); setGhost(null); load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !replay && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, replay])

  const t = issue?.ticket || {}
  const step = steps.find((s) => s.id === issue?.step_id)
  const withTrail = (issue?.reports || []).filter((r) => (r.trail || []).length)
  const ghostCoversAll = ghost && ghost.results?.length === withTrail.length && withTrail.length > 0

  async function runTheGhost() {
    setError('')
    const result = runGhost(withTrail, flags, steps, issue.reports.flatMap((r) => r.facts || []))
    setGhost(result)
    await api.ghost(issue.id, result).catch(() => {})
  }
  async function markFixed() {
    setBusy(true)
    setError('')
    try { setIssue(await api.fixed(issue.id, ghost)) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function unstack(reportId) {
    try { await api.unstack(reportId); load() } catch (e) { setError(e.message) }
  }

  return (
    <>
      <div className="drawer-back" onClick={onClose} />
      <aside className="drawer" aria-label="Ticket">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
          <span className="lab" style={{ opacity: .6 }}>Ticket</span>
          <button className="btn sm light" onClick={onClose}><i className="fa-solid fa-xmark" /> Close</button>
        </div>
        {!issue ? <p className="muted">{error || 'Loading...'}</p> : (
          <div className="stack" style={{ gap: 16 }}>
            <div className="row">
              <span className="chip">{issue.ticket_key || `#${issue.id}`}</span>
              {issue.severity && issue.category === 'bug' && <span className={`chip ${issue.severity}`}>{issue.severity}</span>}
              <span className="chip">{issue.status.replace('_', ' ')}</span>
              <span className="chip">Step {issue.step_id}: {step?.name}</span>
            </div>
            <h1>{issue.title}</h1>
            {issue.category === 'bug' && ['open', 'fixed'].includes(issue.status) && (
              <button className="btn sm light" style={{ alignSelf: 'flex-start' }}
                onClick={async () => {
                  const text = jiraText(issue, step)
                  if (await copyText(text)) { setCopied(true); setTimeout(() => setCopied(false), 2000) } else setManualJira(text)
                }}>
                <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'}`} /> {copied ? 'Copied in Jira format' : 'Copy for Jira'}
              </button>
            )}
            {manualJira && (
              <label className="stack" style={{ gap: 6 }}>
                <span className="small muted">Your browser blocked copying. Select this and copy it yourself:</span>
                <textarea readOnly value={manualJira} rows={8} onFocus={(e) => e.target.select()}
                  style={{ font: '12px var(--mono)', borderRadius: 12, border: '1px solid #cdbfa6', padding: 10, background: '#fff' }} />
              </label>
            )}
            <p className="muted" style={{ margin: 0 }}>{t.summary}</p>

            {issue.status === 'fixed' && (
              <div className="panel-box" style={{ background: 'var(--ink)', color: 'var(--cream)', borderColor: 'var(--ink)' }}>
                <h3 style={{ font: '500 22px var(--display)' }}><i className="fa-solid fa-circle-check" style={{ color: 'var(--heat-green)' }} /> Fixed</h3>
                <p style={{ margin: '6px 0 0' }}>The Ghost tester replayed {ghost?.results?.length || 0} trail(s) on the new build and all passed.
                  {' '}{(t.testers || []).join(', ')} {t.testers?.length === 1 ? 'has' : 'have'} been told their report helped.</p>
              </div>
            )}

            {issue.category === 'bug' && (
              <div className="panel-box stack" style={{ gap: 10 }}>
                <div className="lab">Steps to reproduce</div>
                <p className="small muted" style={{ margin: 0 }}>Written from what the tester actually did, not from memory.</p>
                <ol style={{ margin: 0, paddingLeft: 20 }}>{(t.steps_to_reproduce || []).map((s, i) => <li key={i}>{s}</li>)}</ol>
                <div className="row" style={{ alignItems: 'flex-start', gap: 20 }}>
                  <div style={{ flex: 1, minWidth: 200 }}><b className="small">Expected</b><div>{t.expected}</div></div>
                  <div style={{ flex: 1, minWidth: 200 }}><b className="small">Actual</b><div>{t.actual}</div></div>
                </div>
              </div>
            )}

            {issue.fix && (
              <div className="panel-box stack" style={{ gap: 8 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div className="lab">Mechanic's suggested fix</div>
                  <span className="chip">{issue.fix.by === 'ai' ? `AI, ${Math.round(issue.fix.confidence * 100)}% sure` : 'rule-based hint'}</span>
                </div>
                <div><b className="small">Likely cause</b><WithCode text={issue.fix.likely_cause} /></div>
                <div><b className="small">Suggested change</b><WithCode text={issue.fix.suggested_change} /></div>
                {issue.fix.code && (
                  <details>
                    <summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>The code it read ({issue.fix.file})</summary>
                    <pre>{issue.fix.code}</pre>
                  </details>
                )}
                <p className="small muted" style={{ margin: 0 }}>A suggestion only: a developer makes the change.</p>
              </div>
            )}

            {issue.status === 'open' && (
              <div className="panel-box stack" style={{ gap: 10 }}>
                <div className="lab">Ghost tester</div>
                <p className="small muted" style={{ margin: 0 }}>Replays every stacked tester trail on the current build and checks that this ticket's fault is gone.</p>
                <button className="btn dark" onClick={runTheGhost} disabled={!withTrail.length}>
                  <i className="fa-solid fa-ghost" /> {withTrail.length ? `Replay ${withTrail.length} trail${withTrail.length !== 1 ? 's' : ''} on the current build` : 'No trails to replay'}
                </button>
                {ghost?.results?.map((r) => (
                  <div key={r.report_id} className={`ghost-result ${r.passed ? 'pass' : 'fail'}`}>
                    <b>{r.tester}: {r.passed ? 'passed' : 'still failing'}</b>
                    {r.problems.map((p, i) => <div key={i}>{p}</div>)}
                    {r.also_seen?.length > 0 && <div className="small" style={{ opacity: .75 }}>Also seen, not this ticket's fault: {r.also_seen.join('; ')}</div>}
                  </div>
                ))}
                <button className="btn primary" disabled={busy || !ghostCoversAll || !ghost.passed} onClick={markFixed}>Mark fixed</button>
                {!ghost?.passed && <span className="small muted">Unlocks when every replayed trail passes.</span>}
              </div>
            )}
            {issue.status === 'needs_review' && <div className="panel-box">Waiting for the manager's decision in the review queue.</div>}

            <div className="panel-box stack" style={{ gap: 10 }}>
              <div className="lab">Reports stacked on this ticket</div>
              {issue.reports.map((r) => (
                <div key={r.id} style={{ borderTop: '1px solid #e1d6c2', paddingTop: 10 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <b className="small">{r.tester}{r.kind === 'rage' ? ' (silent rage-click report)' : ''}</b>
                    <span className="row" style={{ gap: 6 }}>
                      {r.stack_confidence != null && <span className="chip">stacked at {Math.round(r.stack_confidence * 100)}%</span>}
                      {(r.trail || []).length > 0 && <button className="btn sm" onClick={() => setReplay(r)}><i className="fa-solid fa-play" /> Replay</button>}
                      {issue.reports.length > 1 && issue.status !== 'fixed' && <button className="btn sm" onClick={() => unstack(r.id)}>Unstack</button>}
                    </span>
                  </div>
                  <div dir="auto">{r.text || <span className="muted">(no comment)</span>}</div>
                  {r.original_text && r.original_text !== r.text && <div className="small muted" dir="auto">Original ({r.language}): {r.original_text}</div>}
                  {(r.facts || []).map((f, i) => <div key={i} className="small muted">Click trail: {f.summary}</div>)}
                </div>
              ))}
            </div>
            {error && <div className="error-text" style={{ color: '#a3282f' }}>{error}</div>}
          </div>
        )}
      </aside>
      {replay && <Replay report={replay} onClose={() => setReplay(null)} />}
    </>
  )
}
