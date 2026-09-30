import assert from 'node:assert/strict';
import test from 'node:test';
import { alpacaPaperClientOrderId, alpacaPaperOrderAllowed, alpacaPaperOrigin, readAlpacaPaperAccount, submitAlpacaPaperOrder } from '../lib/paper/alpaca-paper.ts';

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

test('paper order ids and the eligible-buy gate stay narrow', () => {
  assert.equal(alpacaPaperClientOrderId('ANVS', 'buy', '2026-09-28'), 'mercury-ANVS-buy-2026-09-28');
  assert.equal(alpacaPaperClientOrderId('ANVS', 'buy', '2026-99-99'), null);
  assert.equal(alpacaPaperClientOrderId('not a symbol', 'buy', '2026-09-28'), null);
  assert.equal(alpacaPaperOrderAllowed({ side: 'buy', quantity: 1, gatePass: false, heldQty: 0, positionSide: '' }).reason, 'not_eligible');
  assert.equal(alpacaPaperOrderAllowed({ side: 'buy', quantity: 1, gatePass: true, heldQty: 0, positionSide: '' }).ok, true);
  assert.equal(alpacaPaperOrderAllowed({ side: 'buy', quantity: 11, gatePass: true, heldQty: 0, positionSide: '' }).reason, 'invalid_quantity');
  assert.equal(alpacaPaperOrderAllowed({ side: 'sell', quantity: 1, gatePass: false, heldQty: 0, positionSide: 'long' }).reason, 'insufficient_position');
  assert.equal(alpacaPaperOrderAllowed({ side: 'sell', quantity: 1, gatePass: false, heldQty: 5, positionSide: 'short' }).reason, 'insufficient_position');
  assert.equal(alpacaPaperOrderAllowed({ side: 'sell', quantity: 1, gatePass: false, heldQty: 5, positionSide: 'long' }).ok, true);
});

function routedFetch(routes) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), method: init.method, body: init.body, redirect: init.redirect });
      const route = routes.find((item) => item.method === init.method && String(url).startsWith(item.prefix));
      if (!route) throw new Error(`unexpected ${init.method} ${url}`);
      return jsonResponse(route.body, route.status ?? 200, route.url ?? String(url));
    },
  };
}

const eligibleBuy = {
  symbol: 'ANVS',
  side: 'buy',
  quantity: 1,
  day: '2026-09-28',
  gatePass: true,
};

test('an ineligible buy never calls Alpaca', async () => {
  const order = await submitAlpacaPaperOrder({
    ...eligibleBuy,
    gatePass: false,
    env: paperEnv,
    fetchImpl: () => {
      throw new Error('fetch should not be called');
    },
  });
  assert.equal(order.reason, 'not_eligible');
  assert.equal(order.placed, false);
  assert.equal(order.capitalExecutionEnabled, false);
  assert.equal(order.liveBroker, false);
});

test('a missing paper key does not send an eligible buy', async () => {
  const order = await submitAlpacaPaperOrder({
    ...eligibleBuy,
    env: {},
    fetchImpl: () => {
      throw new Error('fetch should not be called');
    },
  });
  assert.equal(order.reason, 'alpaca_paper_not_configured');
  assert.equal(order.placed, false);
});

test('the live host cannot receive a paper order', async () => {
  const order = await submitAlpacaPaperOrder({
    ...eligibleBuy,
    env: { ...paperEnv, ALPACA_API_BASE_URL: 'https://api.alpaca.markets' },
    fetchImpl: () => {
      throw new Error('fetch should not be called');
    },
  });
  assert.equal(order.reason, 'paper_host_required');
  assert.equal(order.placed, false);
});

test('an eligible buy is one market day order on the paper host', async () => {
  const routed = routedFetch([
    { method: 'GET', prefix: 'https://paper-api.alpaca.markets/v2/orders:by_client_order_id', status: 404, body: { message: 'not found' } },
    {
      method: 'POST',
      prefix: 'https://paper-api.alpaca.markets/v2/orders',
      body: { symbol: 'ANVS', side: 'buy', qty: '1', status: 'accepted', client_order_id: 'mercury-ANVS-buy-2026-09-28' },
    },
  ]);
  const order = await submitAlpacaPaperOrder({ ...eligibleBuy, env: paperEnv, fetchImpl: routed.fetchImpl });
  assert.equal(order.placed, true);
  assert.equal(order.replayed, false);
  assert.equal(order.order.status, 'accepted');
  assert.equal(order.capitalExecutionEnabled, false);
  assert.equal(order.liveBroker, false);
  const post = routed.calls.find((call) => call.method === 'POST');
  const body = JSON.parse(post.body);
  assert.equal(post.url, 'https://paper-api.alpaca.markets/v2/orders');
  assert.equal(post.redirect, 'manual');
  assert.equal(body.type, 'market');
  assert.equal(body.time_in_force, 'day');
  assert.equal(body.qty, '1');
  assert.equal(body.client_order_id, 'mercury-ANVS-buy-2026-09-28');
  assert.equal(body.limit_price, undefined);
  assert.equal(routed.calls.filter((call) => call.method === 'POST').length, 1);
});

test('the same paper order id is not sent twice', async () => {
  const routed = routedFetch([
    {
      method: 'GET',
      prefix: 'https://paper-api.alpaca.markets/v2/orders:by_client_order_id',
      body: { symbol: 'ANVS', side: 'buy', qty: '1', status: 'accepted', client_order_id: 'mercury-ANVS-buy-2026-09-28' },
    },
  ]);
  const order = await submitAlpacaPaperOrder({ ...eligibleBuy, env: paperEnv, fetchImpl: routed.fetchImpl });
  assert.equal(order.replayed, true);
  assert.equal(order.placed, false);
  assert.equal(routed.calls.some((call) => call.method === 'POST'), false);
});

test('a paper sell needs a long position and does not open a short', async () => {
  const flat = routedFetch([
    { method: 'GET', prefix: 'https://paper-api.alpaca.markets/v2/positions/ANVS', status: 404, body: { message: 'position not found' } },
  ]);
  const refused = await submitAlpacaPaperOrder({
    symbol: 'ANVS',
    side: 'sell',
    quantity: 1,
    day: '2026-09-30',
    gatePass: false,
    env: paperEnv,
    fetchImpl: flat.fetchImpl,
  });
  assert.equal(refused.reason, 'insufficient_position');
  assert.equal(flat.calls.some((call) => call.method === 'POST'), false);

  const held = routedFetch([
    { method: 'GET', prefix: 'https://paper-api.alpaca.markets/v2/positions/ANVS', body: { symbol: 'ANVS', qty: '4', side: 'long' } },
    { method: 'GET', prefix: 'https://paper-api.alpaca.markets/v2/orders:by_client_order_id', status: 404, body: {} },
    {
      method: 'POST',
      prefix: 'https://paper-api.alpaca.markets/v2/orders',
      body: { symbol: 'ANVS', side: 'sell', qty: '1', status: 'accepted', client_order_id: 'mercury-ANVS-sell-2026-09-30' },
    },
  ]);
  const order = await submitAlpacaPaperOrder({
    symbol: 'ANVS',
    side: 'sell',
    quantity: 1,
    day: '2026-09-30',
    gatePass: false,
    env: paperEnv,
    fetchImpl: held.fetchImpl,
  });
  assert.equal(order.placed, true);
  assert.equal(JSON.parse(held.calls.find((call) => call.method === 'POST').body).side, 'sell');
});

test('a paper order response from another host is not treated as placed', async () => {
  const routed = routedFetch([
    { method: 'GET', prefix: 'https://paper-api.alpaca.markets/v2/orders:by_client_order_id', status: 404, body: {} },
    {
      method: 'POST',
      prefix: 'https://paper-api.alpaca.markets/v2/orders',
      url: 'https://api.alpaca.markets/v2/orders',
      body: { symbol: 'ANVS', side: 'buy', qty: '1', status: 'accepted', client_order_id: 'mercury-ANVS-buy-2026-09-28' },
    },
  ]);
  const order = await submitAlpacaPaperOrder({ ...eligibleBuy, env: paperEnv, fetchImpl: routed.fetchImpl });
  assert.equal(order.placed, false);
  assert.equal(order.reason, 'paper_host_required');
});
