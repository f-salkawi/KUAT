// The click trail: what the tester did and what the app did back, with timings.
// Sensitive fields are recorded as "filled in", never their value.
// It also watches for rage clicks: RAGE_CLICKS on one button inside RAGE_WINDOW_MS.

export const RAGE_CLICKS = 4
export const RAGE_WINDOW_MS = 2000
const RAGE_COOLDOWN_MS = 15000
const MAX_EVENTS = 120

export function createRecorder({ onRage, now = () => Date.now() } = {}) {
  const start = now()
  let events = []
  const clicks = new Map() // target -> recent click times
  const lastRage = new Map()

  function push(event) {
    events.push({ ...event, t: now() - start })
    if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS)
  }

  return {
    action(type, target, step, detail = {}) {
      const safe = detail.sensitive ? { label: detail.label, masked: true } : detail
      push({ kind: 'action', type, target, step, detail: safe })
      if (type !== 'click') return
      const t = now()
      const recent = (clicks.get(target) || []).filter((c) => t - c <= RAGE_WINDOW_MS)
      recent.push(t)
      clicks.set(target, recent)
      if (recent.length >= RAGE_CLICKS && t - (lastRage.get(target) || -Infinity) > RAGE_COOLDOWN_MS) {
        lastRage.set(target, t)
        onRage?.({ target, step, label: detail.label || target, clicks: recent.length })
      }
    },
    effect(effect) {
      push({ kind: 'effect', ...effect })
    },
    trail(limit = 60) {
      return events.slice(-limit)
    },
    // After a report is sent, start a fresh trail, so the next report only carries new clicks.
    clear() {
      events = []
      clicks.clear()
    },
  }
}
