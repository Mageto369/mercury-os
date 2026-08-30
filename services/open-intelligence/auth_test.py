"""HTTP proof that personal-server intelligence routes work without authentication."""

from fastapi.testclient import TestClient

import app.main as main_module
from app.main import app

CALENDAR = '/calendar/NYSE?start=2026-01-02&end=2026-01-09'
client = TestClient(app, raise_server_exceptions=False)

for headers in ({}, {'authorization': 'Bearer wrong'}):
    response = client.get(CALENDAR, headers=headers)
    assert response.status_code == 200, (headers, response.status_code)
    assert response.json()['capitalExecutionEnabled'] is False

main_module._ticker_records = {
    'AAPL': {'cik': 320193, 'name': 'Apple Inc.', 'ticker': 'AAPL', 'exchange': 'Nasdaq'},
    'OTCX': {'cik': 1067983, 'name': 'Example OTC', 'ticker': 'OTCX', 'exchange': 'OTC'},
    'SKIP': {'cik': 1, 'name': 'Excluded CBOE', 'ticker': 'SKIP', 'exchange': 'CBOE'},
}
main_module._cik_records = {}
universe = client.get('/reference/universe?exchanges=Nasdaq,OTC&offset=0&limit=100')
assert universe.status_code == 200, universe.status_code
payload = universe.json()
assert payload['total'] == 2
assert [row['symbol'] for row in payload['securities']] == ['AAPL', 'OTCX']
assert payload['capitalExecutionEnabled'] is False
health = client.get('/health')
assert health.status_code == 200
assert health.json()['configured']['edgar'] is True
assert 'Mageto369/mercury-os' in main_module.configure_edgar()

print('open-intelligence open access: ok')
