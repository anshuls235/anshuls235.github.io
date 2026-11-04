import { heroScene, workScene, vignette, closingScene, logoMark } from "../world";
import type { Content, Project, Profile } from "./types";
import { escapeHtml as e, safeUrl } from "./content";
import { careerChapters } from "./experience";

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
  return `<div class="project-art art-${e(project.visual_kind)}" aria-hidden="true">${vignette(project.slug === "automall-conversational-ai" ? "retrieval" : project.visual_kind, index)}</div>`;
}

export function renderProject(
  project: Project,
  index: number,
  base: string,
  total = 1,
) {
  return `<article class="project-card frame" id="project-${e(project.slug)}" data-index="${index}"><div class="project-body"><div class="project-badge"><span class="mono">Project</span><strong>${pad(index + 1)}</strong><span class="mono">${e(project.category)}</span></div><dl class="project-meta"><div><dt class="mono">Client</dt><dd>${e(project.organization || "Independent exploration")}</dd></div></dl><h3><a href="#work/${e(project.slug)}" data-project="${e(project.slug)}">${e(project.title)}</a></h3><p class="project-summary">${e(project.summary)}</p><ul class="tags" aria-label="Technologies">${project.technologies
    .slice(0, 4)
    .map((t) => `<li>${e(t)}</li>`)
    .join(
      "",
    )}</ul><div class="project-foot"><a class="box-button" href="#work/${e(project.slug)}" data-project="${e(project.slug)}">View project ${right}<span class="sr-only"> notes for ${e(project.title)}</span></a><span class="mono project-count" aria-hidden="true">${index + 1}/${total}</span></div></div>${projectArt(project, index, base)}</article>`;
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
    ["automall-ai-search", "Search → sales"],
    ["automall-conversational-ai", "Conversations → leads"],
    ["real-time-lead-scoring", "Intent → opportunity"],
  ].flatMap(([slug, label]) => {
    const project = projects.find((p) => p.slug === slug && p.outcomes.length);
    return project ? [{ project, label }] : [];
  });
}

export function renderImpact(projects: Project[]) {
  const stories = impactStories(projects);
  if (!stories.length) return "";
  return `<section class="impact-section" id="impact" aria-labelledby="impact-heading"><div class="container impact-heading"><div><p class="eyebrow"><span>00</span>From the workshop to the real world</p><h2 class="display" id="impact-heading">${display("Built to make\na difference.")}</h2></div><p class="section-intro">The work matters most when someone uses it. A few reported results from the projects below.</p></div><div class="wire-stage" data-wire><span class="wire" aria-hidden="true"></span><div class="impact-grid container">${stories
    .map(
      ({ project, label }, index) =>
        `<article class="impact-card" data-swing><span class="lanyard" aria-hidden="true"><i></i></span><div class="impact-card-inner frame"><p class="impact-label mono"><span>${pad(index + 1)}</span>${e(label)}</p><p class="impact-metric" aria-hidden="true">${e(headlineMetric(project.summary))}</p><h3>${e(project.title)}</h3><p class="impact-result">${e(project.summary)}</p><a class="box-button" href="#work/${e(project.slug)}" data-project="${e(project.slug)}">Explore the evidence ${right}<span class="sr-only"> for ${e(project.title)}</span></a></div></article>`,
    )
    .join(
      "",
    )}</div></div><p class="impact-scope container">Sales figures show attributed revenue, not causal uplift. Lead scoring reports early pilot opportunities, not sales. Open the project notes for measurement periods, methods and limitations.</p></section>`;
}

export function renderExperience(experiences: Content["experiences"]) {
  const chapters = careerChapters(experiences);
  return (
    chapters
      .map(
        (chapter, index) =>
          `<article class="experience-item frame"><div class="experience-top"><span class="epoch mono">Epoch ${pad(chapters.length - index)}</span><p class="mono experience-date">${date(chapter.start)} — ${chapter.end ? date(chapter.end) : "Latest chapter"}</p></div><div class="career-chapter"><h3>${e(chapter.company)}</h3>${chapter.roles.length > 1 ? '<p class="career-progression mono">Role progression</p>' : ""}<ol class="career-roles">${chapter.roles.map((role) => `<li class="career-role"><div class="career-role-heading"><h4>${e(role.position)}</h4><p class="mono">${date(role.start_date)} — ${role.end_date ? date(role.end_date) : "Latest chapter"}</p></div><p class="career-location">${e(role.location)}</p>${role.highlights.length ? `<details><summary>Explore contributions<span class="sr-only"> as ${e(role.position)} at ${e(chapter.company)}</span><span aria-hidden="true" class="summary-icon">+</span></summary><ul>${role.highlights.map((h) => `<li>${e(h)}</li>`).join("")}</ul></details>` : ""}</li>`).join("")}</ol></div></article>`,
      )
      .join("") || '<p class="empty-state">Experience details will be added soon.</p>'
  );
}

/** A small "training curve" whose checkpoints are the career chapters. */
function lossCurve(experiences: Content["experiences"]) {
  const chapters = careerChapters(experiences).reverse();
  if (!chapters.length) return "";
  const w = 420;
  const h = 220;
  const points = chapters.map((c, i) => {
    const x = 30 + (i / Math.max(1, chapters.length - 1)) * (w - 60);
    const y = 40 + (h - 80) * Math.exp(-i * 1.1) ;
    return { x, y: h - y + 20, company: c.company };
  });
  let d = `M14 ${h - 196}`;
  points.forEach((p, i) => {
    const prev = i ? points[i - 1] : { x: 14, y: h - 196 };
    const mid = (prev.x + p.x) / 2;
    d += ` C${mid} ${prev.y} ${mid} ${p.y} ${p.x} ${p.y}`;
  });
  d += ` C${w - 20} ${points.at(-1)!.y} ${w - 10} ${points.at(-1)!.y + 4} ${w} ${points.at(-1)!.y + 4}`;
  return `<figure class="loss-chart frame" aria-hidden="true"><figcaption class="mono"><span>Training curve</span><span>loss ↓ · experience ↑</span></figcaption><svg viewBox="0 0 ${w} ${h}" fill="none"><g class="loss-grid">${[50, 100, 150, 200].map((y) => `<path d="M0 ${y}H${w}"/>`).join("")}</g><path class="loss-line" data-loss-line d="${d}" pathLength="1"/>${points.map((p, i) => `<g class="loss-point" data-loss-point="${i}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})"><circle r="7"/><text y="${i % 2 ? 26 : -16}" text-anchor="middle">${e(p.company.replace(/\s(India|Automotive|Global)$/, ""))}</text></g>`).join("")}</svg></figure>`;
}

const OUTPUTS = ["Shipped products", "Better decisions", "Measured impact"];
const CATEGORY_TONES = ["mint", "yellow", "coral", "sky", "lilac", "lime"];

export function renderNetwork(skills: Content["skills"]) {
  const categories = [...new Set(skills.map((s) => s.category))];
  if (!categories.length)
    return '<p class="empty-state">Expertise details are being updated.</p>';
  const groups = categories.map((category) =>
    skills.filter((s) => s.category === category),
  );
  const halves = groups.map((list) => {
    const cut = Math.ceil(list.length / 2);
    return [list.slice(0, cut), list.slice(cut)];
  });
  const tone = (i: number) => CATEGORY_TONES[i % CATEGORY_TONES.length];
  const hidden = (layer: 0 | 1) =>
    halves
      .map(
        (h, i) =>
          `<div class="band tone-${tone(i)}" data-band="${i}">${h[layer].map((s) => `<span class="node node-skill" data-cat="${i}">${e(s.name)}</span>`).join("")}</div>`,
      )
      .join("");
  return `<div class="network" data-network><canvas class="network-canvas" aria-hidden="true"></canvas><div class="layer layer-input"><p class="layer-label mono" aria-hidden="true">Input layer</p>${categories
    .map(
      (c, i) =>
        `<button type="button" class="node node-input tone-${tone(i)}" data-cat="${i}" aria-pressed="false"><span class="node-dot" aria-hidden="true"></span><span class="node-name">${e(c)}</span><span class="node-count mono" aria-hidden="true">${pad(groups[i].length)}</span><span class="sr-only"> — highlight ${groups[i].length} skills in the network</span></button>`,
    )
    .join(
      "",
    )}</div><div class="layer layer-hidden" aria-hidden="true"><p class="layer-label mono">Hidden layer 1</p>${hidden(0)}</div><div class="layer layer-hidden" aria-hidden="true"><p class="layer-label mono">Hidden layer 2</p>${hidden(1)}</div><div class="layer layer-output" aria-hidden="true"><p class="layer-label mono">Output</p>${OUTPUTS.map((o) => `<span class="node node-output">${o}</span>`).join("")}</div></div><div class="sr-only">${categories
    .map(
      (c, i) =>
        `<h3>${e(c)}</h3><ul class="skill-list">${groups[i].map((s) => `<li>${e(s.name)}</li>`).join("")}</ul>`,
    )
    .join("")}</div>`;
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
  const categories = [
    "All work",
    ...new Set(content.projects.map((p) => p.category)),
  ];
  const featured = content.projects.filter((x) => x.featured);
  const chapters = careerChapters(content.experiences);
  const firstYear = content.experiences
    .map((x) => Number(x.start_date.slice(0, 4)))
    .sort()[0];
  const years = firstYear ? new Date().getUTCFullYear() - firstYear : 0;
  const tickerItems = [
    ...impactStories(content.projects).map(
      ({ project, label }) => `${headlineMetric(project.summary)} · ${label}`,
    ),
    ...p.current_focus.split("·").map((x) => x.trim()),
  ].filter(Boolean);
  const ticker = tickerItems
    .map((t) => `<span>${e(t)}</span><i></i>`)
    .join("");
  const hello = p.name.split(" ")[0];

  return `<main id="main">
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
      </div>
    </div>
    <div class="hero-foot container"><p class="mono hero-role">${e(p.title)} · Builder at heart</p><a class="scroll-pill mono" href="#impact" aria-label="Scroll to reported impact"><i aria-hidden="true"></i>Scroll</a><button class="world-motion mono" data-world-motion type="button" aria-pressed="false">Pause motion <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M6 4v12M14 4v12" stroke="currentColor" stroke-width="3"/></svg></button></div>
  </section>
  <div class="ticker" aria-hidden="true"><div class="ticker-track">${ticker}${ticker}${ticker}</div></div>
  ${renderImpact(content.projects)}
  <section class="work-section selected-section" id="projects" aria-labelledby="work-heading">
    ${workScene(base)}
    <div class="container work-top"><div><p class="eyebrow"><span>01</span>Selected work</p><h2 class="display display-thin" id="work-heading">${display("Work")}</h2></div><div class="work-intro"><p class="section-intro">From a first question to a working system. A selection of things I’ve helped build.</p><a href="#archive" class="box-button box-button-light">View all projects ${down}</a></div></div>
    <div class="work-stage container">
      <button class="edge-button edge-prev" type="button" data-gallery-prev data-interactive hidden aria-label="Previous featured project"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M20 12H4m7-7-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4"/></svg></button>
      <div class="selected-grid" data-carousel>${
        featured.map((x, i) => renderProject(x, i, base, featured.length)).join("") ||
        '<p class="empty-state frame">Selected work is being updated. Explore the archive below.</p>'
      }</div>
      <button class="edge-button edge-next" type="button" data-gallery-next data-interactive hidden aria-label="Next featured project"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 12h16m-7-7 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4"/></svg></button>
    </div>
    <div class="container work-status" data-interactive hidden><p class="mono" data-project-position aria-live="polite">01 / ${pad(featured.length)} — Selected work</p><div class="work-dots" aria-hidden="true">${featured.map((_, i) => `<i data-dot="${i}"></i>`).join("")}</div><p class="mono gallery-hint">Swipe, drag or use the arrows</p></div>
  </section>
  <section class="model-section" id="skills" aria-labelledby="skills-heading">
    <div class="container">
      <div class="model-heading">${sectionHead("02", "Expertise, as a neural network", "The model\nbehind the work.", "skills-heading")}<div class="model-side"><p class="section-intro">Every project runs through the same network. Pick an input to watch a forward pass light up the stack that powers it.</p><div class="model-hud mono" aria-hidden="true"><div><span>Epoch</span><strong data-epoch>001</strong></div><div><span>Loss</span><strong data-loss>0.693</strong></div><svg viewBox="0 0 120 36" preserveAspectRatio="none"><path data-loss-spark d="M0 4L120 4"/></svg></div></div></div>
      ${renderNetwork(content.skills)}
      <p class="sr-only" data-network-status role="status"></p><p class="network-readout mono" data-readout aria-hidden="true">${content.skills.length} skills · ${new Set(content.skills.map((s) => s.category)).size} input layers · ready for a forward pass</p>
    </div>
  </section>
  <section class="experience-section section" id="experience" aria-labelledby="experience-heading"><div class="container experience-layout"><div class="experience-side">${sectionHead("03", "Experience", "Trained on\nreal problems.", "experience-heading")}<p class="section-intro">Working where data, engineering and business decisions meet — one epoch at a time.</p>${lossCurve(content.experiences)}${link(p.resume_url, `Download full CV ${arrow}`, base, "box-button", 'data-event="cv_download" download')}</div><div class="experience-list">${renderExperience(content.experiences)}</div></div></section>
  <section class="archive-section section" id="archive" aria-labelledby="archive-heading"><div class="container">${sectionHead("04", "The project archive", "The curiosity\ncabinet.", "archive-heading")}<div class="archive-tools" data-interactive hidden><div class="filters" role="group" aria-label="Filter projects">${categories.map((c, i) => `<button class="filter ${i === 0 ? "is-active" : ""}" type="button" data-category="${e(c)}" aria-pressed="${i === 0}">${e(c)}</button>`).join("")}</div><div class="search-field"><label class="sr-only" for="project-search">Search projects</label><span aria-hidden="true">⌕</span><input id="project-search" type="search" placeholder="Search projects…" maxlength="120" autocomplete="off"></div></div><p id="archive-count" class="mono archive-count" role="status" aria-live="polite">${content.projects.length} projects</p><div id="archive-list" class="archive-list frame">${renderArchive(content.projects)}</div><noscript><p class="notice">All work is shown. Project filtering and expanded case studies need JavaScript; external source links remain available below.</p><div>${content.project_links.map((l) => link(l.url, `${e(l.label)} ${arrow}`, base, "text-link")).join(" · ")}</div></noscript></div></section>
  <section class="writing-section section" id="writing" aria-labelledby="writing-heading"><div class="container">${sectionHead("05", "Notes & explorations", "Learning,\nin public.", "writing-heading", link(content.social_links.find((s) => s.network === "Medium")?.url ?? null, `All writing ${arrow}`, base, "box-button box-button-light", 'data-event="social_click" data-platform="medium"'))}<div class="writing-layout">${content.publications.map((a, i) => `<article class="publication-item frame"><div class="frame-bar mono"><span>Note ${pad(i + 1)}</span><span>${e(a.platform)}${a.published_on ? ` · ${new Date(a.published_on).getUTCFullYear()}` : ""}</span></div><div class="publication-body"><h3>${link(a.url, `${e(a.title)} ${arrow}`, base, "", 'data-event="social_click" data-platform="medium"')}</h3><p>${e(a.summary)}</p></div></article>`).join("") || '<p class="empty-state">New writing will appear here.</p>'}<aside class="notebook-panel frame"><span class="notebook-symbol" aria-hidden="true">k.</span><p class="eyebrow">Data, openly explored</p><h3>Curiosity has a notebook.</h3><p>Explore my data-science notebooks and experiments on Kaggle.</p>${link(content.social_links.find((s) => s.network === "Kaggle")?.url ?? null, `Explore Kaggle ${arrow}`, base, "box-button", 'data-event="social_click" data-platform="kaggle"')}</aside></div></div></section>
  <section class="education-section section" id="education" aria-labelledby="education-heading"><div class="container">${sectionHead("06", "Foundations", "Always\na student.", "education-heading")}<div class="education-grid">${content.education.map((x) => `<article class="frame credential"><p class="mono">${x.start_year} — ${x.end_year ?? "Present"}</p><h3>${e(x.degree)}</h3><p>${e(x.institution)}</p>${link(x.url, `Institution ${arrow}`, base, "text-link")}</article>`).join("")}${content.certifications.map((x) => `<article class="frame credential"><p class="mono">${x.issued_on ? new Date(x.issued_on).getUTCFullYear() : "Certification"}</p><h3>${e(x.title)}</h3><p>${e(x.issuer)}</p>${link(x.url, `View credential ${arrow}`, base, "text-link")}</article>`).join("")}</div></div></section>
  <section class="about-section section" id="about" aria-labelledby="about-heading"><div class="container about-layout"><div><p class="eyebrow"><span>07</span>Beyond the models</p><h2 class="display" id="about-heading">${display("Engineering\nmeets curiosity.")}</h2></div><div><p class="about-copy">${e(p.about)}</p><p class="mono about-focus">${e(p.current_focus)}</p></div></div><div class="container scoreboard frame" data-scoreboard>${stat(years, "Years shipping")}${stat(chapters.length, "Career epochs")}${stat(content.projects.length, "Projects")}${stat(content.skills.length, "Skills in the model")}</div></section>
  <section class="contact-section section" id="contact" aria-labelledby="contact-heading"><div class="container"><p class="eyebrow"><span>08</span>Have an interesting problem?</p><div class="contact-heading"><h2 class="display" id="contact-heading">${display("Let’s make\nsomething useful.")}</h2>${link(`mailto:${p.email}`, `${arrow}<span class="sr-only">Email ${e(p.name)}</span>`, base, "contact-arrow", 'data-event="contact_action"')}</div>${closingScene()}<div class="contact-bottom">${link(`mailto:${p.email}`, e(p.email), base, "contact-email", 'data-event="contact_action"')}<div class="social-links">${social}</div></div></div></section>
  </main><footer class="site-footer"><div class="container footer-inner"><a class="footer-mark" href="#home" aria-label="Back to the top">${logoMark()}</a><p>© ${new Date().getUTCFullYear()} ${e(p.name)}</p><div><a href="${base}privacy.html">Privacy & analytics</a><a href="#home">Back to top ↑</a></div></div></footer>`;
}

export function renderArchive(projects: Project[]) {
  if (!projects.length)
    return `<div class="empty-state"><h3>No matching projects.</h3><p>Try another term or choose a different category.</p><button class="box-button" type="button" data-reset>Clear filters ${arrow}</button></div>`;
  return projects
    .map(
      (p, i) =>
        `<article class="archive-row"><span class="mono archive-index">${pad(i + 1)}</span><div><p class="mono">${e(p.organization || "Independent exploration")}</p><h3><a href="#work/${e(p.slug)}" data-project="${e(p.slug)}">${e(p.title)}</a></h3><p class="archive-summary">${e(p.summary)}</p></div><span class="archive-category mono">${e(p.category)}</span><a class="archive-arrow" href="#work/${e(p.slug)}" data-project="${e(p.slug)}" aria-label="Read about ${e(p.title)}">${icon(arrowPath)}</a></article>`,
    )
    .join("");
}

export function metadata(p: Profile, site: string, base: string) {
  const title = `${p.name} — ${p.title}`;
  return `<title>${e(title)}</title><meta name="description" content="${e(p.introduction)}"><link rel="canonical" href="${e(site)}"><meta property="og:type" content="website"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(p.introduction)}"><meta property="og:url" content="${e(site)}"><meta property="og:image" content="${e(new URL(base + "assets/social-preview.png", site).href)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">`;
}
