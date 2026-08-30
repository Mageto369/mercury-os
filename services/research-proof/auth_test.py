"""HTTP proof that personal-server compute routes work without authentication."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app, raise_server_exceptions=False)

for headers in ({}, {'authorization': 'Bearer wrong'}):
    response = client.post('/vectorbt/experiment', json={}, headers=headers)
    assert response.status_code == 422, (headers, response.status_code)

assert client.post('/quantstats/proof', json={}).status_code == 422
assert client.post('/backtrader/challenger', json={}).status_code == 422
assert client.get('/health').status_code == 200

print('research-proof open access: ok')
