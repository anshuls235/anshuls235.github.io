// The impact stage: a field of square dots gathers into each reported result
// in turn, while the matching project is shown beneath it. The figures come
// from the published cards; the canvas only draws them.
import { dotField } from "./dots";

const DWELL = 5200; // ms each result stays up before the next one forms
const NIGHT = ["#f4f1e8", "#ff5a2b"];
const DAY = ["#0d0f1a", "#ff4d1c"];

export interface SignalControls {
  /** Re-read the site's motion setting. */
  sync(): void;
  destroy(): void;
}

export function signalScene() {
  return `<div class="impact-signal" data-signal aria-hidden="true" hidden><canvas></canvas></div>`;
}

export function initSignal(isStill: () => boolean): SignalControls | null {
  const found = document.querySelector<HTMLElement>("#impact");
  const root = found?.querySelector<HTMLElement>("[data-signal]");
  const cards = [...(found?.querySelectorAll<HTMLElement>(".impact-card[data-metric]") ?? [])];
  if (!found || !root || !cards.length) return null;
  const section = found;
  const tabs = [...section.querySelectorAll<HTMLButtonElement>("[data-impact-tab]")];
  let current = 0;
  const field = dotField(root, {
    texts: cards.map((card) => card.dataset.metric ?? ""),
    colours: () => (document.documentElement.dataset.theme === "dark" ? NIGHT : DAY),
    isStill,
    dwell: cards.length > 1 ? DWELL : 0,
    onTurn: () => select(current + 1),
  });
  if (!field) return null;
  const dots = field;
  root.hidden = false;
  section.classList.add("is-live");

  /** Show one result: its card, its tab and its figure in the dots. */
  function select(index: number, burst = true) {
    current = (index + cards.length) % cards.length;
    cards.forEach((card, i) => {
      card.classList.toggle("is-current", i === current);
      card.inert = i !== current;
    });
    tabs.forEach((tab, i) => tab.setAttribute("aria-pressed", String(i === current)));
    dots.show(current, burst);
  }
  function pick(event: Event) {
    const tab = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-impact-tab]") : null;
    if (!tab) return;
    dots.setAuto(false); // the visitor has chosen; stop turning
    select(Number(tab.dataset.impactTab));
  }
  section.addEventListener("click", pick);
  window.addEventListener("portfolio-theme-change", dots.repaint);
  select(0, false);

  return {
    sync: dots.sync,
    destroy() {
      dots.destroy();
      section.removeEventListener("click", pick);
      window.removeEventListener("portfolio-theme-change", dots.repaint);
    },
  };
}
