// Drives a local KUAT through every feature and records a video. Prints a PASS/FAIL line per check.
const { chromium } = require('playwright-core')
const BASE = 'http://127.0.0.1:8077'
const OUT = __dirname + '/video3'
const VOICE = __dirname + '/voice3'
const fs = require('fs')
const run = require('util').promisify(require('child_process').execFile)
// What the narrator says: the caption, with symbols turned into words.
const speech = (t) => t.replace(/KUAT's/g, "K-U-A-T's").replace(/\bKUAT\b/g, 'K-U-A-T').replace(/\bUAT\b/g, 'U-A-T').replace(/→/g, ' to ').replace(/…|\.\.\./g, ', ').replace(/·/g, ',').replace(/#(\d)/g, '$1').replace(/"/g, '')
const checks = []
const check = (name, ok, extra = '') => { checks.push([name, ok]); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const OVERLAY = `
window.addEventListener('DOMContentLoaded', () => {
  const cap = document.createElement('div'); cap.id = '__cap'
  cap.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483647;max-width:86%;padding:12px 20px;border-radius:12px;background:rgba(10,8,6,.88);color:#f5ecdc;font:600 19px/1.35 system-ui,sans-serif;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.4);pointer-events:none;display:none'
  document.body.appendChild(cap)
  const cur = document.createElement('div'); cur.id = '__cur'
  cur.style.cssText = 'position:fixed;width:18px;height:18px;border-radius:50%;background:rgba(255,255,255,.85);border:2px solid #111;z-index:2147483647;pointer-events:none;transform:translate(-50%,-50%);left:-50px;top:-50px;transition:transform .08s'
  document.body.appendChild(cur)
  document.addEventListener('mousemove', (e) => { cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px' }, true)
  document.addEventListener('mousedown', () => { cur.style.transform = 'translate(-50%,-50%) scale(.7)' }, true)
  document.addEventListener('mouseup', () => { cur.style.transform = 'translate(-50%,-50%)' }, true)
})`

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: OUT, size: { width: 1280, height: 800 } },
    permissions: ['clipboard-read', 'clipboard-write'] })
  await ctx.request.post(BASE + '/api/demo/reset')
  await ctx.addInitScript(OVERLAY)
  const page = await ctx.newPage()
  page.on('dialog', (d) => d.accept())
  page.on('pageerror', (e) => check('no page errors', false, e.message))
  const t0 = Date.now()
  let speechEnds = 0
  const spoken = []
  // Each caption is also spoken. A new line waits for the last one to finish, and a caption stays up until it is read.
  const say = async (text, ms = 2600) => {
    let dur = 0, file = null
    if (text) {
      const left = speechEnds - Date.now()
      if (left > 0) await wait(left + 200)
      file = `${VOICE}/line${String(spoken.length).padStart(2, '0')}.wav`
      await run('say', ['-v', 'Daniel', '-r', '188', '--file-format=WAVE', '--data-format=LEI16@22050', '-o', file, speech(text)])
      const info = (await run('afinfo', [file])).stdout
      dur = Number((info.match(/estimated duration: ([\d.]+)/) || [])[1] || 0) * 1000
    }
    await page.evaluate((t) => { const c = document.getElementById('__cap'); if (c) { c.textContent = t; c.style.display = t ? 'block' : 'none' } }, text)
    if (text) { spoken.push({ t: Date.now() - t0, file, text, spoken: speech(text), dur }); speechEnds = Date.now() + dur }
    if (ms) await wait(text ? Math.max(ms, dur + 350) : ms)
  }
  const smooth = async (loc, block = 'center') => {
    try {
      await loc.evaluate((el, b) => {
        if (b === 'top') window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 24, behavior: 'smooth' })
        else el.scrollIntoView({ behavior: 'smooth', block: b })
      }, block)
      await wait(1000)
    } catch { /* element gone */ }
  }
  const go = async (url) => { await say('', 0); await page.goto(url) }
  const click = async (loc) => { await loc.evaluate((el) => { const r = el.getBoundingClientRect(); if (r.top < 70 || r.bottom > innerHeight - 100) el.scrollIntoView({ behavior: 'smooth', block: 'center' }) }); await wait(800); const b = await loc.boundingBox(); if (b) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 }); await wait(250); await loc.click() }

  // Tap the visible cookie disc (the layers' full box is mostly hidden while closed).
  const tapCookie = async () => {
    const c = await page.evaluate(() => { const r = document.querySelector('.layer.cream').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
    await page.mouse.move(c.x, c.y, { steps: 14 })
    await wait(300)
    await page.mouse.down()
    await page.mouse.up()
  }

  // 1. Landing
  await go(BASE + '/#/')
  await wait(1500)
  await say('KUAT · Knight UAT: user acceptance testing, untangled', 3000)
  await tapCookie()
  await page.waitForFunction(() => document.querySelector('.stage')?.classList.contains('open'), null, { timeout: 8000 }).catch(() => {})
  await say('Twist it open: testers on top, AI agents in the cream, you decide at the bottom.', 3500)
  await click(page.getByRole('button', { name: 'Close the cookie' }))
  await page.waitForFunction(() => document.querySelector('.stage')?.classList.contains('closed'), null, { timeout: 8000 }).catch(() => {})
  check('intro twist open and closed', await page.locator('.stage.closed').count() === 1)
  await say('Two sides: testers use the real app, developers get the cookie. Testers first.', 3000)

  // 2. Tester side
  await go(BASE + '/#/test')
  await wait(1500)
  check('test site loads', await page.getByText('Northwind Pharma').first().isVisible())
  await say('The app under test: a pharma side-effect report form, with 4 bugs planted on purpose', 3500)
  await click(page.locator('.kuat-knight'))
  await say('The knight button: report a problem or idea in any language. Each tester also gets a test script.', 4000)
  check('knight panel opens', await page.locator('.kpanel').isVisible())
  await click(page.getByLabel('Close panel'))

  await say('Step 1: pick the medicine', 1200)
  await click(page.locator('button.med').first())
  await say('Step 2: add other medicines… the Add button is broken', 1800)
  await page.getByLabel('Other medicine').fill('Ibuprofen')
  const add = page.getByRole('button', { name: 'Add medicine' })
  await click(add)
  for (let i = 0; i < 4; i++) { await add.click(); await wait(180) }
  await page.locator('.ktoast').waitFor({ timeout: 4000 }).catch(() => {})
  check('rage-click detected', await page.locator('.ktoast').isVisible())
  await say('Rage clicks spotted: KUAT files a silent report by itself, so nothing is lost', 3500)
  await click(page.getByRole('button', { name: 'Add comment' }))
  await page.locator('.kpanel textarea').pressSequentially('I pressed Add medicine loads of times and nothing got added', { delay: 25 })
  await say('The tester adds a comment in their own words. Their clicks are attached as evidence.', 1500)
  await click(page.locator('.kpanel button.btn.primary:not(.sm)'))
  await page.getByText('The agents are checking it now').waitFor({ timeout: 10000 }).catch(() => {})
  check('report sent', await page.getByText('The agents are checking it now').isVisible())
  await say('Sent. The tester can follow their report: sent → checked → decided → fixed', 3500)
  await click(page.getByLabel('Close panel'))

  await click(page.getByRole('button', { name: 'Continue', exact: true }))
  await say('Step 3: reaction and batch number. Typed in lower case…', 1500)
  await click(page.getByRole('button', { name: 'Headache' }))
  await page.locator('input.sinput').fill('kp4821')
  await click(page.getByRole('button', { name: 'Continue to review' }))
  await wait(600)
  check('strict batch bug shows', await page.getByText('Invalid batch number').isVisible())
  await say('…and it is rejected. Planted bug #2.', 2500)
  await page.locator('input.sinput').fill('KP4821')
  await click(page.getByRole('button', { name: 'Continue to review' }))
  await say('Step 4: submit. It takes 7 seconds, so an impatient tester presses twice…', 1500)
  const submit = page.getByRole('button', { name: /Submit report|Sending/ })
  await click(submit)
  await wait(700)
  await submit.click().catch(() => {})
  await page.locator('.ref').first().waitFor({ timeout: 15000 }).catch(() => {})
  const refs = await page.locator('.ref').count()
  check('slow + double submit bugs show', refs >= 2, `(${refs} reference numbers)`)
  await say(`Two reference numbers: a duplicate report. Bugs #3 and #4.`, 3000)
  await click(page.locator('.kuat-knight'))
  await click(page.getByText('Report a problem'))
  await page.locator('.kpanel textarea').pressSequentially('Submit took ages so I pressed it again and got two reference numbers', { delay: 20 })
  await click(page.locator('.kpanel button.btn.primary:not(.sm)'))
  await wait(1500)
  await click(page.getByLabel('Close panel'))

  // A vague report: the Detective asks one follow-up question. And an idea.
  await click(page.locator('.kuat-knight'))
  await click(page.getByText('Report a problem'))
  await page.locator('.kpanel textarea').pressSequentially('it feels weird', { delay: 60 })
  await say('Now a vague report, with nothing wrong in the clicks...', 1500)
  await click(page.locator('.kpanel button.btn.primary:not(.sm)'))
  await page.getByRole('button', { name: 'Send another' }).waitFor({ timeout: 10000 }).catch(() => {})
  await click(page.getByRole('button', { name: 'Send another' }))
  await click(page.getByText('Share an idea'))
  await page.locator('.kpanel textarea').pressSequentially('It would be nice to scan the batch number with the phone camera', { delay: 20 })
  await say('Ideas are welcome too. They go to their own board, never the bug queue.', 1500)
  await click(page.locator('.kpanel button.btn.primary:not(.sm)'))
  const answerBox = page.locator('.kpanel input[placeholder="Your answer"]')
  await answerBox.waitFor({ timeout: 40000 }).catch(() => {})
  check('detective asks a follow-up question', await answerBox.isVisible())
  if (await answerBox.isVisible()) {
    await smooth(answerBox)
    await say('For the vague one, the Detective asks ONE kind, specific question. The tester answers right here.', 4000)
    await answerBox.pressSequentially('The confirmation page never says when the email will arrive', { delay: 20 })
    await click(page.locator('.kpanel').getByRole('button', { name: 'Reply' }))
    await wait(1500)
    check('tester answer accepted', !(await answerBox.isVisible()))
  }
  await click(page.getByLabel('Close panel'))

  // 3. Developer side: open the cookie
  await go(BASE + '/#/')
  await wait(1200)
  await say('Developer side. Tap the cookie to twist it open.', 2000)
  await tapCookie()
  await page.waitForFunction(() => document.querySelector('.stage')?.classList.contains('open'), null, { timeout: 8000 }).catch(() => {})
  check('cookie opens', await page.locator('.stage.open').count() === 1)
  await say('Top biscuit: what testers are saying', 2500)
  await click(page.getByRole('button', { name: 'Load demo testers' }))
  await say('Loading 9 more demo testers: vague notes, an Arabic report, a duplicate, an idea…', 3000)

  // Wait for the agents to finish, while showing the cream layer working live.
  await smooth(page.locator('.layer.cream'), 'top')
  await say('The cream: 6 AI agents at work, live. Translator, Detective, Spotter, Writer, Mechanic.', 0)
  let last = -1, stable = 0
  for (let i = 0; i < 60 && stable < 4; i++) {
    await wait(2000)
    const q = await (await ctx.request.get(BASE + '/api/queue')).json()
    const n = (q.item ? 1 : 0) + (q.remaining || 0)
    stable = n === last && n > 0 ? stable + 1 : 0
    last = n
  }
  check('agents produced a review queue', last > 0, `(${last} items)`)
  await smooth(page.locator('.layer.biscuit').first(), 'top')
  await say('Reports are grouped by step. Farah wrote in Arabic: the Translator turned it into English.', 4000)

  // 4. Bottom biscuit: briefing, review, readiness
  await smooth(page.locator('.layer.biscuit').nth(1), 'top')
  await say("Bottom biscuit: you decide. First, KUAT's briefing in plain English.", 1500)
  await click(page.getByRole('button', { name: "Ask KUAT how it's going" }))
  await page.locator('.brief-body').waitFor({ timeout: 45000 }).catch(() => {})
  check('briefing answers', await page.locator('.brief-body').isVisible())
  await smooth(page.locator('.brief-body'))
  await wait(4500)
  await say('The review queue: ONE item at a time, on purpose. No "approve all". Every ticket needs a person.', 4000)
  let decided = 0
  for (let i = 0; i < 14; i++) {
    const primary = page.locator('.decide button.btn.primary:not(.sm)').first()
    if (!(await primary.isVisible().catch(() => false))) break
    await smooth(primary)
    if (i === 0) { await say('Each card shows the reports, highlighted words and click evidence. Accept the suggestion…', 3500); const o = page.getByText('Or overrule in one click'); if (await o.count()) { const b = await o.boundingBox(); if (b) await page.mouse.move(b.x + b.width + 120, b.y + b.height / 2, { steps: 15 }) } await say('…or overrule it in one click', 2500) }
    await click(primary)
    decided++
    await wait(1600)
  }
  check('review queue decided', decided > 0, `(${decided} decisions)`)
  await say('Approved bugs become tickets. Readiness and the "where the problems are" map update live.', 0)
  await smooth(page.locator('.meter'))
  await wait(3500)
  const score1 = Number(await page.locator('.meter').getAttribute('aria-valuenow'))

  // 5. Ticket drawer
  const item = page.locator('.boards .board-item').filter({ hasText: /medicine/i }).first()
  const hasItem = await item.count() > 0
  check('ticket on the To fix board', hasItem)
  await smooth(item)
  await say('Open a ticket', 1200)
  await click(item)
  await page.locator('.drawer').waitFor({ timeout: 8000 })
  await say('A full ticket: severity, steps to reproduce written from the real clicks, expected vs actual', 3500)
  await click(page.getByRole('button', { name: /Copy for Jira/ }))
  await wait(800)
  check('copy for Jira works', await page.getByText(/Copied in Jira format|Your browser blocked copying/).first().isVisible())
  await say('One click copies it in Jira format', 2200)
  const mech = page.getByText("Mechanic's suggested fix")
  if (await mech.count()) { await smooth(mech); await say('The Mechanic read the code and suggests the likely cause and fix. A developer makes the change.', 3500) }
  check('mechanic fix shown', await mech.count() > 0)
  const ghostBtn = page.getByRole('button', { name: /Replay \d+ trail/ })
  await smooth(ghostBtn)
  await say('The Ghost tester replays every tester\'s real clicks on the current build…', 1200)
  await click(ghostBtn)
  await page.locator('.ghost-result').first().waitFor({ timeout: 10000 }).catch(() => {})
  check('ghost says still failing before the fix', await page.locator('.ghost-result.fail').count() > 0)
  await say('…still failing. The bug is real.', 2500)
  const replay = page.getByRole('button', { name: 'Replay' }).first()
  if (await replay.count()) {
    await smooth(replay)
    await say('You can also replay one tester\'s exact click trail', 1000)
    await click(replay)
    await wait(4500)
    const close = page.locator('.modal').getByRole('button', { name: 'Close' })
    if (await close.count()) await click(close)
  }
  await click(page.locator('.drawer').getByRole('button', { name: /Close/ }))

  // 6. Deploy a fix, prove it, mark fixed
  const deploy = page.locator('.switch').filter({ hasText: 'Add medicine' }).getByRole('button')
  await smooth(deploy)
  await say('Play the developer: deploy the fix to the build', 1500)
  await click(deploy)
  await wait(1500)
  await click(page.locator('.boards .board-item').filter({ hasText: /medicine/i }).first())
  await page.locator('.drawer').waitFor()
  const ghost2 = page.getByRole('button', { name: /Replay \d+ trail/ })
  await smooth(ghost2)
  await say('Run the Ghost again on the new build…', 1000)
  await click(ghost2)
  await page.locator('.ghost-result.pass').first().waitFor({ timeout: 10000 }).catch(() => {})
  check('ghost passes after the fix', await page.locator('.ghost-result.pass').count() > 0 && await page.locator('.ghost-result.fail').count() === 0)
  await say('…every trail passes. Only now does "Mark fixed" unlock.', 2500)
  await click(page.getByRole('button', { name: 'Mark fixed' }))
  await page.getByText('The Ghost tester replayed').waitFor({ timeout: 8000 }).catch(() => {})
  check('marked fixed', await page.getByText('The Ghost tester replayed').isVisible())
  await smooth(page.getByText('The Ghost tester replayed'))
  await say('Fixed, with proof. And the testers who reported it are told their report helped.', 3500)
  await click(page.locator('.drawer').getByRole('button', { name: /Close/ }))
  await smooth(page.locator('.meter'))
  await wait(2500)
  const score2 = Number(await page.locator('.meter').getAttribute('aria-valuenow'))
  check('readiness went up', score2 > score1, `(${score1} → ${score2})`)
  await say(`Launch readiness: ${score1} → ${score2}`, 3000)

  // 7. Tester sees the outcome
  await go(BASE + '/#/test')
  await wait(1200)
  await click(page.locator('.kuat-knight'))
  const fixedReport = page.locator('.my-report').filter({ hasText: 'Add medicine' }).filter({ hasText: 'Fixed!' }).first()
  await fixedReport.waitFor({ timeout: 6000 }).catch(() => {})
  check('tester sees their report fixed', await fixedReport.count() > 0)
  await smooth(fixedReport)
  await say('Back on the tester side: their Add medicine report went all the way to Fixed', 4500)
  await click(page.getByLabel('Close panel'))

  // 8. Close and eat the cookie
  await go(BASE + '/#/')
  await wait(1500)
  const closeCookie = page.getByRole('button', { name: 'Close the cookie' })
  if (await closeCookie.isVisible().catch(() => false)) { await smooth(page.locator('.layer.biscuit').first(), 'top'); await click(closeCookie); await wait(2500) }
  await page.evaluate(() => window.scrollTo(0, 0))
  await say('Test cycle done? Drag the cookie down… and eat it.', 1200)
  await page.waitForFunction(() => document.querySelector('.stage')?.classList.contains('closed'), null, { timeout: 10000 }).catch(() => {})
  await wait(800)
  const pts = await page.evaluate(() => { const r = document.querySelector('.layer.cream').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, mx: innerWidth / 2, my: innerHeight - 103 } })
  await page.mouse.move(pts.x, pts.y, { steps: 10 })
  await page.mouse.down()
  for (let i = 1; i <= 40; i++) { await page.mouse.move(pts.x + (pts.mx - pts.x) * i / 40, pts.y + (pts.my - pts.y) * i / 40); await wait(30) }
  await wait(300)
  await page.mouse.up()
  await page.locator('.end.show').waitFor({ timeout: 8000 }).catch(() => {})
  check('cookie eaten', await page.locator('.end.show').isVisible())
  await say('', 3500)
  const bake = page.getByRole('button', { name: 'Bake another' })
  if (await bake.isVisible().catch(() => false)) { await click(bake); await say('Bake another for the next test cycle.', 2500) }
  await say('KUAT · Developers\' favourite Oreo', 3500)

  const left = speechEnds - Date.now()
  if (left > 0) await wait(left + 500)
  fs.writeFileSync(VOICE + '/lines.json', JSON.stringify(spoken, null, 1))
  await ctx.close()
  await browser.close()
  const failed = checks.filter(([, ok]) => !ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
}
main().catch((e) => { console.error('CRASH', e); process.exit(1) })
