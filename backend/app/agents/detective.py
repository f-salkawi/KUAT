"""Detective: reads the click trail and finds what actually went wrong.

The facts here are measured, not guessed: a response that took longer than the test script
allows, an error the app showed, a button that did nothing, a burst of rage clicks, or Submit
pressed again while the report was still sending. Facts are what make a vague comment ("didn't
work") useful, so the Detective only asks the tester a question when it finds none.

Trail events come from the KUAT panel:
  {"t": ms, "kind": "action", "type": "click", "target": "submit", "step": 4, "detail": {"label": "Submit report"}}
  {"t": ms, "kind": "effect", "type": "response" | "error" | "noop", "target": ..., "step": ..., "detail": {...}}
"""

from app import script
from app.agents import llm
from app.agents.text import is_vague

RAGE_CLICKS = 4          # this many clicks on one target...
RAGE_WINDOW_MS = 2000    # ...inside this window is a rage-click burst
SLOW_FACTOR = 1.25       # slower than expected_ms x this counts as slow
SUBMIT = ("submit", 4)   # the button whose second press sends a duplicate, and its step


def _label(event: dict) -> str:
    return (event.get("detail") or {}).get("label") or event.get("target") or "a button"


def find_facts(trail: list[dict]) -> list[dict]:
    facts: list[dict] = []
    clicks = [e for e in trail if e.get("kind") == "action" and e.get("type") == "click"]

    for event in trail:
        if event.get("kind") != "effect":
            continue
        detail = event.get("detail") or {}
        if event.get("type") == "response":
            step = script.step(event.get("step"))
            latency = detail.get("latency_ms") or 0
            if step and latency > step["expected_ms"] * SLOW_FACTOR:
                facts.append({"type": "slow", "step_id": step["id"], "target": event.get("target"),
                              "summary": f"{step['name']} took {latency / 1000:.1f} s "
                                         f"(the script expects under {step['expected_ms'] / 1000:.0f} s)",
                              "detail": {"latency_ms": latency, "expected_ms": step["expected_ms"]}})
        elif event.get("type") == "error":
            facts.append({"type": "error", "step_id": event.get("step"), "target": event.get("target"),
                          "summary": f"The app showed an error: \"{detail.get('message', 'unknown error')}\"",
                          "detail": {"message": detail.get("message")}})

    # Dead clicks: a click whose only effect was "nothing changed".
    dead: dict[str, dict] = {}
    for i, event in enumerate(trail):
        if event.get("kind") == "effect" and event.get("type") == "noop" and i > 0:
            target = event.get("target")
            entry = dead.setdefault(target, {"count": 0, "step_id": event.get("step"), "label": _label(event)})
            entry["count"] += 1
    for target, entry in dead.items():
        facts.append({"type": "dead_click", "step_id": entry["step_id"], "target": target,
                      "summary": f"'{entry['label']}' was clicked {entry['count']} time"
                                 f"{'s' if entry['count'] != 1 else ''} and nothing happened",
                      "detail": {"count": entry["count"]}})

    # Rage clicks: the biggest burst per target inside the window.
    by_target: dict[str, list[dict]] = {}
    for click in clicks:
        by_target.setdefault(click.get("target"), []).append(click)
    for target, items in by_target.items():
        best, start = 0, 0
        for end in range(len(items)):
            while items[end]["t"] - items[start]["t"] > RAGE_WINDOW_MS:
                start += 1
            best = max(best, end - start + 1)
        if best >= RAGE_CLICKS:
            facts.append({"type": "rage", "step_id": items[0].get("step"), "target": target,
                          "summary": f"{best} fast clicks on '{_label(items[0])}' within "
                                     f"{RAGE_WINDOW_MS / 1000:.0f} s (rage clicks)",
                          "detail": {"clicks": best}})

    # Double submit: Submit pressed again before the first send answered.
    target, step_id = SUBMIT
    presses = [c for c in clicks if c.get("target") == target]
    first_answer = next((e["t"] for e in trail if e.get("kind") == "effect" and e.get("target") == target
                         and e.get("type") in ("response", "error")), None)
    if len(presses) >= 2 and first_answer is not None:
        early = [c for c in presses[1:] if c["t"] <= first_answer]
        if early:
            facts.append({"type": "double_submit", "step_id": step_id, "target": target,
                          "summary": "Submit was pressed again while the first report was still sending",
                          "detail": {"presses": 1 + len(early)}})
    return facts


def signature(facts: list[dict]) -> set[tuple]:
    """What kind of fault, where: used by the Spotter to stack reports with the same proof."""
    return {(f["type"], f.get("target")) for f in facts}


def follow_up_question(text: str, step_id: int | None) -> tuple[str, bool]:
    """One kind, specific question. Returns (question, written_by_ai)."""
    step = script.step(step_id)
    where = f"the {step['name']} step" if step else "this step"
    fallback = (f"Thanks for flagging this! On {where}, what did you expect to happen, "
                f"and what happened instead?")
    try:
        result = llm.ask(
            "You help testers in user acceptance testing. A tester left a vague comment and the click "
            "trail showed nothing wrong. Write ONE short, warm, specific follow-up question (max 25 words) "
            "that helps a developer reproduce the problem. Thank them first. Never blame the tester.",
            f"Test step: {step['name'] + ': ' + step['instruction'] if step else 'unknown'}\n"
            f"Expected: {step['expected'] if step else 'unknown'}\nTester comment: {text!r}",
            "follow_up", llm.obj({"question": {"type": "string"}}), max_tokens=200)
        question = (result.get("question") or "").strip()
        return (question, True) if 8 <= len(question) <= 240 else (fallback, False)
    except llm.LLMUnavailable:
        return fallback, False


def investigate(text: str, step_id: int | None, trail: list[dict]) -> dict:
    facts = find_facts(trail)
    vague = is_vague(text)
    if facts:
        verdict = "bug"
    elif vague:
        verdict = "needs_info"
    else:
        verdict = "text_only"
    return {"facts": facts, "vague": vague, "verdict": verdict}
