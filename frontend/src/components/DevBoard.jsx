import { useEffect, useState } from 'react'
import { api } from '../api.js'

export const FIXES = [
  { flag: 'dead_add_medicine', label: 'Add medicine button does nothing', step: 2 },
  { flag: 'strict_batch', label: 'Lower-case batch numbers rejected', step: 3 },
  { flag: 'slow_submit', label: 'Submit takes 7 seconds', step: 4 },
  { flag: 'double_submit', label: 'Pressing Submit twice sends a duplicate', step: 4 },
]
const WORD = { red: 'Hot', orange: 'Warm', yellow: 'Mild', green: 'Clear' }

// Each tile says its level in words and counts as well as colour, so it never relies on colour alone.
function Heatmap({ heat }) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="lab">Where the problems are</div>
      <div className="heat">
        {heat.map((h) => (
          <div key={h.step_id} className={`heat-tile ${h.level}`}>
            {h.step_id}. {h.name}
            <span className="big">{WORD[h.level]}<span className="small" style={{ font: '12px var(--body)', display: 'block' }}>{h.open} open</span></span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Progress({ points }) {
  const w = 520, h = 120, pad = 22
  const max = Math.max(1, ...points.map((p) => p.found))
  const x = (i) => pad + (points.length < 2 ? 0 : (i / (points.length - 1)) * (w - pad * 2))
  const y = (v) => h - pad - (v / max) * (h - pad * 2)
  const line = (key) => points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p[key])}`).join(' ')
  return (
    <div className="panel-box">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="lab">Progress this cycle</div>
        <span className="row small" style={{ gap: 14 }}>
          <span><span style={{ color: 'var(--heat-orange)' }}>━</span> confirmed</span>
          <span><span style={{ color: 'var(--heat-green)' }}>━</span> fixed</span>
        </span>
      </div>
      {points.length === 0 ? <p className="small muted" style={{ marginBottom: 0 }}>The graph starts when the manager approves the first bug.</p> : (
        <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Bugs confirmed and fixed over time">
          <line x1={pad} x2={w - pad} y1={h - pad} y2={h - pad} stroke="var(--choc-line)" />
          <path d={line('found')} fill="none" stroke="var(--heat-orange)" strokeWidth="3" strokeLinejoin="round" />
          <path d={line('fixed')} fill="none" stroke="var(--heat-green)" strokeWidth="3" strokeLinejoin="round" />
          <text x={pad} y={14} fontSize="11" fill="var(--muted)">{max} bugs</text>
        </svg>
      )}
    </div>
  )
}

function Board({ title, items, empty, onOpen }) {
  return (
    <div className="panel-box stack" style={{ gap: 8 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="lab">{title}</div>
        <b style={{ font: '500 22px var(--display)' }}>{items.length}</b>
      </div>
      {items.length === 0 && <p className="small muted" style={{ margin: 0 }}>{empty}</p>}
      {items.map((i) => (
        <a key={i.id} className="board-item" href={`#/ticket/${i.id}`} onClick={(e) => { e.preventDefault(); onOpen(i.id) }}>
          {i.severity && i.category === 'bug' && i.status !== 'fixed' && <span className={`chip ${i.severity}`}>{i.severity}</span>}
          {i.status === 'fixed' && <i className="fa-solid fa-circle-check" style={{ color: 'var(--heat-green)' }} />}
          <span style={{ flex: 1 }}>{i.ticket_key && <b>{i.ticket_key} </b>}{i.title}</span>
          <span className="small muted">{i.report_count}x</span>
        </a>
      ))}
    </div>
  )
}

// Developer side of the bottom biscuit: readiness, heatmap, the demo build and the boards.
export function DevSummary({ flags, setFlags }) {
  const [d, setD] = useState(null)
  useEffect(() => {
    let alive = true
    const load = () => api.dashboard().then((x) => alive && setD(x)).catch(() => {})
    load()
    const id = setInterval(load, 2000)
    return () => { alive = false; clearInterval(id) }
  }, [])
  if (!d) return <div className="panel-box muted">Loading...</div>
  const r = d.readiness

  async function toggle(flag) { setFlags(await api.setBuild({ ...flags, [flag]: !flags[flag] })) }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="panel-box">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="lab">Developer · launch readiness</div>
            <div className="ready-num" style={{ marginTop: 8 }}>{r.score}<small> / 100</small></div>
          </div>
          {r.can_launch ? <span className="chip low">Ready to launch</span> : <span className="chip warn">Launch at {r.launch_at}+ with no critical bugs</span>}
        </div>
        <div className="meter" role="meter" aria-valuenow={r.score} aria-valuemin={0} aria-valuemax={100} aria-label="Launch readiness">
          <div className="fill" style={{ width: `${r.score}%` }} />
          <div className="line" style={{ left: `${r.launch_at}%` }} title={`Launch line: ${r.launch_at}`} />
        </div>
        <div className="small muted">{r.blockers.length ? r.blockers.join(' · ') : 'No blockers'}</div>
        <div className="counts">
          <div><span className="small muted">To fix</span><b>{d.counts.to_fix}</b></div>
          <div><span className="small muted">With manager</span><b>{d.counts.waiting}</b></div>
          <div><span className="small muted">Fixed</span><b style={{ color: 'var(--heat-green)' }}>{d.counts.fixed}</b></div>
          <div><span className="small muted">Ideas</span><b>{d.counts.ideas}</b></div>
        </div>
      </div>
      <div className="panel-box"><Heatmap heat={d.heatmap} /></div>
      <div className="panel-box">
        <div className="lab">Demo build</div>
        <p className="small muted" style={{ margin: '6px 0 4px' }}>4 bugs are planted in the test site on purpose. Play the developer: deploy a fix, then let the Ghost tester prove it on the ticket.</p>
        {FIXES.map((f) => (
          <div className="switch" key={f.flag}>
            <span>{f.label} <span className="muted small">(step {f.step})</span></span>
            <button className={`btn sm ${flags[f.flag] ? 'primary' : ''}`} onClick={() => toggle(f.flag)}>
              {flags[f.flag] ? 'Deploy fix' : <><i className="fa-solid fa-check" /> Fixed in build</>}
            </button>
          </div>
        ))}
      </div>
      <Progress points={d.progress} />
    </div>
  )
}

export function Boards({ onOpen }) {
  const [boards, setBoards] = useState({ to_fix: [], ideas: [], fixed: [] })
  useEffect(() => {
    let alive = true
    const load = () => Promise.all(['to_fix', 'ideas', 'fixed'].map((b) => api.issues(b)))
      .then(([to_fix, ideas, fixed]) => alive && setBoards({ to_fix, ideas, fixed })).catch(() => {})
    load()
    const id = setInterval(load, 2000)
    return () => { alive = false; clearInterval(id) }
  }, [])
  return (
    <div className="boards">
      <Board title="To fix" items={boards.to_fix} empty="Nothing approved yet." onOpen={onOpen} />
      <Board title="Ideas" items={boards.ideas} empty="No ideas yet." onOpen={onOpen} />
      <Board title="Fixed" items={boards.fixed} empty="Your first fix lands here." onOpen={onOpen} />
    </div>
  )
}
