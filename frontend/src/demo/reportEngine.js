// The demo side-effect report site's logic as a pure state machine, so the same code runs three
// ways: live on the test site, step by step in a Replay, and instantly in the Ghost tester.
//
// The bugs are planted on purpose and switched by build flags. "Deploying a fix" turns a
// flag off, which runs the corrected branch below: the fix is real code, not a fake toggle.

export const MEDICINES = [
  { id: 'cardiolex', name: 'Cardiolex 10 mg', form: 'Tablets', use: 'Blood pressure' },
  { id: 'respiron', name: 'Respiron 100', form: 'Inhaler', use: 'Asthma' },
  { id: 'dermaclear', name: 'Dermaclear 1%', form: 'Cream', use: 'Eczema' },
]
export const REACTIONS = ['Headache', 'Dizziness', 'Rash', 'Nausea']

export const START = {
  view: 'medicine', step: 1, medicine: null, others: [], reaction: null, batch: '',
  send: 'idle', duplicate: false, references: [], error: null, notice: null, sent: 0,
}

// Which action a recorded click means, for trails that only kept the target.
export const ACTION_FOR_TARGET = {
  ...Object.fromEntries(MEDICINES.map((m) => [`medicine-${m.id}`, () => ({ type: 'choose_medicine', id: m.id })])),
  ...Object.fromEntries(REACTIONS.map((r) => [`reaction-${r.toLowerCase()}`, () => ({ type: 'choose_reaction', value: r })])),
  'add-medicine': (value) => ({ type: 'add_medicine', name: value || 'Paracetamol 500 mg' }),
  'to-details': () => ({ type: 'to_details' }),
  batch: (value) => ({ type: 'set_batch', value }),
  'submit-details': () => ({ type: 'submit_details' }),
  submit: () => ({ type: 'submit' }),
  back: () => ({ type: 'back' }),
  restart: () => ({ type: 'restart' }),
}

const BATCH = /^[A-Z]{2}\d{4}$/   // two letters, four numbers, as printed on the box

const ok = (target, step, latency_ms = 120) => ({ type: 'response', target, step, detail: { latency_ms } })
const fail = (target, step, message) => ({ type: 'error', target, step, detail: { message } })
const noop = (target, step, label) => ({ type: 'noop', target, step, detail: { label } })

// Returns { state, effects, schedule } where schedule = { after_ms, action } for async work.
export function reduce(state, action, flags = {}) {
  switch (action.type) {
    case 'choose_medicine': {
      const medicine = MEDICINES.find((m) => m.id === action.id)
      if (!medicine) return { state, effects: [] }
      return { state: { ...state, medicine: medicine.id, view: 'others', step: 2, error: null },
        effects: [ok(`medicine-${medicine.id}`, 1)] }
    }

    // KUAT:step-2
    case 'add_medicine': {
      if (flags.dead_add_medicine) {
        // Planted bug: the handler returns before reading the name, so nothing happens.
        return { state, effects: [noop('add-medicine', 2, 'Add medicine')] }
      }
      const name = (action.name || '').trim()
      if (!name) return { state: { ...state, error: 'Type a medicine name first' }, effects: [] }
      if (state.others.includes(name)) return { state, effects: [ok('add-medicine', 2)] }
      return { state: { ...state, others: [...state.others, name], error: null, notice: `${name} added` },
        effects: [ok('add-medicine', 2)] }
    }
    // end KUAT:step-2

    case 'to_details':
      return { state: { ...state, view: 'details', step: 3, error: null, notice: null }, effects: [ok('to-details', 3)] }

    case 'choose_reaction':
      return { state: { ...state, reaction: action.value }, effects: [] }

    case 'set_batch':
      return { state: { ...state, batch: action.value ?? '' }, effects: [] }

    // KUAT:step-3
    case 'submit_details': {
      // Planted bug: strict_batch validates the raw text, so a lower-case "kp4821" is rejected.
      const value = flags.strict_batch ? state.batch : state.batch.trim().toUpperCase()
      if (!BATCH.test(value)) {
        return { state: { ...state, error: 'Invalid batch number' }, effects: [fail('submit-details', 3, 'Invalid batch number')] }
      }
      return { state: { ...state, batch: value, view: 'review', step: 4, error: null }, effects: [ok('submit-details', 4)] }
    }
    // end KUAT:step-3

    // KUAT:step-4
    case 'submit': {
      if (state.send === 'sending') {
        if (flags.double_submit) {
          // Planted bug: a second press while sending posts the report again, creating a duplicate.
          return { state: { ...state, duplicate: true }, effects: [fail('submit', 4, 'Duplicate report created')] }
        }
        return { state, effects: [] } // fixed: Submit is ignored (and disabled) while sending
      }
      if (state.send === 'sent') return { state, effects: [] }
      const after_ms = flags.slow_submit ? 7200 : 900 // planted bug: slow call to the safety database
      return { state: { ...state, send: 'sending', error: null }, effects: [],
        schedule: { after_ms, action: { type: 'send_done', latency_ms: after_ms } } }
    }
    case 'send_done': {
      if (state.send !== 'sending') return { state, effects: [] }
      const first = 1041 + state.sent * 2
      const references = state.duplicate ? [`SR-${first}`, `SR-${first + 1}`] : [`SR-${first}`]
      return { state: { ...state, send: 'sent', view: 'done', step: 5, sent: state.sent + 1, references },
        effects: [ok('submit', 4, action.latency_ms)] }
    }
    // end KUAT:step-4

    case 'back': {
      const previous = { others: 'medicine', details: 'others', review: 'details' }[state.view]
      if (!previous || state.send === 'sending') return { state, effects: [] }
      return { state: { ...state, view: previous, step: state.step - 1, error: null }, effects: [] }
    }

    case 'restart':
      return { state: { ...START, sent: state.sent }, effects: [] }

    default:
      return { state, effects: [] }
  }
}

// Turn a recorded trail back into the actions the tester performed.
export function actionsFromTrail(trail) {
  return trail
    .filter((e) => e.kind === 'action')
    .map((e) => {
      if (e.detail?.action) return { t: e.t, action: e.detail.action, target: e.target, label: e.detail?.label }
      const make = ACTION_FOR_TARGET[e.target]
      return make ? { t: e.t, action: make(e.detail?.value), target: e.target, label: e.detail?.label } : null
    })
    .filter(Boolean)
}

// Which script steps a transition completed cleanly (used for live passes and by the Ghost).
export function stepsCompleted(before, after, action, submitExpectedMs = 2000) {
  const done = []
  if (!before.medicine && after.medicine) done.push(1)
  if (after.others.length > before.others.length) done.push(2)
  if (before.view === 'details' && after.view === 'review') done.push(3)
  if (before.send === 'sending' && after.send === 'sent') {
    if ((action.latency_ms || 0) <= submitExpectedMs * 1.25 && !after.duplicate) done.push(4)
    done.push(5)
  }
  return done
}
