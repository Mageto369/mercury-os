import { NextResponse } from "next/server";
import { z } from "zod";
import { routeOperationalAlert } from "@/lib/alerts/router";
import { getSql } from "@/lib/db";
import { submitPaperOrder } from "@/lib/paper/submit-order";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OrderSchema = z
  .object({
    symbol: z
      .string()
      .trim()
      .min(1)
      .max(16)
      .transform((v) => v.toUpperCase()),
    side: z.enum(["buy", "sell"]),
    quantity: z.number().positive().max(10_000_000),
    orderType: z.enum(["market", "limit"]).default("market"),
    limitPrice: z.number().positive().optional(),
    timeInForce: z.enum(["day", "gtc"]).default("day"),
    pricingMode: z.enum(["auto", "live", "reference"]).default("auto"),
    thesis: z.string().max(4000).optional(),
    catalyst: z.string().max(2000).optional(),
    riskNotes: z.string().max(2000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.orderType === "limit" && value.limitPrice == null)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["limitPrice"],
        message: "Limit price required",
      });
  });

const IdempotencyKeySchema = z.string().regex(/^[A-Za-z0-9._:-]{16,128}$/);

export async function POST(request: Request) {
  const parsed = OrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, error: "invalid_order", issues: parsed.error.flatten() },
      { status: 400 },
    );
  const input = parsed.data;
  const parsedIdempotencyKey = IdempotencyKeySchema.safeParse(
    request.headers.get("idempotency-key"),
  );
  if (!parsedIdempotencyKey.success)
    return NextResponse.json(
      { ok: false, error: "valid_idempotency_key_required" },
      { status: 400 },
    );

  const sql = getSql();
  if (!sql)
    return NextResponse.json(
      { ok: false, error: "database_not_configured" },
      { status: 503 },
    );

  try {
    const result = await submitPaperOrder({
      ...input,
      idempotencyKey: parsedIdempotencyKey.data,
    });
    if ("orderId" in result.body && !("idempotentReplay" in result.body)) {
      await routeOperationalAlert({
        eventKey: `paper:${String(result.body.orderId)}:${String(result.body.status ?? result.body.error ?? "unknown")}`,
        category: "paper",
        severity: "high",
        title: `${input.symbol} paper order ${String(result.body.status ?? "rejected")}`,
        message: `${input.side} ${input.quantity} ${input.symbol} remained simulation-only.`,
        payload: {
          orderId: result.body.orderId,
          symbol: input.symbol,
          side: input.side,
          quantity: input.quantity,
          status: result.body.status ?? "rejected",
          error: result.body.error,
          capitalExecutionEnabled: false,
        },
      });
    }
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "paper_order_failed",
        detail: error instanceof Error ? error.message : "unknown_error",
        capitalExecutionEnabled: false,
      },
      { status: 500 },
    );
  }
}
