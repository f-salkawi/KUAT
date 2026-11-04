"""A scripted test cycle for demos: nine testers trying the side-effect report site.

These are clearly demo testers. Their click trails have the same shape the real panel
records, and every report goes through the same agent pipeline as a live one.
"""

from app import db, script

_BASE = [
    ("click", "medicine-cardiolex", 1, "Cardiolex 10 mg"),
    ("click", "to-details", 2, "Continue"),
    ("click", "reaction-dizziness", 3, "Dizziness"),
    ("input", "batch", 3, "Batch number", "KP4821"),
    ("click", "submit-details", 3, "Continue to review"),
]


def _trail(extra: list[tuple], base: list[tuple] = _BASE) -> list[dict]:
    events, t = [], 0
    for item in base + extra:
        t += item[-1] if isinstance(item[-1], int) and item[0] in ("response", "error", "noop") else 900
        if item[0] in ("click", "input"):
            detail = {"label": item[3]}
            if item[0] == "input":
                detail.update(value=item[4], masked=item[4] is None)
            events.append({"t": t, "kind": "action", "type": item[0], "target": item[1], "step": item[2],
                           "detail": detail})
        else:
            kind, target, step, detail, delay = item
            events.append({"t": t, "kind": "effect", "type": kind, "target": target, "step": step, "detail": detail})
    return events


def _rage(target: str, step: int, label: str, clicks: int) -> list[dict]:
    events, t = [], 2000
    for _ in range(clicks):
        t += 320
        events.append({"t": t, "kind": "action", "type": "click", "target": target, "step": step,
                       "detail": {"label": label}})
        events.append({"t": t + 5, "kind": "effect", "type": "noop", "target": target, "step": step,
                       "detail": {"label": label}})
    return events


def load_scenario() -> list[int]:
    build = db.get_setting("build", script.DEFAULT_BUILD)
    slow = lambda ms: _trail([("click", "submit", 4, "Submit report"), ("response", "submit", 4, {"latency_ms": ms}, ms)])
    reports = [
        ("problem", "Amira", 4, "The screen froze when I submitted the report", slow(7200)),
        ("problem", "Ben", 4, "Pressed submit and nothing happened for ages", slow(7400)),
        ("problem", "Chen", 4, "Stuck on step 4", slow(6900)),
        ("problem", "Dani", 2, "Didn't work", _trail([], _BASE[:1]) + _rage("add-medicine", 2, "Add medicine", 5)),
        ("idea", "Eli", 1, "It would be nice to search for the medicine by name instead of scrolling", []),
        ("problem", "Farah", 3, "رقم التشغيلة لا يقبل الأحرف الصغيرة",
         _trail([("input", "batch", 3, "Batch number", "kp4821"), ("click", "submit-details", 3, "Continue to review"),
                 ("error", "submit-details", 3, {"message": "Invalid batch number"}, 300)], _BASE[:3])),
        ("problem", "Gabe", 5, "The confirmation email took ages to reach my inbox", []),
        ("problem", "Hana", 5, "It felt weird", _trail([("click", "submit", 4, "Submit report"),
                                                         ("response", "submit", 4, {"latency_ms": 900}, 900)])),
        ("problem", "Iris", 4, "I think my report went in twice",
         _trail([("click", "submit", 4, "Submit report"), ("click", "submit", 4, "Submit report"),
                 ("error", "submit", 4, {"message": "Duplicate report created"}, 400)])),
    ]
    ids = []
    for kind, tester, step_id, text, trail in reports:
        ids.append(db.insert("reports", {
            "kind": kind, "tester": tester, "step_id": step_id, "text": text, "original_text": text,
            "trail": trail, "build": {**build, "browser": "Chrome (demo)"}, "facts": [], "status": "checking",
            "created_at": db.now()}))
    for step_id in (1, 5):   # the planted bugs stop steps 2-4 passing until fixed
        db.insert("passes", {"step_id": step_id, "tester": "Amira", "at": db.now()})
    return ids
