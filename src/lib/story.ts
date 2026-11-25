// The site tells one story: a career that flew from Bengaluru to Delhi NCR to
// Dubai. This module derives that story from published content: which city
// each role belongs to, and the order in which the work happened.
import type { Content, Experience, Project } from "./types";
import { careerChapters, type CareerChapter } from "./experience";

export type CityId = "bengaluru" | "delhi" | "dubai";

export const CITIES: Record<CityId, { name: string; short: string; lon: number; lat: number }> = {
  bengaluru: { name: "Bengaluru", short: "BLR", lon: 77.59, lat: 12.97 },
  delhi: { name: "Delhi NCR", short: "DEL", lon: 77.03, lat: 28.46 },
  dubai: { name: "Dubai", short: "DXB", lon: 55.27, lat: 25.2 },
};

export function cityOf(location: string): CityId | null {
  const l = location.toLowerCase();
  if (/bengaluru|bangalore/.test(l)) return "bengaluru";
  if (/gurugram|gurgaon|delhi|noida/.test(l)) return "delhi";
  if (/dubai|uae|emirates/.test(l)) return "dubai";
  return null;
}

export interface Stop {
  city: CityId;
  start: string;
  end: string | null;
  chapters: CareerChapter[];
}

/** Consecutive chapters in the same city form one stop, oldest first. */
export function journeyStops(experiences: Experience[]): Stop[] {
  const stops: Stop[] = [];
  const oldestFirst = [...experiences].sort((a, b) => a.start_date.localeCompare(b.start_date));
  for (const role of oldestFirst) {
    const city = cityOf(role.location);
    if (!city) continue;
    let stop = stops.at(-1);
    if (stop?.city !== city) {
      stop = { city, start: role.start_date, end: role.end_date, chapters: [] };
      stops.push(stop);
    }
    stop.end = role.end_date === null || stop.end === null ? null : [stop.end, role.end_date].sort().at(-1)!;
    const chapter = stop.chapters.at(-1);
    if (chapter && chapter.company.trim().toLowerCase() === role.company.trim().toLowerCase()) {
      chapter.roles.push(role);
      chapter.end = role.end_date;
    } else stop.chapters.push({ company: role.company, start: role.start_date, end: role.end_date, roles: [role] });
  }
  return stops;
}

/** Returning to a company you started at, in a new city. */
export function fullCircle(stops: Stop[]) {
  const first = stops[0]?.chapters[0]?.company ?? "";
  const lastStop = stops.at(-1);
  const latest = lastStop?.chapters.at(-1);
  if (!first || !latest || stops.length < 2) return null;
  const root = (s: string) => s.toLowerCase().split(/\s+/)[0];
  return root(first) === root(latest.company) ? latest : null;
}

/** Which organisation chapter a project belongs to, oldest chapter first. */
function chapterIndex(project: Project, chapters: CareerChapter[]) {
  const org = (project.organization ?? "").trim().toLowerCase();
  if (!org) return -1;
  return chapters.findIndex((c) => c.company.trim().toLowerCase() === org);
}

/**
 * The work in the order it happened: by career chapter, then by start date
 * where one is published, otherwise by the published order. Independent
 * projects sit with the chapter in which they were made, before its client work.
 */
export function storyProjects(content: Content) {
  const chapters = careerChapters(content.experiences).reverse(); // oldest first
  const delhiStart = chapters.findIndex((c) => c.roles.some((r) => cityOf(r.location) === "delhi"));
  const firstGartner = chapters.findIndex((c) => /gartner/i.test(c.company));
  const independentAt = firstGartner >= 0 ? firstGartner - 0.5 : Math.max(0, delhiStart);
  const rank = (p: Project) => {
    const i = chapterIndex(p, chapters);
    return i >= 0 ? i : independentAt;
  };
  return content.projects
    .map((project, published) => ({ project, published }))
    .sort((a, b) => {
      const ra = rank(a.project);
      const rb = rank(b.project);
      if (ra !== rb) return ra - rb;
      const da = a.project.start_date;
      const db = b.project.start_date;
      if (da && db && da !== db) return da.localeCompare(db);
      if (!da !== !db) return da ? 1 : -1; // undated work came first
      return a.published - b.published;
    })
    .map(({ project }) => project);
}

/** Where a project was made, for its label on the spiral. */
export function projectPlace(project: Project, content: Content) {
  const org = (project.organization ?? "").trim().toLowerCase();
  const role = content.experiences.find((r) => r.company.trim().toLowerCase() === org);
  const city = role ? cityOf(role.location) : "delhi";
  return { city: city ?? "delhi", label: `${CITIES[city ?? "delhi"].name} · ${project.organization ?? "Side project"}` };
}

/** Skills named differently in project stacks. Only true equivalents belong here. */
const ALIASES: Record<string, string[]> = {
  llms: ["llama2 70b", "mistral 7b", "mixtral 8x7b", "azure openai"],
  "agentic ai": ["mcp", "langgraph"],
  "azure aks": ["kubernetes"],
  "semantic search": ["rag"],
};
/** Whether a project's published stack uses a skill. */
export function usesSkill(project: Project, skill: string) {
  const name = skill.trim().toLowerCase();
  const names = [name, ...(ALIASES[name] ?? [])];
  return project.technologies.some((t) => {
    const tech = t.trim().toLowerCase();
    return names.some((n) => tech === n || (n.length > 3 && tech.startsWith(n + " ")));
  });
}

export interface Topic {
  name: string;
  skills: { name: string; projects: string[] }[];
  projects: Project[];
}
/** Each expertise category as a layer of the model: its skills, and the work that used them. */
export function modelTopics(content: Content): Topic[] {
  const order = storyProjects(content);
  const categories = [...new Set(content.skills.map((s) => s.category))];
  return categories.map((name) => {
    const skills = content.skills
      .filter((s) => s.category === name)
      .map((s) => ({ name: s.name, projects: order.filter((p) => usesSkill(p, s.name)).map((p) => p.slug) }))
      // Skills that shipped lead; the rest keep their published order.
      .sort((a, b) => Number(b.projects.length > 0) - Number(a.projects.length > 0));
    const used = new Set(skills.flatMap((s) => s.projects));
    return { name, skills, projects: order.filter((p) => used.has(p.slug)) };
  });
}
