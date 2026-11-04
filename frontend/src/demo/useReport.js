import { useCallback, useEffect, useRef, useState } from 'react'
import { START, reduce, stepsCompleted } from './reportEngine.js'

// Runs the test site live: applies actions, records every action and effect into the KUAT
// recorder, schedules async work (sending the report) and reports steps the tester passed.
export function useReport({ flags, recorder, steps, onPass }) {
  const [state, setState] = useState(START)
  const stateRef = useRef(START)
  const timers = useRef([])
  const flagsRef = useRef(flags)
  flagsRef.current = flags

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const apply = useCallback((action) => {
    const before = stateRef.current
    const result = reduce(before, action, flagsRef.current)
    stateRef.current = result.state
    setState(result.state)
    for (const effect of result.effects) recorder?.effect(effect)
    const submitMs = steps?.find((s) => s.id === 4)?.expected_ms
    for (const step of stepsCompleted(before, result.state, action, submitMs)) onPass?.(step)
    if (result.schedule) {
      const { after_ms, action: next } = result.schedule
      timers.current.push(setTimeout(() => apply(next), after_ms))
    }
  }, [recorder, steps, onPass])

  // A user interaction: record it, then run it.
  const act = useCallback(({ type, target, label, value, sensitive, action }) => {
    recorder?.action(type, target, stateRef.current.step, { label, value, sensitive, action })
    if (action) apply(action)
  }, [recorder, apply])

  // Typing: updates the field without filling the trail with every keystroke.
  const change = useCallback((action) => apply(action), [apply])

  return { state, act, change }
}
