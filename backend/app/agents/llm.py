"""The one language-model call every agent shares: Groq Chat Completions with strict JSON output.

Agents never trust free text from the model. Each call names a JSON schema, Groq enforces
it, and the agent still checks the values it uses. If there is no key, or Groq fails or
rate-limits, `ask()` raises LLMUnavailable and the agent falls back to its own rules,
reporting that in the agent feed instead of pretending the AI ran.
"""

import json
import logging

import httpx

from app.config import get_setting

logger = logging.getLogger(__name__)

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = "openai/gpt-oss-120b"
TIMEOUT = httpx.Timeout(30.0, connect=5.0)


class LLMUnavailable(Exception):
    """The model could not be used; `reason` is safe to show in the agent feed."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def _key() -> str | None:
    # KUAT_OFFLINE=1 forces rules mode (tests, or a demo with no network).
    return None if get_setting("KUAT_OFFLINE") == "1" else get_setting("KUAT_GROQ_API_KEY")


def enabled() -> bool:
    return bool(_key())


def model() -> str:
    return get_setting("KUAT_GROQ_MODEL") or DEFAULT_MODEL


def ask(system: str, user: str, schema_name: str, schema: dict, max_tokens: int = 600) -> dict:
    key = _key()
    if not key:
        raise LLMUnavailable("no Groq key set, so rules only")
    body = {
        "model": model(),
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "max_completion_tokens": max_tokens,
        "reasoning_effort": "low",
        "include_reasoning": False,
        "response_format": {"type": "json_schema",
                            "json_schema": {"name": schema_name, "strict": True, "schema": schema}},
    }
    try:
        response = httpx.post(GROQ_URL, json=body, headers={"Authorization": f"Bearer {key}"}, timeout=TIMEOUT)
    except httpx.HTTPError as exc:
        logger.warning("Groq request failed: %s", type(exc).__name__)
        raise LLMUnavailable("Groq could not be reached, so rules only") from exc
    if response.status_code == 429:
        raise LLMUnavailable("Groq free-plan limit hit, so rules only")
    if response.status_code >= 400:
        logger.warning("Groq returned HTTP %s", response.status_code)
        raise LLMUnavailable(f"Groq error {response.status_code}, so rules only")
    try:
        return json.loads(response.json()["choices"][0]["message"]["content"])
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise LLMUnavailable("Groq reply was unreadable, so rules only") from exc


def obj(properties: dict) -> dict:
    """A strict JSON-schema object: every property required, nothing extra allowed."""
    return {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False}
