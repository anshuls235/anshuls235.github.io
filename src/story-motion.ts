// The thread through the page. A paper plane leaves the hero, flies the
// career route on the journey map, rides the flight rail through every
// chapter, and lands in a 3D city at the end. Chapters rise as screens, and
// jumping between them zooms out to show where you are going.
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type Lenis from "lenis";
import type { SkyControls } from "./sky/game";
import { initOrb, type OrbControls, type OrbData } from "./orb";

export interface StoryControls {
  sync(): void;
  /** Glide to a chapter through the screen view; false if it is not a chapter. */
  jump(target: HTMLElement): boolean;
  destroy(): void;
}
interface Options {
  still: () => boolean;
  lenis: () => Lenis | null;
  headerOffset: () => number;
}

const LABELS: Record<string, string> = {
  home: "Prologue · Hello",
  experience: "Chapter 01 · The journey",
  skills: "Chapter 02 · The model",
  projects: "Chapter 03 · The work",
  impact: "Chapter 04 · The impact",
  notes: "Chapter 05 · Between flights",
  contact: "Chapter 06 · Let’s talk",
};
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

export function initStory({ still, lenis, headerOffset }: Options): StoryControls {
  const triggers: ScrollTrigger[] = [];
  const cleanups: (() => void)[] = [];
  const root = document.documentElement;
  const chapters = [...document.querySelectorAll<HTMLElement>("#main > section[id]")].filter((s) => LABELS[s.id]);

  /* ---------- The journey: the plane flies the career route ---------- */
  const journey = document.querySelector<HTMLElement>("[data-journey]");
  const legs = [...(journey?.querySelectorAll<SVGPathElement>("[data-leg]") ?? [])];
  const markers = [...(journey?.querySelectorAll<SVGGElement>("[data-city-marker]") ?? [])];
  const passes = [...(journey?.querySelectorAll<HTMLElement>("[data-stop]") ?? [])];
  const mapPlane = journey?.querySelector<SVGGElement>("[data-journey-plane]");
  const lengths = legs.map((leg) => leg.getTotalLength());
  const stamps = [...(journey?.querySelectorAll<SVGGElement>("[data-timeline-stop]") ?? [])];
  const pcts = stamps.map((g) => Number(g.dataset.pct));
  const years = stamps.map((g) => Number(g.dataset.year));
  const fill = journey?.querySelector<SVGPathElement>("[data-timeline-fill]");
  const yearLabel = journey?.querySelector<HTMLElement>("[data-journey-year]");
  function flyJourney(progress: number) {
    const steps = passes.length;
    if (!steps || !mapPlane) return;
    const seg = clamp(progress) * steps;
    const current = Math.min(steps - 1, Math.floor(seg));
    if (current !== shownStop) {
      shownStop = current;
      closeNote();
    }
    passes.forEach((p, i) => {
      p.classList.toggle("is-current", i === current);
      p.classList.toggle("is-past", i < current);
    });
    let at: DOMPoint | null = null;
    let angle = 0;
    let pct = pcts[0] ?? 0;
    let yearNow = years[0] ?? 0;
    legs.forEach((leg, i) => {
      // Each leg flies in the second half of its stop's share of the scroll.
      const draw = clamp((seg - i - 0.5) / 0.5);
      if (draw > 0 && pcts[i + 1] !== undefined) {
        pct = pcts[i] + (pcts[i + 1] - pcts[i]) * draw;
        yearNow = years[i] + (years[i + 1] - years[i]) * draw;
      }
      leg.style.strokeDashoffset = String(1 - draw);
      if (draw > 0) {
        const d = draw * lengths[i];
        at = leg.getPointAtLength(d);
        const ahead = leg.getPointAtLength(Math.min(lengths[i], d + 2));
        const behind = leg.getPointAtLength(Math.max(0, d - 2));
        angle = (Math.atan2(ahead.y - behind.y, ahead.x - behind.x) * 180) / Math.PI;
      }
    });
    markers.forEach((m, i) => m.classList.toggle("is-visited", i <= current));
    stamps.forEach((g, i) => g.classList.toggle("is-visited", i <= current));
    if (fill) fill.style.strokeDashoffset = String(1 - pct / 100);
    if (yearLabel) yearLabel.textContent = String(Math.floor(yearNow + 0.0001));
    if (at) mapPlane.setAttribute("transform", `translate(${(at as DOMPoint).x.toFixed(1)} ${(at as DOMPoint).y.toFixed(1)}) rotate(${angle.toFixed(1)})`);
    else {
      const first = markers[0]?.getAttribute("transform") ?? "";
      mapPlane.setAttribute("transform", `${first} rotate(-60)`);
    }
  }
  // A role's highlights are on the back of its ticket: the pass turns over to show them.
  const turn = (passEl: HTMLElement, show: () => void) => {
    // Hold the ticket's height through the turn so the card never jumps.
    const ticket = passEl.querySelector<HTMLElement>(".pass-ticket");
    if (ticket && !passEl.classList.contains("show-log")) ticket.style.minHeight = `${ticket.offsetHeight}px`;
    if (still()) return show();
    passEl.classList.add("is-turning");
    window.setTimeout(() => {
      show();
      passEl.classList.remove("is-turning");
    }, 170);
  };
  function closeLogs(focusRole = false) {
    journey?.querySelectorAll<HTMLElement>(".boarding-pass.show-log").forEach((passEl) => {
      const open = passEl.querySelector<HTMLElement>(".pass-log.is-open");
      const button = open ? passEl.querySelector<HTMLButtonElement>(`[data-role-log="${open.id}"]`) : null;
      turn(passEl, () => {
        passEl.querySelector<HTMLElement>(".pass-ticket")?.style.removeProperty("min-height");
        passEl.classList.remove("show-log");
        open?.classList.remove("is-open");
        button?.setAttribute("aria-expanded", "false");
        if (focusRole) button?.focus();
      });
    });
  }
  const onRole = (event: Event) => {
    const target = event.target instanceof Element ? event.target : null;
    const back = target?.closest("[data-log-back]");
    if (back) return closeLogs(true);
    const button = target?.closest<HTMLButtonElement>("[data-role-log]");
    const passEl = button?.closest<HTMLElement>(".boarding-pass");
    const log = button ? journey?.querySelector<HTMLElement>(`#${button.dataset.roleLog}`) : null;
    if (!button || !passEl || !log) return;
    turn(passEl, () => {
      passEl.querySelectorAll(".pass-log.is-open").forEach((l) => l.classList.remove("is-open"));
      log.classList.add("is-open");
      passEl.classList.add("show-log");
      button.setAttribute("aria-expanded", "true");
      log.querySelector<HTMLButtonElement>("[data-log-back]")?.focus({ preventScroll: true });
    });
  };
  const onEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape" && journey?.querySelector(".boarding-pass.show-log")) closeLogs(true);
  };
  journey?.addEventListener("click", onRole);
  document.addEventListener("keydown", onEscape);
  journey?.setAttribute("data-flip-ready", "");
  cleanups.push(() => {
    journey?.removeEventListener("click", onRole);
    document.removeEventListener("keydown", onEscape);
  });
  const closeNote = () => closeLogs();
  let shownStop = -1;

  function setupJourney() {
    const section = journey?.closest<HTMLElement>("section");
    if (!journey || !section) return;
    const pinnable = !still() && innerWidth >= 900 && innerHeight >= 560 && passes.length > 1;
    section.classList.toggle("is-pinned", pinnable);
    journey.style.setProperty("--journey-steps", String(passes.length));
    if (!pinnable) {
      flyJourney(1);
      passes.forEach((p) => p.classList.remove("is-current", "is-past"));
      return;
    }
    const follow = (self: ScrollTrigger) => flyJourney(self.progress);
    // The first pass is simply there on load; only later changes animate.
    section.classList.add("is-settling");
    triggers.push(ScrollTrigger.create({ trigger: journey, start: "top top", end: "bottom bottom", onUpdate: follow, onRefresh: follow }));
    requestAnimationFrame(() => requestAnimationFrame(() => section.classList.remove("is-settling")));
  }

  /* ---------- The model: a knowledge orb ---------- */
  const orbRoot = document.querySelector<HTMLElement>("[data-orb]");
  const orbDetail = document.querySelector<HTMLElement>("[data-orb-detail]");
  const orbButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-orb-topic]")];
  let orb: OrbControls | null = null;
  if (orbRoot) {
    try {
      const graph = JSON.parse(orbRoot.dataset.graph ?? "{}") as OrbData & { projects: Record<string, { name: string; place: string }> };
      const first = orbDetail?.innerHTML ?? "";
      orb = initOrb(orbRoot, graph, still, (node) => {
        orbButtons.forEach((b) => b.setAttribute("aria-pressed", String(node?.hub === true && Number(b.dataset.orbTopic) === node.id)));
        if (!orbDetail) return;
        if (!node) {
          orbDetail.innerHTML = first;
          return;
        }
        orbDetail.replaceChildren();
        const kicker = document.createElement("p");
        kicker.className = "mono";
        kicker.textContent = node.hub ? "Topic" : graph.topics[node.topic];
        const title = document.createElement("h3");
        title.textContent = node.label;
        orbDetail.append(kicker, title);
        if (!node.projects.length) {
          const none = document.createElement("p");
          none.textContent = "In the toolkit; not yet in a published case study.";
          orbDetail.append(none);
          return;
        }
        const label = document.createElement("p");
        label.className = "mono";
        label.textContent = `Shipped in ${node.projects.length} project${node.projects.length > 1 ? "s" : ""}`;
        const list = document.createElement("ul");
        for (const slug of node.projects) {
          const info = graph.projects[slug];
          if (!info) continue;
          const li = document.createElement("li");
          const a = document.createElement("a");
          a.href = `#work/${slug}`;
          a.dataset.project = slug;
          a.textContent = info.name;
          const where = document.createElement("small");
          where.className = "mono";
          where.textContent = info.place;
          a.append(where);
          li.append(a);
          list.append(li);
        }
        orbDetail.append(label, list);
      });
    } catch {
      orbRoot.hidden = true;
    }
    const onTopic = (event: Event) => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-orb-topic]") : null;
      if (!button) return;
      const id = Number(button.dataset.orbTopic);
      orb?.focus(button.getAttribute("aria-pressed") === "true" ? null : id);
    };
    document.addEventListener("click", onTopic);
    cleanups.push(() => {
      document.removeEventListener("click", onTopic);
      orb?.destroy();
    });
  }

  /* ---------- The arrivals board ---------- */
  const board = document.querySelector<HTMLElement>("[data-board]");
  if (board) {
    const clock = board.querySelector<HTMLElement>("[data-board-clock]");
    const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" });
    const tickClock = () => clock && (clock.textContent = time.format(new Date()));
    tickClock();
    const clockTimer = window.setInterval(tickClock, 20000);
    const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$.%";
    const cells = [...board.querySelectorAll<HTMLElement>(".flap")];
    const timers: number[] = [];
    const flip = () => {
      if (still()) return;
      cells.forEach((cell, i) => {
        const target = cell.dataset.char ?? " ";
        if (target === " ") return;
        const row = [...board.querySelectorAll(".board-row")].indexOf(cell.closest(".board-row")!);
        let turns = 6 + (i % 12) + row * 4;
        let odd = false;
        const step = () => {
          // Alternate two identical animations to restart it without forcing a reflow.
          odd = !odd;
          cell.classList.toggle("is-flipping", odd);
          cell.classList.toggle("is-flopping", !odd);
          cell.textContent = turns > 0 ? GLYPHS[Math.floor(Math.random() * GLYPHS.length)] : target;
          if (turns-- > 0) timers.push(window.setTimeout(step, 55));
        };
        timers.push(window.setTimeout(step, row * 160 + (i % 12) * 40));
      });
    };
    const seenBoard = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) flip();
      },
      { threshold: 0.35 },
    );
    seenBoard.observe(board);
    cleanups.push(() => {
      seenBoard.disconnect();
      clearInterval(clockTimer);
      timers.forEach(clearTimeout);
    });
  }

  /* ---------- Chapters rise as screens ---------- */
  function setupScreens() {
    chapters.forEach((section) => section.setAttribute("data-screen", LABELS[section.id]));
    if (still()) return;
    for (const section of chapters) {
      if (section.id === "home") continue;
      // A chapter tab rides in at the top of each chapter. Only opacity and a
      // small transform animate, so scrolling repaints nothing large.
      const bezel = document.createElement("div");
      bezel.className = "screen-bezel";
      bezel.setAttribute("aria-hidden", "true");
      bezel.innerHTML = '<span class="bz-tab"></span>';
      bezel.querySelector(".bz-tab")!.textContent = LABELS[section.id];
      section.prepend(bezel);
      cleanups.push(() => bezel.remove());
      // The chapter's tab announces it as it arrives, then steps aside.
      const timeline = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: { trigger: section, start: "top bottom", end: "top 18%", scrub: true },
      });
      // It slides out of view rather than fading, so it is never half-legible.
      timeline.fromTo(bezel.querySelector(".bz-tab"), { yPercent: 0 }, { yPercent: -160 });
      triggers.push(timeline.scrollTrigger!);
    }
    // The hero's paper plane takes off as the story begins.
    const heroPlane = document.querySelector<HTMLElement>("[data-hero-plane]");
    if (heroPlane) {
      const tween = gsap.to(heroPlane, {
        x: () => innerWidth * 0.45,
        y: () => -innerHeight * 0.2,
        rotate: -18,
        scale: 0.6,
        opacity: 0,
        ease: "power1.in",
        scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom 30%", scrub: true },
      });
      triggers.push(tween.scrollTrigger!);
    }
  }

  /* ---------- The flight rail ---------- */
  const rail = document.querySelector<HTMLElement>("[data-rail]");
  const railPlane = rail?.querySelector<HTMLElement>("[data-rail-plane]");
  const railStops = [...(rail?.querySelectorAll<HTMLAnchorElement>("[data-rail-stop]") ?? [])];
  let railFrame = 0;
  // Chapter positions and dot offsets are measured once (and on resize or refresh),
  // so a scroll only does arithmetic: no layout reads while the page is moving.
  let chapterTops: number[] = [];
  let chapterHeights: number[] = [];
  let dotCentres: number[] = [];
  function measureRail() {
    chapterTops = chapters.map((c) => c.getBoundingClientRect().top + scrollY);
    chapterHeights = chapters.map((c) => c.offsetHeight);
    if (rail) {
      const railTop = rail.getBoundingClientRect().top;
      dotCentres = railStops.map((a) => {
        const r = a.querySelector<HTMLElement>(".rail-dot")!.getBoundingClientRect();
        return r.top + r.height / 2 - railTop;
      });
    }
  }
  let railIndex = -1;
  function paintRail() {
    railFrame = 0;
    if (!rail || !railPlane || !railStops.length || !dotCentres.length) return;
    // Lenis already knows where the page is; reading scrollY here would force a layout.
    const line = (lenis()?.scroll ?? scrollY) + innerHeight * 0.4;
    let index = 0;
    let within = 0;
    chapterTops.forEach((top, i) => {
      if (top <= line) {
        index = i;
        within = clamp((line - top) / Math.max(1, chapterHeights[i]));
      }
    });
    const from = dotCentres[index];
    const to = dotCentres[Math.min(index + 1, dotCentres.length - 1)];
    const y = from + (to - from) * within;
    railPlane.style.transform = `translate(-50%, ${y.toFixed(1)}px) translateY(-50%) rotate(90deg)`;
    rail.style.setProperty("--rail-fill", `${y.toFixed(1)}px`);
    if (index !== railIndex) {
      railIndex = index;
      railStops.forEach((a, i) => {
        if (i === index) a.setAttribute("aria-current", "step");
        else a.removeAttribute("aria-current");
        a.classList.toggle("is-past", i < index);
      });
      rail.classList.toggle("is-landed", chapters[index]?.id === "contact");
    }
    rail.classList.toggle("is-away", index === 0 && within < 0.35);
  }
  const onScroll = () => {
    if (!railFrame) railFrame = requestAnimationFrame(paintRail);
  };
  const onMeasure = () => {
    measureRail();
    onScroll();
  };
  if (rail) {
    rail.hidden = false;
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onMeasure);
    ScrollTrigger.addEventListener("refresh", onMeasure);
    cleanups.push(() => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onMeasure);
      ScrollTrigger.removeEventListener("refresh", onMeasure);
    });
    measureRail();
    paintRail();
  }

  /* ---------- Screen jumps between chapters ---------- */
  const caption = document.querySelector<HTMLElement>("[data-screen-caption]");
  let jumping = false;
  function jump(target: HTMLElement) {
    const smooth = lenis();
    const main = document.querySelector<HTMLElement>("#main");
    const section = target.closest<HTMLElement>("#main > section[id]");
    if (!smooth || !main || !section || !LABELS[section.id] || still()) return false;
    if (jumping) return true;
    jumping = true;
    const scale = innerWidth < 700 ? 0.86 : 0.78;
    const direction = target.getBoundingClientRect().top > 0 ? 1 : -1;
    // Measure before the page is scaled; a scaled page reports scaled boxes.
    const destination = section.id === "home" ? 0 : Math.max(0, target.getBoundingClientRect().top + scrollY + headerOffset() + 8);
    // The visible part of the page, as a rounded screen.
    const frame = () => {
      const top = scrollY - main.offsetTop;
      const bottom = main.offsetHeight - top - innerHeight;
      gsap.set(main, { transformOrigin: `50% ${top + innerHeight / 2}px` });
      return { top, bottom };
    };
    const screen = (inset: number, radius: number) => {
      const { top, bottom } = frame();
      return `inset(${top + inset}px ${inset}px ${bottom + inset}px ${inset}px round ${radius}px)`;
    };
    if (caption) caption.textContent = LABELS[section.id];
    root.classList.add("is-screen-jump");
    smooth.stop();
    const timeline = gsap.timeline({
      defaults: { ease: "power3.inOut" },
      onComplete: () => {
        gsap.set(main, { clearProps: "transform,transformOrigin,clipPath,opacity" });
        root.classList.remove("is-screen-jump");
        smooth.start();
        jumping = false;
        ScrollTrigger.update();
      },
    });
    timeline
      .fromTo(main, { scale: 1, clipPath: screen(0, 0) }, { scale, clipPath: screen(0, 36), duration: 0.5 })
      .to(main, { y: -direction * innerHeight * 0.3, opacity: 0, duration: 0.28, ease: "power2.in" })
      .add(() => {
        smooth.start();
        smooth.scrollTo(destination, { immediate: true, force: true });
        smooth.stop();
        ScrollTrigger.update();
        gsap.set(main, { y: direction * innerHeight * 0.3, clipPath: screen(0, 36) });
      })
      .to(main, { y: 0, opacity: 1, duration: 0.32, ease: "power2.out" })
      .add(() => {
        gsap.set(main, { clipPath: screen(0, 36) });
      })
      .to(main, { scale: 1, clipPath: () => screen(0, 0), duration: 0.55 }, "+=0.12");
    return true;
  }

  /* ---------- The finale: a 3D city, loaded as it approaches ---------- */
  const skyRoot = document.querySelector<HTMLElement>("[data-sky]");
  let sky: SkyControls | null = null;
  let destroyed = false;
  const onPlay = (event: Event) => {
    const flying = (event as CustomEvent<boolean>).detail;
    root.classList.toggle("is-flying", flying);
    if (flying) lenis()?.stop();
    else lenis()?.start();
  };
  window.addEventListener("sky-play", onPlay);
  cleanups.push(() => window.removeEventListener("sky-play", onPlay));
  if (skyRoot) {
    const loader = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        loader.disconnect();
        void import("./sky/game")
          .then(({ initSky }) => {
            if (!destroyed) sky = initSky(skyRoot, { base: import.meta.env.BASE_URL, isStill: still });
          })
          .catch(() => skyRoot.classList.add("is-unsupported"));
      },
      { rootMargin: "1600px 0px" },
    );
    loader.observe(skyRoot);
    // While the visitor reads, fetch and prepare the city in idle time.
    const warm = () =>
      void import("./sky/game")
        .then(({ warmSky }) => warmSky(import.meta.env.BASE_URL))
        .catch(() => undefined);
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const warmTimer = window.setTimeout(() => (idle ? idle(warm, { timeout: 4000 }) : warm()), 2500);
    cleanups.push(() => clearTimeout(warmTimer));
    cleanups.push(() => loader.disconnect());
    skyRoot.querySelectorAll<HTMLElement>("[data-interactive]").forEach((el) => (el.hidden = false));
  }

  setupJourney();
  setupScreens();

  return {
    sync() {
      sky?.sync();
      orb?.sync();
    },
    jump,
    destroy() {
      destroyed = true;
      triggers.forEach((t) => t.kill());
      cleanups.forEach((c) => c());
      cancelAnimationFrame(railFrame);
      sky?.destroy();
      sky = null;
    },
  };
}
