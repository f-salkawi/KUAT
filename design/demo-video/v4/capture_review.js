// Re-captures the manager's review card with exact boxes: the suggestion, its confidence, the evidence, the counter.
const { chromium } = require('playwright-core')
const fs = require('fs')
const BASE = 'http://127.0.0.1:8077'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const meta = JSON.parse(fs.readFileSync('public/meta.json', 'utf8'))
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await ctx.request.post(BASE + '/api/demo/reset')
  await ctx.request.put(BASE + '/api/build', { data: { dead_add_medicine: true, strict_batch: true, slow_submit: true, double_submit: true } })
  await ctx.request.post(BASE + '/api/demo/scenario')
  let last = -1, stable = 0
  for (let i = 0; i < 90 && stable < 5; i++) {
    await wait(2000)
    const q = await (await ctx.request.get(BASE + '/api/queue')).json()
    const n = (q.item ? 1 : 0) + (q.remaining || 0)
    stable = n === last && n > 0 ? stable + 1 : 0
    last = n
  }
  const page = await ctx.newPage()
  await page.goto(BASE + '/#/')
  await page.waitForFunction(() => document.querySelector('.stage')?.classList.contains('closed'))
  const c = await page.evaluate(() => { const r = document.querySelector('.layer.cream').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await page.mouse.click(c.x, c.y)
  await page.waitForFunction(() => document.querySelector('.stage')?.classList.contains('open'), null, { timeout: 30000 })
  await wait(1500)
  await page.evaluate(() => { const el = document.querySelector('.decide'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 20) })
  await wait(1200)
  await page.screenshot({ path: 'public/shots/review.png' })
  const boxes = await page.evaluate(() => {
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }
    const withText = (root, re) => [...root.querySelectorAll('*')].find((e) => re.test(e.textContent || '') && [...e.children].every((ch) => !re.test(ch.textContent || '')))
    const framed = (el) => { while (el && el !== document.body) { const s = getComputedStyle(el); if (parseFloat(s.borderTopWidth) >= 1 && s.borderTopStyle !== 'none') return el; el = el.parentElement } return null }
    const decide = document.querySelector('.decide')
    const card = decide.firstElementChild
    const suggestEl = withText(card, /KUAT suggests/)
    return {
      decide: box(decide), card: box(card), suggest: box(framed(suggestEl)), suggestText: box(suggestEl),
      confidence: box(withText(card, /confident/)), counter: box(withText(card, /^\s*\d+ of \d+\s*$/)),
      title: box(card.querySelector('h2, h3')), evidence: box(withText(card, /What testers said/i)),
      approve: box(decide.querySelector('button.btn.primary:not(.sm)')), overrule: box(withText(card, /Or overrule in one click/)),
      overButtons: [...card.querySelectorAll('button.btn.sm')].map(box),
    }
  })
  meta.shots.review = { file: 'shots/review.png', boxes }
  fs.writeFileSync('public/meta.json', JSON.stringify(meta, null, 1))
  console.log(JSON.stringify(boxes))
  await browser.close()
})().catch((e) => { console.error('CRASH', e); process.exit(1) })
