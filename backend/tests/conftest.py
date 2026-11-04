import os

import pytest

os.environ["KUAT_OFFLINE"] = "1"   # tests never call Groq


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setenv("KUAT_DB_PATH", str(tmp_path / "test.db"))
    from app import db
    db.reset()
    yield


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.main import app
    return TestClient(app)
