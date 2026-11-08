// Captures the real KUAT app (local copy on :8077 with its own database) for the cinematic video:
// sharp 2x screenshots of each moment with element boxes for camera moves, the data behind them,
// and slow-motion frame captures of the cookie twist and the eat (played back fast later, so they are smooth).
const { chromium } = require('playwright-core')
const fs = require('fs')
const path = require('path')

const BASE = 'http://127.0.0.1:8077'
const SHOTS = path.join(__dirname, 'public', 'shots')
const FRAMES = path.join(__dirname, 'frames')
fs.mkdirSync(SHOTS, { recursive: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const meta = { viewport: { width: 1440, height: 900 }, scale: 2, shots: {} }
const data = {}

const CURSOR = `window.addEventListener('DOMContentLoaded', () => {
  const cur = document.createElement('div'); cur.id = '__cur'
  cur.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M5 2.5l14 8.2-6.2 1.5-3.1 6.3z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>'
  cur.style.cssText = 'position:fixed;left:-80px;top:-80px;z-index:2147483647;pointer-events:none;filter:drop-shadow(0 3px 4px rgba(0,0,0,.5))'
  document.body.appendChild(cur)
  document.addEventListener('mousemove', (e) => { cur.style.left = (e.clientX - 5) + 'px'; cur.style.top = (e.clientY - 3) + 'px' }, true)
})`

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const ctx = await browser.newContext({ viewport: meta.viewport, deviceScaleFactor: meta.scale, permissions: ['clipboard-read', 'clipboard-write'] })
  await ctx.request.post(BASE + '/api/demo/reset')
  await ctx.request.put(BASE + '/api/build', { data: { dead_add_medicine: true, strict_batch: true, slow_submit: true, double_submit: true } })
  await ctx.addInitScript(CURSOR)
  const page = await ctx.newPage()
  page.on('dialog', (d) => d.accept())
  const api = async (p) => (await ctx.request.get(BASE + '/api' + p)).json()
  const cursor = (show) => page.evaluate((s) => { const c = document.getElementById('__cur'); if (c) c.style.display = s ? '' : 'none' }, show)

  async function shot(name, boxes = {}) {
    await cursor(false)
    await wait(450)
    await page.screenshot({ path: path.join(SHOTS, name + '.png') })
    const b = {}
    for (const [k, sel] of Object.entries(boxes)) {
      const loc = typeof sel === 'string' ? page.locator(sel).first() : sel
      const bb = await loc.boundingBox().catch(() => null)
      if (bb) b[k] = bb
    }
    meta.shots[name] = { file: `shots/${name}.png`, boxes: b }
    await cursor(true)
    console.log('shot', name, Object.keys(b).join(','))
  }

  async function slowClip(name, rate, run) {
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('Animation.enable')
    await cdp.send('Animation.setPlaybackRate', { playbackRate: rate })
    const dir = path.join(FRAMES, name)
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(dir, { recursive: true })
    const frames = []
    cdp.on('Page.screencastFrame', (f) => {
      const file = `${String(frames.length).padStart(5, '0')}.jpg`
      frames.push({ t: f.metadata.timestamp, file })
      fs.writeFileSync(path.join(dir, file), Buffer.from(f.data, 'base64'))
      cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
    })
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 2880, maxHeight: 1800, everyNthFrame: 1 })
    await run()
    await cdp.send('Page.stopScreencast')
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 })
    await cdp.detach()
    fs.writeFileSync(path.join(dir, 'frames.json'), JSON.stringify({ rate, frames }))
    console.log('clip', name, frames.length, 'frames')
  }

  const disc = () => page.evaluate(() => { const r = document.querySelector('.layer.cream').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  const toTop = (sel) => page.evaluate((s) => { const el = document.querySelector(s); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 20) }, sel)
  const waitClass = (cls) => page.waitForFunction((c) => document.querySelector('.stage')?.classList.contains(c), cls, { timeout: 60000 })

  // 1. Landing and the twist, in slow motion.
  await page.goto(BASE + '/#/')
  await waitClass('closed')
  await wait(1500)
  await shot('landing', { cookie: '.layer.cream', title: '.hero h1' })
  let c = await disc()
  await page.mouse.move(c.x + 330, c.y + 230)
  await slowClip('twist', 0.2, async () => {
    await wait(1500)
    await page.mouse.move(c.x, c.y, { steps: 40 })
    await wait(900)
    await page.mouse.down()
    await page.mouse.up()
    await waitClass('open')
    await wait(4500)
  })
  await page.getByRole('button', { name: 'Close the cookie' }).click()
  await waitClass('closed')

  // 2. Tester side.
  await page.goto(BASE + '/#/test')
  await page.locator('.kuat-knight').waitFor()
  await wait(900)
  await shot('form', { knight: '.kuat-knight', step: '.kuat-step', card: '.site-card', meds: '.med-grid', banner: '.uat-banner' })
  await page.locator('.kuat-knight').click()
  await page.locator('.kpanel').waitFor()
  await wait(700)
  await shot('panel_home', { panel: '.kpanel', problem: page.locator('button.choice').nth(0), idea: page.locator('button.choice').nth(1) })
  await page.getByLabel('Close panel').click()
  await page.locator('button.med').first().click()
  await page.getByLabel('Other medicine').fill('Ibuprofen')
  const add = page.getByRole('button', { name: 'Add medicine' })
  for (let i = 0; i < 5; i++) { await add.click(); await wait(140) }
  await page.locator('.ktoast').waitFor()
  await wait(600)
  await shot('rage', { add, toast: '.ktoast', input: 'input[aria-label="Other medicine"]', card: '.site-card' })
  await page.getByRole('button', { name: 'Add comment' }).click()
  await page.locator('.kpanel textarea').fill('I pressed Add medicine loads of times and nothing got added')
  await shot('panel_problem', { panel: '.kpanel', text: '.kpanel textarea', send: '.kpanel button.btn.primary:not(.sm)' })
  await page.locator('.kpanel button.btn.primary:not(.sm)').click()
  await page.getByText('The agents are checking it now').waitFor()
  await wait(2500)
  await shot('panel_sent', { panel: '.kpanel', report: '.my-report' })
  // A vague report: the Detective asks one question.
  await page.getByRole('button', { name: 'Send another' }).click()
  await page.getByText('Report a problem').click()
  await page.locator('.kpanel textarea').fill('it feels weird')
  await page.locator('.kpanel button.btn.primary:not(.sm)').click()
  const answerBox = page.locator('.kpanel input[placeholder="Your answer"]')
  await answerBox.waitFor({ timeout: 60000 })
  await wait(800)
  await answerBox.scrollIntoViewIfNeeded()
  await shot('question', { panel: '.kpanel', question: page.locator('.my-report').filter({ has: answerBox }).first(), answer: answerBox })
  await answerBox.fill('The confirmation page never says when the email will arrive')
  await page.locator('.kpanel').getByRole('button', { name: 'Reply' }).click()
  await wait(1200)
  await page.getByLabel('Close panel').click()

  // 3. Nine demo testers, then wait for the agents to finish.
  await ctx.request.post(BASE + '/api/demo/scenario')
  let last = -1, stable = 0
  for (let i = 0; i < 90 && stable < 5; i++) {
    await wait(2000)
    const q = await api('/queue')
    const n = (q.item ? 1 : 0) + (q.remaining || 0)
    stable = n === last && n > 0 ? stable + 1 : 0
    last = n
  }
  console.log('queue', last)

  // 4. Developer side.
  await page.goto(BASE + '/#/')
  await waitClass('closed')
  c = await disc()
  await page.mouse.move(c.x, c.y)
  await page.mouse.down()
  await page.mouse.up()
  await waitClass('open')
  await wait(1500)
  await toTop('.layer.biscuit')
  await shot('testers', { layer: '.layer.biscuit', farah: page.locator('.quote').filter({ hasText: 'رقم' }).first(),
    dani: page.locator('.quote').filter({ hasText: "Didn't work" }).first(), hana: page.locator('.quote').filter({ hasText: 'It felt weird' }).first() })
  await toTop('.layer.cream')
  await shot('agents', { layer: '.layer.cream', team: '.agents', feed: '.feed' })
  await toTop('.decide')
  await shot('review', { decide: '.decide', approve: '.decide button.btn.primary:not(.sm)', overrule: page.getByText('Or overrule in one click') })
  for (let i = 0; i < 16; i++) {
    const primary = page.locator('.decide button.btn.primary:not(.sm)').first()
    if (!(await primary.isVisible().catch(() => false))) break
    await primary.click()
    await wait(1700)
  }
  await page.locator('.meter').scrollIntoViewIfNeeded()
  await wait(2500)
  await toTop('.decide')
  await shot('ready_before', { meter: '.meter', ready: '.ready-num', heat: '.decide .panel-box >> nth=1', boards: '.boards' })
  data.readyBefore = (await api('/dashboard')).readiness

  // 5. The ticket, the Mechanic and the Ghost.
  const item = page.locator('.boards .board-item').filter({ hasText: /medicine/i }).first()
  const href = await item.getAttribute('href')
  data.issueId = Number((href || '').split('/').pop())
  await item.click()
  await page.locator('.drawer').waitFor()
  await wait(1200)
  await shot('ticket', { drawer: '.drawer', title: '.drawer h1', copy: page.getByRole('button', { name: /Copy for Jira/ }), steps: page.getByText('Steps to reproduce') })
  await page.getByRole('button', { name: /Copy for Jira/ }).click()
  await wait(700)
  data.jira = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''))
  await page.getByText("Mechanic's suggested fix").scrollIntoViewIfNeeded()
  await wait(600)
  await shot('mechanic', { drawer: '.drawer', mech: page.locator('.drawer .panel-box').filter({ hasText: "Mechanic's suggested fix" }) })
  const ghostBtn = page.getByRole('button', { name: /Replay \d+ trail/ })
  await ghostBtn.scrollIntoViewIfNeeded()
  await ghostBtn.click()
  await page.locator('.ghost-result.fail').first().waitFor()
  await wait(700)
  await shot('ghost_fail', { drawer: '.drawer', ghost: page.locator('.drawer .panel-box').filter({ hasText: 'Ghost tester' }), mark: page.getByRole('button', { name: 'Mark fixed' }) })
  await page.locator('.drawer').getByRole('button', { name: /Close/ }).click()
  const deploy = page.locator('.switch').filter({ hasText: 'Add medicine' }).getByRole('button')
  await deploy.scrollIntoViewIfNeeded()
  await wait(400)
  await shot('deploy_before', { sw: page.locator('.switch').filter({ hasText: 'Add medicine' }), btn: deploy })
  await deploy.click()
  await wait(1500)
  await shot('deploy_after', { sw: page.locator('.switch').filter({ hasText: 'Add medicine' }), btn: page.locator('.switch').filter({ hasText: 'Add medicine' }).getByRole('button') })
  await item.click()
  await page.locator('.drawer').waitFor()
  const ghost2 = page.getByRole('button', { name: /Replay \d+ trail/ })
  await ghost2.scrollIntoViewIfNeeded()
  await ghost2.click()
  await page.locator('.ghost-result.pass').first().waitFor()
  await wait(700)
  await shot('ghost_pass', { drawer: '.drawer', ghost: page.locator('.drawer .panel-box').filter({ hasText: 'Ghost tester' }), mark: page.getByRole('button', { name: 'Mark fixed' }) })
  await page.getByRole('button', { name: 'Mark fixed' }).click()
  await page.getByText('The Ghost tester replayed').waitFor()
  await page.locator('.drawer').evaluate((d) => d.scrollTo(0, 0))
  await wait(900)
  await shot('fixed', { drawer: '.drawer', banner: page.locator('.drawer .panel-box').filter({ hasText: 'The Ghost tester replayed' }), title: '.drawer h1' })
  await page.locator('.drawer').getByRole('button', { name: /Close/ }).click()
  await wait(2500)
  await toTop('.decide')
  await shot('ready_after', { meter: '.meter', ready: '.ready-num', boards: '.boards' })
  data.readyAfter = (await api('/dashboard')).readiness

  // 6. The tester hears it was fixed.
  await page.goto(BASE + '/#/test')
  await page.locator('.kuat-knight').click()
  const fixedReport = page.locator('.my-report').filter({ hasText: 'Fixed!' }).first()
  await fixedReport.waitFor({ timeout: 15000 })
  await fixedReport.scrollIntoViewIfNeeded()
  await wait(700)
  await shot('tester_fixed', { panel: '.kpanel', report: fixedReport })
  await page.getByLabel('Close panel').click()

  // 7. Close the cookie and eat it, in slow motion.
  await page.goto(BASE + '/#/')
  await waitClass('open')
  await toTop('.layer.biscuit')
  await page.getByRole('button', { name: 'Close the cookie' }).click()
  await waitClass('closed')
  await page.evaluate(() => window.scrollTo(0, 0))
  await wait(1200)
  c = await disc()
  const mouth = await page.evaluate(() => ({ x: innerWidth / 2, y: innerHeight - 103 }))
  await page.mouse.move(c.x + 300, c.y - 150)
  await slowClip('eat', 0.2, async () => {
    await wait(1200)
    await page.mouse.move(c.x, c.y, { steps: 30 })
    await wait(700)
    await page.mouse.down()
    for (let i = 1; i <= 90; i++) { await page.mouse.move(c.x + (mouth.x - c.x) * i / 90, c.y + (mouth.y - c.y) * i / 90); await wait(45) }
    await wait(400)
    await page.mouse.up()
    await page.locator('.end.show').waitFor({ timeout: 60000 })
    await wait(6000)
  })

  // 8. The data behind the moments.
  data.issue = await api('/issues/' + data.issueId)
  data.farah = (await api('/reports?tester=Farah'))[0]
  data.hana = (await api('/reports?tester=Hana'))[0]
  data.dani = (await api('/reports?tester=Dani'))[0]
  data.feed = await api('/feed?after=0')
  fs.writeFileSync(path.join(__dirname, 'public', 'meta.json'), JSON.stringify(meta, null, 1))
  fs.writeFileSync(path.join(__dirname, 'public', 'data.json'), JSON.stringify(data, null, 1))
  await browser.close()
  console.log('done')
}
main().catch((e) => { console.error('CRASH', e); process.exit(1) })
