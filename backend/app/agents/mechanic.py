"""Mechanic: points the developer at the likely cause and suggests a fix.

It reads the real code for the failing step (between KUAT:step-N markers in the demo app),
so the suggestion is about actual lines, not a generic tip. It only ever suggests: a
developer makes the change, and the Ghost tester checks it.
"""

import re

from app import script
from app.agents import llm
from app.config import REPO_DIR

RULE_HINTS = {
    "double_submit": ("Submit can be pressed again while the report is still sending, so it is sent twice.",
                      "Ignore Submit (and disable the button) while send.status is 'sending'."),
    "slow": ("Sending the report is much slower than the script allows.",
             "Check the send call's latency or timeout; it should answer in under 2 seconds."),
    "dead_click": ("The click handler for this button does not change any state.",
                   "Make the handler add the medicine: read the name, then update the list."),
    "error": ("The step rejects input that the script says is valid.",
              "Normalise the input (for example trim and upper-case a batch number) before validating it."),
    "rage": ("Testers are clicking repeatedly because nothing visibly happens.",
             "Give immediate feedback on click and fix the underlying handler."),
}


def code_for_step(step_id: int | None) -> tuple[str | None, str | None]:
    where = script.CODE_MAP.get(step_id)
    if not where:
        return None, None
    path = REPO_DIR / where["file"]
    if not path.exists():
        return where["file"], None
    source = path.read_text()
    match = re.search(rf"// {where['marker']}\n(.*?)// end {where['marker']}", source, re.S)
    return where["file"], match.group(1).strip() if match else None


def suggest(step_id: int | None, facts: list[dict]) -> dict | None:
    if not facts:
        return None
    priority = {"error": 0, "double_submit": 1, "dead_click": 2, "slow": 3, "rage": 4}
    main = sorted(facts, key=lambda f: priority.get(f["type"], 9))[0]
    cause, change = RULE_HINTS.get(main["type"], ("Unknown cause.", "Investigate the step's handler."))
    file, code = code_for_step(step_id)
    suggestion = {"likely_cause": cause, "suggested_change": change, "file": file,
                  "code": code, "by": "rules", "confidence": 0.5}
    if code and llm.enabled():
        try:
            result = llm.ask(
                "You are the Mechanic in a user acceptance testing tool. Given measured facts from a tester's "
                "click trail and the code for that step, explain the most likely cause in one sentence and "
                "suggest a minimal code change (a few lines). Only use what the code shows. confidence 0 to 1.",
                f"Facts: {[f['summary'] for f in facts]}\n\nCode ({file}):\n{code}",
                "fix", llm.obj({"likely_cause": {"type": "string"}, "suggested_change": {"type": "string"},
                                "confidence": {"type": "number"}}), max_tokens=500)
            suggestion.update(likely_cause=result["likely_cause"].strip(),
                              suggested_change=result["suggested_change"].strip(),
                              confidence=max(0.0, min(1.0, float(result["confidence"]))), by="ai")
        except (llm.LLMUnavailable, KeyError, TypeError, ValueError, AttributeError):
            pass
    return suggestion
