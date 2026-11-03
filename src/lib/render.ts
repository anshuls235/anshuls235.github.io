import { workshop, vignette, spark, ideaMachine, playground, closingScene } from "../world";
import type { Content, Project, Profile } from "./types";
import { escapeHtml as e, safeUrl } from "./content";
import { careerChapters } from "./experience";
const arrow = '<span aria-hidden="true"><svg class="arrow-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19 19 5 M7 5h12v12"/></svg></span>';
const right = '<span aria-hidden="true"><svg class="arrow-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19 19 5 M7 5h12v12"/></svg></span>';
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
function sectionHead(number: string, eyebrow: string, title: string, end = "") {
  return `<div class="section-heading"><div><p class="eyebrow"><span>${number}</span> ${eyebrow}</p><h2>${title}</h2></div>${end}</div>`;
}
export function projectArt(project: Project, index: number, base: string) {
  const image = safeUrl(project.image_url, base);
  if (image)
    return `<div class="project-art art-image"><img src="${e(image)}" alt="${e(project.image_alt || project.title)}" loading="lazy" width="720" height="450"></div>`;
  return `<div class="project-art art-${e(project.visual_kind)}" aria-hidden="true">${vignette(project.slug === "automall-conversational-ai" ? "retrieval" : project.visual_kind, index)}</div>`;
}
export function renderProject(project: Project, index: number, base: string) {
  return `<article class="project-card" id="project-${e(project.slug)}">${projectArt(project, index, base)}<div class="project-body"><p class="project-meta">${e(project.organization || "Independent exploration")}<span>${e(project.category)}</span></p><h3><a href="#work/${e(project.slug)}" data-project="${e(project.slug)}">${e(project.title)} ${right}</a></h3><p>${e(project.summary)}</p><p class="project-read"><a href="#work/${e(project.slug)}" data-project="${e(project.slug)}">Open the project notes ${right}</a></p><ul class="tags" aria-label="Technologies">${project.technologies
    .slice(0, 4)
    .map((t) => `<li>${e(t)}</li>`)
    .join("")}</ul></div></article>`;
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
    )}${project.responsibilities.length ? `<section><h3>My contribution</h3><ul>${project.responsibilities.map((x) => `<li>${e(x)}</li>`).join("")}</ul></section>` : ""}${project.outcomes.length ? `<section><h3>Documented outcomes</h3><ul>${project.outcomes.map((x) => `<li>${e(x)}</li>`).join("")}</ul></section>` : ""}${links.length ? `<div class="detail-links">${links.map((l) => link(l.url, `${e(l.label)} ${arrow}`, base, "button button-primary", `data-event="project_link" data-project-id="${project.id}" data-link-id="${l.id}" data-platform="${e(l.kind)}"`)).join("")}</div>` : ""}`;
}
export function renderImpact(projects: Project[]) {
  const stories = [
    ["automall-ai-search", "Search → sales"],
    ["automall-conversational-ai", "Conversations → leads"],
    ["real-time-lead-scoring", "Intent → opportunity"],
  ].flatMap(([slug, label]) => {
    const project = projects.find(p => p.slug === slug && p.outcomes.length);
    return project ? [{ project, label }] : [];
  });
  if (!stories.length) return "";
  return `<section class="impact-section section container" id="impact" aria-labelledby="impact-heading"><div class="impact-heading"><p class="eyebrow">FROM THE WORKSHOP TO THE REAL WORLD</p><h2 id="impact-heading">Built to make a difference.</h2><p class="section-intro">The work matters most when someone uses it. A few reported results from the projects below.</p></div><div class="impact-grid">${stories.map(({ project, label }, index) => `<article class="impact-card"><p class="mono"><span>${String(index + 1).padStart(2, "0")}</span> ${e(label)}</p><h3>${e(project.title)}</h3><p class="impact-result">${e(project.summary)}</p><a class="text-link" href="#work/${e(project.slug)}" data-project="${e(project.slug)}">Explore the evidence ${right}<span class="sr-only"> for ${e(project.title)}</span></a></article>`).join("")}</div><p class="impact-scope">Sales figures show attributed revenue, not causal uplift. Lead scoring reports early pilot opportunities, not sales. Open the project notes for measurement periods, methods and limitations.</p></section>`;
}

export function renderExperience(experiences: Content["experiences"]) {
  return careerChapters(experiences).map((chapter, index) => `<article class="experience-item"><span class="experience-number mono">${String(index + 1).padStart(2, "0")}</span><div class="career-chapter"><p class="mono experience-date">${date(chapter.start)} — ${chapter.end ? date(chapter.end) : "Latest chapter"}</p><h3>${e(chapter.company)}</h3>${chapter.roles.length > 1 ? '<p class="career-progression mono">Role progression</p>' : ""}<ol class="career-roles">${chapter.roles.map(role => `<li class="career-role"><div class="career-role-heading"><h4>${e(role.position)}</h4><p class="mono">${date(role.start_date)} — ${role.end_date ? date(role.end_date) : "Latest chapter"}</p></div><p class="career-location">${e(role.location)}</p>${role.highlights.length ? `<details><summary>Explore contributions<span class="sr-only"> as ${e(role.position)} at ${e(chapter.company)}</span><span aria-hidden="true">+</span></summary><ul>${role.highlights.map(h => `<li>${e(h)}</li>`).join("")}</ul></details>` : ""}</li>`).join("")}</ol></div></article>`).join("") || '<p class="empty-state">Experience details will be added soon.</p>';
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
        "text-link",
        `data-event="social_click" data-platform="${e(s.network.toLowerCase())}"`,
      ),
    )
    .join("");

  const categories = [
    "All work",
    ...new Set(content.projects.map((p) => p.category)),
  ];
  const skills = [...new Set(content.skills.map((s) => s.category))];
  return `<main id="main">
  <div class="hero-world"><section class="hero container" id="home" aria-labelledby="hero-heading">
    <div class="hero-topline"><p class="eyebrow"><span class="status-dot"></span> THE WORLD OF ${e(p.name).toUpperCase()}</p><p class="mono location">${e(p.location)} / ALWAYS CURIOUS</p></div>
    <div class="hero-layout"><div class="hero-copy"><p class="hello">Hello, I’m ${e(p.name.split(" ")[0])}. ${spark}</p><h1 id="hero-heading">${e(p.headline).replace(/\n/g, "<br> ")}</h1><p class="hero-description">${e(p.introduction)}</p><div class="hero-actions"><a class="button button-primary" href="#projects">Explore my work ${right}</a>${link(p.resume_url, `Download CV ${arrow}`, base, "button button-plain", 'data-event="cv_download" download')}</div><p class="hero-signoff"><span>${e(p.title)}</span> · Builder at heart.</p></div>${workshop(base)}</div>
    <div class="hero-bottom"><p class="mono">BIG QUESTIONS. SMALL EXPERIMENTS. USEFUL THINGS.</p><button class="world-motion" data-world-motion type="button" aria-pressed="false">Pause motion <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M6 4v12M14 4v12" stroke="currentColor" stroke-width="3"/></svg></button></div>
  </section></div>
  ${ideaMachine()}<div class="world-ribbon" aria-label="Approach"><div>HUMAN IDEAS ${spark} MACHINE INTELLIGENCE ${spark} REAL-WORLD IMPACT ${spark} ENDLESS CURIOSITY ${spark}</div></div>
  ${renderImpact(content.projects)}
  <section class="selected-section section" id="projects"><div class="project-theatre container">${sectionHead("01", "SELECTED WORK", "Out of the workshop.", '<a href="#archive" class="text-link">View all projects <span aria-hidden="true"><svg class="arrow-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5 19 19 M7 19h12V7"/></svg></span></a>')}<p class="section-intro">From a first question to a working system. A selection of things I’ve helped build.</p><div class="project-gallery-controls" data-interactive hidden><p class="mono" data-project-position aria-live="polite">01 / SELECTED WORK</p><div><button type="button" data-gallery-prev aria-label="Previous featured project"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M20 12H4m7-7-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2"/></svg></button><button type="button" data-gallery-next aria-label="Next featured project"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 12h16m-7-7 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2"/></svg></button></div></div><div class="project-window"><div class="selected-grid">${
    content.projects
      .filter((x) => x.featured)
      .map((p, i) => renderProject(p, i, base))
      .join("") ||
    '<p class="empty-state">Selected work is being updated. Explore the archive below.</p>'
  }</div></div><p class="gallery-hint" data-interactive hidden>SCROLL, SWIPE OR USE THE ARROWS TO EXPLORE</p></div></section>
  ${playground()}
  <section class="archive-section section container" id="archive">${sectionHead("02", "THE PROJECT ARCHIVE", "The curiosity cabinet.")}<div class="archive-tools" data-interactive hidden><div class="filters" role="group" aria-label="Filter projects">${categories.map((c, i) => `<button class="filter ${i === 0 ? "is-active" : ""}" type="button" data-category="${e(c)}" aria-pressed="${i === 0}">${e(c)}</button>`).join("")}</div><div class="search-field"><label class="sr-only" for="project-search">Search projects</label><span aria-hidden="true">⌕</span><input id="project-search" type="search" placeholder="Search projects…" maxlength="120" autocomplete="off"></div></div><p id="archive-count" class="mono archive-count" role="status" aria-live="polite">${content.projects.length} projects</p><div id="archive-list">${renderArchive(content.projects)}</div><noscript><p class="notice">All work is shown. Project filtering and expanded case studies need JavaScript; external source links remain available below.</p><div>${content.project_links.map((l) => link(l.url, `${e(l.label)} ${arrow}`, base, "text-link")).join(" · ")}</div></noscript></section>
  <section class="experience-section section" id="experience"><div class="container experience-layout"><div>${sectionHead("03", "EXPERIENCE", "A few chapters<br>in the making.")}<p class="section-intro">Working where data, engineering, and business decisions meet.</p>${link(p.resume_url, `Download full CV ${arrow}`, base, "text-link", 'data-event="cv_download" download')}</div><div class="experience-list">${renderExperience(content.experiences)}</div></div></section>
  <section class="section container" id="skills">${sectionHead("04", "EXPERTISE", "A well-stocked toolbox.")}<div class="expertise-grid">${
    skills
      .map(
        (category, i) =>
          `<article class="expertise-item"><span class="mono">${String(i + 1).padStart(2, "0")} /</span><h3>${e(category)}</h3><ul class="skill-list">${content.skills
            .filter((s) => s.category === category)
            .map((s) => `<li>${e(s.name)}</li>`)
            .join("")}</ul></article>`,
      )
      .join("") ||
    '<p class="empty-state">Expertise details are being updated.</p>'
  }</div></section>
  <section class="writing-section section" id="writing"><div class="container">${sectionHead("05", "NOTES & EXPLORATIONS", "Learning, in public.", link(content.social_links.find((s) => s.network === "Medium")?.url ?? null, `All writing ${arrow}`, base, "text-link", 'data-event="social_click" data-platform="medium"'))}<div class="writing-layout"><div class="publication-list">${content.publications.map((a, i) => `<article class="publication-item"><span class="mono article-index">${String(i + 1).padStart(2, "0")}</span><div><p class="mono article-meta">${e(a.platform)}${a.published_on ? ` · ${new Date(a.published_on).getUTCFullYear()}` : ""}</p><h3>${link(a.url, `${e(a.title)} ${arrow}`, base, "", 'data-event="social_click" data-platform="medium"')}</h3><p>${e(a.summary)}</p></div></article>`).join("") || '<p class="empty-state">New writing will appear here.</p>'}</div><aside class="notebook-panel"><span class="notebook-symbol" aria-hidden="true">k.</span><p class="eyebrow">DATA, OPENLY EXPLORED</p><h3>Curiosity has a notebook.</h3><p>Explore my data-science notebooks and experiments on Kaggle.</p>${link(content.social_links.find((s) => s.network === "Kaggle")?.url ?? null, `Explore Kaggle ${arrow}`, base, "text-link", 'data-event="social_click" data-platform="kaggle"')}</aside></div></div></section>
  <section class="education-section section container" id="education">${sectionHead("06", "FOUNDATIONS", "Always a student.")}<div class="education-grid">${content.education.map((x) => `<article><p class="mono">${x.start_year} — ${x.end_year ?? "Present"}</p><h3>${e(x.degree)}</h3><p>${e(x.institution)}</p>${link(x.url, `Institution ${arrow}`, base, "text-link")}</article>`).join("")}${content.certifications.map((x) => `<article><p class="mono">${x.issued_on ? new Date(x.issued_on).getUTCFullYear() : "CERTIFICATION"}</p><h3>${e(x.title)}</h3><p>${e(x.issuer)}</p>${link(x.url, `View credential ${arrow}`, base, "text-link")}</article>`).join("")}</div></section>
  <section class="about-section section" id="about"><div class="container about-layout"><div><p class="eyebrow"><span>07</span> BEYOND THE MODELS</p><h2>Engineering meets<br><em>curiosity.</em></h2></div><div><p class="about-copy">${e(p.about)}</p><p class="mono about-focus">${e(p.current_focus)}</p></div></div></section>
  <section class="contact-section section container" id="contact">${closingScene()}<p class="eyebrow">HAVE AN INTERESTING PROBLEM?</p><div class="contact-heading"><h2>Let’s make<br>something useful.</h2>${link(`mailto:${p.email}`, '<span aria-hidden="true"><svg class="arrow-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19 19 5 M7 5h12v12"/></svg></span><span class="sr-only">Email ' + e(p.name) + "</span>", base, "contact-arrow", 'data-event="contact_action"')}</div><div class="contact-bottom">${link(`mailto:${p.email}`, e(p.email), base, "contact-email", 'data-event="contact_action"')}<div class="social-links">${social}</div></div></section>
  </main><footer class="site-footer container"><p>© ${new Date().getUTCFullYear()} ${e(p.name)}</p><div><a href="${base}privacy.html">Privacy & analytics</a><a href="#home">Back to top ↑</a></div></footer>`;
}
export function renderArchive(projects: Project[]) {
  if (!projects.length)
    return '<div class="empty-state"><h3>No matching projects.</h3><p>Try another term or choose a different category.</p><button class="text-link" type="button" data-reset>Clear filters <svg class="arrow-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19 19 5 M7 5h12v12"/></svg></button></div>';
  return projects
    .map(
      (p, i) =>
        `<article class="archive-row"><span class="mono archive-index">${String(i + 1).padStart(2, "0")}</span><div><p class="mono">${e(p.organization || "Independent exploration")}</p><h3><a href="#work/${e(p.slug)}" data-project="${e(p.slug)}">${e(p.title)}</a></h3><p class="archive-summary">${e(p.summary)}</p></div><span class="archive-category mono">${e(p.category)}</span><a class="archive-arrow" href="#work/${e(p.slug)}" data-project="${e(p.slug)}" aria-label="Read about ${e(p.title)}"><svg class="arrow-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19 19 5 M7 5h12v12"/></svg></a></article>`,
    )
    .join("");
}
export function metadata(p: Profile, site: string, base: string) {
  const title = `${p.name} — ${p.title}`;
  return `<title>${e(title)}</title><meta name="description" content="${e(p.introduction)}"><link rel="canonical" href="${e(site)}"><meta property="og:type" content="website"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(p.introduction)}"><meta property="og:url" content="${e(site)}"><meta property="og:image" content="${e(new URL(base + "assets/social-preview.png", site).href)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">`;
}
