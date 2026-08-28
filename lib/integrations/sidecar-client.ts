export type SidecarResult<T> = {ok:true; data:T; latencyMs:number} | {ok:false; reason:string; latencyMs:number};

const MAX_RESPONSE_BYTES = Number(process.env.SIDECAR_MAX_RESPONSE_BYTES ?? 2_000_000);

function validateBaseUrl(baseUrl: string) {
  try {
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return { ok: false as const, reason: 'sidecar_protocol_not_allowed' };
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') return { ok: false as const, reason: 'sidecar_https_required' };
    if (url.username || url.password) return { ok: false as const, reason: 'sidecar_url_credentials_not_allowed' };
    return { ok: true as const, url };
  } catch { return { ok: false as const, reason: 'sidecar_url_invalid' }; }
}

export async function callSidecar<T>(baseUrl:string|undefined|null, path:string, init?:RequestInit, authToken?:string|null):Promise<SidecarResult<T>> {
  if (!baseUrl) return {ok:false, reason:'sidecar_not_configured', latencyMs:0};
  const validated = validateBaseUrl(baseUrl);
  if (!validated.ok) return { ok:false, reason:validated.reason, latencyMs:0 };
  if (!path.startsWith('/')) return {ok:false, reason:'sidecar_path_invalid', latencyMs:0};

  const started=Date.now();
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(), Number(process.env.RESEARCH_SIDECAR_TIMEOUT_MS ?? 15000));
  const token = authToken ?? process.env.MERCURY_SIDECAR_TOKEN;
  const headers = new Headers(init?.headers);
  headers.set('accept', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);

  try {
    const response=await fetch(`${validated.url.toString().replace(/\/$/,'')}${path}`, {...init,headers,signal:controller.signal,cache:'no-store',redirect:'error'});
    if(!response.ok) return {ok:false, reason:`http_${response.status}`, latencyMs:Date.now()-started};
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_RESPONSE_BYTES) return {ok:false, reason:'sidecar_response_too_large', latencyMs:Date.now()-started};
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) return {ok:false, reason:'sidecar_response_too_large', latencyMs:Date.now()-started};
    try { return {ok:true, data:JSON.parse(text) as T, latencyMs:Date.now()-started}; }
    catch { return {ok:false, reason:'sidecar_invalid_json', latencyMs:Date.now()-started}; }
  } catch(error) {
    return {ok:false, reason:error instanceof Error ? error.message : 'sidecar_failed', latencyMs:Date.now()-started};
  } finally { clearTimeout(timeout); }
}
