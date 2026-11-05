/** Decorative diagrams: every reported figure still comes from published content. */
export function impactEngine() {
  const node = (x: number, y: number, r = 5) => `<circle cx="${x}" cy="${y}" r="${r}"/>`;
  const web = [0, 1, 2].map(i => [0, 1, 2].map(j => `<path d="M458 ${88 + i * 36}L542 ${88 + j * 36}"/>`).join('')).join('');
  return `<div class="impact-engine container" aria-hidden="true"><div class="engine-caption mono"><span>THE SIGNAL → THE SYSTEM → THE IMPACT</span><span class="engine-live">Applied intelligence</span></div><svg class="engine-diagram" viewBox="0 0 1000 270" fill="none"><defs><pattern id="impact-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#8495d4" opacity=".25"/></pattern></defs><rect width="1000" height="270" fill="url(#impact-grid)"/><g class="engine-wires"><path d="M80 68H260Q300 68 320 100L386 124M80 124H386M80 180H260Q300 180 320 148L386 124"/><path data-lane="0" d="M614 124H670Q700 124 720 92L744 62H920"/><path data-lane="1" d="M614 124H920"/><path data-lane="2" d="M614 124H670Q700 124 720 156L744 186H920"/></g><g class="engine-stream"><path d="M80 68H260Q300 68 320 100L386 124"/><path d="M80 180H260Q300 180 320 148L386 124"/><path data-lane="0" d="M614 124H670Q700 124 720 92L744 62H920"/><path data-lane="1" d="M614 124H920"/><path data-lane="2" d="M614 124H670Q700 124 720 156L744 186H920"/></g><g class="engine-inputs"><rect x="42" y="46" width="158" height="44" rx="22"/><rect x="42" y="102" width="158" height="44" rx="22"/><rect x="42" y="158" width="158" height="44" rx="22"/><text x="121" y="73">HUMAN INTENT</text><text x="121" y="129">CONVERSATIONS</text><text x="121" y="185">BEHAVIOUR</text></g><g class="engine-orbit"><circle cx="500" cy="124" r="112"/><circle cx="500" cy="124" r="100"/>${node(500,12,6)}${node(500,236,6)}</g><rect class="engine-chip-shadow" x="402" y="57" width="204" height="152" rx="16"/><rect class="engine-chip" x="394" y="49" width="212" height="152" rx="16"/><g class="engine-neurons">${web}${[88,124,160].map(y=>node(458,y,7)+node(542,y,7)).join('')}</g><g class="engine-outputs"><g data-lane="0"><circle cx="920" cy="62" r="10"/><text x="902" y="45">DISCOVERY</text></g><g data-lane="1"><circle cx="920" cy="124" r="10"/><text x="902" y="107">CONNECTION</text></g><g data-lane="2"><circle cx="920" cy="186" r="10"/><text x="902" y="169">PRIORITY</text></g></g><text class="engine-footer" x="500" y="260">ONE IDEA. REAL-WORLD OUTCOMES.</text></svg><div class="engine-mobile"><span class="mono">Intent · conversations · behaviour</span><div class="mobile-processor"><span class="processor-ring"></span><span class="processor-ring"></span><strong>AI</strong><i></i><i></i><i></i></div><span class="mono">From signal to something useful ↓</span></div></div>`;
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
  section.querySelectorAll<HTMLElement>('.impact-card').forEach((card, i) => {
    const activate = () => { section.dataset.activeLane = String(i); };
    const clear = () => { delete section.dataset.activeLane; };
    card.addEventListener('pointerenter', activate);
    card.addEventListener('pointerleave', clear);
    card.addEventListener('focusin', activate);
    card.addEventListener('focusout', clear);
  });
  return () => observer.disconnect();
}
