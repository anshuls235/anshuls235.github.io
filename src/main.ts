import fallback from "./content/fallback.json";
import { validateSnapshot, fetchContent, filterProjects } from "./lib/content";
import { configuredProject, configuredAnalytics } from "./lib/settings";
import { renderSite, renderProjectDetail, renderArchive } from "./lib/render";
import { createAnalytics, type EventName } from "./lib/analytics";
let content = validateSnapshot(fallback).content;
const base = import.meta.env.BASE_URL;
const config = configuredProject(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);
const track = createAnalytics(
  config,
  configuredAnalytics(import.meta.env.VITE_ANALYTICS_ENABLED),
);
const portfolio = document.querySelector<HTMLElement>("#portfolio")!;
const dialog = document.querySelector<HTMLDialogElement>("#project-dialog")!;
const detail = document.querySelector<HTMLElement>("#project-detail")!;
const status = document.querySelector<HTMLElement>("#content-status")!;
let category = "All work";
let query = "";
let opener: HTMLElement | null = null;
let returnHash = "#projects";
function updateArchive() {
  const projects = filterProjects(content.projects, category, query);
  const list = document.querySelector("#archive-list");
  if (list) list.innerHTML = renderArchive(projects);
  const count = document.querySelector("#archive-count");
  if (count)
    count.textContent = `${projects.length} ${projects.length === 1 ? "project" : "projects"}${query ? " matching your search" : ""}`;
  document
    .querySelectorAll<HTMLButtonElement>("[data-category]")
    .forEach((button) => {
      const active = button.dataset.category === category;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
}
function enableInteractions() {
  document
    .querySelectorAll<HTMLElement>("[data-interactive]")
    .forEach((el) => (el.hidden = false));
}
function openProject(slug: string) {
  const project = content.projects.find((p) => p.slug === slug);
  if (!project) {
    if (dialog.open) dialog.close();
    status.textContent = "This project is no longer published.";
    return;
  }
  detail.innerHTML = renderProjectDetail(project, content, base);
  if (!dialog.open) dialog.showModal();
  track("project_view", {
    project_id: project.id,
    path: location.pathname + "#work/" + slug,
  });
}
function routeProject() {
  const match = location.hash.match(/^#work\/([a-z0-9-]+)$/);
  if (match) openProject(match[1]);
  else if (dialog.open) dialog.close();
}
function closeProject() {
  dialog.close();
  if (location.hash.startsWith("#work/"))
    history.replaceState(null, "", returnHash);
  opener?.focus();
}
document
  .querySelector("#close-dialog")!
  .addEventListener("click", closeProject);
dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeProject();
});
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) {
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      closeProject();
  }
});
window.addEventListener("hashchange", routeProject);
document.addEventListener("click", (event) => {
  const target =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>("a,button")
      : null;
  if (!target) return;
  if (target.hasAttribute("data-project")) {
    event.preventDefault();
    opener = target;
    returnHash = location.hash.startsWith("#work/")
      ? "#projects"
      : location.hash || "#projects";
    const slug = target.dataset.project!;
    history.pushState(null, "", "#work/" + slug);
    openProject(slug);
  }
  if (target.hasAttribute("data-category")) {
    category = target.dataset.category!;
    updateArchive();
  }
  if (target.hasAttribute("data-reset")) {
    category = "All work";
    query = "";
    const input = document.querySelector<HTMLInputElement>("#project-search");
    if (input) input.value = "";
    updateArchive();
    input?.focus();
  }
  if (target.dataset.event)
    track(target.dataset.event as EventName, {
      ...(target.dataset.projectId
        ? { project_id: target.dataset.projectId }
        : {}),
      ...(target.dataset.linkId ? { link_id: target.dataset.linkId } : {}),
      ...(target.dataset.platform ? { platform: target.dataset.platform } : {}),
    });
});
document.addEventListener("input", (event) => {
  if (
    event.target instanceof HTMLInputElement &&
    event.target.id === "project-search"
  ) {
    query = event.target.value;
    updateArchive();
  }
});
const menu = document.querySelector<HTMLButtonElement>(".menu-toggle")!;
const nav = document.querySelector<HTMLElement>("#main-nav")!;
menu.hidden = false;
function closeMenu() {
  menu.setAttribute("aria-expanded", "false");
  menu.setAttribute("aria-label", "Open navigation menu");
  nav.classList.remove("is-open");
}
menu.addEventListener("click", () => {
  const open = menu.getAttribute("aria-expanded") !== "true";
  menu.setAttribute("aria-expanded", String(open));
  menu.setAttribute(
    "aria-label",
    open ? "Close navigation menu" : "Open navigation menu",
  );
  nav.classList.toggle("is-open", open);
});
nav.addEventListener("click", (event) => {
  if (event.target instanceof Element && event.target.closest("a")) closeMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menu.getAttribute("aria-expanded") === "true") {
    closeMenu();
    menu.focus();
  }
});
document.addEventListener("click", (event) => {
  if (
    event.target instanceof Node &&
    !nav.contains(event.target) &&
    !menu.contains(event.target)
  )
    closeMenu();
});
enableInteractions();
routeProject();
track("page_view");
async function refresh() {
  if (!config) return;
  portfolio.setAttribute("aria-busy", "true");
  try {
    const fresh = await fetchContent(config);
    // Identical saved/live content needs no second render or layout work.
    if (JSON.stringify(fresh) === JSON.stringify(content)) {
      portfolio.removeAttribute("aria-busy");
      return;
    }
    // Preserve focus and the search query when replacing refreshed content.
    const active = document.activeElement;
    content = fresh;
    if (active instanceof HTMLInputElement && active.id === "project-search")
      query = active.value;
    portfolio.innerHTML = renderSite(content, base);
    const profile = content.profile[0];
    if (profile) {
      document.querySelector("#nav-name")!.textContent = profile.name;
      document.title = `${profile.name} — ${profile.title}`;
      document
        .querySelector('meta[name="description"]')
        ?.setAttribute("content", profile.introduction);
    }
    enableInteractions();
    if (!content.projects.some((p) => p.category === category))
      category = "All work";
    const input = document.querySelector<HTMLInputElement>("#project-search");
    if (input) input.value = query;
    updateArchive();
    if (active instanceof HTMLElement && active.id === "project-search")
      input?.focus();
    routeProject();
    portfolio.removeAttribute("aria-busy");
    status.textContent = "";
  } catch {
    portfolio.removeAttribute("aria-busy");
    status.textContent =
      "Showing a saved portfolio while the latest version is unavailable.";
    setTimeout(() => {
      status.textContent = "";
    }, 7000);
  }
}
void refresh();
