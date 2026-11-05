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
  await expect(page.locator("#archive-list article")).toHaveCount(fallback.content.projects.filter(p => p.category === "Machine learning").length);
  await page
    .getByRole("searchbox", { name: "Search projects" })
    .fill("no matching project");
  await expect(
    page.getByRole("heading", { name: "No matching projects." }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Clear filters/ }).click();
  await expect(page.locator("#archive-list article")).toHaveCount(fallback.content.projects.length);
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
  expect(await page.locator("#archive-list article").count()).toBe(fallback.content.projects.length);
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
  await expect(page.locator("#archive-list article")).toHaveCount(fallback.content.projects.length);
  await expect(
    page.getByRole("status").filter({ hasText: "Showing a saved portfolio" }),
  ).toBeVisible();
  await page.context().setOffline(true);
  await page
    .getByRole("button", { name: "Generative AI", exact: true })
    .click();
  await expect(page.locator("#archive-list article")).toHaveCount(fallback.content.projects.filter(p => p.category === "Generative AI").length);
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

test('illustrated hero: film plays, pauses and respects reduced motion', async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto('./');
  await expect(page.locator('.hero-scene')).toBeVisible();
  await expect(page.locator('.hero-scene img.scene-art').first()).toHaveJSProperty('complete', true);
  const film = page.locator('[data-hero-video]');
  await expect.poll(() => film.evaluate(el => (el as HTMLVideoElement).currentTime)).toBeGreaterThan(.2);
  await expect(page.locator('.hero-scene')).toHaveClass(/has-film/);
  expect(await page.locator('.ticker-track').evaluate(el => getComputedStyle(el).animationName)).toBe('ticker');
  await page.getByRole('button',{name:'Pause motion'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-motion','paused');
  await expect(film).toHaveJSProperty('paused',true);
  expect(await page.locator('.ticker-track').evaluate(el => getComputedStyle(el).animationPlayState)).toBe('paused');
  await page.getByRole('button',{name:'Play motion'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-motion','running');
  await page.screenshot({path:'test-results/hero-desktop.png'});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-motion','paused');
  await expect(page.locator('#hero-heading')).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  await page.goto('./');
  await page.screenshot({path:'test-results/hero-mobile.png',fullPage:true});
});

test('featured work carousel works with buttons, keyboard and swipe', async ({page}) => {
  const featured = fallback.content.projects.filter(p => p.featured);
  const total = String(featured.length).padStart(2, '0');
  for (const width of [1440, 390]) {
    await page.setViewportSize({width,height:1000});
    await page.goto('./');
    await page.getByRole('link',{name:/Explore my work/}).click();
    await expect(page.locator('#projects')).toHaveClass(/is-carousel/);
    await expect(page.locator('.project-card.is-current h3')).toContainText(featured[0].title);
    await expect(page.locator('[data-gallery-prev]')).toBeDisabled();
    await page.getByRole('button',{name:'Next featured project'}).click();
    await expect(page.locator('[data-project-position]')).toContainText(`02 / ${total}`);
    await expect(page.locator('.project-card.is-current h3')).toContainText(featured[1].title);
    await expect(page.locator('.project-card:not(.is-current)').first()).toHaveJSProperty('inert', true);
    await page.getByRole('button',{name:'Next featured project'}).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-project-position]')).toContainText(`03 / ${total}`);
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('[data-project-position]')).toContainText(`02 / ${total}`);
    const box = (await page.locator('.project-card.is-current .project-art').boundingBox())!;
    await page.mouse.move(box.x + box.width * .8, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .1, box.y + box.height / 2, {steps:6});
    await page.mouse.up();
    await expect(page.locator('[data-project-position]')).toContainText(`03 / ${total}`);
    await page.locator('.project-card.is-current').getByRole('link',{name:/View project/}).click();
    await expect(page.getByRole('dialog')).toContainText(featured[2].title);
    await page.keyboard.press('Escape');
    await page.screenshot({path:`test-results/work-${width}.png`});
  }
});

test('skills network runs a forward pass and stays accessible', async ({page}) => {
  const categories = [...new Set(fallback.content.skills.map(s => s.category))];
  for (const width of [1440, 390]) {
    await page.setViewportSize({width,height:1000});
    await page.goto('./');
    await page.locator('#skills').scrollIntoViewIfNeeded();
    for (const skill of fallback.content.skills) await expect(page.locator('#skills .skill-list li', {hasText: skill.name}).first()).toBeAttached();
    const button = page.locator(`#skills .node-input[data-cat="1"]`);
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('[data-network-status]')).toContainText(categories[1]);
    const expected = fallback.content.skills.filter(s => s.category === categories[1]).length;
    await expect.poll(() => page.locator('.node-skill.is-lit').count(), {timeout: 8000}).toBe(expected);
    await expect.poll(() => page.locator('.node-output.is-lit').count(), {timeout: 8000}).toBe(3);
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed','false');
    await page.screenshot({path:`test-results/network-${width}.png`});
    const audit = await new AxeBuilder({page}).include('#skills').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    expect(audit.violations).toEqual([]);
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('./');
  await page.locator('#skills').scrollIntoViewIfNeeded();
  await page.locator('#skills .node-input[data-cat="0"]').click();
  await expect(page.locator('.node-output.is-lit')).toHaveCount(3);
});

test('reduced motion keeps the illustrated poster and never downloads the film', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  const films:string[]=[];
  page.on('request',r=>{if(/\.(mp4|webm)$/.test(r.url()))films.push(r.url());});
  await page.goto('./');
  await expect(page.locator('.hero .scene-day')).toBeVisible();
  await expect(page.locator('[data-hero-video]')).toHaveJSProperty('paused',true);
  await page.locator('#contact').scrollIntoViewIfNeeded();
  expect(films).toEqual([]);
});

test('theme switching swaps the illustrated scenes and keeps the hero readable', async ({page}) => {
  for (const width of [390,1440]) {
    await page.setViewportSize({width,height:1000});
    await page.goto('./');
    for (const theme of ['dark','light','dark'] as const) {
      const current=await page.locator('html').getAttribute('data-theme');
      if(current!==theme) await page.locator('.theme-toggle').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
      await expect(page.locator('.hero-panel')).toHaveCSS('background-color',theme==='dark'?'rgb(21, 26, 61)':'rgb(255, 250, 240)');
      await expect(page.locator('.hero-hello')).toHaveCSS('color',theme==='dark'?'rgb(244, 241, 232)':'rgb(13, 15, 26)');
      await expect(page.locator(theme==='dark'?'.hero .scene-night':'.hero .scene-day')).toBeVisible();
      await expect(page.locator(theme==='dark'?'.hero .scene-day':'.hero .scene-night')).toBeHidden();
      const video=page.locator('[data-hero-video]');
      await expect.poll(()=>video.evaluate(el=>(el as HTMLVideoElement).currentTime)).toBeGreaterThan(.2);
      await expect(video).toHaveJSProperty('paused',false);
      await expect(video).toHaveAttribute('src',theme==='dark'?/hero-night/:/hero-day/);
      if(theme==='dark') await page.screenshot({path:`test-results/dark-hero-${width}.png`,fullPage:width===390});
    }
  }
});


test('AI contact pipeline and responsive section geometry', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({width,height:740});
    await page.goto('./');
    await expect(page.locator('.pipeline-steps li')).toHaveCount(3);
    await expect(page.locator('.contact-email')).toHaveAttribute('href', /^mailto:/);
    for (const selector of ['.impact-card-inner', '.loss-chart', '.experience-item', '.contact-pipeline']) {
      for (const item of await page.locator(selector).all()) {
        const box = (await item.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(await item.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
      }
    }
    const art = page.locator('.project-card.is-current .project-art');
    if (width <= 980) {
      const box = (await art.boundingBox())!;
      expect(box.width / box.height).toBeCloseTo(1.6, 1);
    }
    await page.locator('#experience').scrollIntoViewIfNeeded();
    await expect(page.locator('.experience-side')).toHaveCSS('position','static');
  }
});

test('published impact, expanded work and grouped career chapters on desktop and mobile', async ({page}) => {
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});
    await page.goto('./');
    await expect(page.locator('#archive-list article')).toHaveCount(fallback.content.projects.length);
    await expect(page.locator('.selected-grid>.project-card')).toHaveCount(fallback.content.projects.filter(p=>p.featured).length);
    await expect(page.locator('.impact-card')).toHaveCount(3);
    await expect(page.locator('#impact')).toContainText('AED 1.99M');
    await expect(page.locator('#impact')).toContainText('AED 1.33M');
    await expect(page.locator('#impact')).toContainText('45%');
    await expect(page.locator('#impact')).toContainText('not causal uplift');
    await page.locator('.impact-card').nth(1).getByRole('link').click();
    await expect(page.getByRole('dialog')).toContainText('Attribution is by lead match, not proof of causation.');
    await page.keyboard.press('Escape');
    await page.locator('#experience').scrollIntoViewIfNeeded();
    await expect(page.locator('.experience-item')).toHaveCount(4);
    await expect(page.locator('#experience').getByRole('heading',{level:3,name:'Gartner',exact:true})).toHaveCount(1);
    await expect(page.locator('#experience').getByRole('heading',{level:3,name:'SAP Labs India',exact:true})).toHaveCount(1);
    await expect(page.locator('.career-role')).toHaveCount(6);
    const gartner=page.locator('.experience-item').filter({has:page.getByRole('heading',{name:'Gartner',exact:true})});
    await expect(gartner.locator('.experience-date')).toHaveText('Jul 2022 — Jun 2025');
    await expect(gartner).toContainText('Senior Data Scientist');
    await expect(gartner).toContainText('Data Scientist');
    await gartner.locator('summary').first().click();
    await expect(gartner.locator('details[open]')).toContainText('territory planning');
    await page.screenshot({path:`test-results/career-${width}.png`});
    await page.getByRole('button',{name:'Switch to dark theme'}).click();
    await page.screenshot({path:`test-results/career-dark-${width}.png`});
    const audit=await new AxeBuilder({page}).include('#experience').include('#impact').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    expect(audit.violations).toEqual([]);
    await page.getByRole('button',{name:'Switch to light theme'}).click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.locator('#impact').scrollIntoViewIfNeeded();
    await page.screenshot({path:`test-results/impact-${width}.png`});
    for (const slug of ['command-center-ask-ai','qualification-bot','test-drive-mcp','genie-builder']) {
      await page.locator(`#archive-list a[data-project="${slug}"]`).first().click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('dialog')).toContainText(fallback.content.projects.find(p=>p.slug===slug)!.outcomes.at(-1)!);
      await page.keyboard.press('Escape');
    }
  }
});

test('impact engine animates visible signals and respects motion preferences', async ({page}) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({width, height:1000});
    await page.goto('./');
    await page.locator('.impact-engine').scrollIntoViewIfNeeded();
    await expect(page.locator('#impact')).toHaveClass(/impact-in-view/);
    const animated = page.locator(width === 390 ? '.processor-ring' : '.engine-stream').first();
    await expect(animated).toHaveCSS('animation-play-state', 'running');
    await page.locator('.impact-card a').first().focus();
    await expect(page.locator('#impact')).toHaveAttribute('data-active-lane','0');
    await page.locator('.impact-engine').scrollIntoViewIfNeeded();
    await page.locator('#impact').screenshot({path:`test-results/engine-${width}.png`});
    await page.getByRole('button', {name:'Pause motion'}).click();
    await expect(animated).toHaveCSS('animation-play-state','paused');
    await page.getByRole('button', {name:'Play motion'}).click();
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('./');
  await page.locator('.impact-engine').scrollIntoViewIfNeeded();
  await expect(page.locator('.engine-stream')).toHaveCSS('animation-name','none');
});
