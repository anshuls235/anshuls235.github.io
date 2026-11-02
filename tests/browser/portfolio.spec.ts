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

test('illustrated world: visible motion, touch ideas, pause and reduced motion', async ({page}) => {
  await page.goto('./');
  await expect(page.locator('.character-scene')).toBeVisible();
  await expect(page.locator('.workshop-art')).toHaveJSProperty('naturalWidth',1536);
  await expect.poll(() => page.locator('[data-world-video]').evaluate(el => (el as HTMLVideoElement).currentTime)).toBeGreaterThan(.2);
  expect(await page.locator('.journey-signal').first().evaluate(el => getComputedStyle(el).animationName)).toBe('journey-flow');
  await page.getByRole('button',{name:'Spark a new idea'}).click();
  await expect(page.locator('.idea-response')).toContainText('finding a car');
  await page.getByRole('button',{name:'Pause motion'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-motion','paused');
  await expect(page.locator('[data-world-video]')).toHaveJSProperty('paused',true);
  await page.getByRole('button',{name:'Play motion'}).click();
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('./');
  await page.screenshot({path:'test-results/workshop-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.goto('./');
  await page.screenshot({path:'test-results/workshop-mobile.png',fullPage:true});
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.locator('html')).toHaveAttribute('data-motion','paused');
  expect(await page.locator('.journey-signal').first().evaluate(el => getComputedStyle(el).animationName)).toBe('none');
});


test('cinematic gallery, touch navigation and idea machine', async ({page}) => {
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('./');
  await page.getByRole('link',{name:/Explore my work/}).click();
  await expect(page.locator('#projects')).toHaveClass(/is-cinematic/);
  await page.getByRole('button',{name:'Next featured project'}).click();
  await expect(page.locator('[data-project-position]')).toContainText('02 / 03');
  await expect(page.locator('.project-card.is-current h3')).toContainText('enterprise knowledge');
  await expect.poll(() => page.evaluate(() => Math.abs(scrollY - ((document.querySelector('#projects') as HTMLElement).offsetTop - 88 + innerHeight * .85)))).toBeLessThan(4);
  await page.screenshot({path:'test-results/gallery-desktop.png'});
  await page.getByRole('button',{name:'Run the idea machine'}).click();
  await expect(page.locator('[data-machine]')).toHaveAttribute('data-state','done',{timeout:6000});
  await expect(page.locator('.machine-status')).toContainText('became something useful');
  await page.getByRole('button',{name:'Reset',exact:true}).click();
  await expect(page.locator('.machine-status')).toHaveText('Ready when you are.');
  await page.setViewportSize({width:390,height:844});
  await page.goto('./');
  await expect(page.locator('#projects')).not.toHaveClass(/is-cinematic/);
  await page.getByRole('button',{name:'Next featured project'}).click();
  await expect(page.locator('[data-project-position]')).toContainText('02 / 03');
  await expect.poll(() => page.locator('.selected-grid').evaluate(el => el.scrollLeft)).toBeGreaterThan(250);
  await page.screenshot({path:'test-results/gallery-mobile.png'});
  await page.getByRole('button',{name:'Run the idea machine'}).click();
  await expect(page.locator('[data-machine]')).toHaveAttribute('data-state','done',{timeout:6000});
  await page.screenshot({path:'test-results/machine-mobile.png'});
});


test('reduced motion keeps the character poster and avoids downloading the film', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  const films:string[]=[];
  page.on('request',r=>{if(r.url().includes('workshop-loop.'))films.push(r.url());});
  await page.goto('./');
  await expect(page.locator('[data-world-video]')).toHaveJSProperty('paused',true);
  await expect(page.locator('.workshop-art')).toBeVisible();
  await page.getByRole('button',{name:'Run the idea machine'}).click();
  await expect(page.locator('[data-machine]')).toHaveAttribute('data-state','done');
  expect(films).toEqual([]);
});


test('theme switching preserves the animated scene and readable hero content', async ({page}) => {
  for (const width of [390,1440]) {
    await page.setViewportSize({width,height:1000});
    await page.goto('./');
    for (const theme of ['dark','light','dark'] as const) {
      const current=await page.locator('html').getAttribute('data-theme');
      if(current!==theme) await page.locator('.theme-toggle').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
      await expect(page.locator('.hero-world')).toHaveCSS('background-color','rgb(255, 244, 220)');
      await expect(page.locator('.hero')).toHaveCSS('color','rgb(32, 41, 65)');
      await expect(page.locator('#hero-heading')).toHaveCSS('color','rgb(32, 41, 65)');
      await expect(page.locator('.floating-note').first()).toHaveCSS('color','rgb(32, 41, 65)');
      const video=page.locator('[data-world-video]');
      await expect.poll(()=>video.evaluate(el=>(el as HTMLVideoElement).currentTime)).toBeGreaterThan(.2);
      await expect(video).toHaveJSProperty('paused',false);
      await expect(video).toHaveCSS('opacity','1');
      if(theme==='dark') await page.screenshot({path:`test-results/dark-hero-${width}.png`,fullPage:width===390});
    }
  }
});
