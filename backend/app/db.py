"""SQLite storage: one file, no setup, enough for a UAT cycle.

JSON columns hold structured agent output (click trails, facts, suggestions, tickets). Each
call opens its own short-lived connection so background agent work and API requests never
share a cursor; a process-wide lock serialises writes.
"""

import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone

from app.config import db_path

_lock = threading.RLock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,              -- bug | idea
    step_id INTEGER,
    title TEXT NOT NULL,
    status TEXT NOT NULL,                -- needs_review | open | fixed | idea | known | merged | dismissed
    severity TEXT,                       -- low | medium | high | critical
    suggestion TEXT,                     -- JSON: what the AI proposes the manager does
    ticket TEXT,                         -- JSON: the Writer's draft ticket
    fix TEXT,                            -- JSON: the Mechanic's suggested fix
    ghost TEXT,                          -- JSON: the last Ghost tester run
    ticket_key TEXT,
    known_key TEXT,
    merged_into INTEGER,
    created_at TEXT NOT NULL,
    approved_at TEXT,
    fixed_at TEXT
);
CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,                  -- problem | idea | rage
    tester TEXT NOT NULL,
    step_id INTEGER,
    text TEXT NOT NULL DEFAULT '',       -- English (translated if needed)
    original_text TEXT NOT NULL DEFAULT '',
    language TEXT,
    trail TEXT NOT NULL DEFAULT '[]',    -- JSON click trail
    build TEXT NOT NULL DEFAULT '{}',    -- JSON build flags the tester was using
    facts TEXT NOT NULL DEFAULT '[]',    -- JSON facts found by the Detective
    status TEXT NOT NULL,                -- checking | needs_info | filed
    issue_id INTEGER REFERENCES issues(id),
    stack_confidence REAL,
    follow_up TEXT,
    answer TEXT,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id INTEGER NOT NULL REFERENCES issues(id),
    action TEXT NOT NULL,
    suggested_action TEXT,
    overruled INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent TEXT NOT NULL,
    message TEXT NOT NULL,
    report_id INTEGER,
    issue_id INTEGER,
    at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS passes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    step_id INTEGER NOT NULL,
    tester TEXT NOT NULL,
    at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""

JSON_COLUMNS = {"suggestion", "ticket", "fix", "ghost", "trail", "build", "facts"}


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def connect():
    with _lock:
        conn = sqlite3.connect(db_path())
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()


def init() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)


def reset() -> None:
    with connect() as conn:
        conn.executescript("""
            DROP TABLE IF EXISTS decisions; DROP TABLE IF EXISTS events; DROP TABLE IF EXISTS passes;
            DROP TABLE IF EXISTS reports; DROP TABLE IF EXISTS issues; DROP TABLE IF EXISTS settings;
        """)
        conn.executescript(SCHEMA)


def _decode(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    item = dict(row)
    for key in JSON_COLUMNS & item.keys():
        if item[key] is not None:
            item[key] = json.loads(item[key])
    return item


def _encode(values: dict) -> dict:
    return {k: (json.dumps(v) if k in JSON_COLUMNS and v is not None else v) for k, v in values.items()}


def insert(table: str, values: dict) -> int:
    values = _encode(values)
    cols = ", ".join(values)
    marks = ", ".join("?" for _ in values)
    with connect() as conn:
        return conn.execute(f"INSERT INTO {table} ({cols}) VALUES ({marks})", list(values.values())).lastrowid


def update(table: str, row_id: int, values: dict) -> None:
    values = _encode(values)
    sets = ", ".join(f"{k} = ?" for k in values)
    with connect() as conn:
        conn.execute(f"UPDATE {table} SET {sets} WHERE id = ?", [*values.values(), row_id])


def get(table: str, row_id: int) -> dict | None:
    with connect() as conn:
        return _decode(conn.execute(f"SELECT * FROM {table} WHERE id = ?", (row_id,)).fetchone())


def query(sql: str, params: tuple = ()) -> list[dict]:
    with connect() as conn:
        return [_decode(r) for r in conn.execute(sql, params).fetchall()]


def get_setting(key: str, default=None):
    with connect() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return json.loads(row["value"]) if row else default


def set_setting(key: str, value) -> None:
    with connect() as conn:
        conn.execute("INSERT INTO settings (key, value) VALUES (?, ?) "
                     "ON CONFLICT(key) DO UPDATE SET value = excluded.value", (key, json.dumps(value)))
