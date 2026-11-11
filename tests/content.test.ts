import { test } from "node:test";
import assert from "node:assert/strict";
import fallback from "../src/content/fallback.json";
import {
  validateContent,
  validateSnapshot,
  safeUrl,
  escapeHtml,
  publicConfig,
  fetchContent,
} from "../src/lib/content";
import { renderSite, renderProjectDetail } from "../src/lib/render";
const snapshot = validateSnapshot(fallback);
const config = {
  url: "https://example.supabase.co",
  key: "sb_publishable_browseronlyexample",
};
test("reviewed snapshot is published, linked, and complete", () => {
  assert.equal(snapshot.content.profile.length, 1);
  assert.equal(snapshot.content.projects.length, 13);
  assert.equal(snapshot.content.experiences.length, 6);
  assert.ok(
    snapshot.content.project_links.every((l) =>
      snapshot.content.projects.some((p) => p.id === l.project_id),
    ),
  );
});
test("untrusted HTML is escaped and unsafe links are rejected", () => {
  assert.equal(
    escapeHtml('<script>"x"</script>'),
    "&lt;script&gt;&quot;x&quot;&lt;/script&gt;",
  );
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,x",
    "//evil.com",
    "https://user:pass@evil.com",
    "assets/../private",
    "https://evil.com\n",
  ])
    assert.equal(safeUrl(value), null);
  assert.equal(
    safeUrl("assets/portrait.webp", "/repo/"),
    "/repo/assets/portrait.webp",
  );
});
test("public config rejects secret, legacy, incomplete and unexpected endpoints", () => {
  assert.equal(publicConfig(), null);
  assert.deepEqual(publicConfig(config.url, config.key), config);
  for (const key of [
    ["sb", "secret", "shouldneverreachclient"].join("_"),
    "eyJhbGciOiJIUzI1NiJ9.e30.signature",
    "service_role",
  ])
    assert.throws(() => publicConfig(config.url, key));
  for (const url of [
    "http://example.supabase.co",
    "https://evil.com",
    "https://example.supabase.co/rest",
    "https://example.supabase.co/?q=1",
  ])
    assert.throws(() => publicConfig(url, config.key));
  assert.throws(() => publicConfig(config.url));
});
test("content validation refuses drafts, orphan links, invalid types and script URLs", () => {
  let data = structuredClone(snapshot.content);
  data.projects[0].status = "draft";
  assert.throws(() => validateContent(data));
  data = structuredClone(snapshot.content);
  data.project_links[0].project_id = "00000000-0000-4000-8000-000000000000";
  assert.throws(() => validateContent(data));
  data = structuredClone(snapshot.content);
  data.profile[0].image_url = "javascript:alert(1)";
  assert.throws(() => validateContent(data));
  data = structuredClone(snapshot.content);
  data.projects[0].technologies = null as unknown as string[];
  assert.throws(() => validateContent(data));
});
test("live fetch is atomic, explicitly published and credential-free", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    calls++;
    assert.equal(init?.credentials, "omit");
    assert.match(String(input), /status=eq.published/);
    assert.equal((init?.headers as Record<string, string>).apikey, config.key);
    const name = new URL(String(input)).pathname
      .split("/")
      .at(-1) as keyof typeof snapshot.content;
    return new Response(JSON.stringify(snapshot.content[name]));
  };
  const content = await fetchContent(config, fetcher);
  assert.equal(calls, 9);
  assert.deepEqual(content, snapshot.content);
});
test("paused, invalid and empty responses have distinct semantics", async () => {
  await assert.rejects(
    fetchContent(config, async () => new Response("", { status: 503 })),
  );
  await assert.rejects(
    fetchContent(config, async () => new Response("garbage")),
  );
  const empty = Object.fromEntries(
    Object.keys(snapshot.content).map((k) => [k, []]),
  );
  const content = await fetchContent(
    config,
    async () => new Response(JSON.stringify([])),
  );
  assert.deepEqual(content, empty);
  assert.match(renderSite(content), /More to come/);
});
test("renderer preserves deep links and never renders content as executable HTML", () => {
  const c = structuredClone(snapshot.content);
  c.projects[0].title = "<img src=x onerror=alert(1)>";
  const html = renderSite(c, "/repo/");
  assert.match(html, /&lt;img/);
  assert.ok(!html.includes("<img src=x"));
  for (const id of [
    "home",
    "projects",
    "experience",
    "skills",
    "education",
    "about",
    "contact",
  ])
    assert.ok(html.includes(`id="${id}"`));
  assert.match(html, /\/repo\/resume.pdf/);
  const detail = renderProjectDetail(c.projects[0], c, "/repo/");
  assert.match(detail, /rel="noopener noreferrer"/);
});

test("career chapters preserve every role, date and company return", async () => {
  const { careerChapters } = await import("../src/lib/experience");
  const roles = snapshot.content.experiences;
  const chapters = careerChapters(roles);
  assert.equal(chapters.length, 4);
  assert.deepEqual(chapters.map(c => c.roles.length), [1, 2, 1, 2]);
  const gartner = chapters.find(c => c.company === "Gartner")!;
  assert.equal(gartner.start, "2022-07-01");
  assert.equal(gartner.end, "2025-06-01");
  assert.deepEqual(chapters.flatMap(c => c.roles), roles);
  const returned = careerChapters([roles[1], roles[3], roles[2]]);
  assert.equal(returned.length, 3);
  assert.equal(careerChapters([]).length, 0);
});

test("reported impact uses published summaries and keeps evidence accessible", () => {
  const html = renderSite(snapshot.content);
  for (const slug of ["automall-ai-search", "automall-conversational-ai", "real-time-lead-scoring"]) {
    const project = snapshot.content.projects.find(p => p.slug === slug)!;
    assert.ok(html.includes(escapeHtml(project.summary)));
    const detail = renderProjectDetail(project, snapshot.content, "/");
    for (const outcome of project.outcomes) assert.ok(detail.includes(escapeHtml(outcome)));
  }
  assert.match(html, /not causal uplift/);
  const content = structuredClone(snapshot.content);
  content.projects = [];
  assert.ok(!renderSite(content).includes('id="impact"'));
});
