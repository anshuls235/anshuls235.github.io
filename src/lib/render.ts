import { coverImage, hasCover } from "../art";
import { heroScene, vignette, logoMark } from "../world";
import type { Content, Project, Profile } from "./types";
import { escapeHtml as e, safeUrl } from "./content";
import { careerChapters } from "./experience";
import landDots from "../content/map-dots.json";
import { CITIES, fullCircle, journeyStops, modelTopics, projectPlace, storyProjects, type CityId } from "./story";

const arrowPath = "M5 19 19 5 M7 5h12v12";
const icon = (path: string) =>
  `<svg class="arrow-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><path d="${path}"/></svg>`;
const arrow = `<span aria-hidden="true">${icon(arrowPath)}</span>`;
const right = arrow;
const down = `<span aria-hidden="true">${icon("M5 5 19 19 M7 19h12V7")}</span>`;
const pad = (n: number) => String(n).padStart(2, "0");

function link(
  url: string | null,
  label: string,
  base: string,
  cls = "",
  attrs = "",
) {
  const href = safeUrl(url, base);
  if (!href) return "";
  const external = href.startsWith("https:");
  return `<a class="${cls}" href="${e(href)}" ${external ? 'target="_blank" rel="noopener noreferrer"' : ""} ${attrs}>${label}${external ? '<span class="sr-only"> (opens in a new tab)</span>' : ""}</a>`;
}
function conversationStarter(email: string, subject: string, say: string) {
  const address = safeUrl(`mailto:${email}`);
  if (!address) return "";
  return `<a class="box-button box-button-light" href="${e(address)}?subject=${encodeURIComponent(subject)}" data-event="contact_action" data-say="${e(say)}">${e(subject)} ${arrow}</a>`;
}
function date(value: string | null) {
  if (!value) return "Present";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}
/** Display headings are split into masked lines so they can rise into view. */
function display(text: string) {
  return text
    .split("\n")
    .map((line) => `<span class="line"><span>${line}</span></span>`)
    .join("");
}
function sectionHead(
  number: string,
  eyebrow: string,
  title: string,
  id: string,
  end = "",
) {
  return `<div class="section-heading"><div><p class="eyebrow"><span>${number}</span>${eyebrow}</p><h2 class="display" id="${id}">${display(title)}</h2></div>${end}</div>`;
}

/** The headline number a published summary leads with, used as a card metric. */
export function headlineMetric(summary: string) {
  const money = summary.match(/(?:AED|US\$|\$|€|£)\s?[\d.,]+\s?[MKB]?/);
  if (money) return money[0].replace(/\s(?=[MKB]$)/, "");
  const percents = summary.match(/\d+(?:\.\d+)?%/g);
  if (percents) return percents.at(-1)!;
  const count = summary.match(/\d{1,3}(?:,\d{3})+|\d{3,}/);
  return count ? count[0] : "";
}

export function projectArt(project: Project, index: number, base: string) {
  const image = safeUrl(project.image_url, base);
  if (image)
    return `<div class="project-art art-image"><img src="${e(image)}" alt="${e(project.image_alt || project.title)}" loading="lazy" width="720" height="450"></div>`;
  if (hasCover(project.slug))
    return `<div class="project-art art-cover" aria-hidden="true">${coverImage(project.slug, base, "(max-width: 900px) 92vw, 800px")}</div>`;
  return `<div class="project-art art-${e(project.visual_kind)}" aria-hidden="true">${vignette(project.slug === "automall-conversational-ai" ? "retrieval" : project.visual_kind, index)}</div>`;
}

export function renderProject(
  project: Project,
  index: number,
  total = 1,
  place = "",
) {
  return `<article class="project-card frame" id="project-${e(project.slug)}" data-index="${index}"><div class="project-body"><div class="project-badge"><span class="mono">${place ? e(place) : "Project"}</span><strong>${pad(index + 1)}</strong><span class="mono">${e(project.category)}</span></div><dl class="project-meta"><div><dt class="mono">Client</dt><dd>${e(project.organization || "Independent exploration")}</dd></div></dl><h3><a href="#work/${e(project.slug)}" data-project="${e(project.slug)}">${e(project.title)}</a></h3><p class="project-summary">${e(project.summary)}</p><ul class="tags" aria-label="Technologies">${project.technologies
    .slice(0, 4)
    .map((t) => `<li>${e(t)}</li>`)
    .join(
      "",
    )}</ul><div class="project-foot"><a class="box-button" href="#work/${e(project.slug)}" data-project="${e(project.slug)}">View project ${right}<span class="sr-only"> notes for ${e(project.title)}</span></a><span class="mono project-count" aria-hidden="true">${index + 1}/${total}</span></div></div></article>`;
}

/** A tile for the spiral: the project's cover, or a typographic poster without one. */
function spiralTile(project: Project, index: number, base: string, city = "") {
  const metric = headlineMetric(project.summary);
  const top = `<span class="tile-top mono"><span>${pad(index + 1)}</span><span>${e(project.category)}</span></span>`;
  const attrs = `href="#work/${e(project.slug)}" data-project="${e(project.slug)}" data-spiral-tile="${index}" data-place="${e(city)}" tabindex="-1" draggable="false"`;
  if (hasCover(project.slug))
    return `<a class="spiral-tile has-cover" ${attrs}>${coverImage(project.slug, base, "(max-width: 980px) 60vw, 40vw")}${top}${metric ? `<strong class="tile-metric">${e(metric)}</strong>` : ""}</a>`;
  const mark = metric || project.technologies[0] || project.category;
  return `<a class="spiral-tile tone-${index % 6}" ${attrs}>${top}<strong class="tile-mark${mark.length > 10 ? " is-long" : mark.length > 5 ? " is-mid" : ""}">${e(mark)}</strong><span class="tile-title">${e(project.title)}</span><span class="tile-foot mono">${e(project.organization || "Independent")}</span></a>`;
}

export function renderProjectDetail(
  project: Project,
  content: Content,
  base: string,
) {
  const blocks = [
    ["The context", project.problem],
    ["The approach", project.approach],
  ];
  const links = content.project_links.filter(
    (l) => l.project_id === project.id,
  );
  return `<p class="eyebrow">${e(project.category)} / ${e(project.organization || "Independent project")}</p><h2 id="detail-title">${e(project.title)}</h2><p class="detail-intro">${e(project.description)}</p>${projectArt(project, 0, base)}<dl class="project-facts">${project.role ? `<div><dt>My role</dt><dd>${e(project.role)}</dd></div>` : ""}${project.start_date ? `<div><dt>Timeline</dt><dd>${date(project.start_date)} – ${date(project.end_date)}</dd></div>` : ""}<div><dt>Stack</dt><dd>${e(project.technologies.join(" · "))}</dd></div></dl>${blocks
    .filter(([, body]) => body)
    .map(
      ([title, body]) =>
        `<section><h3>${title}</h3><p>${e(body)}</p></section>`,
    )
    .join(
      "",
    )}${project.responsibilities.length ? `<section><h3>My contribution</h3><ul>${project.responsibilities.map((x) => `<li>${e(x)}</li>`).join("")}</ul></section>` : ""}${project.outcomes.length ? `<section><h3>Documented outcomes</h3><ul>${project.outcomes.map((x) => `<li>${e(x)}</li>`).join("")}</ul></section>` : ""}${links.length ? `<div class="detail-links">${links.map((l) => link(l.url, `${e(l.label)} ${arrow}`, base, "box-button", `data-event="project_link" data-project-id="${project.id}" data-link-id="${l.id}" data-platform="${e(l.kind)}"`)).join("")}</div>` : ""}`;
}

function impactStories(projects: Project[]) {
  return [
    ["automall-ai-search", "Search-attributed revenue"],
    ["automall-conversational-ai", "Conversation-attributed revenue"],
    ["real-time-lead-scoring", "Pilot opportunity share"],
  ].flatMap(([slug, label]) => {
    const project = projects.find((p) => p.slug === slug && p.outcomes.length);
    return project ? [{ project, label }] : [];
  });
}

/** Split-flap characters: each one settles on its letter when the board comes into view. */
function flaps(text: string, width: number) {
  return [...text.toUpperCase().padEnd(width, " ")].slice(0, width).map((ch) => `<span class="flap" data-char="${e(ch)}">${ch === " " ? "&nbsp;" : e(ch)}</span>`).join("");
}

/** Results as an arrivals board: what landed, from which project, as reported. */
export function renderImpact(projects: Project[]) {
  const stories = impactStories(projects);
  if (!stories.length) return "";
  const width = Math.max(...stories.map(({ project }) => headlineMetric(project.summary).length), 6);
  return `<section class="impact-section board-section chapter" id="impact" aria-labelledby="impact-heading"><div class="container impact-heading"><div><p class="eyebrow"><span>04</span>What it changed</p><h2 class="display" id="impact-heading">${display("Arrivals.")}</h2></div><p class="section-intro">Work only matters once someone uses it. Three of the projects you just flew past, and what they reported when they landed.</p></div>
  <div class="container"><div class="board" data-board>
    <div class="board-top mono" aria-hidden="true"><span class="board-title">Arrivals · Results</span><span>Dubai <b data-board-clock>--:--</b></span></div>
    <div class="board-head mono" aria-hidden="true"><span>Flight</span><span>Result</span><span>Project</span><span>Status</span></div>
    ${stories
      .map(({ project, label }, i) => {
        const metric = headlineMetric(project.summary);
        return `<article class="impact-card board-row" data-metric="${e(metric)}"><span class="board-flight mono">AS ${pad(i + 1)}${pad(i * 3 + 4)}</span><div class="board-result"><span class="board-flaps" aria-hidden="true">${flaps(metric, width)}</span><span class="sr-only">${e(metric)}</span><p class="impact-label mono">${e(label)}</p></div><div class="board-what"><h3><a href="#work/${e(project.slug)}" data-project="${e(project.slug)}">${e(project.title)}</a></h3><p class="impact-result">${e(project.summary)}</p></div><span class="board-status mono"><i aria-hidden="true"></i>Landed</span></article>`;
      })
      .join("")}
  </div></div>
  <p class="impact-scope container">Sales figures show attributed revenue, not causal uplift. Lead scoring reports early pilot opportunities, not sales. Open the project notes for measurement periods, methods and limitations.</p>${bridge("#notes", "Between the flights, I write things down and keep learning")}</section>`;
}

/** Map coordinates for the journey: an equirectangular crop of the land, no borders. */
const MAP = { w: 800, h: 560, lon: landDots.bounds.lon, lat: landDots.bounds.lat };
function project(lon: number, lat: number) {
  return {
    x: ((lon - MAP.lon[0]) / (MAP.lon[1] - MAP.lon[0])) * MAP.w,
    y: ((MAP.lat[1] - lat) / (MAP.lat[1] - MAP.lat[0])) * MAP.h,
  };
}
function year(value: string | null) {
  return value ? value.slice(0, 4) : "now";
}
/** "1 yr", "8 yrs 10 mos": how long a stop lasted. */
function stay(start: string, end: string | null) {
  const to = end ? new Date(end) : new Date("2026-11-25");
  const months = Math.max(1, (to.getUTCFullYear() - new Date(start).getUTCFullYear()) * 12 + to.getUTCMonth() - new Date(start).getUTCMonth());
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y} yr${y > 1 ? "s" : ""}` : "", m ? `${m} mo${m > 1 ? "s" : ""}` : ""].filter(Boolean).join(" ");
}
const TAGLINES: Record<CityId, string> = {
  bengaluru: "Where it started: shipping code inside enterprise systems.",
  delhi: "Where the developer became a data scientist.",
  dubai: "Where the models met the market.",
};
const planeIcon = `<svg class="pass-plane" viewBox="-16 -12 36 24" aria-hidden="true"><path d="M-14 -10 18 0 -14 10 -7 0Z"/></svg>`;

/** The career as a flight: a map whose legs draw as you scroll, and a boarding pass per city. */
export function renderJourney(experiences: Content["experiences"], base = "/", passenger = "") {
  const stops = journeyStops(experiences);
  if (!stops.length) return '<p class="empty-state">Experience details will be added soon.</p>';
  const circle = fullCircle(stops);
  const points = stops.map((s) => project(CITIES[s.city].lon, CITIES[s.city].lat));
  const legs = points.slice(1).map((to, i) => {
    const from = points[i];
    // Bow each leg like a great-circle route seen on a flat map.
    const mx = (from.x + to.x) / 2 - (to.y - from.y) * 0.3;
    const my = (from.y + to.y) / 2 - (to.x - from.x) * 0.3;
    return `M${from.x.toFixed(1)} ${from.y.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
  });
  const last = points.at(-1)!;
  if (circle) legs.push(`M${last.x.toFixed(1)} ${last.y.toFixed(1)} c 34 -78 128 -56 104 14 c -18 52 -92 40 -104 -14`);
  const first = Number(year(stops[0].start));
  const finalYear = Number(year(circle?.start ?? stops.at(-1)!.start));
  const span = Math.max(1, finalYear + 1 - first);
  const at = (date: string) => ((new Date(date).getUTCFullYear() + new Date(date).getUTCMonth() / 12 - first) / span) * 100;
  const marks = [...stops.map((s) => ({ code: CITIES[s.city].short, date: s.start })), ...(circle ? [{ code: "SAP", date: circle.start }] : [])];
  const tx = (pct: number) => (20 + (pct / 100) * 760).toFixed(1);
  const timeline = `<svg class="journey-timeline" viewBox="0 0 800 64" aria-hidden="true"><path class="timeline-track" d="M20 22H780"/><path class="timeline-fill" data-timeline-fill d="M20 22H780" pathLength="1"/>${Array.from({ length: span }, (_, i) => `<g class="timeline-year" transform="translate(${tx((i / span) * 100)} 0)"><path d="M0 16v12"/><text y="50" text-anchor="middle">${first + i}</text></g>`).join("")}${marks.map((m, i) => `<g class="timeline-stop" data-timeline-stop="${i}" data-pct="${at(m.date).toFixed(2)}" data-year="${year(m.date)}" transform="translate(${tx(at(m.date))} 22)"><circle r="7"/><text y="-14" text-anchor="middle">${m.code}</text></g>`).join("")}</svg>`;
  const map = `<figure class="journey-map" aria-hidden="true"><svg viewBox="0 0 ${MAP.w} ${MAP.h}" fill="none"><image class="map-land" href="${base}assets/journey-land.svg" width="${MAP.w}" height="${MAP.h}" preserveAspectRatio="none"/><text class="map-sea" x="${project(64, 14.5).x}" y="${project(64, 14.5).y}">Arabian Sea</text><text class="map-sea" x="${project(51.6, 27.2).x}" y="${project(51.6, 27.2).y}">Gulf</text><g class="map-legs">${legs.map((d, i) => `<path class="map-leg-ghost" d="${d}"/><path class="map-leg" data-leg="${i}" d="${d}" pathLength="1"/>`).join("")}</g>${stops.map((s, i) => { const left = s.city === "dubai"; return `<g class="map-city" data-city-marker="${i}" transform="translate(${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)})"><circle class="map-halo" r="20"/><circle class="map-pin" r="8"/><g class="map-tag" transform="translate(${left ? -16 : 16} ${s.city === "bengaluru" ? 6 : -10})"><text class="map-code" text-anchor="${left ? "end" : "start"}">${CITIES[s.city].short}</text><text class="map-name" y="18" text-anchor="${left ? "end" : "start"}">${CITIES[s.city].name} · ${year(s.start)}</text></g></g>`; }).join("")}<g class="map-plane" data-journey-plane transform="translate(${points[0].x} ${points[0].y})"><path d="M-14 -10 18 0 -14 10 -7 0Z"/><path class="map-plane-fold" d="M-7 0H18"/></g></svg><figcaption class="map-year"><span class="mono">Year</span><strong data-journey-year>${finalYear}</strong></figcaption></figure>`;
  // Each role is one itinerary row; its highlights live on the back of the ticket.
  const role = (r: Content["experiences"][number]) =>
    r.highlights.length
      ? `<li class="career-role"><button type="button" class="role-row" data-role-log="log-${e(r.slug)}" aria-controls="log-${e(r.slug)}" aria-expanded="false"><h5>${e(r.position)}</h5><span class="mono role-dates">${date(r.start_date)} — ${r.end_date ? date(r.end_date) : "Now"}</span><span class="role-arrow" aria-hidden="true">${icon("M5 12h14M13 6l6 6-6 6")}</span><span class="sr-only">: flight log</span></button></li>`
      : `<li class="career-role"><div class="role-row is-static"><h5>${e(r.position)}</h5><span class="mono role-dates">${date(r.start_date)} — ${r.end_date ? date(r.end_date) : "Now"}</span></div></li>`;
  const logs = (roles: Content["experiences"]) =>
    roles
      .filter((r) => r.highlights.length)
      .map((r) => `<section class="pass-log" id="log-${e(r.slug)}" aria-label="Flight log: ${e(r.position)}, ${e(r.company)}"><p class="mono log-kicker">Flight log · ${e(r.company)}</p><h4>${e(r.position)}</h4><p class="mono log-dates">${date(r.start_date)} — ${r.end_date ? date(r.end_date) : "Now"} · ${e(r.location)}</p><ul class="log-list">${r.highlights.map((h) => `<li>${e(h)}</li>`).join("")}</ul><button type="button" class="log-back" data-log-back>${icon("M19 12H5M11 6l-6 6 6 6")} Back to the pass</button></section>`)
      .join("");
  // A real boarding pass: the ticket, a perforated stub, a security pattern and a passport stamp.
  const pass = (i: number, from: [string, string], to: [string, string], start: string, end: string | null, title: string, line: string, chapters: string, gate: string, stamp: string, extra = "") => {
    const flight = `AS ${year(start)}`;
    const seat = `${pad(i + 1)}${"ACDF"[i % 4]}`;
    return `<li class="journey-stop${extra}" data-stop="${i}"><article class="boarding-pass"><div class="pass-ticket"><header class="pass-band"><span class="pass-airline">${logoMark()}<span>AS<b>AIR</b></span></span><span class="mono">Boarding pass · Career class</span></header><div class="pass-body"><div class="pass-route"><div><span class="mono">From</span><strong>${from[0]}</strong><span>${from[1]}</span></div><div class="pass-path" aria-hidden="true"><i></i>${planeIcon}<span class="mono">${stay(start, end)}</span></div><div class="pass-to"><span class="mono">To</span><strong>${to[0]}</strong><span>${to[1]}</span></div></div><dl class="pass-meta"><div><dt class="mono">Passenger</dt><dd>${e(passenger)}</dd></div><div><dt class="mono">Flight</dt><dd>${flight}</dd></div><div><dt class="mono">Gate</dt><dd>${gate}</dd></div><div><dt class="mono">Boarded</dt><dd>${date(start)}</dd></div><div><dt class="mono">${end ? "Until" : "Status"}</dt><dd>${end ? date(end) : "Now"}</dd></div><div><dt class="mono">Seat</dt><dd>${seat}</dd></div></dl><div class="pass-title"><h3>${title}</h3><p class="pass-line">${line}</p><span class="pass-stamp" aria-hidden="true"><b>${stamp}</b><i>${year(start)}</i></span></div>${chapters}</div></div><aside class="pass-stub" aria-hidden="true"><span class="mono">${flight}</span><strong>${from[0]}</strong><span class="pass-stub-arrow">↓</span><strong>${to[0]}</strong><span class="mono">Seat ${seat}</span><span class="pass-code"></span></aside></article></li>`;
  };
  const passes = stops.map((s, i) => {
    const chapters = s.chapters.filter((c) => !(circle && c === circle && i === stops.length - 1));
    const next = stops[i + 1];
    const to: [string, string] = next ? [CITIES[next.city].short, CITIES[next.city].name] : circle ? [e(circle.company.split(" ")[0]), date(circle.start)] : ["—", "Next"];
    const end = next ? next.start : circle ? circle.start : s.end;
    return pass(i, [CITIES[s.city].short, CITIES[s.city].name], to, s.start, end, e(CITIES[s.city].name), TAGLINES[s.city], chapters.map((c) => `<div class="pass-chapter"><h4>${e(c.company)}</h4><ol class="career-roles">${c.roles.map(role).join("")}</ol></div>`).join("") + logs(chapters.flatMap((c) => c.roles)), e(chapters[0]?.company.split(" ")[0] ?? "—"), e(CITIES[s.city].name));
  });
  if (circle) {
    const root = e(circle.company.split(" ")[0]);
    passes.push(pass(stops.length, [root, `${CITIES[stops[0].city].name} · ${year(stops[0].start)}`], [root, `${CITIES[stops.at(-1)!.city].name} · ${year(circle.start)}`], circle.start, null, `Back to ${e(circle.company)}.`, `The company where I wrote my first production code, ${year(stops[0].start)} in ${CITIES[stops[0].city].name}, is where I now take AI to customers in the field.`, `<div class="pass-chapter"><h4>${e(circle.company)} · ${e(CITIES[stops.at(-1)!.city].name)}</h4><ol class="career-roles">${circle.roles.map(role).join("")}</ol></div>${logs(circle.roles)}`, root, "Returned", " is-circle"));
  }
  return `<div class="journey-visual" data-first-year="${first}" data-final-year="${finalYear}">${map}${timeline}</div><ol class="journey-stops" data-steps="${passes.length}">${passes.join("")}</ol>`;
}

/** The chapter list that the flight rail and the screen transitions share. */
export const CHAPTERS = [
  ["home", "Hello"],
  ["experience", "Journey"],
  ["skills", "Model"],
  ["projects", "Work"],
  ["impact", "Impact"],
  ["notes", "Notes"],
  ["contact", "Let’s talk"],
] as const;

function flightRail(hasImpact: boolean) {
  const chapters = CHAPTERS.filter(([id]) => hasImpact || id !== "impact");
  return `<nav class="flight-rail" aria-label="Story chapters" data-rail data-interactive hidden><ol>${chapters.map(([id, label], i) => `<li><a href="#${id}" data-rail-stop="${id}"><span class="rail-dot" aria-hidden="true"></span><span class="rail-label mono"><span>${pad(i)}</span>${label}</span></a></li>`).join("")}</ol><span class="rail-plane" data-rail-plane aria-hidden="true"><svg viewBox="-16 -12 36 24" width="26" height="18"><path d="M-14 -10 18 0 -14 10 -7 0Z"/></svg></span></nav>`;
}

/** The bridge at the end of each chapter, which hands the story to the next. */
function bridge(href: string, text: string) {
  return `<a class="bridge container" href="${href}"><span class="bridge-line" aria-hidden="true"></span><span class="bridge-text">${text}</span><span class="bridge-arrow" aria-hidden="true">${icon("M5 5 19 19 M7 19h12V7")}</span></a>`;
}

/** The finale: a real city in 3D, the plane, and the conversation. */
function renderSky(p: Profile, base: string, social: string) {
  const cities = (["bengaluru", "delhi", "dubai"] as CityId[]).map((id) => `<button type="button" data-city="${id}" aria-pressed="${id === "dubai"}"><span class="mono">${CITIES[id].short}</span>${e(CITIES[id].name)}</button>`).join("");
  const stat = (name: string, label: string, unit: string) => `<div><span class="mono">${label}</span><strong data-hud="${name}">0</strong><span class="mono">${unit}</span></div>`;
  const result = (name: string, label: string) => `<div><dt class="mono">${label}</dt><dd data-over="${name}">0</dd></div>`;
  return `<div class="sky" data-sky data-city="dubai" data-sky-mode="attract">
    <canvas data-sky-canvas aria-label="A paper plane gliding over a city" role="img"></canvas>
    <div class="sky-poster" aria-hidden="true"></div>
    <div class="sky-shade" aria-hidden="true"></div>
    <p class="sky-loading mono" aria-hidden="true"><span data-sky-loading-label>Loading the city…</span><span class="sky-progress"><i data-sky-progress></i></span></p>
    <div class="sky-cities" role="group" aria-label="Choose a city to fly over" data-interactive hidden>${cities}</div>
    <div class="sky-speedlines" aria-hidden="true"></div>
    <div class="sky-clock" aria-hidden="true"><span class="mono">Time</span><strong data-hud="time">75</strong><span class="sky-meter" data-sky-meter><i></i></span><span class="mono sky-meter-label">Boost</span><span class="sky-bonus mono" data-sky-bonus></span></div>
    <div class="sky-hud" aria-hidden="true">${stat("score", "Score", "")}${stat("combo", "Combo", "")}${stat("rings", "Rings", "")}${stat("speed", "Speed", "km/h")}${stat("alt", "Height", "m")}${stat("vario", "Climb", "m/s")}<p class="sky-chip sky-lift mono">Rising air</p><p class="sky-chip sky-stall mono">Too slow — dive</p></div>
    <p class="sky-count" data-sky-count aria-hidden="true" hidden></p>
    <div class="sky-pointer" data-sky-pointer aria-hidden="true" hidden><span class="sky-pointer-arrow"></span><span class="sky-pointer-ring"></span><span class="mono" data-sky-pointer-distance></span></div>
    <div class="sky-controls" data-interactive hidden><p class="mono sky-help"><span class="kbd">↑↓</span> climb / dive <span class="kbd">←→</span> turn <span class="kbd">Space</span> boost <span class="kbd">R</span> restart · or aim with the mouse · Grab orbs: <b class="orb-boost">boost</b> <b class="orb-lift">updraft</b> <b class="orb-time">time</b> · Skim landmarks for postcards</p><button type="button" class="box-button sky-boost-button" data-sky-boost>Hold to boost</button><button type="button" class="box-button" data-sky-sound aria-pressed="true">Sound on</button><button type="button" class="box-button" data-sky-assist aria-pressed="true">Assist on</button><button type="button" class="box-button box-button-primary" data-sky-exit>Land &amp; talk</button></div>
    <section class="sky-over" data-sky-over aria-label="Flight over" hidden><p class="mono" data-over="cause">Landed</p><h3>Flight over</h3><dl>${result("score", "Score")}${result("rings", "Rings")}${result("postcards", "Postcards")}${result("distance", "Distance")}${result("time", "Time aloft")}${result("best", "Best here")}</dl><p class="sky-stamps mono" data-over="stamps"></p><div class="sky-over-actions"><button type="button" class="box-button box-button-primary" data-sky-relaunch>Fly again</button><button type="button" class="box-button" data-sky-exit>Land &amp; talk</button></div></section>
    <p class="sky-credit mono">Buildings, roads &amp; water: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors<span class="sr-only"> (opens in a new tab)</span></a></p>
    <p class="sr-only" data-sky-status role="status" aria-live="polite"></p>
    <div class="contact-card container">
      <p class="eyebrow"><span>06</span>Last stop · ${e(p.location)}</p>
      <div class="contact-heading"><h2 class="display" id="contact-heading">${display("Great things\nstart with hello.")}</h2></div>
      <p class="contact-lede">That paper plane left the top of the page as a hello. It flew the whole journey, and it has landed here, over Dubai Marina. Send one back.</p>
      <div class="contact-prompts"><p class="mono">Pick a conversation starter</p><div>${[["I have an AI idea", "AI IDEA?"], ["Let’s collaborate", "LET’S BUILD"], ["Just saying hello", "HEY THERE"]].map(([subject, say]) => conversationStarter(p.email, subject, say)).join("")}</div></div>
      <div class="contact-bottom">${link(`mailto:${p.email}`, e(p.email), base, "contact-email", 'data-event="contact_action"')}<div class="social-links">${social}</div></div>
      <div class="sky-invite" data-interactive hidden><button type="button" class="box-button box-button-primary" data-sky-play>Take the controls ${icon("M5 12h14M13 6l6 6-6 6")}</button><p class="mono">Beat the clock through rings over real Bengaluru, Delhi and Dubai. Real lift, drag and thermals.</p></div>
    </div>
  </div>`;
}

/** A short name for a project, from its slug: "automall-ai-search" → "Automall AI search". */
export function shortName(slug: string) {
  const words: Record<string, string> = { ai: "AI", ml: "ML", mcp: "MCP", covid19: "COVID-19" };
  return slug
    .split("-")
    .map((w, i) => words[w] ?? (i ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Expertise as a knowledge orb: topics as hubs, skills around them, and arcs between skills that shipped together. */
export function renderOrb(content: Content) {
  const topics = modelTopics(content);
  if (!topics.length) return '<p class="empty-state">Expertise details are being updated.</p>';
  const nodes: { id: number; label: string; topic: number; hub: boolean; projects: string[] }[] = [];
  topics.forEach((t, i) => {
    nodes.push({ id: nodes.length, label: t.name, topic: i, hub: true, projects: t.projects.map((p) => p.slug) });
    t.skills.forEach((skill) => nodes.push({ id: nodes.length, label: skill.name, topic: i, hub: false, projects: skill.projects }));
  });
  // Skills that shipped in the same project are linked.
  const links = new Map<string, [number, number]>();
  const skills = nodes.filter((n) => !n.hub);
  for (const project of content.projects) {
    const used = skills.filter((n) => n.projects.includes(project.slug)).map((n) => n.id);
    for (let i = 0; i < used.length; i++) for (let j = i + 1; j < used.length; j++) links.set(`${used[i]}-${used[j]}`, [used[i], used[j]]);
  }
  const projects = Object.fromEntries(storyProjects(content).map((p) => [p.slug, { name: shortName(p.slug), place: projectPlace(p, content).label }]));
  const graph = { topics: topics.map((t) => t.name), nodes, links: [...links.values()], projects };
  const totalSkills = skills.length;
  const shipped = skills.filter((n) => n.projects.length).length;
  return `<div class="container orb-grid">
    <div class="orb-copy">${sectionHead("02", "What the journey trained", "The model\nbehind the work.", "skills-heading")}
      <p class="section-intro">${topics.length} topics, ${totalSkills} skills, and the arcs between skills that shipped together. Turn the globe, then pick anything to see the work behind it.</p>
      <div class="orb-topics" role="group" aria-label="Topics">${topics.map((t, i) => `<button type="button" data-orb-topic="${nodes.find((n) => n.hub && n.topic === i)!.id}" aria-pressed="false"><span class="mono">${pad(i + 1)}</span>${e(t.name)}<b class="mono">${t.skills.length}</b></button>`).join("")}</div>
      <div class="orb-detail" data-orb-detail aria-live="polite"><p class="mono">${shipped} of ${totalSkills} skills appear in published work. Filled dots shipped; hollow ones are in the toolkit.</p></div>
    </div>
    <div class="orb-stage" data-orb data-graph="${e(JSON.stringify(graph))}"><canvas aria-hidden="true"></canvas><p class="orb-hint mono" aria-hidden="true">Drag to turn · click a node</p></div>
  </div>
  <div class="sr-only">${topics.map((t) => `<h3>${e(t.name)}</h3><ul>${t.skills.map((s) => `<li>${e(s.name)}${s.projects.length ? `: used in ${s.projects.map((slug) => e(shortName(slug))).join(", ")}` : ""}</li>`).join("")}</ul>`).join("")}</div>`;
}

function stat(value: number | string, label: string) {
  const digits = String(value).padStart(2, "0").split("");
  return `<div class="score"><p class="score-digits" aria-hidden="true">${digits.map((d) => `<span>${d}</span>`).join("")}</p><p class="mono">${label}</p><span class="sr-only">${value} ${label}</span></div>`;
}

export function renderSite(content: Content, base = "/") {
  const p = content.profile[0];
  if (!p)
    return '<main id="main"><section class="container empty-page"><p class="eyebrow">PORTFOLIO</p><h1>More to come.</h1><p>This portfolio is being updated. Please check back soon.</p></section></main>';
  const social = content.social_links
    .map((s) =>
      link(
        s.url,
        `${e(s.network)} ${arrow}`,
        base,
        "box-button box-button-light",
        `data-event="social_click" data-platform="${e(s.network.toLowerCase())}"`,
      ),
    )
    .join("");
  // The spiral follows the career: the work in the order it happened.
  const showcase = storyProjects(content);
  const places = showcase.map((x) => projectPlace(x, content));
  const chapters = careerChapters(content.experiences);
  const stops = journeyStops(content.experiences);
  const firstYear = content.experiences
    .map((x) => Number(x.start_date.slice(0, 4)))
    .sort()[0];
  const years = firstYear ? new Date().getUTCFullYear() - firstYear : 0;
  const tickerItems = [
    ...stops.map((s) => `${CITIES[s.city].short} ${year(s.start)}`),
    ...impactStories(content.projects).map(
      ({ project, label }) => `${headlineMetric(project.summary)} · ${label}`,
    ),
    ...p.current_focus.split("·").map((x) => x.trim()),
  ].filter(Boolean);
  const ticker = tickerItems
    .map((t) => `<span>${e(t)}</span><i></i>`)
    .join("");
  const hello = p.name.split(" ")[0];
  const impact = renderImpact(content.projects);
  const medium = content.social_links.find((s) => s.network === "Medium")?.url ?? null;
  const kaggle = content.social_links.find((s) => s.network === "Kaggle")?.url ?? null;
  const firstCity = stops[0] ? CITIES[stops[0].city].name : "";
  const lastCity = stops.at(-1) ? CITIES[stops.at(-1)!.city].name : "";

  return `${flightRail(Boolean(impact))}<main id="main" class="story">
  <section class="hero" id="home" aria-labelledby="hero-heading">
    ${heroScene(base)}
    <div class="hero-inner container">
      <div class="hero-panel frame">
        <div class="frame-bar mono"><span><span class="status-dot" aria-hidden="true"></span>The world of ${e(p.name)}</span><span>${e(p.location)}</span></div>
        <div class="hero-copy">
          <p class="hero-hello display">${display(`Hi, I’m ${e(hello)}.`)}</p>
          <h1 id="hero-heading">${e(p.headline).replace(/\n/g, "<br> ")}</h1>
          <p class="hero-description">${e(p.introduction)}</p>
          <div class="hero-actions"><a class="box-button box-button-primary" href="#projects">Explore my work ${down}</a>${link(p.resume_url, `Download CV ${arrow}`, base, "box-button", 'data-event="cv_download" download')}</div>
        </div>
        <span class="hero-plane" data-hero-plane aria-hidden="true"><svg viewBox="-16 -12 36 24" width="54" height="36"><path d="M-14 -10 18 0 -14 10 -7 0Z"/><path class="fold" d="M-7 0H18"/></svg></span>
      </div>
    </div>
    <div class="hero-foot container"><p class="mono hero-role">${e(p.title)} · ${e(p.location)}</p><a class="scroll-pill mono" href="#experience" aria-label="Follow the journey"><i aria-hidden="true"></i>Follow the plane</a><button class="world-motion mono" data-world-motion type="button" aria-pressed="false">Pause motion <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M6 4v12M14 4v12" stroke="currentColor" stroke-width="3"/></svg></button></div>
  </section>
  <div class="ticker" aria-hidden="true"><div class="ticker-track">${ticker}${ticker}${ticker}</div></div>
  <section class="journey-section chapter" id="experience" aria-labelledby="experience-heading">
    <div class="journey-track" data-journey><div class="journey-pin">
      <div class="container journey-grid"><div class="journey-head">${sectionHead("01", "The journey", "Three cities.\nOne flight path.", "experience-heading")}<p class="section-intro">${firstCity && lastCity ? `${e(firstCity)} to ${e(lastCity)}` : "A career"}, ${years} years, one direction: from writing enterprise code to putting AI in front of the people who use it.</p></div>${renderJourney(content.experiences, base, p.name)}<p class="journey-hint mono" data-interactive hidden>Scroll to fly the route</p></div>
    </div></div>
    ${bridge("#skills", "Every stop trained something. Here is the model it built")}
  </section>
  <section class="model-section orb-section chapter" id="skills" aria-labelledby="skills-heading">
    ${renderOrb(content)}
    ${bridge("#projects", "A model is only as good as what it ships. Here is the work, in the order it happened")}
  </section>
  <section class="work-section selected-section chapter" id="projects" aria-labelledby="work-heading">
    <div class="container work-top"><div><p class="eyebrow"><span>03</span>What I built along the way</p><h2 class="display display-thin" id="work-heading">${display("Work")}</h2></div><div class="work-intro"><p class="section-intro">In the order it happened, from side projects in ${e(CITIES.delhi.name)} to agents in ${e(lastCity || CITIES.dubai.name)}. Scroll to fly through it; open any project to read the notes.</p></div></div>
    <div class="work-track" data-work-track><div class="work-pin">
    <div class="work-stage container">
      <div class="spiral-stage" data-spiral aria-hidden="true"><div class="spiral-rig">${showcase.map((x, i) => spiralTile(x, i, base, places[i].city)).join("")}</div></div>
      <div class="selected-grid" data-carousel>${
        showcase.map((x, i) => renderProject(x, i, showcase.length, places[i].label)).join("") ||
        '<p class="empty-state frame">Selected work is being updated. Please check back soon.</p>'
      }</div>
    </div>
    <div class="container work-status" data-interactive hidden><p class="mono" data-project-position aria-live="polite">01 / ${pad(showcase.length)} — Selected work</p><p class="mono gallery-hint">Drag the spiral or use the arrows</p><div class="spin-buttons"><button class="spin-button" type="button" data-gallery-prev aria-label="Previous project"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M20 12H4m7-7-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4"/></svg></button><button class="spin-button" type="button" data-gallery-next aria-label="Next project"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 12h16m-7-7 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4"/></svg></button></div></div>
    </div></div>
    <noscript><div class="container work-plain"><p class="notice">Expanded case studies need JavaScript. These project links work without it.</p><p>${content.project_links.map((l) => link(l.url, `${e(l.label)} ${arrow}`, base, "text-link")).join(" · ")}</p></div></noscript>
    ${bridge(impact ? "#impact" : "#notes", impact ? "So what did it change? The numbers, as reported" : "Between the flights, I write things down and keep learning")}
  </section>
  ${impact}
  <section class="notes-section layover-section chapter" id="notes" aria-labelledby="writing-heading">
    <div class="container layover-head">${sectionHead("05", "Between flights", "Postcards,\npassport, journal.", "writing-heading", link(medium, `All writing ${arrow}`, base, "box-button box-button-light", 'data-event="social_click" data-platform="medium"'))}<p class="section-intro">What I write down, where I learned, and who I am when the laptop closes.</p><aside class="luggage-tag notebook-panel"><span class="tag-hole" aria-hidden="true"></span><p class="mono">Checked bag · KGL</p><h3>Curiosity has a notebook.</h3><p>Data-science notebooks and experiments, packed and shared on Kaggle.</p>${link(kaggle, `Explore Kaggle ${arrow}`, base, "box-button", 'data-event="social_click" data-platform="kaggle"')}</aside></div>
    <div class="container postcards" id="writing">${content.publications.map((a, i) => `<article class="postcard"><div class="postcard-message"><p class="mono">Note ${pad(i + 1)} · ${e(a.platform)}</p><h3>${link(a.url, `${e(a.title)} ${arrow}`, base, "", 'data-event="social_click" data-platform="medium"')}</h3><p>${e(a.summary)}</p></div><div class="postcard-side" aria-hidden="true"><span class="postage"><b>${e(a.platform.slice(0, 2).toUpperCase())}</b><i>${a.published_on ? new Date(a.published_on).getUTCFullYear() : "Now"}</i></span><span class="postmark">${e(CITIES[i % 2 ? "delhi" : "dubai"].short)} · ${a.published_on ? new Date(a.published_on).getUTCFullYear() : "new"}</span><span class="address">To: anyone curious<br>about AI &amp; data</span></div></article>`).join("") || '<p class="empty-state">New writing will appear here.</p>'}</div>
    <div class="container layover-grid">
      <article class="passport education-section" id="education" aria-labelledby="education-heading">
        <div class="passport-page passport-id"><p class="mono">Passport · Foundations</p><img src="${base}assets/portrait-small.webp" alt="" width="120" height="150" loading="lazy" decoding="async"><dl><div><dt class="mono">Name</dt><dd>${e(p.name)}</dd></div>${content.education[0]?.end_year ? `<div><dt class="mono">Graduated</dt><dd>${content.education[0].end_year}</dd></div>` : ""}<div><dt class="mono">Based in</dt><dd>${e(p.location)}</dd></div></dl><p class="passport-mrz mono" aria-hidden="true">P&lt;${e(p.name.toUpperCase().replace(/\s+/g, "<"))}&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</p></div>
        <div class="passport-page passport-visas"><h3 id="education-heading">Always a student.</h3>${content.education.map((x, i) => `<div class="visa visa-${i % 3}"><p class="mono">${x.start_year} — ${x.end_year ?? "Present"}</p><h4>${e(x.degree)}</h4><p>${e(x.institution)}</p>${link(x.url, `Institution ${arrow}`, base, "text-link")}</div>`).join("")}${content.certifications.map((x, i) => `<div class="visa visa-${(i + 1) % 3}"><p class="mono">${x.issued_on ? new Date(x.issued_on).getUTCFullYear() : "Certification"}</p><h4>${e(x.title)}</h4><p>${e(x.issuer)}</p>${link(x.url, `View credential ${arrow}`, base, "text-link")}</div>`).join("")}</div>
      </article>
      <article class="journal about-section" id="about" aria-labelledby="about-heading"><p class="mono journal-date">Journal · ${new Date().getUTCFullYear()}</p><h3 id="about-heading">Engineering meets curiosity.</h3><p class="about-copy" data-read>${e(p.about)}</p><p class="mono about-focus">${e(p.current_focus)}</p><div class="stickers scoreboard" data-scoreboard>${stat(years, "Years shipping")}${stat(stops.length, "Cities")}${stat(chapters.length, "Career epochs")}${stat(content.projects.length, "Projects")}</div></article>
    </div>
    ${bridge("#contact", `Which brings the plane to its last stop: ${e(lastCity || "home")}`)}
  </section>
  <section class="contact-section chapter" id="contact" aria-labelledby="contact-heading">${renderSky(p, base, social)}</section>
  </main><footer class="site-footer"><div class="container footer-inner"><a class="footer-mark" href="#home" aria-label="Back to the top">${logoMark()}</a><p>© ${new Date().getUTCFullYear()} ${e(p.name)}</p><div><a href="${base}privacy.html">Privacy & analytics</a><a href="#home">Back to top ↑</a></div></div></footer>`;
}

export function metadata(p: Profile, site: string, base: string) {
  const title = `${p.name} — ${p.title}`;
  return `<title>${e(title)}</title><meta name="description" content="${e(p.introduction)}"><link rel="canonical" href="${e(site)}"><meta property="og:type" content="website"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(p.introduction)}"><meta property="og:url" content="${e(site)}"><meta property="og:image" content="${e(new URL(base + "assets/social-preview.png", site).href)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">`;
}
