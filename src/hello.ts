// The contact stage: the dots say hello in one language after another, and
// spell out a conversation starter while the visitor is pointing at it.
import { dotField } from "./dots";

const GREETINGS = ["HELLO", "नमस्ते", "مرحبا", "HOLA", "BONJOUR", "こんにちは"];
const DWELL = 3400;
const DAY = ["#0d0f1a", "#fff6e6"]; // ink and cream on the accent band
const NIGHT = ["#ff5a2b", "#f4f1e8"]; // accent and cream on black

export interface HelloControls {
  /** Re-read the site's motion setting. */
  sync(): void;
  destroy(): void;
}

export function helloScene() {
  return `<div class="contact-hello" data-hello aria-hidden="true" hidden><canvas></canvas></div>`;
}

export function initHello(isStill: () => boolean): HelloControls | null {
  const root = document.querySelector<HTMLElement>("[data-hello]");
  const section = root?.closest<HTMLElement>("section");
  if (!root || !section) return null;
  const starters = [...section.querySelectorAll<HTMLElement>("[data-say]")];
  let greeting = 0;
  const field = dotField(root, {
    texts: [...GREETINGS, ...starters.map((starter) => starter.dataset.say ?? "")],
    colours: () => (document.documentElement.dataset.theme === "dark" ? NIGHT : DAY),
    isStill,
    fitInk: true,
    dwell: DWELL,
    onTurn: () => field?.show((greeting = (greeting + 1) % GREETINGS.length)),
  });
  if (!field) return null;
  root.hidden = false;

  const say = (event: Event) => {
    const index = starters.indexOf(event.currentTarget as HTMLElement);
    field.setAuto(false);
    field.show(GREETINGS.length + index);
  };
  const resume = () => {
    field.setAuto(true);
    field.show(greeting);
  };
  starters.forEach((starter) => {
    starter.addEventListener("pointerenter", say);
    starter.addEventListener("focus", say);
    starter.addEventListener("pointerleave", resume);
    starter.addEventListener("blur", resume);
  });
  window.addEventListener("portfolio-theme-change", field.repaint);
  field.show(0, false);

  return {
    sync: field.sync,
    destroy() {
      field.destroy();
      window.removeEventListener("portfolio-theme-change", field.repaint);
      starters.forEach((starter) => {
        starter.removeEventListener("pointerenter", say);
        starter.removeEventListener("focus", say);
        starter.removeEventListener("pointerleave", resume);
        starter.removeEventListener("blur", resume);
      });
    },
  };
}
