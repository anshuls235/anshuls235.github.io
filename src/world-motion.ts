import { initHello, type HelloControls } from "./hello";
import { initImpact } from "./impact";
import { initSignal, type SignalControls } from "./signal";
import { initSpiral, type SpiralControls } from "./spiral";
// Presentation and motion only. Content, Supabase and analytics live elsewhere.
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { initNetwork, type NetworkControls } from "./network";

gsap.registerPlugin(ScrollTrigger);
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let paused = reduced.matches;
const still = () => paused || reduced.matches;
let lenis: Lenis | null = null;
let network: NetworkControls | null = null;
let spiral: SpiralControls | null = null;
let carouselIndex = 0;
// On roomy screens the work pins and scrolling turns the spiral.
let workPin: ScrollTrigger | null = null;
let unpinWork: (() => void) | undefined;
let heroVisible = true;
let context: gsap.Context | null = null;
let hello: HelloControls | null = null;
let destroyImpact: (() => void) | undefined;
let signal: SignalControls | null = null;

/* ---------------- Smooth scrolling ---------------- */
function headerOffset() {
  return -(document.querySelector<HTMLElement>(".site-header")?.offsetHeight ?? 0) - 8;
}
function setupLenis() {
  if (lenis || reduced.matches) return;
  lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 1, smoothWheel: true });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}
function teardownLenis() {
  lenis?.destroy();
  lenis = null;
}
// In-page anchors glide with Lenis; project deep links are handled by main.ts.
document.addEventListener("click", (event) => {
  if (!lenis || event.defaultPrevented) return;
  const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="#"]') : null;
  if (!anchor || anchor.hasAttribute("data-project")) return;
  const hash = anchor.getAttribute("href")!;
  if (hash.length < 2 || hash.startsWith("#work/")) return;
  const target = document.getElementById(hash.slice(1));
  if (!target) return;
  event.preventDefault();
  history.pushState(null, "", hash);
  lenis.scrollTo(hash === "#home" ? 0 : target, { offset: headerOffset(), duration: 1.2 });
  target.setAttribute("tabindex", target.getAttribute("tabindex") ?? "-1");
  target.focus({ preventScroll: true });
});
// The dialog scrolls itself; pause page smoothing while it is open.
const dialog = document.querySelector<HTMLDialogElement>("#project-dialog");
if (dialog)
  new MutationObserver(() => (dialog.open ? lenis?.stop() : lenis?.start())).observe(dialog, {
    attributes: true,
    attributeFilter: ["open"],
  });

/* ---------------- Header hides on the way down ---------------- */
let lastY = scrollY;
window.addEventListener(
  "scroll",
  () => {
    const header = document.querySelector(".site-header");
    const menuOpen = document.querySelector(".main-nav.is-open");
    const y = scrollY;
    header?.classList.toggle("is-hidden", y > lastY && y > 400 && !menuOpen && !document.activeElement?.closest(".site-header"));
    lastY = y;
  },
  { passive: true },
);

/* ---------------- Hero film ---------------- */
function syncHeroVideo() {
  const video = document.querySelector<HTMLVideoElement>("[data-hero-video]");
  const scene = document.querySelector<HTMLElement>("[data-hero-scene]");
  if (!video || !scene) return;
  const night = document.documentElement.dataset.theme === "dark";
  const hd = innerWidth * Math.min(devicePixelRatio || 1, 2) > 2100;
  const mp4 = night ? (hd ? video.dataset.nightHd : video.dataset.night) : hd ? video.dataset.dayHd : video.dataset.day;
  // VP9 WebM is lighter and plays in Chromium builds without H.264; Safari keeps MP4.
  const webm = video.canPlayType('video/webm; codecs="vp9"') && video.dataset.failed !== "webm";
  const wanted = webm ? mp4?.replace(/\.mp4$/, ".webm") : mp4;
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  const play = !still() && heroVisible && !document.hidden && !saveData;
  if (wanted && video.dataset.current !== wanted) {
    scene.classList.remove("has-film");
    video.pause();
    video.dataset.current = wanted;
    video.removeAttribute("src");
    video.load();
  }
  if (!play) {
    video.pause();
    return;
  }
  if (!video.getAttribute("src") && wanted) video.src = wanted;
  if (!video.dataset.ready) {
    video.dataset.ready = "true";
    video.addEventListener("playing", () => scene.classList.add("has-film"));
    video.addEventListener("error", () => {
      scene.classList.remove("has-film");
      if (video.currentSrc.endsWith(".webm") && !video.dataset.failed) {
        video.dataset.failed = "webm";
        syncHeroVideo();
      }
    });
  }
  void video.play().catch(() => {
    /* The illustrated poster stays when autoplay is refused. */
  });
}
const heroObserver = new IntersectionObserver(
  (entries) => {
    heroVisible = entries.some((e) => e.isIntersecting);
    syncHeroVideo();
  },
  { threshold: 0.05 },
);

/* ---------------- Work spiral ---------------- */
function cards() {
  return [...document.querySelectorAll<HTMLElement>(".selected-grid > .project-card")];
}
/** Shows one project's notes; `turn` also brings its tile to the front. */
function paintCarousel(next: number, direction = 1, animate = true, turn = true) {
  const list = cards();
  if (!list.length) return;
  const previous = carouselIndex;
  carouselIndex = Math.max(0, Math.min(list.length - 1, next));
  const position = document.querySelector("[data-project-position]");
  if (position)
    position.textContent = `${String(carouselIndex + 1).padStart(2, "0")} / ${String(list.length).padStart(2, "0")} — Selected work`;
  document.querySelector<HTMLButtonElement>("[data-gallery-prev]")?.toggleAttribute("disabled", carouselIndex === 0);
  document.querySelector<HTMLButtonElement>("[data-gallery-next]")?.toggleAttribute("disabled", carouselIndex >= list.length - 1);
  const incoming = list[carouselIndex];
  list.forEach((card, i) => {
    const current = i === carouselIndex;
    card.classList.toggle("is-current", current);
    card.inert = !current;
    card.setAttribute("aria-hidden", String(!current));
  });
  if (turn) spiral?.setTarget(carouselIndex, !animate);
  gsap.killTweensOf(".project-body > *");
  gsap.set(".project-body > *", { clearProps: "transform,opacity" });
  if (!animate || still() || previous === carouselIndex) return;
  gsap.fromTo(
    incoming.querySelectorAll(".project-body > *"),
    { y: direction * 24, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.55, ease: "power3.out", stagger: 0.04, clearProps: "transform,opacity" },
  );
}
/** Buttons, keys, drags and tile clicks: when pinned they scroll to the project. */
function goTo(next: number) {
  const count = cards().length;
  const index = Math.max(0, Math.min(count - 1, next));
  const direction = index >= carouselIndex ? 1 : -1;
  if (!workPin) return paintCarousel(index, direction);
  const top = workPin.start + ((index + 0.5) / count) * (workPin.end - workPin.start);
  if (lenis) lenis.scrollTo(top, { duration: 0.9 });
  else scrollTo({ top });
}
function setupWorkPin() {
  const section = document.querySelector<HTMLElement>("#projects");
  const track = section?.querySelector<HTMLElement>("[data-work-track]");
  const hint = section?.querySelector<HTMLElement>(".gallery-hint");
  const count = cards().length;
  const pin = section?.querySelector<HTMLElement>(".work-pin");
  if (!section || !track || !pin || count < 2 || reduced.matches || innerHeight < 520) return;
  section.classList.add("is-pinned");
  track.style.setProperty("--work-steps", String(count));
  // Pin only where the longest set of notes fits on one screen. The spiral's
  // tiles are positioned outside the layout, so they are left out of the check.
  const stage = pin.querySelector<HTMLElement>(".work-stage");
  const notes = pin.querySelector<HTMLElement>(".selected-grid");
  if (!stage || !notes || notes.scrollHeight > stage.clientHeight + 2) {
    section.classList.remove("is-pinned");
    track.style.removeProperty("--work-steps");
    return;
  }
  const hintText = hint?.textContent ?? "";
  if (hint) hint.textContent = "Scroll, drag or use the arrows";
  const follow = (self: ScrollTrigger) => {
    track.style.setProperty("--work-progress", self.progress.toFixed(4));
    // The spiral turns continuously with the scroll; the notes change at the halfway point.
    const turn = Math.max(0, Math.min(count - 1, self.progress * count - 0.5));
    spiral?.setTarget(turn);
    const next = Math.round(turn);
    if (next !== carouselIndex) paintCarousel(next, next > carouselIndex ? 1 : -1, true, false);
  };
  workPin = ScrollTrigger.create({ trigger: track, start: "top top", end: "bottom bottom", onUpdate: follow, onRefresh: follow });
  return () => {
    workPin?.kill();
    workPin = null;
    section.classList.remove("is-pinned");
    track.style.removeProperty("--work-steps");
    track.style.removeProperty("--work-progress");
    if (hint) hint.textContent = hintText;
    spiral?.setTarget(carouselIndex);
  };
}
/** The about copy brightens word by word as it is read. */
function setupReading() {
  const copy = document.querySelector<HTMLElement>("[data-read]");
  const text = copy?.textContent ?? "";
  if (!copy || !text) return;
  const words = text.split(/\s+/).filter(Boolean).map((word) => {
    const span = document.createElement("span");
    span.textContent = word;
    return span;
  });
  copy.replaceChildren(...words.flatMap((word, i) => (i ? [" ", word] : [word])));
  // This strength keeps the unread words above AA contrast on paper and on black.
  gsap.fromTo(
    words,
    { opacity: 0.62 },
    { opacity: 1, ease: "none", stagger: 0.1, scrollTrigger: { trigger: copy, start: "top 85%", end: "bottom 65%", scrub: true } },
  );
  return () => {
    copy.textContent = text;
  };
}
function setupCarousel() {
  const section = document.querySelector<HTMLElement>("#projects");
  const stage = section?.querySelector<HTMLElement>("[data-spiral]");
  spiral?.destroy();
  spiral = null;
  if (!section || !stage || cards().length < 2) return;
  section.classList.add("is-carousel");
  spiral = initSpiral(stage, still, goTo);
  carouselIndex = Math.min(carouselIndex, cards().length - 1);
  paintCarousel(carouselIndex, 1, false);
}
document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest("[data-gallery-prev]")) goTo(carouselIndex - 1);
  if (target?.closest("[data-gallery-next]")) goTo(carouselIndex + 1);
  if (target?.closest("[data-world-motion]")) {
    paused = !paused;
    syncMotion();
  }
});
document.addEventListener("keydown", (event) => {
  if (!(event.target instanceof Element) || !event.target.closest("#projects .work-pin")) return;
  if (event.key === "ArrowRight") goTo(carouselIndex + 1);
  if (event.key === "ArrowLeft") goTo(carouselIndex - 1);
});

/* ---------------- Scroll choreography ---------------- */
function setupScroll() {
  unpinWork?.();
  unpinWork = undefined;
  context?.revert();
  context = gsap.context(() => {
    const root = document.documentElement;
    if (still()) {
      root.classList.remove("js-motion");
      return;
    }
    root.classList.add("js-motion");
    const unread = setupReading();
    // Each impact number slides in from the side as its band arrives.
    gsap.utils.toArray<HTMLElement>(".impact-metric").forEach((metric) => {
      gsap.fromTo(
        metric,
        { xPercent: 14 },
        { xPercent: 0, ease: "none", scrollTrigger: { trigger: metric, start: "top bottom", end: "top 45%", scrub: true } },
      );
    });
    // Display headlines rise line by line.
    gsap.utils.toArray<HTMLElement>(".display").forEach((heading) => {
      const lines = heading.querySelectorAll(".line > span");
      const inHero = heading.closest(".hero");
      gsap.fromTo(
        lines,
        { yPercent: 105 },
        {
          yPercent: 0,
          duration: 1,
          ease: "expo.out",
          stagger: 0.09,
          delay: inHero ? 0.25 : 0,
          scrollTrigger: inHero ? undefined : { trigger: heading, start: "top 88%", once: true },
        },
      );
    });
    // Panels and cards ease in as they arrive.
    const reveal = gsap.utils.toArray<HTMLElement>(
      ".network, .experience-item, .publication-item, .notebook-panel, .credential, .scoreboard, .model-hud",
    );
    reveal.forEach((el) => el.setAttribute("data-reveal", ""));
    ScrollTrigger.batch(reveal, {
      start: "top 90%",
      once: true,
      onEnter: (batch) =>
        gsap.to(batch, { y: 0, duration: 1,  ease: "power3.out", stagger: 0.1, overwrite: true }),
    });
    // Parallax for the illustrated scenes.
    const heroArt = document.querySelector<HTMLElement>("[data-hero-scene]");
    if (heroArt)
      gsap.to(heroArt, {
        "--scene-shift": "120px",
        ease: "none",
        scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
      });
    // The career training curve draws itself as you read.
    const line = document.querySelector<SVGPathElement>("[data-loss-line]");
    const points = gsap.utils.toArray<SVGGElement>("[data-loss-point]");
    if (line) {
      gsap.set(line, { strokeDasharray: 1, strokeDashoffset: 1 });
      gsap.set(points, { scale: 0, transformOrigin: "50% 50%" });
      const timeline = gsap.timeline({
        scrollTrigger: { trigger: ".loss-chart", start: "top 85%", once: true },
      });
      timeline.to(line, { strokeDashoffset: 0, ease: "none", duration: 1 }, 0);
      points.forEach((p, i) =>
        timeline.to(p, { scale: 1, duration: 0.08, ease: "back.out(3)" }, (i / Math.max(1, points.length - 1)) * 0.92),
      );
    }
    // Scoreboard digits roll into place.
    const digits = gsap.utils.toArray<HTMLElement>(".score-digits span");
    ScrollTrigger.create({
      trigger: "[data-scoreboard]",
      start: "top 85%",
      once: true,
      onEnter: () =>
        digits.forEach((digit, i) => {
          const final = digit.textContent ?? "0";
          const counter = { n: 0 };
          gsap.to(counter, {
            n: 12 + i * 3,
            duration: 1.1 + i * 0.08,
            ease: "power2.out",
            onUpdate: () => (digit.textContent = String(Math.floor(counter.n) % 10)),
            onComplete: () => {
              digit.textContent = final;
            },
          });
        }),
    });
    return unread;
  });
  if (!still()) unpinWork = setupWorkPin();
}

/* ---------------- Motion state ---------------- */
function syncMotion() {
  const isStill = still();
  document.documentElement.dataset.motion = isStill ? "paused" : "running";
  document.querySelectorAll<HTMLButtonElement>("[data-world-motion]").forEach((button) => {
    button.setAttribute("aria-pressed", String(isStill));
    button.innerHTML = `${isStill ? "Play motion" : "Pause motion"} <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="${isStill ? "m6 4 10 6-10 6Z" : "M6 4v12M14 4v12"}" fill="${isStill ? "currentColor" : "none"}" stroke="currentColor" stroke-width="3"/></svg>`;
  });
  syncHeroVideo();
  network?.setPaused(isStill);
  hello?.sync();
  signal?.sync();
}

export function initWorld() {
  hello?.destroy();
  hello = initHello(still);
  destroyImpact?.();
  destroyImpact = initImpact();
  heroObserver.disconnect();
  network?.destroy();
  const scene = document.querySelector("[data-hero-scene]");
  if (scene) heroObserver.observe(scene);
  const networkRoot = document.querySelector<HTMLElement>("[data-network]");
  network = networkRoot ? initNetwork(networkRoot, still) : null;
  signal?.destroy();
  signal = initSignal(still);
  setupCarousel();
  setupScroll();
  syncMotion();
  ScrollTrigger.refresh();
}

reduced.addEventListener("change", (event) => {
  paused = event.matches;
  if (event.matches) teardownLenis();
  else setupLenis();
  setupScroll();
  syncMotion();
});
document.addEventListener("visibilitychange", syncHeroVideo);
window.addEventListener("portfolio-theme-change", syncHeroVideo);
window.addEventListener("load", () => ScrollTrigger.refresh());
// Whether the work section can pin depends on the viewport, so re-check on resize.
let resizeTimer = 0;
let lastWidth = innerWidth;
let lastHeight = innerHeight;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    // Mobile address bars resize the viewport constantly; ignore those nudges.
    if (innerWidth === lastWidth && Math.abs(innerHeight - lastHeight) < 120) return;
    lastWidth = innerWidth;
    lastHeight = innerHeight;
    if (!document.documentElement.classList.contains("js-motion")) return;
    unpinWork?.();
    unpinWork = setupWorkPin();
    ScrollTrigger.refresh();
  }, 200);
});
setupLenis();
initWorld();
