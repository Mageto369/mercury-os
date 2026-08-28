from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date

from app.main import health, market_calendar, normalize_record


def task(i: int):
    h = health()
    assert h['ok'] is True
    assert h['capitalExecutionEnabled'] is False
    record = normalize_record({'date': date(2026, 1, (i % 27) + 1), 'value': i})
    assert isinstance(record['date'], str)
    calendar = market_calendar('NYSE', date(2026, 1, 2), date(2026, 1, 9))
    assert calendar['capitalExecutionEnabled'] is False
    assert len(calendar['sessions']) > 0
    return i


with ThreadPoolExecutor(max_workers=16) as pool:
    futures = [pool.submit(task, i) for i in range(160)]
    completed = [future.result() for future in as_completed(futures)]

assert len(completed) == 160
print('open-intelligence stress: ok (160 tasks / 16 workers)')
