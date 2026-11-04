"""Settings come from environment variables, with backend/.env as a local fallback.

The Groq key is optional: without it KUAT runs in "rules" mode, where every agent uses its
deterministic checks only and says so in the agent feed. The key is never logged or returned.
"""

import os
from functools import lru_cache
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent


@lru_cache
def _dotenv() -> dict[str, str]:
    path = BACKEND_DIR / ".env"
    values: dict[str, str] = {}
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def get_setting(name: str) -> str | None:
    return os.environ.get(name) or _dotenv().get(name) or None


def db_path() -> str:
    return get_setting("KUAT_DB_PATH") or str(BACKEND_DIR / "kuat.db")
