import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { DEFAULT_PAPER_ACCOUNT_ID } from "@/lib/paper/account";
import { toJsonb } from "@/lib/db/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sql = getSql();
  if (!sql)
    return NextResponse.json(
      { ok: false, error: "database_not_configured" },
      { status: 503 },
    );
  try {
    const result = await sql.begin(async (tx) => {
      const [account] =
        await tx`select * from paper_accounts where id=${DEFAULT_PAPER_ACCOUNT_ID} for update`;
      if (!account)
        return {
          status: 404,
          body: { ok: false, error: "paper_account_not_found" },
        };
      const [marking] =
        await tx`select coalesce(sum(pp.quantity*coalesce(latest.price,pp.average_cost)),0) as market_value,coalesce(sum(pp.quantity*(coalesce(latest.price,pp.average_cost)-pp.average_cost)),0) as unrealized_pnl,count(*) filter(where pp.quantity>0)::int as position_count from paper_positions pp left join lateral(select price from market_snapshots ms where ms.security_id=pp.security_id order by observed_at desc limit 1)latest on true where pp.account_id=${DEFAULT_PAPER_ACCOUNT_ID}`;
      const cash = Number(account.cash ?? 0),
        marketValue = Number(marking?.market_value ?? 0),
        unrealized = Number(marking?.unrealized_pnl ?? 0),
        realized = Number(account.realized_pnl ?? 0);
      await tx`insert into paper_account_snapshots(id,account_id,cash,market_value,equity,realized_pnl,unrealized_pnl,gross_exposure,position_count,metadata) values(${`paper-snapshot:${randomUUID()}`},${DEFAULT_PAPER_ACCOUNT_ID},${cash},${marketValue},${cash + marketValue},${realized},${unrealized},${marketValue},${Number(marking?.position_count ?? 0)},${toJsonb({ trigger: "pre_reset_archive" })}::jsonb)`;
      // Orders resting when the account is reset belong to the account life that
      // just ended. Leaving them open would let them fill into the new account and
      // would keep their cash reserved against a balance that no longer funds them.
      const resting =
        await tx`select id from paper_orders where status in('open','pending','partially_filled') for update`;
      for (const order of resting) {
        await tx`update paper_orders set status='cancelled',cancelled_at=now(),updated_at=now() where id=${order.id}`;
        await tx`insert into paper_order_events(id,order_id,event_type,status,detail) values(${`paper-event:${randomUUID()}`},${order.id},'cancelled','cancelled',${toJsonb({ reason: "account_reset", capitalExecutionEnabled: false })}::jsonb)`;
        await tx`update paper_trade_journal set outcome=outcome || ${toJsonb({ status: "cancelled", reason: "account_reset" })}::jsonb,updated_at=now() where order_id=${order.id}`;
      }
      await tx`update paper_positions set quantity=0,average_cost=0,updated_at=now() where account_id=${DEFAULT_PAPER_ACCOUNT_ID}`;
      await tx`update paper_accounts set cash=starting_capital,realized_pnl=0,updated_at=now() where id=${DEFAULT_PAPER_ACCOUNT_ID}`;
      await tx`insert into paper_account_snapshots(id,account_id,cash,market_value,equity,realized_pnl,unrealized_pnl,gross_exposure,position_count,metadata) values(${`paper-snapshot:${randomUUID()}`},${DEFAULT_PAPER_ACCOUNT_ID},${Number(account.starting_capital)},0,${Number(account.starting_capital)},0,0,0,0,${toJsonb({ trigger: "reset", capitalExecutionEnabled: false })}::jsonb)`;
      return {
        status: 200,
        body: {
          ok: true,
          status: "reset",
          startingCapital: Number(account.starting_capital),
          restingOrdersCancelled: resting.length,
          historyPreserved: true,
          capitalExecutionEnabled: false,
          brokerConnected: false,
        },
      };
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "paper_account_reset_failed",
        detail: error instanceof Error ? error.message : "unknown_error",
        capitalExecutionEnabled: false,
      },
      { status: 500 },
    );
  }
}
