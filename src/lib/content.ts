import { TABLES, type Content, type Snapshot } from "./types";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}
export function safeUrl(value: unknown, base = "/"): string | null {
  if (
    typeof value !== "string" ||
    !value ||
    [...value].some((char) => char.charCodeAt(0) <= 32 || char === "\\")
  )
    return null;
  if (/^https:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return url.username || url.password ? null : url.href;
    } catch {
      return null;
    }
  }
  if (/^mailto:[^@?\s]+@[^@?\s]+\.[a-z]+$/i.test(value)) return value;
  if (
    /^(?:assets\/[a-z0-9/_ .-]+|resume\.pdf)$/i.test(value) &&
    !value.includes("..")
  )
    return base + value;
  return null;
}
const fields: Record<keyof Content, string[]> = {
  profile: [
    "slug",
    "name",
    "title",
    "headline",
    "introduction",
    "about",
    "location",
    "email",
    "current_focus",
  ],
  projects: [
    "slug",
    "title",
    "category",
    "summary",
    "description",
    "visual_kind",
  ],
  project_links: ["project_id", "kind", "label", "url"],
  experiences: ["slug", "company", "position", "location", "start_date"],
  education: ["institution", "degree"],
  skills: ["name", "category"],
  certifications: ["title", "issuer"],
  publications: ["slug", "title", "summary", "platform", "url"],
  social_links: ["network", "url"],
};
export function validateContent(value: unknown): Content {
  if (!value || typeof value !== "object")
    throw new Error("Content must be an object");
  const object = value as Record<string, unknown>;
  for (const table of TABLES) {
    if (!Array.isArray(object[table]) || object[table].length > 1000)
      throw new Error(`Invalid ${table}`);
    const ids = new Set<string>();
    for (const raw of object[table]) {
      const row = raw as Record<string, unknown>;
      if (
        !row ||
        typeof row !== "object" ||
        typeof row.id !== "string" ||
        !uuid.test(row.id) ||
        ids.has(row.id) ||
        row.status !== "published" ||
        typeof row.sort_order !== "number" ||
        !Number.isInteger(row.sort_order)
      )
        throw new Error(`Invalid published row in ${table}`);
      ids.add(row.id);
      for (const field of fields[table])
        if (
          typeof row[field] !== "string" ||
          (row[field] as string).length > 20000
        )
          throw new Error(`Invalid ${table}.${field}`);
      for (const field of [
        "technologies",
        "responsibilities",
        "outcomes",
        "highlights",
      ]) {
        if (
          (table === "projects" && field !== "highlights") ||
          (table === "experiences" && field === "highlights")
        ) {
          if (
            !Array.isArray(row[field]) ||
            row[field].length > 100 ||
            !row[field].every(
              (s: unknown) => typeof s === "string" && s.length <= 20000,
            )
          )
            throw new Error(`Invalid ${field}`);
        }
      }
      for (const field of [
        "image_url",
        "resume_url",
        "image_alt",
        "role",
        "organization",
        "problem",
        "approach",
        "start_date",
        "end_date",
        "issued_on",
        "published_on",
        "url",
      ]) {
        if (
          field in row &&
          row[field] !== null &&
          typeof row[field] !== "string"
        )
          throw new Error(`Invalid ${field}`);
      }
      for (const field of ["url", "image_url", "resume_url"])
        if (row[field] && !safeUrl(row[field]))
          throw new Error(`Unsafe ${field}`);
      if (
        "slug" in row &&
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug as string)
      )
        throw new Error("Invalid slug");
      if (
        table === "projects" &&
        (!["search", "retrieval", "pipeline", "chart", "vision"].includes(
          row.visual_kind as string,
        ) ||
          typeof row.featured !== "boolean")
      )
        throw new Error("Invalid project display");
      if (
        table === "education" &&
        (!Number.isInteger(row.start_year) ||
          (row.end_year !== null && !Number.isInteger(row.end_year)))
      )
        throw new Error("Invalid education years");
    }
  }
  if ((object.profile as unknown[]).length > 1)
    throw new Error("Only one public profile is supported");
  const projects = new Set(
    (object.projects as Content["projects"]).map((p) => p.id),
  );
  if (
    (object.project_links as Content["project_links"]).some(
      (link) => !projects.has(link.project_id),
    )
  )
    throw new Error("Orphan project link");
  const content = object as unknown as Content;
  return Object.fromEntries(
    TABLES.map((table) => [
      table,
      [...content[table]].sort(
        (a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id),
      ),
    ]),
  ) as unknown as Content;
}
export function validateSnapshot(value: unknown): Snapshot {
  const snapshot = value as Snapshot;
  if (
    snapshot?.version !== 1 ||
    !Number.isFinite(Date.parse(snapshot.exported_at))
  )
    throw new Error("Invalid snapshot");
  return { ...snapshot, content: validateContent(snapshot.content) };
}
export interface PublicConfig {
  url: string;
  key: string;
}
export function publicConfig(url?: string, key?: string): PublicConfig | null {
  if (!url && !key) return null;
  if (!url || !key) throw new Error("Set both Supabase public variables");
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    !/^[a-z0-9-]+\.supabase\.co$/.test(parsed.hostname) ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  )
    throw new Error("Expected an HTTPS Supabase project URL");
  if (!/^sb_publishable_[a-zA-Z0-9_-]{10,}$/.test(key))
    throw new Error("Only a browser-safe Supabase publishable key is accepted");
  return { url: parsed.origin, key };
}
export async function fetchContent(
  config: PublicConfig,
  fetcher: typeof fetch = fetch,
): Promise<Content> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const rows = await Promise.all(
      TABLES.map(async (table) => {
        const result = await fetcher(
          `${config.url}/rest/v1/${table}?select=*&status=eq.published&order=sort_order.asc,id.asc&limit=1001`,
          {
            headers: { apikey: config.key, Accept: "application/json" },
            signal: controller.signal,
            cache: "no-store",
            credentials: "omit",
          },
        );
        if (!result.ok)
          throw new Error(`Content unavailable (${result.status})`);
        const text = await result.text();
        if (text.length > 2_000_000)
          throw new Error("Content response too large");
        return [table, JSON.parse(text)];
      }),
    );
    return validateContent(Object.fromEntries(rows));
  } finally {
    clearTimeout(timeout);
  }
}
export function filterProjects(
  projects: Content["projects"],
  category: string,
  query: string,
) {
  const search = query.trim().toLocaleLowerCase();
  return projects.filter(
    (p) =>
      (category === "All work" || p.category === category) &&
      `${p.title} ${p.summary} ${p.technologies.join(" ")} ${p.organization ?? ""}`
        .toLocaleLowerCase()
        .includes(search),
  );
}
