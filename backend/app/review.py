"""Human decisions. This is the only place an issue becomes a ticket.

The rules are enforced here, not just hidden in the UI:
  - one issue per decision (there is no bulk function or endpoint),
  - an issue can be decided once, while it is `needs_review`,
  - every decision is logged with what the AI suggested, so overrules are counted,
  - a ticket is marked fixed only after the Ghost tester has replayed every stacked trail
    against the current build and all of them passed.
"""

from app import db
from app.agents import feed, writer

ACTIONS = {"approve", "merge", "to_idea", "link_known", "dismiss"}


class ReviewError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def next_item() -> dict:
    """The single oldest issue waiting for a human, plus how many are behind it."""
    waiting = db.query("SELECT * FROM issues WHERE status = 'needs_review' ORDER BY id")
    if not waiting:
        return {"item": None, "remaining": 0}
    return {"item": detail(waiting[0]["id"]), "remaining": len(waiting) - 1}


def detail(issue_id: int) -> dict | None:
    issue = db.get("issues", issue_id)
    if not issue:
        return None
    issue["reports"] = db.query("SELECT * FROM reports WHERE issue_id = ? ORDER BY id", (issue_id,))
    issue["decisions"] = db.query("SELECT * FROM decisions WHERE issue_id = ? ORDER BY id", (issue_id,))
    if issue.get("suggestion", {}) and issue["suggestion"].get("merge_into"):
        target = db.get("issues", issue["suggestion"]["merge_into"])
        issue["merge_target"] = {"id": target["id"], "title": target["title"], "ticket_key": target["ticket_key"],
                                 "status": target["status"]} if target else None
    return issue


def decide(issue_id: int, action: str, merge_into: int | None = None, note: str | None = None) -> dict:
    if action not in ACTIONS:
        raise ReviewError(f"Unknown action '{action}'")
    issue = db.get("issues", issue_id)
    if not issue:
        raise ReviewError("Issue not found", 404)
    if issue["status"] != "needs_review":
        raise ReviewError("This issue has already been decided", 409)

    suggested = (issue.get("suggestion") or {}).get("action")
    values: dict = {}
    if action == "approve":
        # Jira-style keys run in order (UAT-101, UAT-102...), however many reports were sorted on the way.
        key = f"UAT-{101 + db.query('SELECT COUNT(*) AS n FROM issues WHERE ticket_key IS NOT NULL')[0]['n']}"
        values = {"status": "open", "ticket_key": key, "approved_at": db.now()}
        message = f"Manager approved {key} \"{issue['title']}\""
    elif action == "merge":
        target_id = merge_into or (issue.get("suggestion") or {}).get("merge_into")
        target = db.get("issues", target_id) if target_id else None
        if not target or target["id"] == issue_id or target["status"] not in ("needs_review", "open"):
            raise ReviewError("Pick an open issue to merge into")
        with db.connect() as conn:
            conn.execute("UPDATE reports SET issue_id = ? WHERE issue_id = ?", (target["id"], issue_id))
        writer.refresh(target["id"])
        values = {"status": "merged", "merged_into": target["id"]}
        message = f"Manager merged #{issue_id} into {target['ticket_key'] or '#' + str(target['id'])}"
    elif action == "to_idea":
        values = {"status": "idea", "category": "idea"}
        message = f"Manager moved \"{issue['title']}\" to the ideas board"
    elif action == "link_known":
        key = (issue.get("suggestion") or {}).get("known_key")
        if not key:
            raise ReviewError("There is no known ticket to link")
        values = {"status": "known", "known_key": key}
        message = f"Manager linked this to known ticket {key}"
    else:
        values = {"status": "dismissed"}
        message = f"Manager dismissed \"{issue['title']}\" as not a problem"

    db.update("issues", issue_id, values)
    overruled = bool(suggested) and suggested != action
    db.insert("decisions", {"issue_id": issue_id, "action": action, "suggested_action": suggested,
                            "overruled": int(overruled), "note": note, "at": db.now()})
    feed.say("Manager", message + (" (overruled the AI)" if overruled else ""), issue_id=issue_id)
    return detail(issue_id)


def unstack(report_id: int) -> dict:
    """Split one report out of a stack into its own issue for review."""
    report = db.get("reports", report_id)
    if not report or not report["issue_id"]:
        raise ReviewError("Report not found", 404)
    old = db.get("issues", report["issue_id"])
    others = db.query("SELECT id FROM reports WHERE issue_id = ? AND id != ?", (old["id"], report_id))
    if not others:
        raise ReviewError("This report is the only one on its issue")
    suggestion = {"action": "approve", "confidence": 0.5, "low_confidence": True,
                  "reasons": [f"A manager split this out of #{old['id']}"], "evidence": {}}
    issue_id = db.insert("issues", {"category": old["category"], "step_id": report["step_id"], "title": "(drafting)",
                                    "status": "needs_review", "suggestion": suggestion, "created_at": db.now()})
    db.update("reports", report_id, {"issue_id": issue_id, "stack_confidence": None})
    writer.refresh(issue_id)
    writer.refresh(old["id"])
    feed.say("Manager", f"Unstacked a report from #{old['id']} into new issue #{issue_id}", report_id, issue_id)
    return detail(issue_id)


def mark_fixed(issue_id: int, ghost: dict) -> dict:
    issue = db.get("issues", issue_id)
    if not issue or issue["status"] != "open":
        raise ReviewError("Only an approved, open ticket can be marked fixed", 409)
    results = ghost.get("results") or []
    reports = db.query("SELECT id FROM reports WHERE issue_id = ?", (issue_id,))
    replayed = {r.get("report_id") for r in results}
    if not results or replayed != {r["id"] for r in reports} or not all(r.get("passed") for r in results):
        db.update("issues", issue_id, {"ghost": ghost})
        raise ReviewError("The Ghost tester has not passed every replayed trail yet", 409)
    db.update("issues", issue_id, {"status": "fixed", "fixed_at": db.now(), "ghost": ghost})
    record_ghost_passes(results)
    feed.say("Ghost", f"Replayed {len(results)} tester trail{'s' if len(results) != 1 else ''} on the new build: "
             f"all passed. {issue['ticket_key']} is fixed", issue_id=issue_id)
    return detail(issue_id)


def record_ghost_passes(results: list[dict]) -> None:
    """Steps the Ghost tester completed cleanly count as tested, like a human pass."""
    for result in results:
        if result.get("passed"):
            for step_id in result.get("steps_passed") or []:
                if isinstance(step_id, int) and 1 <= step_id <= 5:
                    db.insert("passes", {"step_id": step_id, "tester": "Ghost tester", "at": db.now()})


def tester_message(report: dict) -> dict:
    """What the tester sees about their own report, so they always feel heard.

    `stage` drives the tester's tracker, like a parcel: 1 sent, 2 checked by the agents,
    3 decided by a person, 4 fixed.
    """
    if report["status"] == "checking":
        return {"tone": "info", "stage": 1, "text": "KUAT is checking your report..."}
    if report["status"] == "needs_info":
        return {"tone": "question", "stage": 2, "text": report["follow_up"]}
    issue = db.get("issues", report["issue_id"]) if report["issue_id"] else None
    while issue and issue["status"] == "merged" and issue["merged_into"]:
        issue = db.get("issues", issue["merged_into"])
    if not issue:
        return {"tone": "info", "stage": 2, "text": "Saved. Thank you!"}
    others = db.query("SELECT COUNT(*) AS n FROM reports WHERE issue_id = ? AND id != ?", (issue["id"], report["id"]))[0]["n"]
    status = issue["status"]
    if status == "idea":
        return {"tone": "idea", "stage": 2, "text": "Great idea, it's saved on the ideas board."
                + (f" {others} other tester{'s' if others != 1 else ''} suggested it too." if others else "")}
    if status == "needs_review":
        if others:
            return {"tone": "info", "stage": 2, "text": f"Same problem as {others} other report{'s' if others != 1 else ''}. "
                                                        "Yours adds weight, and it's with the manager now."}
        return {"tone": "info", "stage": 2, "text": "Thanks! A manager is reviewing it now."}
    if status == "open":
        return {"tone": "ok", "stage": 3, "text": f"Confirmed as {issue['ticket_key']}. The developers are on it."}
    if status == "fixed":
        return {"tone": "win", "stage": 4, "text": f"Fixed! Your report helped fix {issue['ticket_key']}."}
    if status == "known":
        return {"tone": "ok", "stage": 3, "text": f"Already known as {issue['known_key']}. Your report was added to it."}
    return {"tone": "info", "stage": 3, "text": "The manager checked this and found no problem. Thanks for looking so closely!"}
