"""Writer: turns reports and click trails into a ticket a developer can act on.

Steps to reproduce come from what the tester actually did (the trail), not from memory.
Expected comes from the test script; actual comes from the Detective's facts. Card numbers
are never in the trail: the panel masks sensitive fields before anything is sent.
"""

from app import db, script
from app.agents import llm

SEVERITIES = ["low", "medium", "high", "critical"]


def severity(step_id: int | None, facts: list[dict], report_count: int) -> str:
    """Heavy lifts first: a broken Submit outranks a slow list."""
    step = script.step(step_id)
    score = step["weight"] if step else 2
    if any(f["type"] in ("error", "dead_click", "rage", "double_submit") for f in facts):
        score += 1
    if report_count >= 3:
        score += 1
    if score >= 5:
        return "critical"
    if score == 4:
        return "high"
    if score == 3:
        return "medium"
    return "low"


def reproduce_steps(trail: list[dict]) -> list[str]:
    steps: list[list] = []   # [line, times in a row]
    for event in trail:
        if event.get("kind") != "action":
            continue
        detail = event.get("detail") or {}
        label = detail.get("label") or event.get("target") or "something"
        if event.get("type") == "click":
            line = f"Click '{label}'"
        elif event.get("type") == "input":
            value = detail.get("value")
            line = f"Type '{value}' into {label}" if value and not detail.get("masked") else f"Fill in {label}"
        else:
            line = label
        if steps and steps[-1][0] == line:
            steps[-1][1] += 1
        else:
            steps.append([line, 1])
    return [line if times == 1 else f"{line} x{times}" for line, times in steps][-12:]


def fallback_title(step_id: int | None, facts: list[dict], text: str) -> str:
    step = script.step(step_id)
    where = step["name"] if step else "App"
    priority = {"error": 0, "double_submit": 1, "dead_click": 2, "slow": 3, "rage": 4}
    if facts:
        fact = sorted(facts, key=lambda f: priority.get(f["type"], 9))[0]
        if fact["type"] == "slow":
            return f"{where} is too slow ({fact['detail']['latency_ms'] / 1000:.1f} s)"
        if fact["type"] == "error":
            return f"{where}: error \"{fact['detail'].get('message')}\""
        if fact["type"] == "dead_click":
            return f"{where}: button does nothing when clicked"
        if fact["type"] == "double_submit":
            return f"{where}: pressing it twice sends a duplicate report"
        return f"{where}: testers rage-clicking"
    short = (text or "No comment").strip().rstrip(".")
    return f"{where}: {short[:70]}{'...' if len(short) > 70 else ''}"


def draft(issue_step: int | None, reports: list[dict], use_ai: bool = True, kind: str = "bug") -> dict:
    """The full ticket for an issue, built from all of its stacked reports."""
    main = next((r for r in reports if r["facts"]), reports[0])
    facts = [f for r in reports for f in (r["facts"] or [])]
    unique_facts = list({f["summary"]: f for f in facts}.values())
    step = script.step(issue_step)
    texts = [r["text"] for r in reports if r["text"]]
    title = fallback_title(issue_step, unique_facts, texts[0] if texts else "")
    summary = None
    if use_ai and llm.enabled() and (texts or unique_facts):
        # An idea is a suggestion, not a fault, so it gets its own brief: never describe it as a bug.
        brief = ("You are the Writer in a user acceptance testing tool. A tester suggested an improvement. "
                 "Write a short title (max 8 words) that keeps the tester's meaning, and a one-sentence "
                 "summary. Do not describe it as a bug and do not add anything the tester did not say."
                 if kind == "idea" else
                 "You are the Writer in a user acceptance testing tool. Write a clear bug ticket title "
                 "(max 10 words) and a one-sentence summary for a developer. Use only the evidence given. "
                 "Do not invent causes.")
        try:
            result = llm.ask(
                brief,
                f"Test step: {step['name'] if step else 'unknown'} (expected: {step['expected'] if step else '?'})\n"
                f"Tester comments: {texts[:5]}\nMeasured facts: {[f['summary'] for f in unique_facts]}",
                "ticket", llm.obj({"title": {"type": "string"}, "summary": {"type": "string"}}), max_tokens=250)
            if 5 <= len(result.get("title", "")) <= 90:
                title = result["title"].strip()
            summary = (result.get("summary") or "").strip() or None
        except llm.LLMUnavailable:
            pass
    actual = "; ".join(f["summary"] for f in unique_facts) or (texts[0] if texts else "See tester comments")
    browsers = sorted({(r.get("build") or {}).get("browser", "unknown") for r in reports})
    return {
        "title": title,
        "summary": summary or (f"{len(reports)} tester{'s' if len(reports) != 1 else ''} hit this on the "
                               f"{step['name'] if step else 'unknown'} step."),
        "summary_by_ai": bool(summary),
        "steps_to_reproduce": reproduce_steps(main["trail"] or []),
        "expected": step["expected"] if step else "As described in the test script",
        "actual": actual,
        "evidence": [f["summary"] for f in unique_facts],
        "comments": [{"tester": r["tester"], "text": r["text"], "original": r["original_text"],
                      "language": r["language"]} for r in reports if r["text"] or r["original_text"]],
        "reports": len(reports),
        "testers": sorted({r["tester"] for r in reports}),
        "environment": ", ".join(browsers),
        "severity": severity(issue_step, unique_facts, len(reports)),
    }


def refresh(issue_id: int) -> dict:
    issue = db.get("issues", issue_id)
    reports = db.query("SELECT * FROM reports WHERE issue_id = ? ORDER BY id", (issue_id,))
    if not reports:
        return issue
    previous = issue.get("ticket") or {}
    ticket = draft(issue["step_id"], reports, use_ai=not previous, kind=issue["category"])
    if previous.get("title"):
        # Stacking adds evidence; the title (and an AI-written summary) the manager saw stay stable.
        ticket["title"] = previous["title"]
        if previous.get("summary_by_ai"):
            ticket["summary"], ticket["summary_by_ai"] = previous["summary"], True
    db.update("issues", issue_id, {"ticket": ticket, "severity": ticket["severity"], "title": ticket["title"]})
    return db.get("issues", issue_id)
