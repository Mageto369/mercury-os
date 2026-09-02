import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { runLlm } from "@/lib/llm/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const Schema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(16)
    .transform((v) => v.toUpperCase()),
  question: z.string().trim().min(1).max(8000),
  mode: z.enum(["copilot", "debate", "agent-room"]).default("copilot"),
  provider: z.enum(["openai", "anthropic", "gemini", "deepseek", "kimi"]).optional(),
});

type LlmRun = Awaited<ReturnType<typeof runLlm>>;

export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_research_request",
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  const sql = getSql();
  if (!sql)
    return NextResponse.json(
      { ok: false, error: "database_not_configured" },
      { status: 503 },
    );
  try {
    const [security] =
      await sql`select id,symbol,name,market,cik from securities where upper(symbol)=${parsed.data.symbol} and active=true and id not like 'validation:%' limit 1`;
    if (!security)
      return NextResponse.json(
        { ok: false, error: "security_not_found" },
        { status: 404 },
      );
    const [opportunity] =
      await sql`select state,alpha,gem,wave,asymmetry,catalyst,social,liquidity,trap_risk,peak_risk,confidence,action,hard_blocked,reasons,observed_at from opportunities where security_id=${security.id} order by observed_at desc limit 1`;
    const [market] =
      await sql`select price,dollar_volume,spread_bps,rvol,float_rotation,observed_at from market_snapshots where security_id=${security.id} order by observed_at desc limit 1`;
    const [structure] =
      await sql`select effective_float,outstanding_shares,authorized_shares,reserved_dilution_shares,dilution_overhang_pct,dilution_risk,float_confidence,risk_factors from structure_intelligence where security_id=${security.id} order by observed_at desc limit 1`;
    const [ownership] =
      await sql`select insider_net_shares,insider_buy_value,insider_sell_value,institutional_shares,ownership_alignment_score,confidence from ownership_intelligence where security_id=${security.id} order by observed_at desc limit 1`;
    const filings =
      await sql`select form,filed_at,accession_number from filings where security_id=${security.id} order by filed_at desc limit 10`;
    const catalysts =
      await sql`select catalyst_type,materiality,novelty,credibility,half_life_minutes,source,observed_at from catalyst_intelligence where security_id=${security.id} order by observed_at desc limit 10`;
    const context = JSON.stringify({
      security,
      opportunity: opportunity ?? null,
      market: market ?? null,
      structure: structure ?? null,
      ownership: ownership ?? null,
      filings,
      catalysts,
    });
    const system =
      "You are a research-only microcap analyst inside Mercury OS. Use only the supplied evidence. Separate facts from inference, surface uncertainty, dilution/liquidity/trap risks, and never recommend or authorize real-money execution. Do not claim profitability or certainty.";
    const base = `Ticker evidence:\n${context}\n\nOperator question: ${parsed.data.question}`;
    if (parsed.data.mode === "copilot") {
      const result = await runLlm({
        provider: parsed.data.provider,
        prompt: base,
        system,
        maxOutputTokens: 1800,
      });
      return NextResponse.json({
        ok: true,
        mode: "copilot",
        ...result,
        evidenceScope: "live-only",
      });
    }
    if (parsed.data.mode === "debate") {
      const bull = await runLlm({
        provider: parsed.data.provider,
        prompt: `${base}\n\nAct as the BULL analyst. Build the strongest evidence-grounded case and list what would falsify it.`,
        system,
        maxOutputTokens: 1200,
      });
      const bear = await runLlm({
        provider: parsed.data.provider,
        prompt: `${base}\n\nAct as the BEAR analyst. Build the strongest evidence-grounded risk case and list what would falsify it.`,
        system,
        maxOutputTokens: 1200,
      });
      const synthesis = await runLlm({
        provider: parsed.data.provider,
        prompt: `Evidence:${context}\nBull case:${bull.text}\nBear case:${bear.text}\nQuestion:${parsed.data.question}\nSynthesize disagreements, unknowns, and what evidence is needed next. No real-money recommendation.`,
        system,
        maxOutputTokens: 1400,
      });
      return NextResponse.json({
        ok: true,
        mode: "debate",
        bull,
        bear,
        synthesis,
        researchOnly: true,
        capitalExecutionEnabled: false,
      });
    }
    const roles = [
      "filings-specialist",
      "market-structure-specialist",
      "risk-specialist",
    ] as const;
    const analyses: LlmRun[] = [];
    for (const role of roles) {
      analyses.push(
        await runLlm({
          provider: parsed.data.provider,
          prompt: `${base}\n\nRole: ${role}. Analyze only your domain. Return key facts, concerns, unknowns, and confidence.`,
          system,
          maxOutputTokens: 900,
        }),
      );
    }
    const supervisor = await runLlm({
      provider: parsed.data.provider,
      prompt: `Evidence:${context}\nSpecialist analyses:${JSON.stringify(analyses.map((a, i) => ({ role: roles[i], text: a.text })))}\nQuestion:${parsed.data.question}\nAs Supervisor, synthesize consensus, disagreement, missing evidence and research priority.`,
      system,
      maxOutputTokens: 1400,
    });
    return NextResponse.json({
      ok: true,
      mode: "agent-room",
      roles: roles.map((role, i) => ({ role, ...analyses[i] })),
      supervisor,
      researchOnly: true,
      capitalExecutionEnabled: false,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "research_copilot_failed",
        detail: error instanceof Error ? error.message : "unknown_error",
        capitalExecutionEnabled: false,
      },
      { status: 500 },
    );
  }
}
