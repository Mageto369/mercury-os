import { createHash } from 'node:crypto';
import { getSql } from '@/lib/db';
import { bootstrapDeepIntelligence } from '@/lib/db/bootstrap-deep-intelligence';
import { toJsonb } from '@/lib/db/json';

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));
const id = (...parts: unknown[]) => createHash('sha256').update(parts.join(':')).digest('hex');

export async function runDeepIntelligence() {
  const sql = getSql();
  if (!sql) return { ok: false as const, reason: 'database_not_configured' as const, shadowOnly: true, capitalExecutionEnabled: false };
  await bootstrapDeepIntelligence();

  const structures = await sql<any[]>`SELECT s.id security_id, s.symbol, ss.authorized_shares, ss.outstanding_shares, ss.float_shares, ss.verified, ss.source, ss.observed_at,
    COALESCE((SELECT SUM(COALESCE(fe.shares,0)) FROM financing_events fe WHERE fe.security_id=s.id AND fe.observed_at > now()-interval '365 days'),0) reserved,
    COALESCE((SELECT COUNT(*) FROM financing_events fe WHERE fe.security_id=s.id AND fe.observed_at > now()-interval '365 days'),0) financing_count
    FROM securities s LEFT JOIN LATERAL (SELECT * FROM share_structures x WHERE x.security_id=s.id ORDER BY x.observed_at DESC LIMIT 1) ss ON true
    WHERE s.active=true AND s.id NOT LIKE 'validation:%' LIMIT 1500`;
  let structureRows = 0;
  for (const r of structures) {
    const outstanding=n(r.outstanding_shares), float=n(r.float_shares), authorized=n(r.authorized_shares), reserved=n(r.reserved);
    const effectiveFloat=float || outstanding || null;
    const overhang=outstanding>0 ? (reserved/outstanding)*100 : 0;
    const headroom=outstanding>0 && authorized>outstanding ? ((authorized-outstanding)/outstanding)*100 : 0;
    const risk=clamp(Math.min(55,overhang*1.6)+Math.min(25,headroom*.25)+Math.min(20,n(r.financing_count)*5));
    const confidence=clamp((r.verified?55:25)+(float>0?20:0)+(outstanding>0?15:0)+(authorized>0?10:0));
    const riskFactors=[overhang>20?'financing-overhang':null,headroom>100?'authorized-headroom':null,n(r.financing_count)>=3?'repeat-financing':null].filter(Boolean);
    await sql`INSERT INTO structure_intelligence (id,security_id,effective_float,outstanding_shares,authorized_shares,reserved_dilution_shares,dilution_overhang_pct,dilution_risk,float_confidence,risk_factors,evidence,observed_at)
      VALUES (${id('structure',r.security_id,r.observed_at)},${r.security_id},${effectiveFloat},${outstanding||null},${authorized||null},${reserved||0},${overhang},${risk},${confidence},${toJsonb(riskFactors)}::jsonb,${toJsonb({source:r.source,verified:r.verified,financingEvents:n(r.financing_count),method:'conservative-structure-v1'})}::jsonb,now()) ON CONFLICT (id) DO NOTHING`;
    structureRows++;
  }

  const ownership = await sql<any[]>`SELECT s.id security_id,s.symbol,
    COALESCE(SUM(CASE WHEN it.transaction_code='P' THEN COALESCE(it.shares,0) ELSE 0 END),0) buys,
    COALESCE(SUM(CASE WHEN it.transaction_code='S' THEN COALESCE(it.shares,0) ELSE 0 END),0) sells,
    COALESCE(SUM(CASE WHEN it.transaction_code='P' THEN COALESCE(it.shares,0)*COALESCE(it.price,0) ELSE 0 END),0) buy_value,
    COALESCE(SUM(CASE WHEN it.transaction_code='S' THEN COALESCE(it.shares,0)*COALESCE(it.price,0) ELSE 0 END),0) sell_value,
    COALESCE((SELECT SUM(COALESCE(ih.shares,0)) FROM institutional_holdings ih WHERE ih.security_id=s.id AND ih.report_date>current_date-interval '180 days'),0) institutional
    FROM securities s LEFT JOIN insider_transactions it ON it.security_id=s.id AND it.transaction_date>current_date-interval '180 days'
    WHERE s.active=true AND s.id NOT LIKE 'validation:%' GROUP BY s.id,s.symbol LIMIT 1500`;
  let ownershipRows=0;
  for (const r of ownership) {
    const buys=n(r.buys), sells=n(r.sells), buyValue=n(r.buy_value), sellValue=n(r.sell_value), inst=n(r.institutional);
    const total=buyValue+sellValue; const alignment=clamp(50+(total>0?((buyValue-sellValue)/total)*35:0)+(inst>0?10:0));
    const confidence=clamp((total>0?55:15)+(inst>0?25:0));
    await sql`INSERT INTO ownership_intelligence (id,security_id,insider_net_shares,insider_buy_value,insider_sell_value,institutional_shares,ownership_alignment_score,confidence,evidence,observed_at)
      VALUES (${id('ownership',r.security_id,new Date().toISOString().slice(0,10))},${r.security_id},${buys-sells},${buyValue},${sellValue},${inst},${alignment},${confidence},${toJsonb({windowDays:180,method:'ownership-alignment-v1'})}::jsonb,now()) ON CONFLICT (id) DO UPDATE SET insider_net_shares=EXCLUDED.insider_net_shares,insider_buy_value=EXCLUDED.insider_buy_value,insider_sell_value=EXCLUDED.insider_sell_value,institutional_shares=EXCLUDED.institutional_shares,ownership_alignment_score=EXCLUDED.ownership_alignment_score,confidence=EXCLUDED.confidence,evidence=EXCLUDED.evidence,observed_at=now()`;
    ownershipRows++;
  }

  const catalysts=await sql<any[]>`SELECT f.security_id,f.id source_event_id,f.form,f.filed_at observed_at,'sec-filing' source FROM filings f JOIN securities s ON s.id=f.security_id WHERE f.filed_at>now()-interval '30 days' AND s.id NOT LIKE 'validation:%'
    UNION ALL SELECT ca.security_id,ca.id,ca.type,ca.observed_at,'corporate-action' FROM corporate_actions ca JOIN securities s ON s.id=ca.security_id WHERE ca.observed_at>now()-interval '30 days' AND s.id NOT LIKE 'validation:%' LIMIT 3000`;
  let catalystRows=0;
  for (const r of catalysts) {
    const form=String(r.form||'').toUpperCase();
    const materiality=form==='8-K'?78:/S-1|S-3|424B/.test(form)?85:/10-Q|10-K/.test(form)?65:55;
    const halfLife=/8-K/.test(form)?1440:/S-1|S-3|424B/.test(form)?4320:2880;
    await sql`INSERT INTO catalyst_intelligence (id,security_id,catalyst_type,materiality,novelty,credibility,half_life_minutes,source_event_id,source,evidence,observed_at) VALUES (${id('catalyst',r.source,r.source_event_id)},${r.security_id},${form},${materiality},65,${r.source==='sec-filing'?95:80},${halfLife},${r.source_event_id},${r.source},${toJsonb({method:'catalyst-materiality-v1'})}::jsonb,${r.observed_at}) ON CONFLICT (id) DO NOTHING`;
    catalystRows++;
  }

  const opps=await sql<any[]>`SELECT o.id opportunity_id,o.security_id,o.state,o.alpha,o.wave,o.social,o.liquidity,o.trap_risk,o.peak_risk,o.observed_at,
    COALESCE((SELECT dilution_risk FROM structure_intelligence si WHERE si.security_id=o.security_id ORDER BY observed_at DESC LIMIT 1),0) structural,
    COALESCE((SELECT ownership_alignment_score FROM ownership_intelligence oi WHERE oi.security_id=o.security_id ORDER BY observed_at DESC LIMIT 1),50) ownership
    FROM opportunities o JOIN securities s ON s.id=o.security_id WHERE s.id NOT LIKE 'validation:%' ORDER BY o.observed_at DESC LIMIT 1000`;
  let dynamicsRows=0;
  for (const r of opps) {
    const crowding=clamp(n(r.wave)*.45+n(r.social)*.35+n(r.trap_risk)*.2);
    const liquidityDecay=clamp(100-n(r.liquidity));
    const peak=clamp(n(r.peak_risk)*.45+crowding*.3+liquidityDecay*.15+n(r.structural)*.1);
    const base=String(r.state)==='ACCELERATION'?120:String(r.state)==='BREAKOUT'?240:String(r.state)==='EUPHORIA'?45:360;
    const halfLife=Math.max(15,Math.round(base*(1-peak/140)));
    await sql`INSERT INTO opportunity_dynamics (id,opportunity_id,security_id,half_life_minutes,peak_probability,crowding_score,liquidity_decay_score,structural_risk_score,ownership_alignment_score,evidence,computed_at) VALUES (${id('dynamics',r.opportunity_id)},${r.opportunity_id},${r.security_id},${halfLife},${peak},${crowding},${liquidityDecay},${n(r.structural)},${n(r.ownership)},${toJsonb({method:'opportunity-dynamics-v1',capitalExecutionEnabled:false})}::jsonb,now()) ON CONFLICT (opportunity_id) DO UPDATE SET half_life_minutes=EXCLUDED.half_life_minutes,peak_probability=EXCLUDED.peak_probability,crowding_score=EXCLUDED.crowding_score,liquidity_decay_score=EXCLUDED.liquidity_decay_score,structural_risk_score=EXCLUDED.structural_risk_score,ownership_alignment_score=EXCLUDED.ownership_alignment_score,evidence=EXCLUDED.evidence,computed_at=now()`;
    dynamicsRows++;
  }
  return {ok:true as const,structureRows,ownershipRows,catalystRows,dynamicsRows,shadowOnly:true,capitalExecutionEnabled:false};
}

export async function getDeepIntelligenceStatus() {
  const sql=getSql(); if(!sql) return {available:false,reason:'database_not_configured',shadowOnly:true,capitalExecutionEnabled:false};
  await bootstrapDeepIntelligence();
  const [x]=await sql<any[]>`SELECT (SELECT count(*)::int FROM structure_intelligence) structures,(SELECT count(*)::int FROM ownership_intelligence) ownership,(SELECT count(*)::int FROM catalyst_intelligence) catalysts,(SELECT count(*)::int FROM opportunity_dynamics) dynamics`;
  return {available:true,...x,shadowOnly:true,capitalExecutionEnabled:false};
}
