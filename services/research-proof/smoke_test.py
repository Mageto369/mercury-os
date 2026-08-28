import os
from datetime import datetime, timedelta, timezone

from app.main import BacktraderInput, ProofInput, SeriesInput, app, backtrader_challenger, health, quantstats_proof, require_sidecar_token, sidecar_access, vectorbt_experiment

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

base = datetime(2026, 1, 1, tzinfo=timezone.utc)
ts = [(base + timedelta(days=i)).isoformat() for i in range(40)]
prices = [100 + i * 0.5 + (i % 5) * 0.1 for i in range(40)]

h = health()
assert h['ok'] is True and h['capitalExecutionEnabled'] is False

v = vectorbt_experiment(SeriesInput(timestamps=ts, prices=prices))
assert v['ok'] is True and v['engine'] == 'vectorbt' and v['capitalExecutionEnabled'] is False

returns = [0.001 if i % 3 else -0.0005 for i in range(40)]
q = quantstats_proof(ProofInput(timestamps=ts, returns=returns, scope='test'))
assert q['ok'] is True and q['engine'] == 'quantstats' and q['capitalExecutionEnabled'] is False

b = backtrader_challenger(BacktraderInput(
    timestamps=ts,
    open=prices,
    high=[p + 1 for p in prices],
    low=[p - 1 for p in prices],
    close=prices,
    volume=[100000 + i * 1000 for i in range(40)],
    fast=3,
    slow=8,
))
assert b['ok'] is True and b['engine'] == 'backtrader' and b['capitalExecutionEnabled'] is False
print('research-proof smoke: ok')
