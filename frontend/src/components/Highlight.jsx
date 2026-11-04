// Marks the tester's words that the Spotter matched, so the evidence is visible.
export default function Highlight({ text, words = [] }) {
  if (!text || !words.length) return <>{text}</>
  const lower = new Set(words.map((w) => w.toLowerCase()))
  return (
    <>
      {text.split(/(\s+)/).map((part, i) => {
        const bare = part.toLowerCase().replace(/[^a-z0-9']/g, '')
        return lower.has(bare) ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>
      })}
    </>
  )
}
