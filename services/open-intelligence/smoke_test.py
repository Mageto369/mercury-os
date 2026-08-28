from datetime import date

from fastapi import HTTPException
from app.main import configure_edgar, health, market_calendar, normalize_record

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
