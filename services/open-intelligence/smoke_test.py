import os
from datetime import date

from fastapi import HTTPException
from app.main import app, configure_edgar, health, market_calendar, normalize_record, require_sidecar_token, sidecar_access

assert any(middleware.kwargs.get('dispatch') is require_sidecar_token for middleware in app.user_middleware)

original_token = os.environ.pop('MERCURY_SIDECAR_TOKEN', None)
try:
    assert sidecar_access('Bearer anything') == (False, 503, 'sidecar_token_not_configured')
    os.environ['MERCURY_SIDECAR_TOKEN'] = 'mercury-sidecar-smoke-secret'
    assert sidecar_access(None) == (False, 401, 'unauthorized')
    assert sidecar_access('Bearer wrong') == (False, 401, 'unauthorized')
    assert sidecar_access('Bearer mercury-sidecar-smoke-secret') == (True, 200, None)
finally:
    if original_token is None:
        os.environ.pop('MERCURY_SIDECAR_TOKEN', None)
    else:
        os.environ['MERCURY_SIDECAR_TOKEN'] = original_token

h = health()
assert h['ok'] is True and h['capitalExecutionEnabled'] is False

record = normalize_record({'date': date(2026, 1, 2), 'value': 5})
assert record['date'] == '2026-01-02' and record['value'] == 5

calendar = market_calendar('NYSE', date(2026, 1, 2), date(2026, 1, 9))
assert calendar['exchange'] == 'NYSE'
assert len(calendar['sessions']) > 0
assert calendar['capitalExecutionEnabled'] is False

try:
    configure_edgar()
except HTTPException as exc:
    assert exc.status_code == 503 and exc.detail == 'edgar_identity_not_configured'
else:
    raise AssertionError('EDGAR must fail closed in CI without identity')

print('open-intelligence smoke: ok')
