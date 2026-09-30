import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { loadChampionCard } from '@/lib/market/research-memory';
import { ALPACA_PAPER_ORIGIN, readAlpacaPaperAccount, submitAlpacaPaperOrder, type AlpacaPaperOrderResult, type AlpacaPaperSide } from '@/lib/paper/alpaca-paper';
import { screenPaperBuy } from '@/lib/workflows/penny-screen';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const snapshot = await readAlpacaPaperAccount();
  const status = snapshot.status === 'refused' ? 400 : snapshot.status === 'unreachable' ? 502 : 200;
  return NextResponse.json(snapshot, { status });
}

function numberOrNull(value: unknown) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function orderStatus(result: AlpacaPaperOrderResult) {
  if (result.reason === 'paper_host_required' || result.reason === 'invalid_order') return 400;
  if (result.reason === 'not_eligible' || result.reason === 'insufficient_position' || result.reason === 'invalid_quantity') return 409;
  if (result.reason === 'alpaca_unreachable' || (result.reason?.startsWith('alpaca_http_') ?? false)) return 502;
  return 200;
}

/** The latest journaled book, using the same room and expectancy rule as the eligible-buy strip. */
async function latestEligibleBuy(symbol: string) {
  const sql = getSql();
  if (!sql) return { ok: false as const };
  try {
    const champion = await loadChampionCard();
    const rows = await sql<{
      card_version: string;
      session_date: string;
      price: string | number | null;
      room: boolean;
      blocks_room: boolean;
      expectancy_pct: string | number | null;
      gate_pass: boolean;
    }[]>`
      select card_version, session_date::text as session_date, price, room, blocks_room, expectancy_pct, gate_pass
      from research_decisions
      where symbol = ${symbol}
        and card_version = ${champion.version}
        and session_date = (select max(session_date) from research_decisions where card_version = ${champion.version})
      order by created_at desc
      limit 1
    `;
    const row = rows[0];
    if (!row || row.gate_pass !== true) return { ok: false as const };
    const day = row.session_date.slice(0, 10);
    const screen = screenPaperBuy({
      symbol,
      price: numberOrNull(row.price),
      room: row.room === true && row.blocks_room !== true,
      expectancyPct: numberOrNull(row.expectancy_pct),
    });
    return screen.pass ? { ok: true as const, day } : { ok: false as const };
  } catch {
    return { ok: false as const };
  }
}

function readOrder(body: unknown): { symbol: string; side: AlpacaPaperSide; quantity: number } | null {
  if (!body || typeof body !== 'object') return null;
  const row = body as Record<string, unknown>;
  const symbol = typeof row.symbol === 'string' ? row.symbol.trim().toUpperCase() : '';
  const side = row.side === 'buy' || row.side === 'sell' ? row.side : null;
  const quantity = row.quantity == null ? 1 : row.quantity;
  if (!/^[A-Z]{1,5}$/.test(symbol) || !side || typeof quantity !== 'number' || !Number.isInteger(quantity)) return null;
  return { symbol, side, quantity };
}

/** An explicit paper order. Page load does not call this. */
export async function POST(request: Request) {
  const parsed = readOrder(await request.json().catch(() => null));
  if (!parsed) {
    return NextResponse.json({
      ok: false,
      mode: 'alpaca-paper',
      reason: 'invalid_order',
      origin: ALPACA_PAPER_ORIGIN,
      capitalExecutionEnabled: false,
      liveBroker: false,
      placed: false,
      replayed: false,
      order: null,
    } satisfies AlpacaPaperOrderResult, { status: 400 });
  }

  if (parsed.side === 'buy') {
    const eligibility = await latestEligibleBuy(parsed.symbol);
    if (!eligibility.ok) {
      const refused: AlpacaPaperOrderResult = {
        ok: false,
        mode: 'alpaca-paper',
        reason: 'not_eligible',
        origin: ALPACA_PAPER_ORIGIN,
        capitalExecutionEnabled: false,
        liveBroker: false,
        placed: false,
        replayed: false,
        order: null,
      };
      return NextResponse.json(refused, { status: 409 });
    }
    const result = await submitAlpacaPaperOrder({
      symbol: parsed.symbol,
      side: 'buy',
      quantity: parsed.quantity,
      day: eligibility.day,
      gatePass: true,
    });
    return NextResponse.json(result, { status: orderStatus(result) });
  }

  const result = await submitAlpacaPaperOrder({
    symbol: parsed.symbol,
    side: 'sell',
    quantity: parsed.quantity,
    day: new Date().toISOString().slice(0, 10),
    gatePass: false,
  });
  return NextResponse.json(result, { status: orderStatus(result) });
}
