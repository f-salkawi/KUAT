"""Spotter: is this report the same problem as one we already have?

The confidence is grounded in evidence a manager can check, not just the model's say-so:
  - shared concepts in the words ("froze" and "stuck" both mean freeze),
  - the same measured fault in the click trail (both show Submit taking 7 s),
  - the same test step.
When Groq is available it also judges the meaning, and the two scores are averaged. If the
reports are on different steps the confidence is capped and a warning is shown, so the
model can never be "sure" about a match the evidence does not support.
"""

from app import db, script
from app.agents import llm
from app.agents.detective import signature
from app.agents.text import concepts, jaccard, matching_words

STACK_AT = 0.75      # at or above: stack onto the existing issue automatically (manager can unstack)
SUGGEST_AT = 0.45    # between: new issue, and suggest a merge to the manager
KNOWN_AT = 0.5

ACTIVE = ("needs_review", "open", "idea")


def _issue_profile(issue: dict) -> dict:
    reports = db.query("SELECT text, facts FROM reports WHERE issue_id = ?", (issue["id"],))
    words: set[str] = set()
    sigs: set[tuple] = set()
    for r in reports:
        words |= concepts(r["text"])
        sigs |= signature(r["facts"] or [])
    return {"words": words, "sigs": sigs, "texts": [r["text"] for r in reports if r["text"]]}


def grounded_score(report: dict, issue: dict, profile: dict) -> dict:
    words = concepts(report["text"])
    sigs = signature(report["facts"] or [])
    text_sim = jaccard(words, profile["words"])
    fact_sim = jaccard(sigs, profile["sigs"])
    same_step = 1.0 if report.get("step_id") and report.get("step_id") == issue.get("step_id") else 0.0
    if sigs and profile["sigs"]:
        score = 0.30 * text_sim + 0.50 * fact_sim + 0.20 * same_step
    else:
        score = 0.75 * text_sim + 0.25 * same_step
    if fact_sim == 1.0 and same_step:
        score = max(score, 0.85)  # the exact same measured fault on the same step: strong proof
    elif fact_sim == 1.0 and text_sim > 0:
        score = max(score, 0.8)   # same fault and overlapping words
    elif sigs and profile["sigs"] and fact_sim == 0:
        score = min(score, 0.4)   # both trails show a fault, and they are different faults: different bugs
    shared = words & profile["words"]
    shared_facts = [f["summary"] for f in (report["facts"] or []) if (f["type"], f.get("target")) in profile["sigs"]]
    return {"score": round(score, 2), "text_sim": round(text_sim, 2), "fact_sim": round(fact_sim, 2),
            "same_step": bool(same_step), "shared_words": matching_words(report["text"], shared),
            "shared_facts": shared_facts}


def _llm_judgement(report: dict, candidates: list[dict]) -> dict | None:
    lines = []
    for c in candidates:
        texts = " | ".join(c["profile"]["texts"][:3]) or "(no comment, trail only)"
        lines.append(f"#{c['issue']['id']} (step {c['issue']['step_id']}): {c['issue']['title']} :: {texts}")
    try:
        result = llm.ask(
            "You are the Spotter in a user acceptance testing tool. Decide if the NEW report describes the "
            "same underlying problem as one of the existing issues. Testers use different words for the same "
            "thing. Answer match_id 0 if none match. confidence is 0 to 1. Give at most 2 short reasons that "
            "quote the evidence.",
            f"NEW report (step {report.get('step_id')}): {report['text'] or '(no comment)'}\n"
            f"Trail facts: {[f['summary'] for f in report['facts'] or []]}\n\nExisting issues:\n" + "\n".join(lines),
            "spotter", llm.obj({"match_id": {"type": "integer"}, "confidence": {"type": "number"},
                                "reasons": {"type": "array", "items": {"type": "string"}}}), max_tokens=300)
    except llm.LLMUnavailable:
        return None
    if not isinstance(result.get("confidence"), (int, float)):
        return None
    result["confidence"] = max(0.0, min(1.0, float(result["confidence"])))
    return result


def find_match(report: dict, category: str) -> dict:
    """Returns {"issue": issue|None, "confidence", "reasons", "evidence", "used_ai", "warning"}."""
    issues = db.query(f"SELECT * FROM issues WHERE category = ? AND status IN ({','.join('?' * len(ACTIVE))}) "
                      "ORDER BY id", (category, *ACTIVE))
    scored = []
    for issue in issues:
        profile = _issue_profile(issue)
        scored.append({"issue": issue, "profile": profile, "ground": grounded_score(report, issue, profile)})
    scored.sort(key=lambda c: c["ground"]["score"], reverse=True)
    candidates = [c for c in scored if c["ground"]["score"] >= 0.15][:3]
    if not candidates:
        return {"issue": None, "confidence": 0.0, "reasons": [], "evidence": {}, "used_ai": False, "warning": None}

    best = candidates[0]
    confidence = best["ground"]["score"]
    reasons: list[str] = []
    used_ai = False
    judgement = _llm_judgement(report, candidates) if llm.enabled() else None
    if judgement is not None:
        used_ai = True
        chosen = next((c for c in candidates if c["issue"]["id"] == judgement.get("match_id")), None)
        if chosen is None:
            confidence = round(confidence * 0.5, 2)   # the model saw no match: halve the evidence score
        else:
            best = chosen
            confidence = round(0.5 * best["ground"]["score"] + 0.5 * judgement["confidence"], 2)
            reasons += [r for r in judgement.get("reasons") or [] if isinstance(r, str)][:2]

    ground = best["ground"]
    if ground["same_step"]:
        step = script.step(best["issue"]["step_id"])
        reasons.append(f"Same test step ({step['name'] if step else best['issue']['step_id']})")
    if ground["shared_facts"]:
        reasons.append("Same fault in the click trail: " + ground["shared_facts"][0])
    if ground["shared_words"]:
        reasons.append("Similar words: " + ", ".join(f"'{w}'" for w in ground["shared_words"][:4]))

    warning = None
    if not ground["same_step"] and report.get("step_id") and best["issue"]["step_id"]:
        confidence = min(confidence, 0.6)
        warning = "Different test steps, so this match is uncertain"
    return {"issue": best["issue"], "confidence": round(confidence, 2), "reasons": reasons[:4],
            "evidence": {"words": ground["shared_words"], "facts": ground["shared_facts"]},
            "used_ai": used_ai, "warning": warning}


def find_known(report: dict) -> dict | None:
    words = concepts(report["text"])
    for ticket in script.KNOWN_TICKETS:
        keywords = concepts(" ".join(ticket["keywords"]))
        overlap = words & keywords
        score = len(overlap) / max(1, min(len(keywords), 3))
        if report.get("step_id") == ticket["step_id"]:
            score += 0.2
        if score >= KNOWN_AT and overlap:
            return {"ticket": ticket, "confidence": round(min(score, 0.95), 2),
                    "words": matching_words(report["text"], overlap)}
    return None
