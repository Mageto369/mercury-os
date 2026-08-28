import { getRuntimeIntegration, resolveIntegrationToken } from '@/lib/admin/integration-runtime';

export type LlmProvider='openai'|'anthropic'|'gemini';
export type LlmRequest={prompt:string;system?:string;provider?:LlmProvider;maxOutputTokens?:number};
export type LlmResult={provider:LlmProvider;model:string;text:string;usage?:unknown;researchOnly:true;capitalExecutionEnabled:false};

const providers:LlmProvider[]=['openai','anthropic','gemini'];
const defaults={openai:'https://api.openai.com',anthropic:'https://api.anthropic.com',gemini:'https://generativelanguage.googleapis.com'} as const;

async function configured(provider:LlmProvider){const c=await getRuntimeIntegration(provider);return c?.enabled&&c.model?c:null}
export async function selectLlmProvider(preferred?:LlmProvider){if(preferred){const c=await configured(preferred);if(c)return {provider:preferred,config:c}}for(const p of providers){const c=await configured(p);if(c)return {provider:p,config:c}}return null}

async function fetchJson(url:string,init:RequestInit){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);try{const r=await fetch(url,{...init,signal:controller.signal,cache:'no-store',redirect:'error'});const text=await r.text();if(text.length>2_000_000)throw new Error('llm_response_too_large');let body:any={};try{body=text?JSON.parse(text):{}}catch{throw new Error('llm_invalid_json')}if(!r.ok)throw new Error(`llm_http_${r.status}:${String(body?.error?.message??body?.message??'provider_error').slice(0,300)}`);return body}finally{clearTimeout(timer)}}

export async function runLlm(request:LlmRequest):Promise<LlmResult>{
 const prompt=request.prompt.trim().slice(0,30000);if(!prompt)throw new Error('empty_prompt');const maxOutputTokens=Math.max(64,Math.min(4000,request.maxOutputTokens??1200));const chosen=await selectLlmProvider(request.provider);if(!chosen)throw new Error('no_enabled_llm_provider');const {provider,config}=chosen;const model=String(config.model);const base=(config.baseUrl||defaults[provider]).replace(/\/$/,'');
 if(provider==='openai'){
  const token=await resolveIntegrationToken('openai',['OPENAI_API_KEY'],'api_key');if(!token)throw new Error('openai_credential_missing');
  const body=await fetchJson(`${base}/v1/responses`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({model,input:[...(request.system?[{role:'system',content:request.system.slice(0,12000)}]:[]),{role:'user',content:prompt}],max_output_tokens:maxOutputTokens})});
  const text=String(body.output_text??(Array.isArray(body.output)?body.output.flatMap((o:any)=>o.content??[]).map((c:any)=>c.text??'').join(''):'')).trim();return {provider,model,text,usage:body.usage,researchOnly:true,capitalExecutionEnabled:false};
 }
 if(provider==='anthropic'){
  const token=await resolveIntegrationToken('anthropic',['ANTHROPIC_API_KEY'],'api_key');if(!token)throw new Error('anthropic_credential_missing');
  const body=await fetchJson(`${base}/v1/messages`,{method:'POST',headers:{'x-api-key':token,'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify({model,max_tokens:maxOutputTokens,system:request.system?.slice(0,12000),messages:[{role:'user',content:prompt}]})});
  const text=Array.isArray(body.content)?body.content.filter((x:any)=>x.type==='text').map((x:any)=>x.text).join('\n').trim():'';return {provider,model,text,usage:body.usage,researchOnly:true,capitalExecutionEnabled:false};
 }
 const token=await resolveIntegrationToken('gemini',['GEMINI_API_KEY','GOOGLE_API_KEY'],'api_key');if(!token)throw new Error('gemini_credential_missing');
 const body=await fetchJson(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(token)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({systemInstruction:request.system?{parts:[{text:request.system.slice(0,12000)}]}:undefined,contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{maxOutputTokens}})});
 const text=Array.isArray(body.candidates)?body.candidates.flatMap((c:any)=>c.content?.parts??[]).map((p:any)=>p.text??'').join('\n').trim():'';return {provider,model,text,usage:body.usageMetadata,researchOnly:true,capitalExecutionEnabled:false};
}
