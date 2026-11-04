from app import db, demo, review
from app.agents import detective, kuat, spotter, translator, writer
from app.agents.text import is_vague, sounds_like_idea


def click(t, target, step, label=None):
    return {"t": t, "kind": "action", "type": "click", "target": target, "step": step, "detail": {"label": label or target}}


def effect(t, kind, target, step, **detail):
    return {"t": t, "kind": "effect", "type": kind, "target": target, "step": step, "detail": detail}


def test_detective_finds_slow_submit():
    facts = detective.find_facts([click(0, "submit", 4, "Submit report"), effect(7200, "response", "submit", 4, latency_ms=7200)])
    assert [f["type"] for f in facts] == ["slow"]
    assert "7.2 s" in facts[0]["summary"]


def test_detective_ignores_fast_submit():
    assert detective.find_facts([click(0, "submit", 4), effect(900, "response", "submit", 4, latency_ms=900)]) == []


def test_detective_finds_rage_and_dead_clicks():
    trail = []
    for i in range(5):
        trail += [click(i * 300, "add-medicine", 2, "Add medicine"), effect(i * 300 + 5, "noop", "add-medicine", 2, label="Add medicine")]
    types = {f["type"] for f in detective.find_facts(trail)}
    assert types == {"rage", "dead_click"}


def test_detective_finds_double_submit_and_error():
    trail = [click(0, "submit", 4), click(400, "submit", 4),
             effect(450, "error", "submit", 4, message="Duplicate report created")]
    types = {f["type"] for f in detective.find_facts(trail)}
    assert {"double_submit", "error"} <= types


def test_vague_and_idea_detection():
    assert is_vague("Didn't work")
    assert is_vague("it felt weird")
    assert not is_vague("The screen froze when I paid")
    assert sounds_like_idea("It would be nice if the total was bigger")


def test_translator_leaves_english_alone_offline():
    assert translator.translate("Submit froze")["translated"] is False
    result = translator.translate("رقم التشغيلة لا يقبل الأحرف الصغيرة")
    assert result["translated"] is False and result["note"]          # honest: no AI, so not translated


def test_severity_ranks_submit_above_medicine_list():
    assert writer.severity(4, [{"type": "error"}], 1) == "critical"
    assert writer.severity(2, [], 1) == "low"


def test_reproduce_steps_collapse_repeats():
    trail = [click(i, "add-medicine", 2, "Add medicine") for i in range(3)]
    assert writer.reproduce_steps(trail) == ["Click 'Add medicine' x3"]


def run_scenario():
    ids = demo.load_scenario()
    for report_id in ids:
        kuat.process(report_id)
    return ids


def test_scenario_stacks_the_three_slow_submit_reports():
    ids = run_scenario()
    slow = db.get("issues", db.get("reports", ids[0])["issue_id"])
    assert db.query("SELECT COUNT(*) AS n FROM reports WHERE issue_id = ?", (slow["id"],))[0]["n"] == 3
    assert slow["status"] == "needs_review"                           # stacking never approves anything
    assert slow["ticket"]["severity"] == "critical"                   # Submit step + 3 reports
    iris = db.get("reports", ids[8])                                  # the duplicate send is a different bug
    assert iris["issue_id"] != slow["id"] and {f["type"] for f in iris["facts"]} >= {"double_submit"}
    assert db.get("issues", iris["issue_id"])["suggestion"]["action"] == "approve"   # different faults are not merged


def test_scenario_turns_vague_into_bug_with_trail_and_asks_when_no_trail():
    ids = run_scenario()
    dani = db.get("reports", ids[3])
    assert dani["status"] == "filed" and {f["type"] for f in dani["facts"]} >= {"dead_click"}
    hana = db.get("reports", ids[7])
    assert hana["status"] == "needs_info" and hana["follow_up"]


def test_scenario_routes_idea_and_known_ticket():
    ids = run_scenario()
    eli_issue = db.get("issues", db.get("reports", ids[4])["issue_id"])
    assert eli_issue["status"] == "idea"
    gabe_issue = db.get("issues", db.get("reports", ids[6])["issue_id"])
    assert gabe_issue["suggestion"]["action"] == "link_known" and gabe_issue["suggestion"]["known_key"] == "UAT-7"


def test_different_step_caps_confidence():
    run_scenario()
    report = {"text": "the screen froze when I paid", "step_id": 1, "facts": []}
    match = spotter.find_match(report, "bug")
    if match["issue"] and match["issue"]["step_id"] != 1:
        assert match["confidence"] <= 0.6 and match["warning"]


def test_tester_hears_back():
    ids = run_scenario()
    assert "other report" in review.tester_message(db.get("reports", ids[1]))["text"]
    assert "idea" in review.tester_message(db.get("reports", ids[4]))["text"].lower()


def test_silent_rage_report_stacks_onto_same_fault():
    ids = run_scenario()
    dani_issue = db.get("reports", ids[3])["issue_id"]
    trail = []
    for i in range(5):
        trail += [{"t": i * 250, "kind": "action", "type": "click", "target": "add-medicine", "step": 2, "detail": {"label": "Add medicine"}},
                  {"t": i * 250 + 5, "kind": "effect", "type": "noop", "target": "add-medicine", "step": 2, "detail": {"label": "Add medicine"}}]
    rid = db.insert("reports", {"kind": "rage", "tester": "Zoe", "step_id": 2, "text": "", "original_text": "",
                                "trail": trail, "build": {}, "facts": [], "status": "checking", "created_at": db.now()})
    kuat.process(rid)
    assert db.get("reports", rid)["issue_id"] == dani_issue


def test_demo_reports_remember_their_build():
    ids = demo.load_scenario()
    assert db.get("reports", ids[0])["build"]["slow_submit"] is True


def test_fault_on_another_step_does_not_leak_into_a_report():
    trail = [click(0, "submit", 4, "Submit report"), effect(7200, "response", "submit", 4, latency_ms=7200)]
    rid = db.insert("reports", {"kind": "problem", "tester": "Zoe", "step_id": 3, "original_text": "would be better with a back button",
                                "text": "would be better with a back button", "trail": trail, "build": {}, "facts": [],
                                "status": "checking", "created_at": db.now()})
    kuat.process(rid)
    report = db.get("reports", rid)
    assert report["facts"] == []
    assert db.get("issues", report["issue_id"])["suggestion"]["action"] == "to_idea"
