import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import storage
from app.api import auth
from app.api.main import app, attempts


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, 'DATA', tmp_path)
    monkeypatch.delenv('SETUP_TOKEN', raising=False)
    attempts.clear()
    with TestClient(app) as client:
        yield client


def test_auth_setup_password_hash_cookie_csrf_and_roles(client):
    assert client.get('/api/snapshot').status_code==401
    response=client.post('/api/auth/setup',json={'username':'tester','password':'test-password-123'})
    assert response.status_code==200
    assert 'HttpOnly' in response.headers['set-cookie']
    assert 'test-password' not in (storage.DATA/'users.json').read_text()
    csrf=response.json()['csrf']
    assert client.post('/api/commands',json={}).status_code==403
    assert client.post('/api/auth/setup',json={'username':'other','password':'test-password'}).status_code==409
    assert client.post('/api/auth/logout',headers={'x-csrf-token':csrf}).status_code==200
    auth.create_user('viewer','viewer-password','viewer')
    login=client.post('/api/auth/login',json={'username':'viewer','password':'viewer-password'}).json()
    assert client.post('/api/commands',headers={'x-csrf-token':login['csrf']},json={}).status_code==403


def test_login_origin_rate_limit_and_validation(client):
    assert client.post('/api/auth/setup',headers={'origin':'https://untrusted.example'},json={'username':'operator','password':'password-test'}).status_code==403
    assert client.post('/api/auth/setup',json={'username':'op','password':'short'}).status_code==422
    for _ in range(10):
        client.post('/api/auth/login',json={'username':'nobody','password':'incorrect-password'})
    assert client.post('/api/auth/login',json={'username':'nobody','password':'incorrect-password'}).status_code==429


def test_websocket_requires_authentication(client):
    from starlette.websockets import WebSocketDisconnect
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect('/api/ws',headers={'origin':'http://localhost:5173'}):
            pass


def test_saved_training_splits_disjoint():
    path=Path(__file__).resolve().parents[2]/'artifacts'/'evaluation.json'
    if not path.exists():
        pytest.skip('Train and copy artifacts first')
    model=json.loads(path.read_text())
    sets=[set(ids) for ids in model['splits'].values()]
    assert not sets[0]&sets[1] and not sets[0]&sets[2] and not sets[1]&sets[2]
    assert len(set.union(*sets))>=100
