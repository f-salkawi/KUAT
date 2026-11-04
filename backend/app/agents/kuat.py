"""KUAT, the head coach: runs the agent team on every report, in order.

  Translator -> Detective -> Spotter -> Writer -> Mechanic

The agents only prepare things. A new bug becomes an issue in `needs_review`, and only a
human decision (app/review.py) turns it into a ticket. Stacking a report onto an issue the
evidence already matches is automatic, because it adds proof without creating anything new,
and the manager can unstack it in one click.
"""

import logging
import threading

from app import db, script
from app.agents import detective, feed, llm, mechanic, spotter, translator, writer
from app.agents.text import sounds_like_idea

logger = logging.getLogger(__name__)


def _facts_for_step(facts: list[dict], step_id: int | None) -> list[dict]:
    """Only faults on the step the tester reported, so an old fault elsewhere never leaks in."""
    return [f for f in facts if f.get("step_id") == step_id] if step_id else facts


def _stack(report_id: int, issue: dict, confidence: float, reasons: list[str]) -> None:
    db.update("reports", report_id, {"issue_id": issue["id"], "status": "filed", "stack_confidence": confidence})
    refreshed = writer.refresh(issue["id"])
    count = refreshed["ticket"]["reports"]
    label = refreshed.get("ticket_key") or f"#{issue['id']}"
    feed.say("Spotter", f"Stacked onto {label} \"{refreshed['title']}\" ({round(confidence * 100)}% match). "
             f"{count} reports now. {reasons[0] if reasons else ''}".strip(), report_id, issue["id"])


def _new_issue(report: dict, category: str, suggestion: dict) -> dict:
    status = "idea" if category == "idea" else "needs_review"
    issue_id = db.insert("issues", {"category": category, "step_id": report["step_id"],
                                    "title": "(drafting)", "status": status, "suggestion": suggestion,
                                    "created_at": db.now()})
    db.update("reports", report["id"], {"issue_id": issue_id, "status": "filed"})
    issue = writer.refresh(issue_id)
    if category == "bug":
        feed.say("Writer", f"Drafted ticket \"{issue['title']}\" ({issue['severity']} severity)", report["id"], issue_id)
        fix = mechanic.suggest(report["step_id"], report["facts"])
        if fix:
            db.update("issues", issue_id, {"fix": fix})
            feed.say("Mechanic", f"Likely cause: {fix['likely_cause']}"
                     + (" (rule-based hint)" if fix["by"] == "rules" else ""), report["id"], issue_id)
    return db.get("issues", issue_id)


_one_at_a_time = threading.Lock()   # reports are checked in order, so duplicates always see each other


def process(report_id: int) -> None:
    try:
        with _one_at_a_time:
            _process(report_id)
    except Exception:  # an agent bug must never lose the tester's report
        logger.exception("Pipeline failed for report %s", report_id)
        db.update("reports", report_id, {"status": "filed"})
        feed.say("KUAT", "Something went wrong while checking this report. It is saved for the manager.", report_id)


def _process(report_id: int) -> None:
    report = db.get("reports", report_id)
    step = script.step(report["step_id"])
    where = f"step {step['id']} ({step['name']})" if step else "an unknown step"
    kind_label = {"problem": "problem report", "idea": "idea", "rage": "silent rage-click report"}[report["kind"]]
    feed.say("KUAT", f"New {kind_label} from {report['tester']} on {where}"
             + ("" if llm.enabled() else " (rules mode: no AI key)"), report_id)

    # 1. Translator
    if report["original_text"]:
        result = translator.translate(report["original_text"])
        db.update("reports", report_id, {"text": result["text"], "language": result["language"]})
        if result["translated"]:
            feed.say("Translator", f"Translated from {result['language']}: \"{result['text']}\"", report_id)
        elif result["note"]:
            feed.say("Translator", result["note"], report_id)
        report = db.get("reports", report_id)

    # Ideas skip the Detective: nothing is broken.
    if report["kind"] == "idea":
        match = spotter.find_match(report, "idea")
        if match["issue"] and match["confidence"] >= spotter.STACK_AT:
            _stack(report_id, match["issue"], match["confidence"], match["reasons"])
        else:
            issue = _new_issue(report, "idea", {"action": "idea", "confidence": 1.0, "reasons": ["Tester chose 'Share an idea'"]})
            feed.say("KUAT", f"Saved to the ideas board: \"{issue['title']}\"", report_id, issue["id"])
        return

    # 2. Detective
    text = report["text"] if not report["answer"] else f"{report['text']} (follow-up: {report['answer']})"
    found = detective.investigate(text, report["step_id"], report["trail"] or [])
    facts = _facts_for_step(found["facts"], report["step_id"])
    db.update("reports", report_id, {"facts": facts})
    report = db.get("reports", report_id)
    if facts:
        feed.say("Detective", "Click trail shows: " + "; ".join(f["summary"] for f in facts[:2]), report_id)
    elif found["verdict"] == "needs_info" and not report["answer"] and report["kind"] == "problem":
        question, by_ai = detective.follow_up_question(text, report["step_id"])
        db.update("reports", report_id, {"status": "needs_info", "follow_up": question})
        feed.say("Detective", "Trail looks normal and the comment is vague, so I asked one kind question: "
                 f"\"{question}\"" + ("" if by_ai else " (template)"), report_id)
        return
    else:
        feed.say("Detective", "Nothing unusual in the click trail; going on the tester's description", report_id)

    # 3. Spotter: known tickets first, then open issues.
    known = spotter.find_known(report)
    if known:
        suggestion = {"action": "link_known", "known_key": known["ticket"]["key"], "confidence": known["confidence"],
                      "low_confidence": known["confidence"] < 0.6,
                      "reasons": [f"Matches known ticket {known['ticket']['key']}: {known['ticket']['title']}"],
                      "evidence": {"words": known["words"], "facts": []}}
        issue = _new_issue(report, "bug", suggestion)
        feed.say("Spotter", f"Looks like known ticket {known['ticket']['key']} ({round(known['confidence'] * 100)}%), "
                 "suggesting the manager links it", report_id, issue["id"])
        return

    match = spotter.find_match(report, "bug")
    if match["issue"] and match["confidence"] >= spotter.STACK_AT and not match["warning"]:
        _stack(report_id, match["issue"], match["confidence"], match["reasons"])
        return

    # 4. New issue: decide what to suggest to the manager.
    if match["issue"] and match["confidence"] >= spotter.SUGGEST_AT:
        suggestion = {"action": "merge", "merge_into": match["issue"]["id"], "confidence": match["confidence"],
                      "low_confidence": match["confidence"] < 0.6, "reasons": match["reasons"],
                      "evidence": match["evidence"], "warning": match["warning"]}
        note = f"Possible duplicate of #{match['issue']['id']} ({round(match['confidence'] * 100)}%), manager to decide"
    elif not facts and sounds_like_idea(report["text"]):
        suggestion = {"action": "to_idea", "confidence": 0.7, "low_confidence": False,
                      "reasons": ["Reads like a suggestion, and the click trail shows no fault"], "evidence": {}}
        note = "Sounds like an idea rather than a bug, suggesting the manager moves it"
    else:
        confidence = 0.9 if facts else 0.55
        reasons = ([f["summary"] for f in facts[:2]] if facts
                   else ["Based on the tester's description only (no fault in the click trail)"])
        suggestion = {"action": "approve", "confidence": confidence, "low_confidence": confidence < 0.6,
                      "reasons": reasons, "evidence": {"words": [], "facts": [f["summary"] for f in facts]}}
        note = "New problem, sent to the manager for approval"
    issue = _new_issue(report, "bug", suggestion)
    feed.say("KUAT", note, report_id, issue["id"])
