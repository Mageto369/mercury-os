import { getSql } from '@/lib/db';

export const DEFAULT_PAPER_ACCOUNT_ID = 'paper:primary';
export const DEFAULT_STARTING_CAPITAL = 100_000;

export async function ensurePaperAccount() {
  const sql = getSql();
  if (!sql) return null;
  const [account] = await sql`
    insert into paper_accounts (id, name, starting_capital, cash, capital_execution_enabled)
    values (${DEFAULT_PAPER_ACCOUNT_ID}, 'Mercury Paper Account', ${DEFAULT_STARTING_CAPITAL}, ${DEFAULT_STARTING_CAPITAL}, false)
    on conflict (id) do update set updated_at = paper_accounts.updated_at
    returning *
  `;
  return account ?? null;
}

export async function getPaperAccountSnapshot() {
  const sql = getSql();
  if (!sql) return null;
  const account = await ensurePaperAccount();
  if (!account) return null;

  const positions = await sql`
    select
      pp.id,
      pp.security_id,
      s.symbol,
      s.market,
      pp.quantity,
      pp.average_cost,
      pp.realized_pnl,
      latest.price as mark_price,
      latest.observed_at as marked_at
    from paper_positions pp
    join securities s on s.id = pp.security_id
    left join lateral (
      select ms.price, ms.observed_at
      from market_snapshots ms
      where ms.security_id = pp.security_id
      order by ms.observed_at desc
      limit 1
    ) latest on true
    where pp.account_id = ${DEFAULT_PAPER_ACCOUNT_ID}
      and s.id not like 'validation:%'
      and pp.quantity > 0
    order by s.symbol
  `;

  let marketValue = 0;
  let costBasis = 0;
  let unrealizedPnl = 0;
  const valuedPositions = positions.map((position) => {
    const quantity = Number(position.quantity ?? 0);
    const averageCost = Number(position.average_cost ?? 0);
    const markPrice = position.mark_price == null ? averageCost : Number(position.mark_price);
    const value = quantity * markPrice;
    const basis = quantity * averageCost;
    const unrealized = value - basis;
    marketValue += value;
    costBasis += basis;
    unrealizedPnl += unrealized;
    return {
      id: String(position.id),
      securityId: String(position.security_id),
      security_id: String(position.security_id),
      symbol: String(position.symbol),
      market: String(position.market ?? ''),
      quantity,
      averageCost,
      markPrice,
      marketValue: value,
      costBasis: basis,
      unrealizedPnl: unrealized,
      realizedPnl: Number(position.realized_pnl ?? 0),
      markedAt: position.marked_at ?? null,
    };
  });

  const startingCapital = Number(account.starting_capital ?? 0);
  const cash = Number(account.cash ?? 0);
  const realizedPnl = Number(account.realized_pnl ?? 0);
  const equity = cash + marketValue;
  const totalPnl = equity - startingCapital;
  const grossExposure = marketValue;
  const buyingPower = Math.max(0, cash);

  return {
    id: account.id,
    name: account.name,
    status: account.status,
    startingCapital,
    cash,
    buyingPower,
    equity,
    marketValue,
    costBasis,
    grossExposure,
    realizedPnl,
    unrealizedPnl,
    totalPnl,
    totalReturnPct: startingCapital > 0 ? (totalPnl / startingCapital) * 100 : 0,
    capitalExecutionEnabled: false,
    positions: valuedPositions,
    updatedAt: account.updated_at,
  };
}
