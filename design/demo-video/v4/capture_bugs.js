// The tester site's planted bugs, for the bug tour: lower-case batch rejected, the slow submit, the duplicate submit.
const { chromium } = require('playwright-core')
const fs = require('fs')
const path = require('path')
const BASE = 'http://127.0.0.1:8077'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const meta = JSON.parse(fs.readFileSync('public/meta.json', 'utf8'))
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await ctx.request.put(BASE + '/api/build', { data: { dead_add_medicine: true, strict_batch: true, slow_submit: true, double_submit: true } })
  const page = await ctx.newPage()
  const shot = async (name, boxes) => {
    await wait(500)
    await page.screenshot({ path: path.join('public/shots', name + '.png') })
    const b = {}
    for (const [k, loc] of Object.entries(boxes)) { const bb = await loc.boundingBox().catch(() => null); if (bb) b[k] = bb }
    meta.shots[name] = { file: `shots/${name}.png`, boxes: b }
    console.log('shot', name, Object.keys(b).join(','))
  }
  await page.goto(BASE + '/#/test')
  await page.locator('button.med').first().waitFor()
  await page.locator('button.med').first().click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Headache' }).click()
  await page.locator('input.sinput').fill('kp4821')
  await page.getByRole('button', { name: 'Continue to review' }).click()
  await page.getByText('Invalid batch number').waitFor()
  await shot('bug_batch', { card: page.locator('.site-card'), error: page.locator('.site-error'), input: page.locator('input.sinput') })
  await page.locator('input.sinput').fill('KP4821')
  await page.getByRole('button', { name: 'Continue to review' }).click()
  const submit = page.getByRole('button', { name: /Submit report|Sending/ })
  await submit.click()
  await wait(900)
  await shot('bug_slow', { card: page.locator('.site-card'), submit })
  await submit.click().catch(() => {})
  await page.locator('.ref').nth(1).waitFor({ timeout: 20000 })
  await wait(600)
  await shot('bug_double', { card: page.locator('.site-card'), refs: page.locator('.ref').first() })
  meta.shots.bug_double.boxes.refs2 = await page.locator('.ref').nth(1).boundingBox()
  fs.writeFileSync('public/meta.json', JSON.stringify(meta, null, 1))
  await browser.close()
  console.log('done')
})().catch((e) => { console.error('CRASH', e); process.exit(1) })
