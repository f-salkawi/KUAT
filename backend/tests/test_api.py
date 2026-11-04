from app import db, demo
from app.agents import kuat


def load(client):
    for report_id in demo.load_scenario():
        kuat.process(report_id)


def test_queue_returns_exactly_one_item(client):
    load(client)
    body = client.get("/api/queue").json()
    assert body["item"] is not None and isinstance(body["item"], dict)
    assert body["remaining"] >= 1


def test_there_is_no_bulk_approve_route(client):
    paths = {route.path for route in client.app.routes}
    assert not any("bulk" in p or "approve_all" in p or "approve-all" in p for p in paths)
    assert client.post("/api/issues/decision", json={"action": "approve"}).status_code in (404, 405, 422)


def test_approve_creates_ticket_once(client):
    load(client)
    item = client.get("/api/queue").json()["item"]
    first = client.post(f"/api/issues/{item['id']}/decision", json={"action": "approve"})
    assert first.status_code == 200 and first.json()["ticket_key"].startswith("UAT-")
    again = client.post(f"/api/issues/{item['id']}/decision", json={"action": "approve"})
    assert again.status_code == 409


def test_overrule_is_logged(client):
    load(client)
    item = client.get("/api/queue").json()["item"]
    suggested = item["suggestion"]["action"]
    other = "dismiss" if suggested != "dismiss" else "approve"
    client.post(f"/api/issues/{item['id']}/decision", json={"action": other})
    decision = db.query("SELECT * FROM decisions WHERE issue_id = ?", (item["id"],))[0]
    assert decision["overruled"] == 1 and decision["suggested_action"] == suggested
    assert client.get("/api/dashboard").json()["ai_accuracy"] == {"agreed": 0, "total": 1}


def test_fixed_needs_every_trail_to_pass(client):
    load(client)
    pay = db.get("issues", db.query("SELECT issue_id FROM reports ORDER BY id LIMIT 1")[0]["issue_id"])
    client.post(f"/api/issues/{pay['id']}/decision", json={"action": "approve"})
    reports = db.query("SELECT id FROM reports WHERE issue_id = ?", (pay["id"],))
    partial = {"results": [{"report_id": reports[0]["id"], "passed": True}]}
    assert client.post(f"/api/issues/{pay['id']}/fixed", json={"ghost": partial}).status_code == 409
    full = {"results": [{"report_id": r["id"], "passed": True} for r in reports]}
    done = client.post(f"/api/issues/{pay['id']}/fixed", json={"ghost": full})
    assert done.status_code == 200 and done.json()["status"] == "fixed"


def test_readiness_blocks_launch_with_open_critical(client):
    load(client)
    pay = db.get("issues", db.query("SELECT issue_id FROM reports ORDER BY id LIMIT 1")[0]["issue_id"])
    client.post(f"/api/issues/{pay['id']}/decision", json={"action": "approve"})
    ready = client.get("/api/dashboard").json()["readiness"]
    assert ready["can_launch"] is False
    assert any("critical" in b for b in ready["blockers"])


def test_follow_up_answer_reruns_pipeline(client):
    ids = demo.load_scenario()
    for report_id in ids:
        kuat.process(report_id)
    hana = ids[7]
    assert client.post(f"/api/reports/{hana}/answer", json={"answer": "The reference number was missing on the confirmation"}).status_code == 200
    report = client.get(f"/api/reports/{hana}").json()
    assert report["status"] == "filed" and report["issue"] is not None


def test_report_requires_text_unless_rage(client):
    assert client.post("/api/reports", json={"kind": "problem", "tester": "A", "step_id": 4, "text": " "}).status_code == 422
    assert client.post("/api/reports", json={"kind": "rage", "tester": "A", "step_id": 2, "trail": []}).status_code == 201


def test_unstack_splits_a_report(client):
    load(client)
    pay = db.get("issues", db.query("SELECT issue_id FROM reports ORDER BY id LIMIT 1")[0]["issue_id"])
    report = db.query("SELECT id FROM reports WHERE issue_id = ? ORDER BY id DESC", (pay["id"],))[0]
    body = client.post(f"/api/reports/{report['id']}/unstack").json()
    assert body["status"] == "needs_review" and body["id"] != pay["id"]


def test_briefing_explains_the_cycle_from_real_numbers(client):
    empty = client.get("/api/briefing").json()
    assert empty["by"] == "rules" and "No feedback" in empty["headline"]
    load(client)
    body = client.get("/api/briefing").json()
    assert body["by"] == "rules"                       # tests run offline: rules mode, and it says so
    assert "9 reports from 9 testers" in body["points"][0]
    assert body["next_step"].startswith("Review")       # nothing approved yet, so the manager is next


def test_tester_tracker_moves_from_sent_to_fixed(client):
    load(client)
    amira = db.query("SELECT id, issue_id FROM reports ORDER BY id LIMIT 1")[0]
    assert client.get(f"/api/reports/{amira['id']}").json()["message"]["stage"] == 2
    client.post(f"/api/issues/{amira['issue_id']}/decision", json={"action": "approve"})
    assert client.get(f"/api/reports/{amira['id']}").json()["message"]["stage"] == 3


def test_reports_are_rate_limited_per_device(client):
    from app import main
    main._recent.clear()
    codes = [client.post("/api/reports", json={"kind": "rage", "tester": "Bot", "step_id": 2, "trail": []}).status_code
             for _ in range(main.REPORTS_PER_MINUTE + 1)]
    assert codes[-1] == 429 and codes[0] == 201
    main._recent.clear()
