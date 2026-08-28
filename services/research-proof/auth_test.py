"""End-to-end proof that the sidecar itself enforces the bearer token.

The smoke test calls the endpoint functions directly, which bypasses the HTTP
middleware entirely. Token enforcement therefore has to be exercised over real
HTTP or it is not actually verified. This sidecar runs unbounded backtest
compute, so an unauthenticated caller is a resource-abuse problem, not just an
information-disclosure one.
"""

import os

from fastapi.testclient import TestClient

from app.main import app

TOKEN = 'mercury-sidecar-test-token'
client = TestClient(app, raise_server_exceptions=False)


def configure(token: str | None) -> None:
    os.environ.pop('MERCURY_SIDECAR_TOKEN', None)
    if token is not None:
        os.environ['MERCURY_SIDECAR_TOKEN'] = token


# Fail closed: with no token configured the service refuses to run compute.
configure(None)
assert client.post('/vectorbt/experiment', json={}).status_code == 503
assert client.get('/yfinance/history/AAPL').status_code == 503

# Token configured: unauthenticated and mis-authenticated callers are rejected.
configure(TOKEN)
for headers in ({}, {'authorization': 'Bearer wrong'}, {'authorization': TOKEN}):
    assert client.post('/vectorbt/experiment', json={}, headers=headers).status_code == 401, headers

# Enforcement covers every compute route, not just one.
assert client.post('/quantstats/proof', json={}).status_code == 401
assert client.post('/backtrader/challenger', json={}).status_code == 401
assert client.get('/yfinance/history/AAPL').status_code == 401

# The correct token is accepted and reaches the handler: an empty body now
# fails request validation (422) rather than authentication.
authorized = client.post('/vectorbt/experiment', json={}, headers={'authorization': f'Bearer {TOKEN}'})
assert authorized.status_code == 422, authorized.status_code

# /health is deliberately exempt so platform probes keep working.
assert client.get('/health').status_code == 200

print('research-proof auth: ok')
