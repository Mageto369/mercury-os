import os
from datetime import date
from unittest.mock import patch

from fastapi import HTTPException
from app.main import (
    app,
    build_security_universe,
    configure_edgar,
    health,
    market_calendar,
    normalize_record,
    parse_form4_xml,
    parse_fred_csv,
    parse_fred_observations,
    parse_ticker_catalog,
    recent_filings,
    fred_series,
)

assert app.user_middleware == []

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

universe_total, universe = build_security_universe([
    {'cik': 320193, 'name': 'Apple Inc.', 'ticker': 'aapl', 'exchange': 'Nasdaq'},
    {'cik': 1067983, 'name': 'Example OTC', 'ticker': 'otcx', 'exchange': 'OTC'},
    {'cik': 1, 'name': 'Excluded', 'ticker': 'skip', 'exchange': 'CBOE'},
], {'NASDAQ', 'OTC'}, 0, 10)
assert universe_total == 2
assert universe == [
    {'symbol': 'AAPL', 'name': 'Apple Inc.', 'market': 'NASDAQ', 'cik': '0000320193'},
    {'symbol': 'OTCX', 'name': 'Example OTC', 'market': 'OTC', 'cik': '0001067983'},
]

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

fred_csv = parse_fred_csv(
    'observation_date,DFF\n2026-01-01,3.64\n2026-01-02,.\n',
    'DFF',
    '2026-01-03',
)
assert fred_csv == [
    {'observationDate': '2026-01-01', 'vintageDate': '2026-01-03', 'value': 3.64},
    {'observationDate': '2026-01-02', 'vintageDate': '2026-01-03', 'value': None},
]

with patch.dict(os.environ, {'FRED_API_KEY': ''}), patch(
    'app.main.provider_get_text',
    return_value='observation_date,DFF\n2026-01-01,3.64\n',
):
    keyless_fred = fred_series('DFF', start='2026-01-01', end='2026-01-02')
assert keyless_fred['source'] == 'fred-csv'
assert keyless_fred['observations'][0]['value'] == 3.64
assert keyless_fred['capitalExecutionEnabled'] is False

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

assert 'Mageto369/mercury-os' in configure_edgar()
assert health()['configured']['edgar'] is True

print('open-intelligence smoke: ok')
