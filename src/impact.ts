import { signalScene } from "./signal";
/** Decorative diagrams: every reported figure still comes from published content. */
export function impactEngine() {
  return signalScene();
}

export function impactVisual(index: number) {
  const start = `<div class="impact-visual" aria-hidden="true"><svg viewBox="0 0 360 150" fill="none">`;
  if (index === 0) return `${start}<g class="visual-grid"><path d="M20 40H340M20 80H340M20 120H340M60 20V140M120 20V140M180 20V140M240 20V140M300 20V140"/></g><path class="visual-track" d="M35 112C100 112 98 42 180 42S258 112 325 112"/><path class="visual-signal" d="M35 112C100 112 98 42 180 42S258 112 325 112"/><g class="visual-float"><rect x="99" y="46" width="162" height="58" rx="29"/><circle cx="130" cy="74" r="11"/><path d="m138 82 8 8M161 69h70M161 80h44"/></g><circle class="visual-dot" cx="35" cy="112" r="7"/><circle class="visual-dot" cx="325" cy="112" r="7"/></svg><span class="mono">01 / Understanding intent</span></div>`;
  if (index === 1) return `${start}<path class="visual-track" d="M30 75H330"/><path class="visual-signal" d="M30 75H330"/><g class="visual-float"><path d="M46 28h150v62h-74l-22 22V90H46Z"/><path d="M67 49h104M67 63h72"/></g><g class="visual-float visual-delay"><path d="M182 65h132v57h-24v18l-23-18h-85Z"/><circle cx="214" cy="94" r="4"/><circle cx="247" cy="94" r="4"/><circle cx="280" cy="94" r="4"/></g></svg><span class="mono">02 / Creating connection</span></div>`;
  return `${start}<g class="visual-grid">${Array.from({length:40},(_,i)=>`<circle cx="${40+(i%10)*30}" cy="${26+Math.floor(i/10)*30}" r="6"/>`).join('')}</g><g class="visual-priority">${[4,8,13,17,21,26].map((i,n)=>`<circle style="--dot:${n}" cx="${40+(i%10)*30}" cy="${26+Math.floor(i/10)*30}" r="8"/>`).join('')}</g><path class="visual-track" d="M25 140H335"/><path class="visual-signal" d="M25 140H335"/></svg><span class="mono">03 / Finding the signal</span></div>`;
}

export function initImpact() {
  const section = document.querySelector<HTMLElement>('#impact');
  if (!section) return;
  const observer = new IntersectionObserver(([entry]) => {
    section.classList.toggle('impact-in-view', entry.isIntersecting);
  });
  observer.observe(section);
  return () => observer.disconnect();
}
