export const MAX_BODY = 2048;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const path=/^\/([a-zA-Z0-9_-]+\/)*([a-zA-Z0-9_.-]+)?(#work\/[a-z0-9-]+)?$/;
const events=['page_view','project_view','project_link','cv_download','contact_action','social_click'] as const;
export interface AnalyticsEvent {event_id:string;session_id:string;event:typeof events[number];path:string;project_id?:string;link_id?:string;platform?:string;referrer?:string;utm?:Record<string,string>}
export function validateEvent(input:unknown):AnalyticsEvent {
  if(!input || typeof input!=='object' || Array.isArray(input))throw new Error('Object required');
  const e=input as Record<string,unknown>;
  if(Object.keys(e).some(key=>!['event_id','session_id','event','path','project_id','link_id','platform','referrer','utm'].includes(key)))throw new Error('Unexpected field');
  if(typeof e.event_id!=='string'||!uuid.test(e.event_id)||typeof e.session_id!=='string'||!uuid.test(e.session_id))throw new Error('Invalid ID');
  if(!events.includes(e.event as AnalyticsEvent['event']))throw new Error('Invalid event');
  if(typeof e.path!=='string'||e.path.length>200||!path.test(e.path)||e.path.includes('..'))throw new Error('Invalid path');
  for(const key of ['project_id','link_id']) if(key in e && (typeof e[key]!=='string'||!uuid.test(e[key] as string)))throw new Error('Invalid reference');
  if(['project_view','project_link'].includes(e.event as string) && !e.project_id)throw new Error('Project required');
  if(e.event==='project_link' && !e.link_id)throw new Error('Link required');
  if(e.event!=='project_link' && e.link_id)throw new Error('Unexpected link');
  if(!['project_view','project_link'].includes(e.event as string) && e.project_id)throw new Error('Unexpected project');
  if('platform' in e && (typeof e.platform!=='string'||!['github','linkedin','medium','kaggle','website','demo','article','notebook','case-study','other'].includes(e.platform)))throw new Error('Invalid platform');
  if('referrer' in e && (typeof e.referrer!=='string'||e.referrer.length>253||!e.referrer.includes('.')||!/^[a-z0-9]+([a-z0-9.-]*[a-z0-9])?$/i.test(e.referrer)))throw new Error('Invalid referrer');
  if('utm' in e) {
    if(!e.utm||typeof e.utm!=='object'||Array.isArray(e.utm))throw new Error('Invalid UTM');
    for(const [key,value] of Object.entries(e.utm)) if(!['utm_source','utm_medium','utm_campaign'].includes(key)||typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(value))throw new Error('Invalid UTM');
  }
  return e as unknown as AnalyticsEvent;
}
export function allowedOrigins(value:string):Set<string> {
  const origins=value.split(',').map(s=>s.trim()).filter(Boolean);
  if(!origins.length || origins.length>10)throw new Error('Configure explicit origins');
  for(const origin of origins) {
    const url=new URL(origin);
    if(url.origin!==origin || (url.protocol!=='https:' && !(url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname))))throw new Error('Invalid origin');
  }
  return new Set(origins);
}
