"""Translator: testers write in any language, developers read English.

The original words are always kept next to the translation, so nothing is lost if the
translation is imperfect. Plain English text is not sent to the model at all.
"""

from app import script
from app.agents import llm
from app.agents.text import looks_non_english

ENGLISH_HINTS = set("the and is it was not to my on of when i".split())


def _probably_english(text: str) -> bool:
    if looks_non_english(text):
        return False
    words = text.lower().split()
    return len(words) <= 3 or any(w in ENGLISH_HINTS for w in words)


def translate(text: str) -> dict:
    """Returns {"text": english, "language": name, "translated": bool, "note": str | None}."""
    text = (text or "").strip()
    if not text or _probably_english(text):
        return {"text": text, "language": "English", "translated": False, "note": None}
    try:
        result = llm.ask(
            "Detect the language of a software tester's comment and translate it into plain English. "
            "Keep product words, numbers and button names exactly. If it is already English, return it unchanged. "
            # Knowing the app's own words turns "operation number" into the "batch number" the tester meant.
            f"The app being tested uses these words: {', '.join(s['name'] for s in script.STEPS)}, "
            "batch number, reaction, side effect, medicine.",
            text, "translation", llm.obj({"language": {"type": "string"}, "english": {"type": "string"}}),
            max_tokens=400)
    except llm.LLMUnavailable as exc:
        return {"text": text, "language": "Unknown", "translated": False, "note": f"Not translated: {exc.reason}"}
    english = (result.get("english") or "").strip() or text
    language = (result.get("language") or "Unknown").strip()
    return {"text": english, "language": language, "translated": language.lower() != "english", "note": None}
