"""Small, explainable text tools the agents use to ground the AI's claims.

Testers describe the same bug in different words ("froze", "stuck", "hangs"), so words are
folded into shared concepts before comparing. This is deliberately simple: the point is that
a manager can see which words matched, not that the matching is clever.
"""

import re

STOPWORDS = set("""
a an the i me my we it its it's is was were be been am are to of in on at for and or but so
this that these those then than when after before just really very bit quite also again
with without from by as up down out about into over can could would should will did do
does doing done have has had got get gets you your they them there here what which who
""".split())

# Every word on the left is read as the concept on the right.
SYNONYMS = {
    "froze": "freeze", "frozen": "freeze", "freezes": "freeze", "freezing": "freeze", "stuck": "freeze",
    "hang": "freeze", "hangs": "freeze", "hung": "freeze", "loading": "freeze", "spinning": "freeze",
    "slow": "slow", "ages": "slow", "forever": "slow", "long": "slow", "laggy": "slow", "lag": "slow",
    "submit": "submit", "submitted": "submit", "submitting": "submit", "send": "submit", "sent": "submit",
    "sending": "submit", "save": "submit", "saved": "submit",
    "medicine": "medicine", "medicines": "medicine", "medication": "medicine", "drug": "medicine", "drugs": "medicine",
    "tablet": "medicine", "tablets": "medicine", "meds": "medicine", "paracetamol": "medicine",
    "add": "add", "added": "add", "adding": "add",
    "batch": "batch", "lot": "batch", "code": "batch", "number": "batch", "lowercase": "batch", "letters": "batch",
    "button": "button", "btn": "button", "click": "button", "clicked": "button", "press": "button",
    "pressed": "button", "tap": "button", "tapped": "button",
    "nothing": "broken", "broken": "broken", "work": "broken", "working": "broken", "works": "broken",
    "failed": "broken", "fails": "broken", "fail": "broken", "useless": "broken", "dead": "broken",
    "error": "error", "message": "error", "warning": "error", "invalid": "error", "rejected": "error",
    "twice": "double", "double": "double", "two": "double",
    "confirmation": "confirmation", "reference": "confirmation", "email": "email", "inbox": "email",
    "duplicate": "double", "duplicated": "double",
}

VAGUE_WORDS = set("""
didnt didn't doesnt doesn't dont don't not no bad shit rubbish weird strange odd wrong nice right
feel felt fine okay ok job awful terrible annoying broken work working thing stuff page site app
""".split())

IDEA_PHRASES = ("would be nice", "would be good", "it'd be", "should have", "should be", "could you add",
                "can you add", "wish", "suggest", "idea", "maybe add", "would love", "better if",
                "would be better", "would be great", "would help", "could we", "please add", "be able to",
                "option to", "there should")


def words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", (text or "").lower())


def concepts(text: str) -> set[str]:
    out = set()
    for word in words(text):
        word = word.replace("'", "")
        if word in STOPWORDS or len(word) < 2:
            continue
        out.add(SYNONYMS.get(word, word))
    return out


def matching_words(text: str, shared: set[str]) -> list[str]:
    """The tester's own words that map to a shared concept, for highlighting."""
    seen, out = set(), []
    for word in words(text):
        concept = SYNONYMS.get(word.replace("'", ""), word.replace("'", ""))
        if concept in shared and word not in seen:
            seen.add(word)
            out.append(word)
    return out


def jaccard(a: set, b: set) -> float:
    return len(a & b) / len(a | b) if a and b else 0.0


def is_vague(text: str) -> bool:
    """Too little to act on: almost no words, or only words like "didn't work", "bad", "weird"."""
    meaningful = [w.replace("'", "") for w in words(text) if w not in STOPWORDS]
    if len(meaningful) < 2:
        return True
    specific = [w for w in meaningful if w not in VAGUE_WORDS]
    return len(specific) == 0 or (len(meaningful) <= 4 and len(specific) <= 1 and not any(c.isdigit() for c in text))


def sounds_like_idea(text: str) -> bool:
    lowered = (text or "").lower()
    return any(phrase in lowered for phrase in IDEA_PHRASES)


def looks_non_english(text: str) -> bool:
    return any(ord(ch) > 127 and ch.isalpha() for ch in text or "")
