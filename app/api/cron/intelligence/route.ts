import { NextResponse } from 'next/server';
import { runSupervisor } from '@/lib/agents/supervisor';
import { matureOpportunityOutcomes } from '@/lib/performance/outcomes';
import { refreshSourceReputation } from '@/lib/research/source-reputation';
import { buildShadowPortfolio } from '@/lib/portfolio/shadow-portfolio';
import { settleRestingOrders } from '@/lib/paper/order-engine';
import { pullAndPersistMarketData } from '@/lib/providers/market/router';
import { runOpenDataMesh } from '@/lib/providers/open-data/mesh';
import { runOpenIntelligenceSync } from '@/lib/integrations/open-intelligence-sync';
import { runDeepIntelligence } from '@/lib/intelligence/deep-intelligence';
import { buildEntityRelationshipGraph } from '@/lib/intelligence/entity-graph';
import { runSignalAttribution } from '@/lib/intelligence/signal-attribution';
import { requireBearerSecret } from '@/lib/security/request-auth';
import { getIngestionPolicies, recordIngestionResult, type IngestionPolicy } from '@/lib/admin/ingestion-runtime';
import type { IntelligenceJobName } from '@/lib/workflows/jobs';

export const runtime = 'nodejs';

type SafeResult={ok:false;reason:string}|Record<string,unknown>;
function statusOf(result:unknown):'success'|'degraded'{return result&&typeof result==='object'&&'ok' in result&&(result as {ok?:boolean}).ok===false?'degraded':'success'}
function reasonOf(result:unknown){return result&&typeof result==='object'&&'reason' in result?String((result as {reason?:unknown}).reason??'degraded'):null}
async function record(policy:IngestionPolicy|undefined,result:unknown){if(policy?.due)await recordIngestionResult(policy,statusOf(result),reasonOf(result))}

export async function GET(request: Request) {
  const access = requireBearerSecret(request, process.env.CRON_SECRET);
  if (!access.ok) return NextResponse.json({ ok: false, error: access.reason }, { status: access.status });

  const now=new Date();
  const ingestion=await getIngestionPolicies(now);
  const marketPolicy=ingestion['market-snapshots'];
  const openIntelDue=['sec-filings','share-structure','macro-series','corporate-actions'].some(key=>ingestion[key]?.due);
  const openDataDue=['sec-filings','corporate-actions'].some(key=>ingestion[key]?.due);

  let marketRefresh: SafeResult;
  let openDataRefresh: SafeResult;
  let openIntelligenceRefresh: SafeResult;
  let entityGraph: SafeResult;
  let deepIntelligence: SafeResult;

  if(marketPolicy?.due){try{marketRefresh=await pullAndPersistMarketData(marketPolicy.batchSize)}catch(error){marketRefresh={ok:false,reason:error instanceof Error?error.message:'market_refresh_failed'}}}else marketRefresh={ok:false,reason:marketPolicy?.enabled?'not_due':'disabled_by_ingestion_policy'};
  if(openDataDue){try{openDataRefresh=await runOpenDataMesh()}catch(error){openDataRefresh={ok:false,reason:error instanceof Error?error.message:'open_data_refresh_failed'}}}else openDataRefresh={ok:false,reason:'not_due_or_disabled_by_ingestion_policy'};
  if(openIntelDue){try{openIntelligenceRefresh=await runOpenIntelligenceSync()}catch(error){openIntelligenceRefresh={ok:false,reason:error instanceof Error?error.message:'open_intelligence_refresh_failed'}}}else openIntelligenceRefresh={ok:false,reason:'not_due_or_disabled_by_ingestion_policy'};

  await record(marketPolicy,marketRefresh);
  for(const key of ['sec-filings','corporate-actions'] as const)if(ingestion[key]?.due)await record(ingestion[key],openDataRefresh);
  for(const key of ['share-structure','macro-series'] as const)if(ingestion[key]?.due)await record(ingestion[key],openIntelligenceRefresh);

  const jobMap:Partial<Record<keyof typeof ingestion,IntelligenceJobName>>={
    'social-radar':'social-radar','sec-filings':'sec-filings','share-structure':'share-structure','corporate-actions':'finra-actions','research-proof':'model-learning',
  };
  const requestedJobs=Object.entries(jobMap).filter(([key])=>ingestion[key]?.due).map(([,job])=>job!).filter(Boolean);
  const result = await runSupervisor(now, requestedJobs, 'cron');
  for(const [key,job] of Object.entries(jobMap)){const policy=ingestion[key];if(!policy?.due||!job)continue;const assignment=result.assignments.find(a=>a.job===job);if(assignment)await recordIngestionResult(policy,assignment.status==='completed'?'success':assignment.status==='skipped'?'skipped':'degraded',assignment.status==='completed'?null:assignment.message)}

  try { entityGraph = await buildEntityRelationshipGraph(); } catch (error) { entityGraph = { ok:false, reason:error instanceof Error ? error.message : 'entity_graph_failed' }; }
  try { deepIntelligence = await runDeepIntelligence(); } catch (error) { deepIntelligence = { ok:false, reason:error instanceof Error ? error.message : 'deep_intelligence_failed' }; }

  let outcomeMaturation: Awaited<ReturnType<typeof matureOpportunityOutcomes>> | { ok:false; reason:string };
  let signalAttribution: Awaited<ReturnType<typeof runSignalAttribution>> | { ok:false; reason:string };
  let sourceReputation: Awaited<ReturnType<typeof refreshSourceReputation>> | { ok:false; reason:string };
  let shadowPortfolio: Awaited<ReturnType<typeof buildShadowPortfolio>> | { ok:false; reason:string };
  let restingOrders: Awaited<ReturnType<typeof settleRestingOrders>> | { ok:false; reason:string };
  try { outcomeMaturation = await matureOpportunityOutcomes(250); } catch (error) { outcomeMaturation = { ok:false, reason:error instanceof Error ? error.message : 'outcome_maturation_failed' }; }
  try { signalAttribution = await runSignalAttribution(); } catch (error) { signalAttribution = { ok:false, reason:error instanceof Error ? error.message : 'signal_attribution_failed' }; }
  try { sourceReputation = await refreshSourceReputation(); } catch (error) { sourceReputation = { ok:false, reason:error instanceof Error ? error.message : 'source_reputation_failed' }; }
  try { shadowPortfolio = await buildShadowPortfolio(); } catch (error) { shadowPortfolio = { ok:false, reason:error instanceof Error ? error.message : 'shadow_portfolio_failed' }; }
  // Resting orders are the other half of the paper lifecycle: without this pass
  // an open limit order can never fill and a day order never expires.
  try { restingOrders = await settleRestingOrders(now); } catch (error) { restingOrders = { ok:false, reason:error instanceof Error ? error.message : 'resting_order_settlement_failed' }; }

  return NextResponse.json({
    ok:true, mode:result.mode, autonomousExecution:false, capitalExecutionEnabled:false,
    supervisor:result.supervisor, startedAt:result.startedAt, completedAt:result.completedAt,
    dueJobs:result.dueJobs, completed:result.completed, degraded:result.degraded, skipped:result.skipped,
    persistedAudits:result.assignments.filter((assignment)=>assignment.persisted).length,
    escalations:result.escalations, ingestionPolicies:ingestion, marketRefresh, openDataRefresh, openIntelligenceRefresh, entityGraph, deepIntelligence,
    outcomeMaturation, signalAttribution, sourceReputation, shadowPortfolio, restingOrders,
    jobs:result.assignments,
  });
}
