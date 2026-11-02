const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const desktop = matchMedia('(min-width: 901px)');
let paused = reduced.matches;
let ideaIndex = 0;
let galleryIndex = 0;
let machineTimer: ReturnType<typeof setTimeout> | undefined;
let frame = 0;
let pointerX = 0;
let pointerY = 0;
const ideas = ['What if finding a car felt like a conversation?', 'What if a model gave back hours of someone’s day?', 'What if complex data made the next decision clearer?', 'What if the next useful thing starts with your question?'];
const clamp = (value: number) => Math.max(0, Math.min(1, value));
let videoVisible = false;
function syncVideo() {
 const video = document.querySelector<HTMLVideoElement>('[data-world-video]');
 if (!video) return;
 const saveData = (navigator as Navigator & {connection?: {saveData?:boolean}}).connection?.saveData;
 if (paused || reduced.matches || document.hidden || !videoVisible || saveData) { video.pause(); return; }
 if (!video.getAttribute('src') && video.dataset.src) {
  const webm = video.dataset.webm;
  const alternative = video.canPlayType('video/webm; codecs="vp9"') && webm ? video.dataset.src : webm;
  video.src = video.canPlayType('video/webm; codecs="vp9"') && webm ? webm : video.dataset.src;
  video.addEventListener('loadeddata', () => video.parentElement?.classList.add('has-film'), {once:true});
  video.addEventListener('error', () => {
   if (alternative && !video.dataset.triedFallback) {
    video.dataset.triedFallback='true';video.src=alternative;
    if (!paused && !reduced.matches && videoVisible) void video.play().catch(()=>{});
   } else video.parentElement?.classList.remove('has-film');
  });
 }
 void video.play().catch(() => { /* The illustrated poster remains available if autoplay is refused. */ });
}
function syncMotion() {
 document.documentElement.dataset.motion = paused || reduced.matches ? 'paused' : 'running';
 document.querySelectorAll<HTMLButtonElement>('[data-world-motion]').forEach(button => {
  button.setAttribute('aria-pressed', String(paused || reduced.matches));
  button.innerHTML = `${paused || reduced.matches ? 'Play motion' : 'Pause motion'} <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="${paused || reduced.matches ? 'm7 4 8 6-8 6Z' : 'M6 4v12M14 4v12'}" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
 });
 syncVideo();
 requestUpdate();
}
const observer = new IntersectionObserver(entries => entries.forEach(entry => {
 if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
}), {threshold:.08});
const videoObserver = new IntersectionObserver(entries => {videoVisible = entries.some(entry => entry.isIntersecting);syncVideo();}, {threshold:.05});
function setGalleryIndex(index: number) {
 const cards = [...document.querySelectorAll<HTMLElement>('.selected-grid>.project-card')];
 galleryIndex = Math.max(0, Math.min(cards.length - 1, index));
 const position = document.querySelector('[data-project-position]');
 if (position) position.textContent = `${String(galleryIndex+1).padStart(2,'0')} / ${String(cards.length).padStart(2,'0')} — SELECTED WORK`;
 document.querySelector<HTMLButtonElement>('[data-gallery-prev]')?.toggleAttribute('disabled', galleryIndex === 0);
 document.querySelector<HTMLButtonElement>('[data-gallery-next]')?.toggleAttribute('disabled', galleryIndex >= cards.length-1);
 cards.forEach((card,i) => card.classList.toggle('is-current', i === galleryIndex));
}
function update() {
 frame = 0;
 const stage = document.querySelector<HTMLElement>('#projects');
 const theatre = document.querySelector<HTMLElement>('.project-theatre');
 const track = document.querySelector<HTMLElement>('.selected-grid');
 const cards = document.querySelectorAll('.selected-grid>.project-card');
 const cinematic = desktop.matches && !reduced.matches && cards.length > 1;
 if (stage && theatre && track) {
  stage.classList.toggle('is-cinematic', cinematic);
  if (cinematic) {
   const distance = (cards.length-1) * innerHeight * .85;
   stage.style.setProperty('--stage-height', `${theatre.offsetHeight + distance}px`);
   const progress = clamp((88-stage.getBoundingClientRect().top) / distance);
   track.style.transform = `translate3d(${-progress * (cards.length-1) * track.clientWidth}px,0,0)`;
   setGalleryIndex(Math.round(progress * (cards.length-1)));
  } else {
   stage.style.removeProperty('--stage-height'); track.style.removeProperty('transform');
  }
 }
 const journey = document.querySelector<HTMLElement>('.idea-journey');
 if (journey) {
  const rect = journey.getBoundingClientRect();
  journey.style.setProperty('--travel', paused || reduced.matches ? '.5' : String(clamp((innerHeight-rect.top)/(innerHeight+rect.height))));
 }
 const world = document.querySelector<HTMLElement>('[data-workshop]');
 if (world) {
  const rect = world.getBoundingClientRect();
  world.style.setProperty('--scene-depth', paused || reduced.matches ? '0' : String(clamp(-rect.top/innerHeight)));
  world.style.setProperty('--px', paused || reduced.matches ? '0px' : `${pointerX}px`);
  world.style.setProperty('--py', paused || reduced.matches ? '0px' : `${pointerY}px`);
 }
}
function requestUpdate() { if (!frame) frame = requestAnimationFrame(update); }
function goToProject(index:number) {
 const stage = document.querySelector<HTMLElement>('#projects');
 const cards = [...document.querySelectorAll<HTMLElement>('.selected-grid>.project-card')];
 if (!stage || !cards.length) return;
 const next = Math.max(0, Math.min(cards.length-1,index));
 if (desktop.matches && !reduced.matches && cards.length>1) {
  window.scrollTo({top:scrollY + stage.getBoundingClientRect().top - 88 + next * innerHeight * .85, behavior:paused?'instant':'smooth'});
 } else {
  const track = document.querySelector<HTMLElement>('.selected-grid');
  if (track && !reduced.matches) track.scrollTo({left:cards[next].offsetLeft - cards[0].offsetLeft,behavior:paused?'instant':'smooth'});
  else cards[next].scrollIntoView({behavior:'instant',block:'center'});
  setGalleryIndex(next);
 }
}
export function initWorld() {
 clearTimeout(machineTimer);
 observer.disconnect(); videoObserver.disconnect();
 document.querySelectorAll<HTMLElement>('.expertise-item,.publication-item,.experience-item').forEach(el => {el.classList.add('reveal-section');observer.observe(el);});
 const video = document.querySelector('[data-world-video]');
 if (video) videoObserver.observe(video);
 const track = document.querySelector<HTMLElement>('.selected-grid');
 if (track) {
  track.addEventListener('scroll', () => {
   if (!desktop.matches && track.firstElementChild) {
    const first = track.firstElementChild as HTMLElement;
    setGalleryIndex(Math.round(track.scrollLeft/(first.offsetWidth+24)));
   }
  }, {passive:true});
 }
 setGalleryIndex(0); syncMotion(); requestUpdate();
}
function resetMachine() {
 clearTimeout(machineTimer);
 document.querySelector('[data-machine]')?.removeAttribute('data-state');
 const status = document.querySelector('.machine-status');
 const caption = document.querySelector('[data-machine-caption]');
 const run = document.querySelector<HTMLButtonElement>('[data-run-machine]');
 if (status) status.textContent='Ready when you are.';
 if (caption) caption.textContent='WAITING FOR A GOOD QUESTION';
 if (run) run.disabled=false;
}
document.addEventListener('click', event => {
 const target = event.target instanceof Element ? event.target : null;
 if (target?.closest('[data-world-motion]')) {paused = !paused;syncMotion();}
 if (target?.closest('[data-gallery-prev]')) goToProject(galleryIndex-1);
 if (target?.closest('[data-gallery-next]')) goToProject(galleryIndex+1);
 if (target?.closest('[data-idea]')) {
  const world = document.querySelector('[data-workshop]');
  const response = document.querySelector('.idea-response');
  if (response) response.textContent = ideas[ideaIndex++ % ideas.length];
  world?.classList.remove('is-sparking');
  requestAnimationFrame(() => world?.classList.add('is-sparking'));
  setTimeout(() => world?.classList.remove('is-sparking'),900);
 }
 if (target?.closest('[data-machine-reset]')) resetMachine();
 if (target?.closest('[data-run-machine]')) {
  resetMachine();
  const machine = document.querySelector('[data-machine]');
  const status = document.querySelector('.machine-status');
  const caption = document.querySelector('[data-machine-caption]');
  const run = document.querySelector<HTMLButtonElement>('[data-run-machine]');
  if (run) run.disabled=true;
  machine?.setAttribute('data-state','working');
  if (status) status.textContent='Question in. Connecting the dots…';
  if (caption) caption.textContent='EXPERIMENTING / LEARNING / BUILDING';
  machineTimer = setTimeout(() => {
   machine?.setAttribute('data-state','done');
   if (status) status.textContent='A little curiosity became something useful. Your turn?';
   if (caption) caption.textContent='AN IDEA, READY FOR THE REAL WORLD';
   if (run) run.disabled=false;
  },reduced.matches || paused ? 0 : 2600);
 }
});
document.addEventListener('focusin', event => {
 if (!(event.target instanceof Element)) return;
 const card = event.target.closest<HTMLElement>('.selected-grid>.project-card');
 if (!card) return;
 const cards=[...document.querySelectorAll('.selected-grid>.project-card')];
 const index=cards.indexOf(card);
 if (index !== galleryIndex) goToProject(index);
});
window.addEventListener('scroll',requestUpdate,{passive:true});
window.addEventListener('resize',requestUpdate,{passive:true});
document.addEventListener('visibilitychange',syncVideo);
if (matchMedia('(hover:hover) and (pointer:fine)').matches) {
 document.addEventListener('pointermove', event => {
  pointerX=(event.clientX/innerWidth-.5)*14;pointerY=(event.clientY/innerHeight-.5)*10;requestUpdate();
 },{passive:true});
}
reduced.addEventListener('change',event=>{paused=event.matches;syncMotion();requestUpdate();});
desktop.addEventListener('change',requestUpdate);
initWorld();
