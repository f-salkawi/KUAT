async function call(method, path, body) {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : 'Something went wrong. Try again.'
    throw new Error(detail)
  }
  return data
}

export const api = {
  health: () => call('GET', '/health'),
  script: () => call('GET', '/script'),
  build: () => call('GET', '/build'),
  setBuild: (flags) => call('PUT', '/build', flags),
  report: (body) => call('POST', '/reports', body),
  reports: (tester) => call('GET', `/reports?tester=${encodeURIComponent(tester)}`),
  answer: (id, answer) => call('POST', `/reports/${id}/answer`, { answer }),
  unstack: (id) => call('POST', `/reports/${id}/unstack`),
  pass: (step_id, tester) => call('POST', '/passes', { step_id, tester }),
  queue: () => call('GET', '/queue'),
  decide: (id, action, extra = {}) => call('POST', `/issues/${id}/decision`, { action, ...extra }),
  issues: (board) => call('GET', `/issues?board=${board}`),
  issue: (id) => call('GET', `/issues/${id}`),
  ghost: (id, ghost) => call('POST', `/issues/${id}/ghost`, { ghost }),
  fixed: (id, ghost) => call('POST', `/issues/${id}/fixed`, { ghost }),
  dashboard: () => call('GET', '/dashboard'),
  briefing: () => call('GET', '/briefing'),
  feed: (after) => call('GET', `/feed?after=${after}`),
  reset: () => call('POST', '/demo/reset'),
  scenario: () => call('POST', '/demo/scenario'),
}
