"""KUAT API. Thin routes: the rules live in agents/, review.py and readiness.py."""

import time
from collections import defaultdict, deque
from typing import Literal

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app import briefing, db, demo, readiness, review, script
from app.agents import feed, kuat, llm
from app.config import REPO_DIR

app = FastAPI(title="KUAT", version="0.1.0")
db.init()

DEFAULT_BUILD = script.DEFAULT_BUILD


class ReportIn(BaseModel):
    kind: Literal["problem", "idea", "rage"]
    tester: str = Field(min_length=1, max_length=40)
    step_id: int | None = Field(default=None, ge=1, le=len(script.STEPS))
    text: str = Field(default="", max_length=2000)
    trail: list[dict] = Field(default_factory=list, max_length=400)
    build: dict = Field(default_factory=dict)


class AnswerIn(BaseModel):
    answer: str = Field(min_length=1, max_length=1000)


class DecisionIn(BaseModel):
    action: Literal["approve", "merge", "to_idea", "link_known", "dismiss"]
    merge_into: int | None = None
    note: str | None = Field(default=None, max_length=500)


class PassIn(BaseModel):
    step_id: int = Field(ge=1, le=len(script.STEPS))
    tester: str = Field(min_length=1, max_length=40)


class FixedIn(BaseModel):
    ghost: dict


# The live demo is public, so one device cannot flood the agents (or the free AI quota).
REPORTS_PER_MINUTE = 30
_recent: dict[str, deque] = defaultdict(deque)


def _rate_limit(request: Request) -> None:
    now, ip = time.monotonic(), request.client.host if request.client else "unknown"
    window = _recent[ip]
    while window and now - window[0] > 60:
        window.popleft()
    if len(window) >= REPORTS_PER_MINUTE:
        raise HTTPException(429, "That's a lot of reports in one minute. Take a breath and try again shortly.")
    window.append(now)


def _review_call(fn, *args):
    try:
        return fn(*args)
    except review.ReviewError as exc:
        raise HTTPException(exc.status, str(exc)) from exc


def _with_message(report: dict) -> dict:
    report["message"] = review.tester_message(report)
    issue = db.get("issues", report["issue_id"]) if report["issue_id"] else None
    report["issue"] = {"id": issue["id"], "title": issue["title"], "status": issue["status"],
                       "ticket_key": issue["ticket_key"]} if issue else None
    return report


@app.get("/api/health")
def health():
    return {"ok": True, "mode": "ai" if llm.enabled() else "rules", "model": llm.model() if llm.enabled() else None}


@app.get("/api/script")
def get_script():
    return {"steps": script.STEPS, "known": script.KNOWN_TICKETS}


@app.get("/api/build")
def get_build():
    return db.get_setting("build", DEFAULT_BUILD)


@app.put("/api/build")
def put_build(flags: dict[str, bool]):
    build = {**DEFAULT_BUILD, **{k: v for k, v in flags.items() if k in DEFAULT_BUILD}}
    db.set_setting("build", build)
    patched = [k for k, v in build.items() if not v]
    feed.say("Developer", "Deployed a new demo build" + (f" with fixes for: {', '.join(patched)}" if patched else ""))
    return build


@app.post("/api/reports", status_code=201)
def create_report(body: ReportIn, tasks: BackgroundTasks, request: Request):
    _rate_limit(request)
    if body.kind != "rage" and not body.text.strip():
        raise HTTPException(422, "Please write a few words first.")
    report_id = db.insert("reports", {
        "kind": body.kind, "tester": body.tester.strip(), "step_id": body.step_id,
        "text": body.text.strip(), "original_text": body.text.strip(), "trail": body.trail,
        "build": body.build, "facts": [], "status": "checking", "created_at": db.now()})
    tasks.add_task(kuat.process, report_id)
    return {"id": report_id}


@app.get("/api/reports")
def list_reports(tester: str | None = None):
    rows = (db.query("SELECT * FROM reports WHERE tester = ? ORDER BY id DESC LIMIT 20", (tester,)) if tester
            else db.query("SELECT * FROM reports ORDER BY id DESC LIMIT 50"))
    return [_with_message(r) for r in rows]


@app.get("/api/reports/{report_id}")
def get_report(report_id: int):
    report = db.get("reports", report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    return _with_message(report)


@app.post("/api/reports/{report_id}/answer")
def answer_report(report_id: int, body: AnswerIn, tasks: BackgroundTasks):
    report = db.get("reports", report_id)
    if not report or report["status"] != "needs_info":
        raise HTTPException(409, "This report is not waiting for an answer")
    db.update("reports", report_id, {"answer": body.answer.strip(), "status": "checking"})
    feed.say("KUAT", f"{report['tester']} answered the follow-up question", report_id)
    tasks.add_task(kuat.process, report_id)
    return {"id": report_id}


@app.post("/api/reports/{report_id}/unstack")
def unstack_report(report_id: int):
    return _review_call(review.unstack, report_id)


@app.post("/api/passes", status_code=201)
def record_pass(body: PassIn):
    db.insert("passes", {"step_id": body.step_id, "tester": body.tester, "at": db.now()})
    return {"ok": True}


@app.get("/api/queue")
def queue():
    return review.next_item()


@app.post("/api/issues/{issue_id}/decision")
def decide(issue_id: int, body: DecisionIn):
    return _review_call(review.decide, issue_id, body.action, body.merge_into, body.note)


@app.get("/api/issues")
def list_issues(board: Literal["to_fix", "ideas", "fixed", "all"] = "all"):
    where = {"to_fix": "status = 'open'", "ideas": "status = 'idea'", "fixed": "status = 'fixed'",
             "all": "status NOT IN ('merged')"}[board]
    rows = db.query(f"SELECT * FROM issues WHERE {where} ORDER BY id DESC")
    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    if board == "to_fix":
        rows.sort(key=lambda i: (order.get(i["severity"], 4), i["id"]))
    for row in rows:
        row["report_count"] = db.query("SELECT COUNT(*) AS n FROM reports WHERE issue_id = ?", (row["id"],))[0]["n"]
    return rows


@app.get("/api/issues/{issue_id}")
def get_issue(issue_id: int):
    issue = review.detail(issue_id)
    if not issue:
        raise HTTPException(404, "Issue not found")
    return issue


@app.post("/api/issues/{issue_id}/fixed")
def mark_fixed(issue_id: int, body: FixedIn):
    return _review_call(review.mark_fixed, issue_id, body.ghost)


@app.post("/api/issues/{issue_id}/ghost")
def save_ghost(issue_id: int, body: FixedIn):
    if not db.get("issues", issue_id):
        raise HTTPException(404, "Issue not found")
    results = body.ghost.get("results") or []
    passed = len([r for r in results if r.get("passed")])
    db.update("issues", issue_id, {"ghost": body.ghost})
    review.record_ghost_passes(results)
    feed.say("Ghost", f"Replayed {len(results)} trail{'s' if len(results) != 1 else ''} on the current build: "
             f"{passed} passed, {len(results) - passed} still failing", issue_id=issue_id)
    return {"ok": True}


@app.get("/api/dashboard")
def dashboard():
    return readiness.summary()


@app.get("/api/briefing")
def get_briefing():
    return briefing.write()


@app.get("/api/feed")
def get_feed(after: int = 0):
    return feed.since(after)


@app.post("/api/demo/reset")
def demo_reset():
    db.reset()
    feed.say("KUAT", "Fresh test cycle started")
    return {"ok": True}


@app.post("/api/demo/scenario")
def demo_scenario(tasks: BackgroundTasks):
    ids = demo.load_scenario()
    for report_id in ids:
        tasks.add_task(kuat.process, report_id)
    return {"reports": ids}


# Serve the built frontend (npm run build) from the same server in production.
DIST = REPO_DIR / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        file = DIST / path
        if path and file.is_file() and DIST in file.resolve().parents:
            return FileResponse(file)
        # The page itself is never cached, so a new deploy shows up on the next visit.
        return FileResponse(DIST / "index.html", headers={"Cache-Control": "no-cache"})
