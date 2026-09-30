import assert from 'node:assert/strict';
import test from 'node:test';
import { alpacaPaperOrigin, readAlpacaPaperAccount } from '../lib/paper/alpaca-paper.ts';

const paperEnv = {
  ALPACA_API_KEY_ID: 'paper-key',
  ALPACA_API_SECRET_KEY: 'paper-secret',
  ALPACA_API_BASE_URL: 'https://paper-api.alpaca.markets',
};

function jsonResponse(body, status = 200, url = 'https://paper-api.alpaca.markets/v2/account') {
  const response = new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

test('only the Alpaca paper host is accepted', () => {
  assert.equal(alpacaPaperOrigin(undefined).ok, true);
  assert.equal(alpacaPaperOrigin('').origin, 'https://paper-api.alpaca.markets');
  assert.equal(alpacaPaperOrigin('https://paper-api.alpaca.markets').ok, true);
  assert.equal(alpacaPaperOrigin('https://api.alpaca.markets').ok, false);
  assert.equal(alpacaPaperOrigin('http://paper-api.alpaca.markets').ok, false);
  assert.equal(alpacaPaperOrigin('https://paper-api.alpaca.markets.evil.example').ok, false);
  assert.equal(alpacaPaperOrigin('https://user:secret@paper-api.alpaca.markets').ok, false);
});

test('missing paper keys do not call Alpaca', async () => {
  const snapshot = await readAlpacaPaperAccount({
    env: {},
    fetchImpl: () => {
      throw new Error('fetch should not run');
    },
  });
  assert.equal(snapshot.status, 'unconfigured');
  assert.equal(snapshot.capitalExecutionEnabled, false);
  assert.equal(snapshot.liveBroker, false);
  assert.equal(snapshot.ordersEnabled, false);
  assert.equal(snapshot.account, null);
});

test('a live host is refused before any request', async () => {
  const snapshot = await readAlpacaPaperAccount({
    env: { ...paperEnv, ALPACA_API_BASE_URL: 'https://api.alpaca.markets' },
    fetchImpl: () => {
      throw new Error('fetch should not run');
    },
  });
  assert.equal(snapshot.status, 'refused');
  assert.equal(snapshot.reason, 'paper_host_required');
  assert.equal(snapshot.ordersEnabled, false);
});

test('a paper account read returns buying power and does not place an order', async () => {
  const calls = [];
  const snapshot = await readAlpacaPaperAccount({
    env: paperEnv,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), method: init?.method, redirect: init?.redirect });
      assert.equal(init?.headers?.['APCA-API-KEY-ID'], 'paper-key');
      if (String(url).endsWith('/v2/account')) {
        return jsonResponse({
          status: 'ACTIVE',
          currency: 'USD',
          cash: '100000',
          equity: '100000',
          buying_power: '200000',
          portfolio_value: '100000',
          account_number: 'PA123456789',
        }, 200, 'https://paper-api.alpaca.markets/v2/account');
      }
      return jsonResponse([
        { symbol: 'anvs', qty: '10', side: 'long', market_value: '37.4', unrealized_pl: '1.2', avg_entry_price: '3.62' },
      ], 200, 'https://paper-api.alpaca.markets/v2/positions');
    },
  });
  assert.deepEqual(calls.map((call) => call.method), ['GET', 'GET']);
  assert.deepEqual(calls.map((call) => call.redirect), ['manual', 'manual']);
  assert.equal(calls.some((call) => String(call.url).includes('api.alpaca.markets') && !String(call.url).includes('paper-api')), false);
  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.status, 'connected');
  assert.equal(snapshot.account.buyingPower, 200000);
  assert.equal(snapshot.account.cash, 100000);
  assert.equal(snapshot.positionCount, 1);
  assert.equal(snapshot.positions[0].symbol, 'ANVS');
  assert.equal(snapshot.capitalExecutionEnabled, false);
  assert.equal(snapshot.liveBroker, false);
  assert.equal(snapshot.ordersEnabled, false);
  assert.equal(JSON.stringify(snapshot).includes('PA123456789'), false);
  assert.equal(JSON.stringify(snapshot).includes('paper-secret'), false);
});

test('a response that landed on the live host is refused', async () => {
  const snapshot = await readAlpacaPaperAccount({
    env: paperEnv,
    fetchImpl: async (url) => jsonResponse({ status: 'ACTIVE', cash: '1' }, 200, String(url).replace('paper-api.', 'api.')),
  });
  assert.equal(snapshot.status, 'refused');
  assert.equal(snapshot.reason, 'paper_host_required');
  assert.equal(snapshot.account, null);
});

test('an unauthorized paper response stays unread and omits the body', async () => {
  const snapshot = await readAlpacaPaperAccount({
    env: paperEnv,
    fetchImpl: async () => jsonResponse({ message: 'forbidden secret=paper-secret' }, 401, 'https://paper-api.alpaca.markets/v2/account'),
  });
  assert.equal(snapshot.status, 'unreachable');
  assert.equal(snapshot.reason, 'alpaca_http_401');
  assert.equal(snapshot.account, null);
  assert.equal(JSON.stringify(snapshot).includes('paper-secret'), false);
});
