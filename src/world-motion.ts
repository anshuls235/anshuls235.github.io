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
let carouselIndex = 0;
let heroVisible = true;
let context: gsap.Context | null = null;

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

/* ---------------- Featured work carousel ---------------- */
function cards() {
  return [...document.querySelectorAll<HTMLElement>(".selected-grid > .project-card")];
}
function paintCarousel(next: number, direction = 1, animate = true) {
  const list = cards();
  if (!list.length) return;
  const previous = carouselIndex;
  carouselIndex = Math.max(0, Math.min(list.length - 1, next));
  const position = document.querySelector("[data-project-position]");
  if (position)
    position.textContent = `${String(carouselIndex + 1).padStart(2, "0")} / ${String(list.length).padStart(2, "0")} — Selected work`;
  document.querySelector<HTMLButtonElement>("[data-gallery-prev]")?.toggleAttribute("disabled", carouselIndex === 0);
  document.querySelector<HTMLButtonElement>("[data-gallery-next]")?.toggleAttribute("disabled", carouselIndex >= list.length - 1);
  document.querySelectorAll("[data-dot]").forEach((dot, i) => dot.classList.toggle("is-current", i === carouselIndex));
  const incoming = list[carouselIndex];
  const outgoing = list[previous];
  list.forEach((card, i) => {
    const current = i === carouselIndex;
    card.classList.toggle("is-current", current);
    card.inert = !current;
    card.setAttribute("aria-hidden", String(!current));
  });
  if (!animate || still() || previous === carouselIndex) {
    gsap.set(list, { clearProps: "transform,opacity" });
    return;
  }
  gsap.killTweensOf(list);
  outgoing.classList.add("is-leaving");
  gsap.fromTo(
    outgoing,
    { x: 0, rotation: 0, opacity: 1, visibility: "visible" },
    {
      x: -direction * 120,
      rotation: -direction * 4,
      opacity: 0,
      duration: 0.45,
      ease: "power2.in",
      onComplete: () => {
        outgoing.classList.remove("is-leaving");
        gsap.set(outgoing, { clearProps: "transform,opacity,visibility" });
      },
    },
  );
  gsap.fromTo(
    incoming,
    { x: direction * 160, rotation: direction * 5, opacity: 0 },
    { x: 0, rotation: 0, opacity: 1, duration: 0.8, ease: "back.out(1.4)", delay: 0.12 },
  );
}
function setupCarousel() {
  const section = document.querySelector<HTMLElement>("#projects");
  const track = document.querySelector<HTMLElement>(".selected-grid");
  const list = cards();
  if (!section || !track || list.length < 2) return;
  section.classList.add("is-carousel");
  carouselIndex = Math.min(carouselIndex, list.length - 1);
  paintCarousel(carouselIndex, 1, false);
  // Drag or swipe to change project.
  let startX = 0;
  let startY = 0;
  let dragging = false;
  track.addEventListener("pointerdown", (event) => {
    if ((event.target as Element).closest("a,button")) return;
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    track.setPointerCapture(event.pointerId);
  });
  track.addEventListener("dragstart", (event) => event.preventDefault());
  track.addEventListener("pointerup", (event) => {
    if (!dragging) return;
    dragging = false;
    const dx = event.clientX - startX;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(event.clientY - startY))
      paintCarousel(carouselIndex + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  });
  track.addEventListener("pointercancel", () => (dragging = false));
}
document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest("[data-gallery-prev]")) paintCarousel(carouselIndex - 1, -1);
  if (target?.closest("[data-gallery-next]")) paintCarousel(carouselIndex + 1, 1);
  if (target?.closest("[data-world-motion]")) {
    paused = !paused;
    syncMotion();
  }
});
document.addEventListener("keydown", (event) => {
  if (!(event.target instanceof Element) || !event.target.closest("#projects .work-stage")) return;
  if (event.key === "ArrowRight") paintCarousel(carouselIndex + 1, 1);
  if (event.key === "ArrowLeft") paintCarousel(carouselIndex - 1, -1);
});

/* ---------------- Scroll choreography ---------------- */
function setupScroll() {
  context?.revert();
  context = gsap.context(() => {
    const root = document.documentElement;
    if (still()) {
      root.classList.remove("js-motion");
      return;
    }
    root.classList.add("js-motion");
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
      ".impact-card, .work-stage, .network, .experience-item, .archive-list, .publication-item, .notebook-panel, .credential, .scoreboard, .contact-pipeline, .model-hud",
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
    const land = document.querySelector<HTMLElement>(".work-scene");
    if (land)
      gsap.fromTo(
        land,
        { "--land-shift": "-40px" },
        { "--land-shift": "40px", ease: "none", scrollTrigger: { trigger: "#projects", start: "top bottom", end: "bottom top", scrub: true } },
      );
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
  });
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

}

export function initWorld() {
  heroObserver.disconnect();
  network?.destroy();
  const scene = document.querySelector("[data-hero-scene]");
  if (scene) heroObserver.observe(scene);
  const networkRoot = document.querySelector<HTMLElement>("[data-network]");
  network = networkRoot ? initNetwork(networkRoot, still) : null;
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
setupLenis();
initWorld();
