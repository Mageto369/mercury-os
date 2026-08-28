"""End-to-end proof that the sidecar itself enforces the bearer token.

The smoke and stress tests call the endpoint functions directly, which bypasses
the HTTP middleware entirely. Token enforcement therefore has to be exercised
over real HTTP or it is not actually verified.
"""

import os

from fastapi.testclient import TestClient

from app.main import app

TOKEN = 'mercury-sidecar-test-token'
CALENDAR = '/calendar/NYSE?start=2026-01-02&end=2026-01-09'
client = TestClient(app, raise_server_exceptions=False)


def configure(token: str | None) -> None:
    os.environ.pop('MERCURY_SIDECAR_TOKEN', None)
    if token is not None:
        os.environ['MERCURY_SIDECAR_TOKEN'] = token


# Fail closed: with no token configured the service refuses to serve data.
configure(None)
assert client.get(CALENDAR).status_code == 503
assert client.get('/identity/AAPL').status_code == 503

# Token configured: unauthenticated and mis-authenticated callers are rejected.
configure(TOKEN)
for headers in ({}, {'authorization': 'Bearer wrong'}, {'authorization': TOKEN}):
    assert client.get(CALENDAR, headers=headers).status_code == 401, headers

# Enforcement covers every data route, not just one.
assert client.get('/identity/AAPL').status_code == 401
assert client.get('/edgar/company/AAPL').status_code == 401
assert client.get('/fred/GDP').status_code == 401

# The correct token is accepted and reaches the handler.
authorized = client.get(CALENDAR, headers={'authorization': f'Bearer {TOKEN}'})
assert authorized.status_code == 200, authorized.status_code
assert authorized.json()['capitalExecutionEnabled'] is False

# /health is deliberately exempt so platform probes keep working.
assert client.get('/health').status_code == 200

print('open-intelligence auth: ok')
