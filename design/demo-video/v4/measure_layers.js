// Exact positions of the three cookie layers in the state the twist clip ends in (fresh cycle, build deployed).
const { chromium } = require('playwright-core')
const BASE = 'http://127.0.0.1:8077'
;(async () => {
  const b = await chromium.launch({ channel: 'chrome', headless: true })
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.request.post(BASE + '/api/demo/reset')
  await ctx.request.put(BASE + '/api/build', { data: { dead_add_medicine: true, strict_batch: true, slow_submit: true, double_submit: true } })
  const p = await ctx.newPage()
  await p.goto(BASE + '/#/')
  await p.waitForFunction(() => document.querySelector('.stage')?.classList.contains('closed'))
  const c = await p.evaluate(() => { const r = document.querySelector('.layer.cream').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await p.mouse.click(c.x, c.y)
  await p.waitForFunction(() => document.querySelector('.stage')?.classList.contains('open'), null, { timeout: 30000 })
  await p.waitForTimeout(4500)
  console.log(JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.layer')].map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } }))))
  await b.close()
})()
