# KUAT ♞ UAT, untangled

**Feedback, untangled.** KUAT makes user acceptance testing (UAT) feedback easy to give and easy to act on. Testers report problems in their own words, a team of AI agents sorts and investigates them, a human approves every bug one at a time, and developers get tickets that come with proof.

Built for the Pfizer AI Studio hackathon "UAT, Untangled" (University of Brighton, November 2026).

## The idea in one picture

Think of a sandwich cookie with three layers:

| Layer | Who | What KUAT does for them |
|---|---|---|
| Top biscuit | **Tester** | Press the KUAT button on the test site, pick *Report a problem* or *Share an idea*, write anything in any language. KUAT attaches their clicks automatically, and a tracker shows where the report is now: sent, checked, decided, fixed. |
| Cream | **AI agent team** | Translate, investigate the click trail, spot duplicates, write the ticket, suggest a fix. Every suggestion shows its confidence, its reasons and the evidence. |
| Bottom biscuit | **Manager and developer** | The manager approves each bug, one at a time, or overrules the AI in one click. The developer gets steps to reproduce, a Replay of the tester's session, a suggested fix and a Ghost tester that proves the fix works. |

## What makes it different

- **The click trail turns "it didn't work" into a real bug report.** The Detective compares what the tester did with what the test script expects, so it can find the problem even when the comment is vague. It only asks the tester a question when the trail shows nothing wrong.
- **Rage-click detector.** If a tester hits the same button 4 times in 2 seconds, KUAT files a silent report straight away. It catches bugs that nobody bothers to report.
- **Stacking, not binning.** Duplicates are stacked onto the original issue like plates on a bar. More reports mean more weight and higher priority, and each one adds proof. The tester is told: "Same problem as 2 other reports. Yours adds weight."
- **Honest confidence.** The Spotter's score combines matching words, the same measured fault in the trail and the same test step. If the reports are on different steps, confidence is capped and a warning is shown. Low confidence is flagged "AI unsure: please check".
- **Replay and Ghost tester.** Developers watch the tester's exact clicks replayed on the build they used. After a fix, the Ghost tester replays every stacked trail on the new build and checks that *this ticket's* fault is gone; any other fault it sees is listed separately, so one bug never blocks another's fix. A ticket can only be marked fixed when every trail passes.
- **Any language in, English ticket out.** The original words are always kept next to the translation, and the Translator is told the app's own words, so "رقم التشغيلة" becomes "batch number", not "operation number".
- **KUAT's briefing.** One click and KUAT explains the whole test cycle to the manager in plain English: the riskiest step, what got fixed and what to do next. Every number comes from the database; the AI only words it, and the card says whether the AI or the rules wrote it.
- **Testers feel heard.** Every report shows what happened to it, even when it never becomes a ticket: stacked, saved as an idea, linked to a known ticket, a kind follow-up question, or "Fixed! Your report helped fix UAT-101".
- **Launch readiness meter and heatmap.** Readiness counts script coverage and open bugs by severity. Launch needs 85+ **and** no open critical bug. Each heatmap tile names its level in words (Hot, Warm, Mild, Clear) and counts its open problems, so it never relies on colour alone (colour-blind friendly).

## Human control is enforced in the backend, not just the UI

- The AI only ever **suggests**. A bug becomes a ticket only through `review.decide()`, which takes one issue ID.
- There is **no bulk endpoint**. A test checks that no "approve all" route exists.
- An issue can be decided once. A second decision returns HTTP 409.
- The manager can overrule the AI in **one click**: every other choice is a button next to the suggestion.
- Every decision is logged with what the AI suggested, so overrules are counted ("AI agreed with you 9 of 11 times").
- `mark_fixed` refuses until the Ghost tester has passed every stacked trail.

## The agent team

| Agent | Job | Without an AI key |
|---|---|---|
| KUAT | Runs the team in order for every report | Same |
| Translator | Any language to English | Keeps the original and says it was not translated |
| Detective | Finds measured faults in the click trail: slow responses, errors, dead buttons, rage clicks, double submits | Same (rules) |
| Spotter | Stacks duplicates and links known tickets, with evidence | Evidence score only |
| Writer | Drafts the ticket from the trail and the script | Template titles |
| Mechanic | Reads the step's real code and suggests a fix | Rule-based hints |
| Ghost tester | Replays trails on the current build (runs in the browser) | Same |
| KUAT's briefing | Explains the whole cycle in plain English, from the live numbers | Built from the same numbers by rules |

The AI is Groq (`openai/gpt-oss-120b`) with strict JSON schemas. If there is no key, or the free plan's limit is reached, each agent falls back to its rules and says so in the live agent feed. Nothing pretends the AI ran. The public demo accepts at most 30 reports a minute from one device, so nobody can drain the free AI quota.

## The demo: a side-effect report form

KUAT is shown on **Northwind Pharma SafeReport**, a made-up internal tool where a nurse reports a side effect a patient had after taking a medicine. It is in the style of the internal apps a pharma company tests before launch. The test script has 5 steps, and **4 bugs are planted on purpose**, controlled by build flags:

1. Other medicines: *Add medicine* does nothing (dead button)
2. Batch number: lower-case batch numbers such as `kp4821` are rejected
3. Submit: sending the report takes 7.2 seconds
4. Submit: pressing it twice sends a duplicate safety report

"Deploying a fix" on the dashboard switches a flag off, which runs the corrected code in `frontend/src/demo/reportEngine.js`.

- `#/test` is the test site, with the KUAT button in the corner for testers.
- `#/` is the KUAT dashboard: a cookie you twist open (or press Enter on it). Testers on the top biscuit, the agent team in the cream, the manager and developer on the bottom biscuit. Click any tester's card to follow their report to its ticket. Drag the closed cookie down to eat it.
- The cookie only animates movement and opacity, sampled from smooth curves, so it runs at a steady 60 frames a second, and it respects the system's "reduce motion" setting.
- *Load demo testers* runs nine testers' reports (including one in Arabic and one silent rage-click report) through the real agent pipeline.
- Approved tickets get Jira-style keys (`UAT-101`), and *Copy for Jira* copies a ticket in Jira's text format. `UAT-7` stands in for a ticket already in the team's Jira backlog.

## Run it locally

You need Python 3.12+ with [uv](https://docs.astral.sh/uv/), and Node 20+.

```bash
cd frontend && npm install && npm run build
cd ../backend && uv sync
uv run uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Open http://127.0.0.1:8001. To turn the AI agents on, put your free Groq key in `backend/.env`:

```
KUAT_GROQ_API_KEY=your-key-here
```

For frontend development with hot reload, run the backend as above, then `cd frontend && npm run dev` and open http://127.0.0.1:5174.

## Deploy (free)

`render.yaml` deploys KUAT to Render's free plan as one web service: the build compiles the React app and FastAPI serves it next to the API. In Render choose **New > Blueprint**, pick this repository and paste your Groq key when asked for `KUAT_GROQ_API_KEY`. The free service sleeps after 15 minutes idle, and its demo database starts empty after each sleep, so press *Load demo testers* first.

## Tests

```bash
cd backend && uv run pytest      # agents, pipeline, one-at-a-time review rules, readiness, briefing
cd frontend && npm test          # planted bugs and fixes, Ghost tester, rage-click recorder, Jira format
```

## Stack

React 19 + Vite, FastAPI, SQLite, Groq. No paid services.

## Made by

Faris Salkawi, BSc (Hons) Computer Science with Artificial Intelligence, University of Brighton.
