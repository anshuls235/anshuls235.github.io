import { coverUrl } from "./art";
/** Archive rows show their project's cover beside the cursor on hover. */
export function initPeek(isStill: () => boolean) {
  const list = document.querySelector<HTMLElement>("#archive-list");
  if (!list || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const peek = document.createElement("div");
  peek.className = "archive-peek";
  peek.setAttribute("aria-hidden", "true");
  const image = new Image();
  image.alt = "";
  peek.append(image);
  document.body.append(peek);
  let slug = "";
  let x = 0;
  let y = 0;
  let aimX = 0;
  let aimY = 0;
  let frame = 0;
  function tick() {
    frame = 0;
    const ease = isStill() ? 1 : 0.18;
    x += (aimX - x) * ease;
    y += (aimY - y) * ease;
    peek.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(-4deg)`;
    if (Math.abs(aimX - x) + Math.abs(aimY - y) > 0.5) frame = requestAnimationFrame(tick);
  }
  function move(event: PointerEvent) {
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-cover]") : null;
    if (!row) return hide();
    aimX = Math.min(event.clientX + 28, innerWidth - 340);
    aimY = event.clientY - 110;
    if (row.dataset.cover !== slug) {
      slug = row.dataset.cover!;
      image.src = coverUrl(slug, import.meta.env.BASE_URL, 600);
    }
    if (!peek.classList.contains("is-shown")) {
      x = aimX;
      y = aimY;
      peek.classList.add("is-shown");
    }
    if (!frame) frame = requestAnimationFrame(tick);
  }
  function hide() {
    peek.classList.remove("is-shown");
  }
  list.addEventListener("pointermove", move);
  list.addEventListener("pointerleave", hide);
  window.addEventListener("scroll", hide, { passive: true });
  return () => {
    cancelAnimationFrame(frame);
    list.removeEventListener("pointermove", move);
    list.removeEventListener("pointerleave", hide);
    window.removeEventListener("scroll", hide);
    peek.remove();
  };
}
