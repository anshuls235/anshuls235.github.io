// A responsive flight scene; no remote assets or animation library required.
let root: HTMLElement | null = null;
let visible = false;
let stopped = false;
let tick = 0;
let elapsed = 0;
let previous = 0;
let manual = false;
const mobile = matchMedia('(max-width: 650px)');
let route: SVGPathElement | null = null;
let plane: SVGGElement | null = null;
let paper: SVGGElement | null = null;
let shadow: SVGGElement | null = null;
let trail: SVGPathElement | null = null;
let length = 0;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
function selectRoute() {
 const svg = root?.querySelector<SVGSVGElement>(mobile.matches ? '.flight-mobile' : '.flight-desktop');
 route = svg?.querySelector<SVGPathElement>('[data-flight-trail]') ?? null;
 trail = route;
 plane = svg?.querySelector<SVGGElement>('[data-flight-plane]') ?? null;
 paper = svg?.querySelector<SVGGElement>('[data-flight-paper]') ?? null;
 shadow = svg?.querySelector<SVGGElement>('[data-flight-shadow]') ?? null;
 length = route?.getTotalLength() ?? 0;
 paint(reduced.matches ? 1 : Math.min(elapsed / 6100, 1),1);
}
function paint(progress:number, opacity:number) {
 if(!route || !plane || !paper || !trail || !shadow) return;
 const distance=progress*length;
 const point=route.getPointAtLength(distance);
 const before=route.getPointAtLength(Math.max(0,distance-5));
 const ahead=route.getPointAtLength(Math.min(length,distance+5));
 const angle=Math.atan2(ahead.y-before.y,ahead.x-before.x)*180/Math.PI;
 const behind=route.getPointAtLength(Math.max(0,distance-35));
 const far=route.getPointAtLength(Math.min(length,distance+35));
 const a=Math.atan2(point.y-behind.y,point.x-behind.x);
 const b=Math.atan2(far.y-point.y,far.x-point.x);
 const turn=Math.atan2(Math.sin(b-a),Math.cos(b-a));
 const scale=.78+Math.sin(progress*Math.PI)*.3;
 plane.setAttribute('transform',`translate(${point.x.toFixed(2)} ${point.y.toFixed(2)}) rotate(${angle.toFixed(2)}) scale(${scale.toFixed(3)})`);
 paper.setAttribute('transform',`scale(1 ${(1-Math.min(Math.abs(turn)*.32,.35)).toFixed(3)})`);
 plane.style.opacity=String(opacity);
 shadow.setAttribute('transform',`translate(${(point.x+10).toFixed(2)} ${(point.y+25).toFixed(2)}) scale(${scale.toFixed(3)})`);
 shadow.style.opacity=String(opacity*.14);
 trail.style.strokeDasharray=`${distance.toFixed(2)} ${length.toFixed(2)}`;
 trail.style.opacity=String(opacity);
 root?.classList.toggle('is-arriving',progress>.975 && opacity>.5);
 root?.setAttribute('data-flight-state',progress>=1?'arrived':'flying');
 if(progress>=1 && manual){
  const status=root?.querySelector('[data-flight-status]');
  if(status) status.textContent='Your little hello has arrived. Fly it again, or start a conversation below.';
  manual=false;
 }
}
function animate(now:number) {
 tick=0;
 if(!visible || stopped || reduced.matches || document.hidden){previous=0;return;}
 if(previous) elapsed+=Math.min(now-previous,80);
 previous=now;
 if(elapsed>8900) elapsed=0;
 const raw=Math.min(elapsed/6100,1);
 const progress=raw*raw*(3-2*raw);
 const opacity=elapsed>7900?Math.max(0,(8800-elapsed)/900):Math.min(1,elapsed/220);
 paint(progress,opacity);
 tick=requestAnimationFrame(animate);
}
function resume() {
 cancelAnimationFrame(tick);tick=0;previous=0;
 if(reduced.matches){paint(1,1);return;}
 if(visible && !stopped && !document.hidden) tick=requestAnimationFrame(animate);
}
const observer=new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting);resume();},{threshold:.08});
export function initFlight() {
 observer.disconnect();cancelAnimationFrame(tick);tick=0;elapsed=0;previous=0;manual=false;
 root=document.querySelector<HTMLElement>('[data-flight]');
 if(!root)return;
 selectRoute();observer.observe(root);
}
export function pauseFlight(paused:boolean){stopped=paused;resume();}
document.addEventListener('click',event=>{
 if(!(event.target instanceof Element) || !event.target.closest('[data-flight-launch]'))return;
 elapsed=0;previous=0;manual=true;
 const status=root?.querySelector('[data-flight-status]');
 if(status)status.textContent='A little hello is on its way.';
 if(reduced.matches || stopped){paint(1,1);}else{paint(0,1);resume();}
});
mobile.addEventListener('change',()=>{selectRoute();resume();});
reduced.addEventListener('change',resume);
document.addEventListener('visibilitychange',resume);
