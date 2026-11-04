"""The UAT test script for the demo side-effect report site, plus the "Jira" tickets that are already known.

Each step says what should happen (expected) and how long it may take (expected_ms). The
Detective compares a tester's click trail against these, so the expectations are the
single source of truth for "is this a bug?". `weight` says how much a broken step hurts
the launch: a broken Submit on a safety report is critical, a slow list is not.
"""

STEPS = [
    {"id": 1, "key": "medicine", "name": "Medicine", "instruction": "Choose the suspected medicine, Cardiolex 10 mg",
     "expected": "The medicine is selected straight away", "expected_ms": 1000, "weight": 2},
    {"id": 2, "key": "others", "name": "Other medicines", "instruction": "Add Paracetamol as another medicine the patient takes",
     "expected": "The medicine is added to the list", "expected_ms": 1000, "weight": 2},
    {"id": 3, "key": "details", "name": "Batch number", "instruction": "Pick the reaction, type the batch number from the box and continue",
     "expected": "Any valid batch number (2 letters, 4 numbers) is accepted, in upper or lower case", "expected_ms": 1000, "weight": 3},
    {"id": 4, "key": "submit", "name": "Submit", "instruction": "Press Submit report once",
     "expected": "The report is sent once, in under 2 seconds", "expected_ms": 2000, "weight": 4},
    {"id": 5, "key": "confirm", "name": "Confirmation", "instruction": "Check the confirmation",
     "expected": "A reference number is shown and a confirmation email is sent", "expected_ms": 1000, "weight": 2},
]

STEP_BY_ID = {step["id"]: step for step in STEPS}

# The demo site's build: True means the planted bug is live, False means its fix is deployed.
DEFAULT_BUILD = {"dead_add_medicine": True, "strict_batch": True, "slow_submit": True, "double_submit": True}

# Tickets the development team already has, standing in for an existing Jira backlog.
KNOWN_TICKETS = [
    {"key": "UAT-7", "step_id": 5, "title": "Confirmation email arrives up to 10 minutes late",
     "keywords": ["email", "confirmation", "late", "inbox"]},
]

# Where each step's logic lives in the demo app, so the Mechanic can point at real code.
CODE_MAP = {
    2: {"file": "frontend/src/demo/reportEngine.js", "marker": "KUAT:step-2"},
    3: {"file": "frontend/src/demo/reportEngine.js", "marker": "KUAT:step-3"},
    4: {"file": "frontend/src/demo/reportEngine.js", "marker": "KUAT:step-4"},
}


def step(step_id: int | None) -> dict | None:
    return STEP_BY_ID.get(step_id) if step_id else None
