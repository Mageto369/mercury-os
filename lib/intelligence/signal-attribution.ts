import { createHash } from 'node:crypto';
import { getSql } from '@/lib/db';
import { conditionalExpectancy, correlationDecayMinutes } from '@/lib/intelligence/signal-metrics';

const hid=(...parts:unknown[])=>createHash('sha256').update(parts.join(':')).digest('hex');
const num=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?n:0};
const optionalNum=(v:unknown)=>{if(v==null)return null;const n=Number(v);return Number.isFinite(n)?n:null};

export async function runSignalAttribution(){
  const sql=getSql();
  if(!sql)return{ok:false as const,reason:'database_not_configured' as const,shadowOnly:true,capitalExecutionEnabled:false};

  const rows=await sql<any[]>`SELECT so.signal_key,so.family,coalesce(sf.regime,'all') regime,count(*)::int observations,
    avg(oo.return_60m) average_return,
    avg(oo.return_60m) FILTER(WHERE oo.return_60m>0) average_win,
    avg(oo.return_60m) FILTER(WHERE oo.return_60m<=0) average_loss,
    count(*) FILTER(WHERE oo.return_60m>0)::int wins,
    count(*) FILTER(WHERE oo.return_60m<=0)::int losses,
    avg(CASE WHEN oo.return_60m>0 THEN 1.0 ELSE 0.0 END)*100 hit_rate,
    corr(so.normalized_score::numeric,oo.return_15m::numeric) correlation_15m,
    corr(so.normalized_score::numeric,oo.return_60m::numeric) correlation_60m,
    corr(so.normalized_score::numeric,oo.return_1d::numeric) correlation_1d
    FROM signal_observations so
    JOIN opportunity_outcomes oo ON oo.opportunity_id=so.opportunity_id AND oo.matured_60m=true AND oo.return_60m IS NOT NULL
    JOIN securities s ON s.id=so.security_id
    LEFT JOIN setup_fingerprints sf ON sf.opportunity_id=so.opportunity_id
    WHERE s.id NOT LIKE 'validation:%' AND so.opportunity_id IS NOT NULL
    GROUP BY so.signal_key,so.family,coalesce(sf.regime,'all')
    HAVING count(*)>=5`;

  let persisted=0;
  for(const r of rows){
    const observations=num(r.observations),avg=num(r.average_return),hit=num(r.hit_rate),wins=num(r.wins),losses=num(r.losses),averageWin=optionalNum(r.average_win),averageLoss=optionalNum(r.average_loss),corr15=optionalNum(r.correlation_15m),corr60=optionalNum(r.correlation_60m),corr1d=optionalNum(r.correlation_1d);
    const expectancy=conditionalExpectancy(averageWin,wins,averageLoss,losses);
    const decayMinutes=correlationDecayMinutes([{minutes:15,correlation:corr15},{minutes:60,correlation:corr60},{minutes:1440,correlation:corr1d}]);
    const status=observations>=50&&expectancy>0&&hit>=55?'candidate':observations>=20?'shadow':'insufficient';
    const result=await sql`INSERT INTO signal_performance(id,signal_key,family,regime,observations,hit_rate,average_return,marginal_expectancy,correlation_to_alpha,decay_minutes,status,metrics,evaluated_at)
      VALUES(${hid('signal',r.signal_key,r.regime)},${r.signal_key},${r.family},${r.regime},${observations},${hit},${avg},${expectancy},${corr60},${decayMinutes},${status},${sql.json({expectancyMethod:'conditional-win-loss-weighted',averageWin,averageLoss,wins,losses,decayMethod:'predictive-correlation-half-life',horizonCorrelations:{m15:corr15,m60:corr60,d1:corr1d},decayObservedThroughMinutes:1440,conditionalNotCausal:true,evidenceScope:'live',syntheticValidationExcluded:true,capitalExecutionEnabled:false})},now())
      ON CONFLICT(signal_key,regime) DO UPDATE SET family=EXCLUDED.family,observations=EXCLUDED.observations,hit_rate=EXCLUDED.hit_rate,average_return=EXCLUDED.average_return,marginal_expectancy=EXCLUDED.marginal_expectancy,correlation_to_alpha=EXCLUDED.correlation_to_alpha,decay_minutes=EXCLUDED.decay_minutes,status=EXCLUDED.status,metrics=EXCLUDED.metrics,evaluated_at=now() RETURNING id`;
    persisted+=result.length;
  }

  const [summary]=await sql<any[]>`SELECT count(*)::int signals,count(*) FILTER(WHERE status='candidate')::int candidates,count(*) FILTER(WHERE status='shadow')::int shadow FROM signal_performance`;
  return{ok:true as const,evaluated:rows.length,persisted,signals:Number(summary?.signals??0),candidates:Number(summary?.candidates??0),shadow:Number(summary?.shadow??0),evidenceScope:'live' as const,shadowOnly:true as const,capitalExecutionEnabled:false as const};
}

export async function getSignalAttributionStatus(){
  const sql=getSql();if(!sql)return{available:false as const,reason:'database_not_configured' as const,shadowOnly:true,capitalExecutionEnabled:false};
  const [x]=await sql<any[]>`SELECT count(*)::int signals,count(*) FILTER(WHERE status='candidate')::int candidates,count(*) FILTER(WHERE status='shadow')::int shadow,max(evaluated_at) evaluated_at FROM signal_performance`;
  return{available:true as const,...x,evidenceScope:'live' as const,shadowOnly:true as const,capitalExecutionEnabled:false as const};
}
