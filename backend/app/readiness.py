"""The developer dashboard numbers: readiness meter, heatmap, progress and AI accuracy.

Readiness = how much of the script has been tested x how little is still broken.
  coverage: share of the 5 steps a tester has completed at least once,
  penalty: each open or unreviewed bug costs points by severity.
Launch needs a score of LAUNCH_AT or more AND no open critical bug, because a high average
must never hide one broken Submit button.
"""

from app import db, script

LAUNCH_AT = 85
PENALTY = {"critical": 30, "high": 15, "medium": 8, "low": 3}
UNREVIEWED_PENALTY = 6
HEAT_WEIGHT = {"critical": 8, "high": 5, "medium": 3, "low": 1}


def summary() -> dict:
    issues = db.query("SELECT * FROM issues")
    passes = db.query("SELECT step_id, COUNT(*) AS n FROM passes GROUP BY step_id")
    passed = {p["step_id"]: p["n"] for p in passes}
    open_bugs = [i for i in issues if i["status"] == "open"]
    waiting = [i for i in issues if i["status"] == "needs_review"]
    fixed = [i for i in issues if i["status"] == "fixed"]
    ideas = [i for i in issues if i["status"] == "idea"]

    coverage = len([s for s in script.STEPS if passed.get(s["id"])]) / len(script.STEPS)
    penalty = sum(PENALTY.get(i["severity"] or "low", 3) for i in open_bugs) + UNREVIEWED_PENALTY * len(waiting)
    score = round(max(0, 100 - penalty) * coverage)
    critical_open = [i for i in open_bugs if i["severity"] == "critical"]
    blockers = []
    if coverage < 1:
        blockers.append(f"{len(script.STEPS) - round(coverage * len(script.STEPS))} step(s) not tested yet")
    if critical_open:
        blockers.append(f"{len(critical_open)} critical bug(s) open")
    if waiting:
        blockers.append(f"{len(waiting)} report(s) waiting for the manager")

    heat = []
    for step in script.STEPS:
        mine = [i for i in issues if i["step_id"] == step["id"] and i["category"] == "bug"]
        open_here = [i for i in mine if i["status"] in ("open", "needs_review")]
        value = sum(HEAT_WEIGHT.get(i["severity"] or "low", 1) for i in open_here)
        level = "red" if value >= 8 else "orange" if value >= 4 else "yellow" if value > 0 else "green"
        heat.append({"step_id": step["id"], "name": step["name"], "open": len(open_here),
                     "fixed": len([i for i in mine if i["status"] == "fixed"]),
                     "passes": passed.get(step["id"], 0), "heat": value, "level": level})

    # Progress: cumulative bugs found (approved) vs fixed, at each event in time.
    events = sorted([(i["approved_at"], "found") for i in issues if i["approved_at"]]
                    + [(i["fixed_at"], "fixed") for i in issues if i["fixed_at"]])
    found_n = fixed_n = 0
    progress = []
    for at, kind in events:
        found_n += kind == "found"
        fixed_n += kind == "fixed"
        progress.append({"at": at, "found": found_n, "fixed": fixed_n})

    decisions = db.query("SELECT * FROM decisions WHERE suggested_action IS NOT NULL")
    agreed = len([d for d in decisions if not d["overruled"]])

    return {
        "readiness": {"score": score, "launch_at": LAUNCH_AT, "coverage": round(coverage, 2),
                      "can_launch": score >= LAUNCH_AT and not critical_open and not waiting,
                      "blockers": blockers},
        "counts": {"to_fix": len(open_bugs), "waiting": len(waiting), "fixed": len(fixed), "ideas": len(ideas)},
        "heatmap": heat,
        "progress": progress,
        "ai_accuracy": {"agreed": agreed, "total": len(decisions)},
    }
