"""The cycle briefing: KUAT explains the whole test cycle to the UAT manager in plain English.

Every number comes from the database (readiness.summary and the issues table). The model only
words them; it is told to use no other numbers, and without a key the same briefing is built
from rules, so the manager always gets an answer and always knows which one they got.
"""

from app import db, readiness, script
from app.agents import llm


def _facts() -> dict:
    summary = readiness.summary()
    issues = db.query("SELECT * FROM issues WHERE status IN ('open', 'needs_review') AND category = 'bug'")
    for issue in issues:
        issue["reports"] = db.query("SELECT COUNT(*) AS n FROM reports WHERE issue_id = ?", (issue["id"],))[0]["n"]
    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    issues.sort(key=lambda i: (order.get(i["severity"], 4), -i["reports"]))
    testers = db.query("SELECT COUNT(DISTINCT tester) AS n FROM reports")[0]["n"]
    total = db.query("SELECT COUNT(*) AS n FROM reports")[0]["n"]
    hottest = max(summary["heatmap"], key=lambda h: h["heat"])
    return {"summary": summary, "issues": issues, "testers": testers, "reports": total, "hottest": hottest}


def _rules(f: dict) -> dict:
    s, r = f["summary"], f["summary"]["readiness"]
    if not f["reports"]:
        return {"headline": "No feedback yet this cycle", "points": ["Nobody has sent a report so far."],
                "next_step": "Ask testers to work through the script and use the knight button."}
    points = [f"{f['reports']} report{'s' if f['reports'] != 1 else ''} from {f['testers']} tester{'s' if f['testers'] != 1 else ''}, "
              f"grouped into {s['counts']['to_fix'] + s['counts']['waiting']} open problem(s) and {s['counts']['ideas']} idea(s)."]
    if f["hottest"]["heat"]:
        points.append(f"The riskiest step is {f['hottest']['step_id']}. {f['hottest']['name']}, with {f['hottest']['open']} open problem(s).")
    if s["counts"]["fixed"]:
        points.append(f"{s['counts']['fixed']} bug(s) fixed and proven by the Ghost tester.")
    top = f["issues"][0] if f["issues"] else None
    next_step = (f"Review \"{top['title']}\" first: {top['severity']} severity, {top['reports']} report(s)." if top and top["status"] == "needs_review"
                 else f"Fix \"{top['title']}\" next: {top['severity']} severity." if top
                 else "Retest the remaining steps to raise coverage.")
    headline = "Ready to launch" if r["can_launch"] else f"Not ready yet: readiness {r['score']} of 100"
    return {"headline": headline, "points": points, "next_step": next_step}


def write() -> dict:
    f = _facts()
    base = _rules(f)
    numbers = {
        "readiness": f["summary"]["readiness"],
        "problems": {"approved_to_fix": f["summary"]["counts"]["to_fix"], "waiting_for_your_decision": f["summary"]["counts"]["waiting"],
                     "fixed": f["summary"]["counts"]["fixed"]},
        "open_problems_by_severity": {sev: len([i for i in f["issues"] if i["severity"] == sev])
                                      for sev in ("critical", "high", "medium", "low")},
        "ideas": f["summary"]["counts"]["ideas"], "testers": f["testers"], "tester_reports": f["reports"],
        "steps": [{"step": f"{h['step_id']}. {h['name']}", "open_problems": h["open"], "fixed_problems": h["fixed"],
                   "times_completed_cleanly": h["passes"]} for h in f["summary"]["heatmap"]],
        "open_problems": [{"title": i["title"], "severity": i["severity"], "reports": i["reports"],
                           "status": "waiting for the manager" if i["status"] == "needs_review" else "approved, to fix"}
                          for i in f["issues"][:6]],
    }
    if not f["reports"] or not llm.enabled():
        return {**base, "by": "rules"}
    try:
        result = llm.ask(
            "You are KUAT, the lead of an AI team that sorts user acceptance testing feedback. Brief the UAT manager "
            "on the whole test cycle in plain, friendly English, speaking to them as 'you'. Use ONLY the numbers and "
            "titles given; never invent a number, and only describe severities using open_problems_by_severity. A 'report' is one tester's message; a 'problem' is a group of "
            "reports about the same fault; never mix the two words up. Use sentence case, not Title Case. "
            "headline: max 12 words. points: 2 to 4 short sentences (trends, the riskiest step, what got fixed). "
            "next_step: one concrete thing the manager can do in KUAT now, such as reviewing a named problem.",
            f"Test script steps: {[s['name'] for s in script.STEPS]}\nCycle data: {numbers}",
            "briefing", llm.obj({"headline": {"type": "string"}, "points": {"type": "array", "items": {"type": "string"}},
                                 "next_step": {"type": "string"}}), max_tokens=500)
        points = [p.strip() for p in result.get("points") or [] if isinstance(p, str) and p.strip()][:4]
        if not result.get("headline") or not points:
            raise llm.LLMUnavailable("empty briefing")
        return {"headline": result["headline"].strip(), "points": points,
                "next_step": (result.get("next_step") or base["next_step"]).strip(), "by": "ai"}
    except llm.LLMUnavailable:
        return {**base, "by": "rules"}
