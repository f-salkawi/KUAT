import { useState } from 'react'
import { MEDICINES, REACTIONS } from './reportEngine.js'

const LABELS = ['Medicine', 'Other medicines', 'Reaction and batch', 'Review and send', 'Confirmation']

// Northwind Pharma's side-effect report form: a made-up internal tool in the style of the apps
// a pharma company tests before launch. It knows nothing about KUAT; it only calls `act`.
export default function ReportSite({ state, act, change, highlight }) {
  const [otherName, setOtherName] = useState('Paracetamol 500 mg')
  const glow = (target) => (highlight === target ? ' flash' : '')
  const click = (target, label, action) => () => act({ type: 'click', target, label, action })
  const medicine = MEDICINES.find((m) => m.id === state.medicine)

  return (
    <div className="site">
      <div className="uat-banner">UAT test build. Bugs are expected here: use the knight button to tell the team.</div>
      <header>
        <div className="site-bar">
          <div className="logo" aria-hidden="true"><i className="fa-solid fa-capsules" /></div>
          <div className="brand"><b>Northwind Pharma</b><span>SafeReport · Report a side effect</span></div>
          <div className="who">Signed in as a test nurse</div>
        </div>
      </header>
      <main>
        <h1>Report a suspected side effect</h1>
        <p className="lede">Tell us about a reaction a patient had after taking one of our medicines. It goes to the drug safety team.</p>
        <div className="stepper" aria-hidden="true">{LABELS.map((l, i) => <div key={l} className={i < state.step ? 'done' : ''} />)}</div>
        <div className="stepper-labels" aria-hidden="true">{LABELS.map((l) => <span key={l}>{l}</span>)}</div>

        <div className="site-card">
          {state.error && <div className="site-error" role="alert">{state.error}</div>}

          {state.view === 'medicine' && (
            <>
              <h2>Which medicine do you suspect?</h2>
              <p className="hint-text">Choose the medicine the patient was taking when the reaction started.</p>
              <div className="med-grid">
                {MEDICINES.map((m) => (
                  <button key={m.id} className={`med${glow(`medicine-${m.id}`)}`}
                    onClick={click(`medicine-${m.id}`, m.name, { type: 'choose_medicine', id: m.id })}>
                    <b>{m.name}</b><span>{m.form} · {m.use}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {state.view === 'others' && (
            <>
              <h2>Does the patient take any other medicines?</h2>
              <p className="hint-text">Other medicines can explain a reaction, so list everything the patient takes with {medicine?.name}.</p>
              {state.notice && <div className="site-note">{state.notice}</div>}
              <div className="row" style={{ marginBottom: 14 }}>
                <input className="sinput" style={{ flex: 1 }} aria-label="Other medicine" value={otherName}
                  onChange={(e) => setOtherName(e.target.value)} />
                <button className={`sbtn${glow('add-medicine')}`}
                  onClick={() => act({ type: 'click', target: 'add-medicine', label: 'Add medicine', value: otherName, action: { type: 'add_medicine', name: otherName } })}>
                  Add medicine
                </button>
              </div>
              <div className="pills">
                {state.others.length === 0 && <span className="hint-text" style={{ margin: 0 }}>No other medicines added yet.</span>}
                {state.others.map((o) => <span key={o} className="pill on">{o}</span>)}
              </div>
              <div className="site-actions">
                <button className="sbtn" onClick={click('back', 'Back', { type: 'back' })}>Back</button>
                <button className={`sbtn main${glow('to-details')}`} onClick={click('to-details', 'Continue', { type: 'to_details' })}>Continue</button>
              </div>
            </>
          )}

          {state.view === 'details' && (
            <>
              <h2>What happened, and which batch?</h2>
              <p className="hint-text">The batch number is printed on the side of the box, for example KP4821.</p>
              <div className="field">
                Reaction
                <div className="pills">
                  {REACTIONS.map((r) => (
                    <button key={r} className={`pill${state.reaction === r ? ' on' : ''}${glow(`reaction-${r.toLowerCase()}`)}`}
                      onClick={click(`reaction-${r.toLowerCase()}`, r, { type: 'choose_reaction', value: r })}>{r}</button>
                  ))}
                </div>
              </div>
              <label className="field">
                Batch number
                <input className={`sinput${glow('batch')}`} value={state.batch} placeholder="KP4821" style={{ maxWidth: 260 }}
                  onChange={(e) => change({ type: 'set_batch', value: e.target.value })}
                  onBlur={(e) => act({ type: 'input', target: 'batch', label: 'Batch number', value: e.target.value })} />
              </label>
              <div className="site-actions">
                <button className="sbtn" onClick={click('back', 'Back', { type: 'back' })}>Back</button>
                <button className={`sbtn main${glow('submit-details')}`} onClick={click('submit-details', 'Continue to review', { type: 'submit_details' })}>
                  Continue to review
                </button>
              </div>
            </>
          )}

          {state.view === 'review' && (
            <>
              <h2>Check and send your report</h2>
              <p className="hint-text">Press Submit report once. The drug safety team gets it straight away.</p>
              <dl className="summary">
                <dt>Medicine</dt><dd>{medicine?.name}</dd>
                <dt>Other medicines</dt><dd>{state.others.join(', ') || 'None'}</dd>
                <dt>Reaction</dt><dd>{state.reaction || 'Not chosen'}</dd>
                <dt>Batch number</dt><dd>{state.batch}</dd>
              </dl>
              <div className="site-actions">
                <button className="sbtn" disabled={state.send === 'sending'} onClick={click('back', 'Back', { type: 'back' })}>Back</button>
                <button className={`sbtn main${glow('submit')}`} onClick={click('submit', 'Submit report', { type: 'submit' })}>
                  {state.send === 'sending' ? <><span className="spinner" /> Sending...</> : 'Submit report'}
                </button>
              </div>
            </>
          )}

          {state.view === 'done' && (
            <>
              <h2>Report sent. Thank you</h2>
              <p className="hint-text">Your reference {state.references.length > 1 ? 'numbers' : 'number'}:</p>
              {state.references.map((r) => <div key={r} className="ref">{r}</div>)}
              <p className="hint-text" style={{ marginTop: 14 }}>A confirmation email is on its way.</p>
              <button className="sbtn" onClick={click('restart', 'Start a new report', { type: 'restart' })}>Start a new report</button>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
