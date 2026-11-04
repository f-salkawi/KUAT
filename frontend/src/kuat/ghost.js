// Ghost tester: replays a tester's recorded actions against a build, instantly, using a
// virtual clock, and checks every result against the test script. It finds three kinds of
// fault: an error, a button that did nothing, and a step slower than the script allows.

import { START, actionsFromTrail, reduce, stepsCompleted } from '../demo/reportEngine.js'

const SLOW_FACTOR = 1.25

// Which Ghost fault proves which Detective fact, so a ticket is judged on its own fault.
export const FAULT_FOR_FACT = { slow: 'slow', dead_click: 'noop', rage: 'noop', error: 'error', double_submit: 'error' }

// `focus`: the fault kinds this ticket is about. A trail passes when none of those happen; any
// other fault (a different bug on the same step) is still reported, as "also seen".
export function simulate(trail, flags, steps, focus = null) {
  const expected = Object.fromEntries(steps.map((s) => [s.id, s.expected_ms]))
  const names = Object.fromEntries(steps.map((s) => [s.id, s.name]))
  let state = START
  let scheduled = []
  const faults = []
  const passed = new Set()

  function apply(action, at) {
    const result = reduce(state, action, flags)
    const before = state
    state = result.state
    for (const effect of result.effects) {
      const name = names[effect.step] || 'Step'
      if (effect.type === 'error') faults.push({ kind: 'error', text: `${name}: error "${effect.detail.message}"` })
      if (effect.type === 'noop') faults.push({ kind: 'noop', text: `${name}: '${effect.detail.label}' did nothing` })
      if (effect.type === 'response' && effect.detail.latency_ms > (expected[effect.step] || 1000) * SLOW_FACTOR) {
        faults.push({ kind: 'slow', text: `${name}: took ${(effect.detail.latency_ms / 1000).toFixed(1)} s` })
      }
    }
    if (result.schedule) scheduled.push({ at: at + result.schedule.after_ms, action: result.schedule.action })
    for (const step of stepsCompleted(before, state, action, expected[4])) passed.add(step)
  }

  function flush(until) {
    scheduled.sort((a, b) => a.at - b.at)
    while (scheduled.length && scheduled[0].at <= until) {
      const next = scheduled.shift()
      apply(next.action, next.at)
    }
  }

  const actions = actionsFromTrail(trail)
  for (const { t, action } of actions) {
    flush(t)
    apply(action, t)
  }
  flush(Infinity)
  const mine = focus ? faults.filter((f) => focus.has(f.kind)) : faults
  const other = focus ? faults.filter((f) => !focus.has(f.kind)) : []
  return {
    passed: mine.length === 0,
    problems: mine.map((f) => f.text),
    also_seen: other.map((f) => f.text),
    steps_passed: faults.length ? [] : [...passed].sort(),   // a step only counts as tested when nothing went wrong
    actions: actions.length,
  }
}

// `facts`: the Detective's facts on the ticket; they decide what this Ghost run is checking.
export function runGhost(reports, flags, steps, facts = []) {
  const kinds = new Set(facts.map((f) => FAULT_FOR_FACT[f.type]).filter(Boolean))
  const focus = kinds.size ? kinds : null
  const results = reports.map((r) => ({ report_id: r.id, tester: r.tester, ...simulate(r.trail || [], flags, steps, focus) }))
  return { at: new Date().toISOString(), build: flags, focus: focus ? [...focus] : null, results, passed: results.every((r) => r.passed) }
}
