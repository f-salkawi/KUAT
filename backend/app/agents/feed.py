"""The live agent feed: every agent says what it did, in plain words, as it does it."""

from app import db


def say(agent: str, message: str, report_id: int | None = None, issue_id: int | None = None) -> None:
    db.insert("events", {"agent": agent, "message": message, "report_id": report_id,
                         "issue_id": issue_id, "at": db.now()})


def since(after_id: int = 0, limit: int = 60) -> list[dict]:
    rows = db.query("SELECT * FROM events WHERE id > ? ORDER BY id DESC LIMIT ?", (after_id, limit))
    return list(reversed(rows))
