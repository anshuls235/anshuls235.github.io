const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let paused = reduced.matches;
let ideaIndex = 0;
const ideas = ['What if finding a car felt like a conversation?', 'What if a model gave back hours of someone’s day?', 'What if complex data made the next decision clearer?', 'What if the next useful thing starts with your question?'];
function syncMotion() {
 document.documentElement.dataset.motion = paused ? 'paused' : 'running';
 document.querySelectorAll('[data-world-motion]').forEach(button => {
  button.setAttribute('aria-pressed', String(paused));
  button.innerHTML = `${paused ? 'Play motion' : 'Pause motion'} <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="${paused ? 'm7 4 8 6-8 6Z' : 'M6 4v12M14 4v12'}" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
 });
}
export function initWorld() {
 syncMotion();
 // The observer is recreated after a Supabase content refresh.
 observer.disconnect();
 document.querySelectorAll<HTMLElement>('.project-card,.expertise-item,.publication-item').forEach(el => {
  el.classList.add('reveal-section'); observer.observe(el);
 });
}
const observer = new IntersectionObserver(entries => entries.forEach(entry => {
 if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
}), {threshold:.08});
document.addEventListener('click', event => {
 const target = event.target instanceof Element ? event.target : null;
 if (target?.closest('[data-world-motion]')) {paused = !paused; syncMotion();}
 if (target?.closest('[data-idea]')) {
  const world = document.querySelector('[data-workshop]');
  const response = document.querySelector('.idea-response');
  if (response) response.textContent = ideas[ideaIndex++ % ideas.length];
  world?.classList.remove('is-sparking');
  requestAnimationFrame(() => world?.classList.add('is-sparking'));
  setTimeout(() => world?.classList.remove('is-sparking'),900);
 }
});
if (matchMedia('(hover:hover) and (pointer:fine)').matches) {
 document.addEventListener('pointermove', event => {
  if (paused || reduced.matches) return;
  const world = document.querySelector<HTMLElement>('[data-workshop]');
  if (world) {world.style.setProperty('--px',`${(event.clientX / innerWidth - .5) * 8}px`);world.style.setProperty('--py',`${(event.clientY / innerHeight - .5) * 6}px`);}
 }, {passive:true});
}
reduced.addEventListener('change', event => {paused = event.matches; syncMotion();});
initWorld();
