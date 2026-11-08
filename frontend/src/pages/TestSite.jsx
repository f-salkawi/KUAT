import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api.js'
import ReportSite from '../demo/ReportSite.jsx'
import { useReport } from '../demo/useReport.js'
import Panel from '../kuat/Panel.jsx'
import { createRecorder } from '../kuat/recorder.js'

// The app being tested (Northwind Pharma's form) with the KUAT layer on top: the KUAT button,
// the feedback panel, the current script step and the rage-click detector.
export default function TestSite({ steps, flags }) {
  const [tester, setTester] = useState(() => {
    try { return localStorage.getItem('kuat-tester') || 'You' } catch { return 'You' }
  })
  const [open, setOpen] = useState(false)
  const [panelView, setPanelView] = useState('home')
  const [rage, setRage] = useState(null)
  const [passed, setPassed] = useState([])
  const testerRef = useRef(tester)
  testerRef.current = tester
  const flagsRef = useRef(flags)
  flagsRef.current = flags

  // A rage-click burst files a silent report straight away, so it is never lost.
  const recorder = useMemo(() => createRecorder({
    onRage: (burst) => {
      setRage(burst)
      setTimeout(() => {
        api.report({ kind: 'rage', tester: testerRef.current, step_id: burst.step, text: '', trail: recorder.trail(),
          build: { ...flagsRef.current, browser: 'Chrome' } }).catch(() => {})
      }, 50)
    },
  }), []) // eslint-disable-line react-hooks/exhaustive-deps

  const onPass = useCallback((stepId) => {
    setPassed((p) => (p.includes(stepId) ? p : [...p, stepId]))
    api.pass(stepId, testerRef.current).catch(() => {})
  }, [])

  const { state, act, change } = useReport({ flags, recorder, steps, onPass })
  const step = steps.find((s) => s.id === state.step)

  useEffect(() => { document.title = 'SafeReport · Northwind Pharma (UAT)'; return () => { document.title = 'KUAT · UAT, untangled' } }, [])
  useEffect(() => { try { localStorage.setItem('kuat-tester', tester) } catch { /* private mode */ } }, [tester])
  useEffect(() => { if (!rage) return undefined; const id = setTimeout(() => setRage(null), 9000); return () => clearTimeout(id) }, [rage])

  function openPanel(view = 'home') { setPanelView(view); setOpen(true) }

  return (
    <>
      <ReportSite state={state} act={act} change={change} />

      <div className="kuat-fab">
        {step && !open && !rage && (
          <div className="kuat-step" key={step.id}><span>Test step {step.id} of {steps.length}</span>{step.instruction}</div>
        )}
        <button className="kuat-knight" onClick={() => openPanel()} aria-label="Open KUAT: report a problem or share an idea" title="KUAT feedback">
          <i className="fa-solid fa-chess-knight" />
        </button>
      </div>

      <Panel open={open} onClose={() => setOpen(false)} tester={tester} setTester={setTester} steps={steps}
        currentStep={state.step} passed={passed} recorder={recorder} flags={flags} initialView={panelView} />

      {rage && (
        <div className="ktoast" role="status">
          <div className="kmark"><i className="fa-solid fa-chess-knight" /></div>
          <div style={{ flex: 1 }}>
            <b>That looked frustrating.</b>
            <div className="small muted">KUAT noticed {rage.clicks} fast clicks on '{rage.label}' and quietly reported it. Want to add a comment?</div>
          </div>
          <button className="btn sm primary" onClick={() => { setRage(null); openPanel('problem') }}>Add comment</button>
        </div>
      )}
    </>
  )
}
