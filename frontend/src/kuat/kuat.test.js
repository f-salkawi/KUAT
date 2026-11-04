import { describe, expect, it } from 'vitest'
import { START, reduce } from '../demo/reportEngine.js'
import { runGhost, simulate } from './ghost.js'
import { createRecorder } from './recorder.js'

const STEPS = [
  { id: 1, name: 'Medicine', expected_ms: 1000 }, { id: 2, name: 'Other medicines', expected_ms: 1000 },
  { id: 3, name: 'Batch number', expected_ms: 1000 }, { id: 4, name: 'Submit', expected_ms: 2000 },
  { id: 5, name: 'Confirmation', expected_ms: 1000 },
]
const BUGGY = { dead_add_medicine: true, strict_batch: true, slow_submit: true, double_submit: true }
const FIXED = { dead_add_medicine: false, strict_batch: false, slow_submit: false, double_submit: false }

const act = (t, target, action) => ({ t, kind: 'action', type: 'click', target, step: 1, detail: { action } })
const fullRun = [
  act(0, 'medicine-cardiolex', { type: 'choose_medicine', id: 'cardiolex' }),
  act(500, 'add-medicine', { type: 'add_medicine', name: 'Paracetamol 500 mg' }),
  act(900, 'to-details', { type: 'to_details' }),
  act(1200, 'reaction-dizziness', { type: 'choose_reaction', value: 'Dizziness' }),
  { t: 1700, kind: 'action', type: 'input', target: 'batch', step: 3, detail: { value: 'kp4821' } },
  act(2000, 'submit-details', { type: 'submit_details' }),
  act(2500, 'submit', { type: 'submit' }),
  act(2900, 'submit', { type: 'submit' }),
]

describe('side-effect report planted bugs', () => {
  it('Add medicine does nothing until fixed', () => {
    const s = { ...START, view: 'others', medicine: 'cardiolex' }
    expect(reduce(s, { type: 'add_medicine', name: 'Paracetamol' }, BUGGY).effects[0].type).toBe('noop')
    expect(reduce(s, { type: 'add_medicine', name: 'Paracetamol' }, FIXED).state.others).toEqual(['Paracetamol'])
  })
  it('lower-case batch number is rejected only in the buggy build', () => {
    const s = { ...START, view: 'details', batch: 'kp4821' }
    expect(reduce(s, { type: 'submit_details' }, BUGGY).effects[0].type).toBe('error')
    expect(reduce(s, { type: 'submit_details' }, FIXED).state.view).toBe('review')
  })
  it('second Submit press creates a duplicate only in the buggy build', () => {
    const s = { ...START, view: 'review', send: 'sending' }
    expect(reduce(s, { type: 'submit' }, BUGGY).state.duplicate).toBe(true)
    expect(reduce(s, { type: 'submit' }, FIXED).state.duplicate).toBe(false)
  })
  it('a duplicate send shows two reference numbers', () => {
    const s = { ...START, view: 'review', send: 'sending', duplicate: true }
    expect(reduce(s, { type: 'send_done', latency_ms: 900 }, BUGGY).state.references).toHaveLength(2)
  })
})

describe('ghost tester', () => {
  it('fails the buggy build with the reasons', () => {
    const r = simulate(fullRun, BUGGY, STEPS)
    expect(r.passed).toBe(false)
    expect(r.problems.join(' ')).toMatch(/did nothing|Invalid batch number/)
  })
  it('passes the fixed build and lists completed steps', () => {
    const r = simulate(fullRun, FIXED, STEPS)
    expect(r.passed).toBe(true)
    expect(r.steps_passed).toEqual([1, 2, 3, 4, 5])
  })
  it('judges a ticket on its own fault, and still reports any other fault it saw', () => {
    const twice = [act(0, 'submit', { type: 'submit' }), act(400, 'submit', { type: 'submit' })]
    const onlyDuplicateFixed = { ...BUGGY, double_submit: false }
    const run = runGhost([{ id: 9, tester: 'Iris', trail: twice }], onlyDuplicateFixed, STEPS, [{ type: 'double_submit' }])
    expect(run.passed).toBe(true)
    expect(run.results[0].also_seen.join(' ')).toMatch(/took 7.2 s/)
    expect(run.results[0].steps_passed).toEqual([])   // the step is not counted as tested while a fault remains
  })
  it('replays trails that only kept the target', () => {
    const trail = [{ t: 0, kind: 'action', type: 'click', target: 'medicine-cardiolex' }]
    expect(simulate(trail, FIXED, STEPS).steps_passed).toEqual([1])
  })
})

describe('recorder', () => {
  it('spots rage clicks once per burst', () => {
    let t = 0
    const bursts = []
    const rec = createRecorder({ now: () => t, onRage: (b) => bursts.push(b) })
    for (let i = 0; i < 6; i += 1) { t += 200; rec.action('click', 'add-medicine', 2, { label: 'Add medicine' }) }
    expect(bursts).toHaveLength(1)
    expect(bursts[0].clicks).toBe(4)
  })
  it('never records sensitive values', () => {
    const rec = createRecorder()
    rec.action('input', 'patient-initials', 3, { label: 'Patient initials', value: 'J.D.', sensitive: true })
    expect(JSON.stringify(rec.trail())).not.toContain('J.D.')
  })
  it('starts a fresh trail after a report is sent', () => {
    const rec = createRecorder()
    rec.action('click', 'add-medicine', 2, { label: 'Add medicine' })
    rec.clear()
    expect(rec.trail()).toEqual([])
  })
})

describe('Copy for Jira', async () => {
  const { jiraText } = await import('../components/TicketDrawer.jsx')
  it('writes the ticket in Jira text format, with the steps from the click trail', () => {
    const issue = {
      title: 'Submit sends a duplicate report', severity: 'critical', step_id: 4,
      ticket: { reports: 1, testers: ['Iris'], summary: 'Pressing Submit twice sends two reports.',
        steps_to_reproduce: ["Click 'Submit report' x2"], expected: 'Sent once', actual: 'Sent twice',
        comments: [{ tester: 'Iris', text: 'I think my report went in twice', original: 'I think my report went in twice' }], environment: 'Chrome' },
      fix: { likely_cause: 'Submit is not ignored while sending', suggested_change: 'Ignore Submit while sending' },
    }
    const text = jiraText(issue, { name: 'Submit' })
    expect(text).toMatch(/^h2\. Submit sends a duplicate report/)
    expect(text).toContain("# Click 'Submit report' x2")
    expect(text).toContain('*Severity:* critical')
    expect(text).toContain('* Iris: "I think my report went in twice"')
  })
})
