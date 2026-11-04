import { useEffect, useState } from 'react'
import { api } from './api.js'
import Dashboard from './pages/Dashboard.jsx'
import TestSite from './pages/TestSite.jsx'

function useHash() {
  const [hash, setHash] = useState(window.location.hash || '#/')
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/')
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

// Two places: #/test is the app being tested (with the knight button), everything else is the KUAT cookie.
export default function App() {
  const hash = useHash()
  const [steps, setSteps] = useState([])
  const [flags, setFlags] = useState({})
  const [health, setHealth] = useState(null)
  const [tries, setTries] = useState(0)

  // The free server sleeps when nobody uses it, so keep knocking until it wakes up (about a minute).
  useEffect(() => {
    if (steps.length) return undefined
    const id = setTimeout(() => {
      api.script().then((s) => setSteps(s.steps)).catch(() => setTries((n) => n + 1))
      api.health().then(setHealth).catch(() => {})
    }, tries ? 3000 : 0)
    return () => clearTimeout(id)
  }, [steps.length, tries])

  useEffect(() => {
    const loadBuild = () => api.build().then(setFlags).catch(() => {})
    loadBuild()
    const id = setInterval(loadBuild, 4000)
    return () => clearInterval(id)
  }, [])

  if (!steps.length) {
    return (
      <div className="waking">
        <div className="kmark spin-slow"><i className="fa-solid fa-chess-knight" /></div>
        <p>{tries < 2 ? 'Baking the cookie...' : 'Waking up the free server. This can take up to a minute the first time.'}</p>
      </div>
    )
  }
  if (hash.startsWith('#/test')) return <TestSite steps={steps} flags={flags} />
  return <Dashboard steps={steps} flags={flags} setFlags={setFlags} health={health} />
}
