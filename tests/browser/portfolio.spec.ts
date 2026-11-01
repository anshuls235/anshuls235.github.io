import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import type { Snapshot } from "../../src/lib/types";
const fallback = JSON.parse(
  readFileSync("src/content/fallback.json", "utf8"),
) as Snapshot;
test.beforeEach(async ({ page }) => {
  await page.route(
    "https://dopakyjcuasdjxzubwyy.supabase.co/rest/v1/**",
    async (route) => {
      const table = new URL(route.request().url()).pathname
        .split("/")
        .at(-1) as keyof typeof fallback.content;
      await route.fulfill({
        json: fallback.content[table],
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    },
  );
  await page.route(
    "https://dopakyjcuasdjxzubwyy.supabase.co/functions/v1/analytics",
    (route) =>
      route.fulfill({
        status: 204,
        headers: { "Access-Control-Allow-Origin": "*" },
      }),
  );
});
const previewUrl = (process.env.PORTFOLIO_PREVIEW_URL || "http://127.0.0.1:4173/").replace(/\/?$/, "/");
const previewOrigin = new URL(previewUrl).origin;
const expectedTitle = "Making intelligence work in the real world.";
test("desktop project, filter, search, deep link, CV and theme flows", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    expectedTitle,
  );
  await page.getByRole("link", { name: /Explore my work/ }).click();
  await page
    .getByRole("link", { name: /A more natural way to find a car/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "The approach" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Machine learning", exact: true })
    .click();
  await expect(page.locator("#archive-list article")).toHaveCount(2);
  await page
    .getByRole("searchbox", { name: "Search projects" })
    .fill("no matching project");
  await expect(
    page.getByRole("heading", { name: "No matching projects." }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Clear filters/ }).click();
  await expect(page.locator("#archive-list article")).toHaveCount(8);
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  const cv = await page.request.get(new URL("resume.pdf", previewUrl).href);
  expect(cv.status()).toBe(200);
  expect(cv.headers()["content-type"]).toContain("pdf");
  await page.goto("./#work/automall-ai-search");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close project details" }).click();
  await page.getByText("Privacy & analytics", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Privacy, by design." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("mobile and tablet: no overflow, keyboard navigation and menu", async ({
  page,
}) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("./");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Open navigation menu", exact: true })
    .click();
  await expect(page.locator("#main-nav")).toHaveClass(/is-open/);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open navigation menu", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Open navigation menu", exact: true })
    .click();
  await page
    .locator("#main-nav")
    .getByRole("link", { name: "Work", exact: true })
    .click();
  await expect(page.locator("#main-nav")).not.toHaveClass(/is-open/);
});
test("WCAG checks on desktop, mobile, dark theme and open dialog", async ({
  page,
}) => {
  for (const [width, dark] of [
    [1440, false],
    [390, false],
    [390, true],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("./");
    if (dark)
      await page.getByRole("button", { name: "Switch to dark theme" }).click();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  }
  await page
    .getByRole("link", { name: /A more natural way to find a car/ })
    .first()
    .click();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
test("static content works without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(previewUrl);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    expectedTitle,
  );
  await expect(
    page.getByRole("link", { name: "Visit Automall", exact: false }),
  ).toBeVisible();
  expect(await page.locator("#archive-list article").count()).toBe(8);
  await context.close();
});
test("all local assets load and no third-party resources are requested", async ({
  page,
}) => {
  const failed: string[] = [];
  const remote: string[] = [];
  page.on("response", (res) => {
    if (res.status() >= 400) failed.push(res.url());
  });
  page.on("request", (req) => {
    if (
      !req.url().startsWith(previewOrigin + "/") &&
      !req.url().startsWith("https://dopakyjcuasdjxzubwyy.supabase.co/")
    )
      remote.push(req.url());
  });
  await page.goto("./");
  await page.evaluate(() => document.fonts.ready);
  await page.locator("#contact").scrollIntoViewIfNeeded();
  expect(failed).toEqual([]);
  expect(remote).toEqual([]);
});
// These scenarios run against a build using the fake public test project config.
// No real Supabase data or privileged key is used. The default build skips them.
test("configured content: live edits, empty collections, errors and paused database", async ({
  page,
}) => {
  test.skip(
    !process.env.PORTFOLIO_TEST_REMOTE,
    "Requires a configured test build",
  );
  let mode = "live";
  await page.route("https://example.supabase.co/rest/v1/**", async (route) => {
    if (mode === "paused")
      return route.fulfill({
        status: 503,
        body: "unavailable",
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    const table = new URL(route.request().url()).pathname
      .split("/")
      .at(-1) as keyof typeof fallback.content;
    const c = structuredClone(fallback.content);
    c.profile[0].title = "Updated through Supabase";
    if (mode === "empty") {
      c.projects = [];
      c.project_links = [];
    }
    await route.fulfill({
      json: c[table],
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
  await page.goto("./");
  await expect(
    page.getByText("Updated through Supabase", { exact: true }),
  ).toBeVisible();
  mode = "empty";
  await page.reload();
  await expect(page.locator("#archive-list article")).toHaveCount(0);
  await expect(
    page.getByText("Selected work is being updated.", { exact: false }),
  ).toBeVisible();
  mode = "paused";
  await page.reload();
  await expect(page.locator("#archive-list article")).toHaveCount(8);
  await expect(
    page.getByRole("status").filter({ hasText: "Showing a saved portfolio" }),
  ).toBeVisible();
  await page.context().setOffline(true);
  await page
    .getByRole("button", { name: "Generative AI", exact: true })
    .click();
  await expect(page.locator("#archive-list article")).toHaveCount(4);
  await page.context().setOffline(false);
});
test("configured analytics respects DNT and never delays a link", async ({
  browser,
}) => {
  test.skip(
    !process.env.PORTFOLIO_TEST_REMOTE,
    "Requires a configured test build",
  );
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "doNotTrack", { value: "1" });
  });
  const page = await context.newPage();
  let requests = 0;
  page.on("request", (r) => {
    if (r.url().includes("/functions/v1/analytics")) requests++;
  });
  await page.route("https://example.supabase.co/rest/v1/**", (r) => r.abort());
  await page.goto(previewUrl);
  await page.getByRole("link", { name: /Explore my work/ }).click();
  expect(requests).toBe(0);
  await context.close();
});
