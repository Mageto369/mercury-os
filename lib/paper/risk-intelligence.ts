import { simulateExecution } from '@/lib/execution/simulator';

export type RiskSizingInput={equity:number;cash:number;price:number;dollarVolume:number;spreadBps:number;rvol:number;floatRotation:number;conviction:number;currentDrawdownPct:number;maxPositionPct?:number;maxRiskPerTradePct?:number};

export function buildRiskSizing(input:RiskSizingInput){
 const equity=Math.max(0,input.equity),price=Math.max(.000001,input.price),conviction=Math.max(0,Math.min(100,input.conviction));
 const drawdownPenalty=input.currentDrawdownPct<=-15?.35:input.currentDrawdownPct<=-10?.5:input.currentDrawdownPct<=-5?.75:1;
 const convictionFactor=.25+.75*(conviction/100);
 const maxPositionPct=Math.max(.005,Math.min(.25,input.maxPositionPct??.05));
 const riskPerTradePct=Math.max(.001,Math.min(.05,input.maxRiskPerTradePct??.01));
 const volatility=Math.max(1,Math.min(100,input.rvol*8+input.floatRotation*12));
 const stopDistancePct=Math.max(.025,Math.min(.25,.025+volatility/500+input.spreadBps/10000));
 const riskBudget=equity*riskPerTradePct*drawdownPenalty*convictionFactor;
 const riskSizedNotional=riskBudget/stopDistancePct;
 const concentrationCap=equity*maxPositionPct*drawdownPenalty;
 const cashCap=Math.max(0,input.cash*.95);
 const preliminary=Math.min(riskSizedNotional,concentrationCap,cashCap);
 const execution=simulateExecution({notional:preliminary,price,dollarVolume:input.dollarVolume,spreadBps:input.spreadBps,rvol:input.rvol,floatRotation:input.floatRotation});
 const recommendedNotional=Math.max(0,Math.min(preliminary,execution.estimatedCapacityNotional));
 const quantity=Math.floor(recommendedNotional/price);
 const gapRiskScore=Math.min(100,volatility*.55+Math.min(100,input.spreadBps/2)*.25+Math.min(100,input.rvol*10)*.2);
 const gapRisk=gapRiskScore>=75?'extreme':gapRiskScore>=55?'high':gapRiskScore>=30?'moderate':'low';
 return {recommendedNotional:Number(recommendedNotional.toFixed(2)),recommendedQuantity:quantity,riskBudget:Number(riskBudget.toFixed(2)),stopDistancePct:Number((stopDistancePct*100).toFixed(2)),stopPriceLong:Number((price*(1-stopDistancePct)).toFixed(6)),drawdownMultiplier:drawdownPenalty,convictionMultiplier:Number(convictionFactor.toFixed(3)),liquidityCapacity:execution.estimatedCapacityNotional,fillProbabilityPct:execution.estimatedFillProbabilityPct,estimatedRoundTripCostPct:execution.estimatedRoundTripCostPct,gapRisk,gapRiskScore:Number(gapRiskScore.toFixed(2)),capacityExceeded:execution.capacityExceeded,capitalExecutionEnabled:false};
}

export function portfolioRiskSummary(equity:number,positions:Array<{symbol:string;marketValue:number;unrealizedPnl:number}>,currentDrawdownPct:number){
 const gross=positions.reduce((s,p)=>s+Math.abs(p.marketValue),0);
 const weights=positions.map(p=>({symbol:p.symbol,weightPct:equity>0?p.marketValue/equity*100:0,marketValue:p.marketValue,unrealizedPnl:p.unrealizedPnl})).sort((a,b)=>b.weightPct-a.weightPct);
 const topWeight=weights[0]?.weightPct??0;
 const concentration=topWeight>=20?'extreme':topWeight>=12?'high':topWeight>=7?'moderate':'low';
 const governor=currentDrawdownPct<=-15?'minimum':currentDrawdownPct<=-10?'defensive':currentDrawdownPct<=-5?'reduced':'normal';
 return {grossExposure:gross,grossExposurePct:equity>0?gross/equity*100:0,topPositionWeightPct:topWeight,concentrationRisk:concentration,drawdownGovernor:governor,positionWeights:weights,capitalExecutionEnabled:false};
}
