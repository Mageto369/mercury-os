import os
from datetime import date

from fastapi import HTTPException
from fastapi.testclient import TestClient
import app.main as main_module
from app.main import (
    app,
    configure_edgar,
    health,
    market_calendar,
    normalize_record,
    parse_form4_xml,
    parse_fred_observations,
    parse_ticker_catalog,
    recent_filings,
    resolve_identifier,
    require_sidecar_token,
    sidecar_access,
)

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

tickers, ciks = parse_ticker_catalog({
    'fields': ['cik', 'name', 'ticker', 'exchange'],
    'data': [[320193, 'Apple Inc.', 'AAPL', 'Nasdaq']],
})
assert tickers['AAPL']['name'] == 'Apple Inc.'
assert ciks['0000320193']['ticker'] == 'AAPL'

filings = recent_filings({
    'filings': {
        'recent': {
            'form': ['10-Q', '8-K', '8-K'],
            'accessionNumber': ['a', 'b', 'c'],
            'filingDate': ['2026-01-01', '2026-01-02', '2026-01-03'],
            'reportDate': ['2025-12-31', '2026-01-02', '2026-01-03'],
            'primaryDocument': ['a.htm', 'b.htm', 'c.htm'],
        },
    },
}, '8-K', 1)
assert filings == [{
    'accessionNumber': 'b',
    'form': '8-K',
    'filingDate': '2026-01-02',
    'reportDate': '2026-01-02',
    'primaryDocument': 'b.htm',
}]

form4 = parse_form4_xml('''
<ownershipDocument>
  <issuer><issuerCik>0000320193</issuerCik><issuerName>Apple Inc.</issuerName><issuerTradingSymbol>AAPL</issuerTradingSymbol></issuer>
  <reportingOwner><reportingOwnerId><rptOwnerCik>0001214128</rptOwnerCik><rptOwnerName>Example Owner</rptOwnerName></reportingOwnerId></reportingOwner>
  <nonDerivativeTable><nonDerivativeTransaction>
    <securityTitle><value>Common Stock</value></securityTitle>
    <transactionDate><value>2026-01-02</value></transactionDate>
    <transactionCoding><transactionCode>P</transactionCode></transactionCoding>
    <transactionAmounts>
      <transactionShares><value>100</value></transactionShares>
      <transactionPricePerShare><value>200.50</value></transactionPricePerShare>
      <transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode>
    </transactionAmounts>
  </nonDerivativeTransaction></nonDerivativeTable>
</ownershipDocument>
''')
assert form4['issuer']['symbol'] == 'AAPL'
assert form4['reportingOwner']['name'] == 'Example Owner'
assert form4['nonDerivativeTransactions'][0]['shares'] == '100'

fred = parse_fred_observations({'observations': [
    {'date': '2026-01-01', 'realtime_start': '2026-01-02', 'value': '123.4'},
    {'date': '2026-02-01', 'realtime_start': '2026-02-02', 'value': '.'},
]})
assert fred[0]['value'] == 123.4
assert fred[1]['value'] is None

# Numeric CIKs do not depend on the ticker-catalog provider.
assert resolve_identifier('320193') == ('0000320193', None)

calendar = market_calendar('NYSE', date(2026, 1, 2), date(2026, 1, 9))
assert calendar['exchange'] == 'NYSE'
assert len(calendar['sessions']) > 0
assert calendar['capitalExecutionEnabled'] is False

thanksgiving = market_calendar('NASDAQ', date(2026, 11, 26), date(2026, 11, 27))
assert [session['sessionDate'] for session in thanksgiving['sessions']] == ['2026-11-27']
assert thanksgiving['sessions'][0]['earlyClose'] is True
assert thanksgiving['sessions'][0]['closeAt'] == '2026-11-27T18:00:00+00:00'

try:
    market_calendar('UNSUPPORTED', date(2026, 1, 2), date(2026, 1, 9))
except HTTPException as exc:
    assert exc.status_code == 404 and exc.detail == 'calendar_not_supported'
else:
    raise AssertionError('Unsupported calendars must fail explicitly')

try:
    configure_edgar()
except HTTPException as exc:
    assert exc.status_code == 503 and exc.detail == 'edgar_identity_not_configured'
else:
    raise AssertionError('EDGAR must fail closed in CI without identity')

for route in (main_module.edgar_company, main_module.edgar_filings, main_module.edgar_form4):
    try:
        route('320193')
    except HTTPException as exc:
        assert exc.status_code == 503 and exc.detail == 'edgar_identity_not_configured'
    else:
        raise AssertionError(f'{route.__name__} must preserve missing-identity status')


def fake_provider_json(url, *, params=None, headers=None):
    if url == main_module.SEC_TICKERS_URL:
        return {
            'fields': ['cik', 'name', 'ticker', 'exchange'],
            'data': [[320193, 'Apple Inc.', 'AAPL', 'Nasdaq']],
        }
    if url == main_module.SEC_SUBMISSIONS_URL.format(cik='0000320193'):
        return {
            'name': 'Apple Inc.',
            'tickers': ['AAPL'],
            'exchanges': ['Nasdaq'],
            'formerNames': [],
            'filings': {'recent': {
                'form': ['8-K', '4'],
                'accessionNumber': ['0000320193-26-000001', '0000320193-26-000002'],
                'filingDate': ['2026-01-02', '2026-01-03'],
                'reportDate': ['2026-01-02', '2026-01-03'],
                'primaryDocument': ['eight-k.htm', 'form4.xml'],
            }},
        }
    if url == main_module.FRED_OBSERVATIONS_URL:
        assert params['series_id'] == 'GDP'
        return {'observations': [{'date': '2026-01-01', 'realtime_start': '2026-01-02', 'value': '123.4'}]}
    raise AssertionError(f'unexpected provider URL: {url}')


def fake_provider_text(url, *, headers=None):
    assert url.endswith('/000032019326000002/form4.xml')
    return '''<ownershipDocument>
      <issuer><issuerCik>0000320193</issuerCik><issuerName>Apple Inc.</issuerName><issuerTradingSymbol>AAPL</issuerTradingSymbol></issuer>
      <reportingOwner><reportingOwnerId><rptOwnerCik>0001214128</rptOwnerCik><rptOwnerName>Example Owner</rptOwnerName></reportingOwnerId></reportingOwner>
      <nonDerivativeTable><nonDerivativeTransaction><transactionAmounts><transactionShares><value>100</value></transactionShares></transactionAmounts></nonDerivativeTransaction></nonDerivativeTable>
    </ownershipDocument>'''


# Exercise every provider route over HTTP with deterministic provider replies.
saved_json = main_module.provider_get_json
saved_text = main_module.provider_get_text
saved_tickers = main_module._ticker_records
saved_ciks = main_module._cik_records
saved_env = {key: os.environ.get(key) for key in ('MERCURY_SIDECAR_TOKEN', 'EDGAR_IDENTITY', 'FRED_API_KEY')}
try:
    main_module.provider_get_json = fake_provider_json
    main_module.provider_get_text = fake_provider_text
    main_module._ticker_records = None
    main_module._cik_records = None
    os.environ['MERCURY_SIDECAR_TOKEN'] = 'smoke-token'
    os.environ['EDGAR_IDENTITY'] = 'Mercury OS smoke@example.com'
    os.environ['FRED_API_KEY'] = 'test-key'
    client = TestClient(app, raise_server_exceptions=False)
    headers = {'authorization': 'Bearer smoke-token'}

    identity = client.get('/identity/AAPL', headers=headers)
    assert identity.status_code == 200 and identity.json()['cik'] == '0000320193'
    reference = client.get('/reference/equity/AAPL', headers=headers)
    assert reference.status_code == 200 and reference.json()['found'] is True
    company = client.get('/edgar/company/AAPL', headers=headers)
    assert company.status_code == 200 and company.json()['name'] == 'Apple Inc.'
    filings_response = client.get('/edgar/filings/AAPL?form=8-K&limit=1', headers=headers)
    assert filings_response.status_code == 200 and len(filings_response.json()['filings']) == 1
    form4_response = client.get('/edgar/form4/AAPL?limit=1', headers=headers)
    assert form4_response.status_code == 200
    assert form4_response.json()['transactions'][0]['payload']['issuer']['symbol'] == 'AAPL'
    fred_response = client.get('/fred/GDP?start=2026-01-01&end=2026-01-31', headers=headers)
    assert fred_response.status_code == 200 and fred_response.json()['observations'][0]['value'] == 123.4
    calendar_response = client.get('/calendar/NASDAQ?start=2026-11-26&end=2026-11-27', headers=headers)
    assert calendar_response.status_code == 200 and calendar_response.json()['sessions'][0]['earlyClose'] is True
finally:
    main_module.provider_get_json = saved_json
    main_module.provider_get_text = saved_text
    main_module._ticker_records = saved_tickers
    main_module._cik_records = saved_ciks
    for key, value in saved_env.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value

print('open-intelligence smoke: ok')
