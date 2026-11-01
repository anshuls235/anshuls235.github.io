import { MAX_BODY, allowedOrigins, validateEvent } from './validation.ts';
export interface AnalyticsConfig {url:string;serviceKey:string;origins:string}
export function createHandler(config:AnalyticsConfig,fetcher:typeof fetch=fetch) {
  const origins=allowedOrigins(config.origins);
  const url=new URL(config.url);
  if(!config.serviceKey || (url.protocol!=='https:' && !['127.0.0.1','localhost','kong'].includes(url.hostname)))throw new Error('Missing server configuration');
  return async(request:Request):Promise<Response>=>{
    const origin=request.headers.get('origin');
    if(!origin||!origins.has(origin))return new Response(null,{status:403,headers:{'Cache-Control':'no-store','Vary':'Origin'}});
    const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, DNT, Sec-GPC','Vary':'Origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    const result=(status:number)=>new Response(null,{status,headers});
    if(request.method==='OPTIONS')return result(204);
    if(request.method!=='POST')return result(405);
    if(request.headers.get('dnt')==='1'||request.headers.get('sec-gpc')==='1')return result(204);
    if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return result(415);
    const length=request.headers.get('content-length');
    if(length && (!/^\d+$/.test(length)||Number(length)>MAX_BODY))return result(413);
    let body='';
    try {
      const reader=request.body?.getReader();
      if(!reader)return result(400);
      let total=0;const decoder=new TextDecoder();
      // Timeout also covers a streaming client that never finishes sending its body.
      const deadline=AbortSignal.timeout(2000);
      const timedRead=()=>new Promise<ReadableStreamReadResult<Uint8Array>>((resolve,reject)=>{
        const abort=()=>reject(new Error('Body timed out'));
        if(deadline.aborted)return abort();
        deadline.addEventListener('abort',abort,{once:true});
        void reader.read().then(value=>{deadline.removeEventListener('abort',abort);resolve(value);},reject);
      });
      try {while(true){const {done,value}=await timedRead();if(done)break;total+=value.byteLength;if(total>MAX_BODY){void reader.cancel();return result(413);}body+=decoder.decode(value,{stream:true});}body+=decoder.decode();}
      catch{void reader.cancel();return result(400);}
      const event=validateEvent(JSON.parse(body));
      const response=await fetcher(`${url.origin}/rest/v1/rpc/ingest_analytics`,{
        method:'POST',headers:{'Content-Type':'application/json',apikey:config.serviceKey,Authorization:`Bearer ${config.serviceKey}`},
        body:JSON.stringify({p_event:event}),signal:AbortSignal.timeout(2500)
      });
      if(!response.ok)return result(response.status===400?400:503);
      const accepted=await response.json();
      return accepted===true?result(204):result(429);
    } catch(error) {return result(error instanceof SyntaxError || (error instanceof Error && /Invalid|Unexpected|required|Object/.test(error.message))?400:503);}
  };
}
