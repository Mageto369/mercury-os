'use client';
import { useRef, useState } from 'react';
import { Send, ShieldCheck } from 'lucide-react';
import styles from './paper-order-ticket.module.css';

type Quote={pricingMode:'live'|'reference'|null;source:string|null;observedAt:string|null;ageMinutes:number|null;reason:string|null};
type Assumptions={spreadSource:'observed'|'assumed';rvolSource:'observed'|'assumed'};
type Simulation={estimatedOneWayCostBps:number;estimatedFillProbabilityPct:number;estimatedCapacityNotional:number;capacityExceeded:boolean;discontinuityRisk:string;quote?:Quote;assumptions?:Assumptions};

function costBasisLabel(assumptions?:Assumptions){
  if(!assumptions)return '—';
  const missing=[assumptions.spreadSource==='assumed'?'spread':null,assumptions.rvolSource==='assumed'?'relative volume':null].filter((part):part is string=>part!=null);
  return missing.length?`Assumed ${missing.join(' and ')}`:'Observed quote';
}
type Result={ok:boolean;error?:string;orderId?:string;fillPrice?:number;quote?:Quote;simulation?:Simulation};

export function PaperOrderTicket({onComplete}:{onComplete:()=>Promise<void>}) {
  const [symbol,setSymbol]=useState('');
  const [side,setSide]=useState<'buy'|'sell'>('buy');
  const [quantity,setQuantity]=useState(100);
  const [orderType,setOrderType]=useState<'market'|'limit'>('market');
  const [pricingMode,setPricingMode]=useState<'auto'|'live'|'reference'>('auto');
  const [limitPrice,setLimitPrice]=useState('');
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState<Result|null>(null);
  const retryKey=useRef<string|null>(null);

  async function submit(e:React.FormEvent) {
    e.preventDefault(); setBusy(true); setResult(null);
    const idempotencyKey=retryKey.current??crypto.randomUUID(); retryKey.current=idempotencyKey;
    try {
      const r=await fetch('/api/paper/orders',{method:'POST',headers:{'content-type':'application/json','idempotency-key':idempotencyKey},body:JSON.stringify({symbol,side,quantity:Number(quantity),orderType,pricingMode,limitPrice:orderType==='limit'?Number(limitPrice):undefined})});
      retryKey.current=null;
      const body=await r.json().catch(()=>({})); setResult(body);
      if(r.ok){setSymbol('');await onComplete()}
    } catch(e) { setResult({ok:false,error:e instanceof Error?e.message:'paper_order_failed'}); }
    finally { setBusy(false); }
  }

  const quote=result?.simulation?.quote??result?.quote;
  return <div className={styles.grid}>
    <form className={`surface paper-panel ${styles.ticket}`} onSubmit={submit}>
      <div className="section-head"><div><h2>Paper Order Ticket</h2><p>Live-preferred simulation with explicit quote provenance.</p></div><ShieldCheck size={17}/></div>
      <div className={styles.formGrid}>
        <label>Symbol<input value={symbol} onChange={e=>setSymbol(e.target.value.toUpperCase())} placeholder="Ticker" maxLength={16} required/></label>
        <label>Side<select value={side} onChange={e=>setSide(e.target.value as 'buy'|'sell')}><option value="buy">Buy</option><option value="sell">Sell</option></select></label>
        <label>Quantity<input type="number" min="0.000001" step="any" value={quantity} onChange={e=>setQuantity(Number(e.target.value))} required/></label>
        <label>Order type<select value={orderType} onChange={e=>setOrderType(e.target.value as 'market'|'limit')}><option value="market">Market simulation</option><option value="limit">Limit simulation</option></select></label>
        <label className={styles.wide}>Pricing feed<select value={pricingMode} onChange={e=>setPricingMode(e.target.value as 'auto'|'live'|'reference')}><option value="auto">Auto: live preferred, reference fallback</option><option value="live">Live quotes only (max 5 minutes)</option><option value="reference">Delayed reference only (max 7 days)</option></select></label>
        {orderType==='limit'&&<label className={styles.wide}>Limit price<input type="number" min="0.000001" step="any" value={limitPrice} onChange={e=>setLimitPrice(e.target.value)} required/></label>}
      </div>
      <div className={styles.boundary}><b>NO BROKER ROUTING</b><span>Live-only rejects delayed or stale quotes. Auto fallback is always labeled as reference data.</span></div>
      <button className="pulse-button" disabled={busy}><Send size={14}/>{busy?'Simulating…':'Submit Paper Order'}</button>
    </form>
    <section className="surface paper-panel">
      <div className="section-head"><div><h2>Simulation Result</h2><p>Fill, liquidity and quote evidence.</p></div></div>
      {!result?<div className={styles.resultEmpty}><b>Ready for simulation</b><span>Submit a paper order to see fill price, slippage, capacity and quote provenance.</span></div>
      :result.ok?<div className="paper-facts"><div><span>Order</span><b>{result.orderId}</b></div><div><span>Simulated fill</span><b>${Number(result.fillPrice??0).toFixed(4)}</b></div><div><span>Pricing feed</span><b>{quote?.pricingMode?.toUpperCase()??'—'}</b></div><div><span>Quote source</span><b>{quote?.source??'—'}</b></div><div><span>Quote age</span><b>{quote?.ageMinutes==null?'—':`${quote.ageMinutes.toFixed(1)} min`}</b></div><div><span>Slippage</span><b>{result.simulation?.estimatedOneWayCostBps?.toFixed(2)??'—'} bps</b></div><div><span>Cost basis</span><b>{costBasisLabel(result.simulation?.assumptions)}</b></div><div><span>Fill probability</span><b>{result.simulation?.estimatedFillProbabilityPct?.toFixed(1)??'—'}%</b></div><div><span>Capacity</span><b>${Number(result.simulation?.estimatedCapacityNotional??0).toLocaleString()}</b></div><div><span>Discontinuity</span><b>{result.simulation?.discontinuityRisk??'—'}</b></div></div>
      :<div className={styles.resultEmpty}><b className="danger">Order rejected</b><span>{(result.error??'unknown_error').replaceAll('_',' ')}</span>{quote&&<small>{quote.source??'unknown source'} · {quote.ageMinutes==null?'unknown age':`${quote.ageMinutes.toFixed(1)} minutes old`}</small>}{result.simulation&&<small>Estimated capacity ${Number(result.simulation.estimatedCapacityNotional??0).toLocaleString()} · discontinuity {result.simulation.discontinuityRisk}</small>}</div>}
    </section>
  </div>;
}
