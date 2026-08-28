export type SidecarResult<T> = {ok:true; data:T; latencyMs:number} | {ok:false; reason:string; latencyMs:number};

export async function callSidecar<T>(baseUrl:string|undefined, path:string, init?:RequestInit):Promise<SidecarResult<T>> {
  if (!baseUrl) return {ok:false, reason:'sidecar_not_configured', latencyMs:0};
  const started=Date.now();
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(), Number(process.env.RESEARCH_SIDECAR_TIMEOUT_MS ?? 15000));
  try {
    const response=await fetch(`${baseUrl.replace(/\/$/,'')}${path}`, {...init, signal:controller.signal, cache:'no-store'});
    if(!response.ok) return {ok:false, reason:`http_${response.status}`, latencyMs:Date.now()-started};
    return {ok:true, data:await response.json() as T, latencyMs:Date.now()-started};
  } catch(error) {
    return {ok:false, reason:error instanceof Error ? error.message : 'sidecar_failed', latencyMs:Date.now()-started};
  } finally { clearTimeout(timeout); }
}
