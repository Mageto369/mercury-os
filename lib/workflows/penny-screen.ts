/**
 * Penny auto-select. A name has to be common stock under $5 with enough
 * dollar volume to trade. Missing price or volume fails closed.
 */

export const PENNY_MAX_PRICE = 5;
export const PENNY_MIN_DOLLAR_VOLUME = 100_000;
export const PENNY_MAX_SPREAD_BPS = 800;

const NON_COMMON_TICKER = /[.+^/]/;
const WARRANT_TICKER = /(WS|WW)$/;

export interface PennyScreenInput {
  symbol: string;
  price: number | null;
  /** Omit when the caller only knows the price. Null fails the volume rule. */
  dollarVolume?: number | null;
  spreadBps?: number | null;
}

export interface PennyScreenResult {
  pass: boolean;
  reasons: string[];
}

export function screenPennyStock(input: PennyScreenInput): PennyScreenResult {
  const reasons: string[] = [];
  const symbol = input.symbol.trim().toUpperCase();
  if (!symbol || NON_COMMON_TICKER.test(symbol) || WARRANT_TICKER.test(symbol)) {
    reasons.push('not a common-stock ticker');
  }

  const price = input.price;
  if (price == null || !Number.isFinite(price) || price <= 0 || price >= PENNY_MAX_PRICE) {
    reasons.push('price is outside the penny band under $5');
  }

  if (input.dollarVolume !== undefined) {
    const dollarVolume = input.dollarVolume;
    if (dollarVolume == null || !Number.isFinite(dollarVolume) || dollarVolume < PENNY_MIN_DOLLAR_VOLUME) {
      reasons.push('dollar volume is below the penny activity floor');
    }
  }

  const spreadBps = input.spreadBps;
  if (spreadBps != null && Number.isFinite(spreadBps) && spreadBps > PENNY_MAX_SPREAD_BPS) {
    reasons.push('observed spread is wider than the penny maximum');
  }

  return { pass: reasons.length === 0, reasons };
}

/** New simulated buys. Penny screen first, then the rise-with-room rank. */
export function screenPaperBuy(input: { symbol: string; price: number | null; room: boolean }): PennyScreenResult {
  const penny = screenPennyStock({ symbol: input.symbol, price: input.price });
  if (!penny.pass) return penny;
  if (!input.room) return { pass: false, reasons: ['rise is not marked room'] };
  return { pass: true, reasons: ['rise with room'] };
}
