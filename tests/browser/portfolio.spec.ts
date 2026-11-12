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
test("desktop project, deep link, CV and theme flows", async ({
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
  expect(await page.locator(".selected-grid>.project-card").count()).toBe(fallback.content.projects.length);
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
  await expect(page.locator(".selected-grid>.project-card")).toHaveCount(0);
  await expect(
    page.getByText("Selected work is being updated.", { exact: false }),
  ).toBeVisible();
  mode = "paused";
  await page.reload();
  await expect(page.locator(".selected-grid>.project-card")).toHaveCount(fallback.content.projects.length);
  await expect(
    page.getByRole("status").filter({ hasText: "Showing a saved portfolio" }),
  ).toBeVisible();
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

test('work spiral turns with buttons, keyboard, drag and tile clicks', async ({page}) => {
  const featured = fallback.content.projects; // the spiral keeps the published order
  const total = String(fallback.content.projects.length).padStart(2, '0');
  for (const width of [1440, 390]) {
    await page.setViewportSize({width,height:1000});
    await page.goto('./');
    await page.getByRole('link',{name:/Explore my work/}).click();
    await expect(page.locator('#projects')).toHaveClass(/is-carousel/);
    await expect(page.locator('.project-card.is-current h3')).toContainText(featured[0].title);
    await expect(page.locator('[data-gallery-prev]')).toBeDisabled();
    // Let the anchor glide finish, then bring the controls into view at the start of the stage.
    let lastY = -1;
    await expect.poll(async () => { const y = await page.evaluate(() => scrollY); const settled = y === lastY; lastY = y; return settled; }, {intervals:[300]}).toBe(true);
    await page.locator('[data-work-track]').evaluate(el => window.scrollTo(0, el.getBoundingClientRect().top + scrollY));
    await expect(page.locator('[data-project-position]')).toContainText(`01 / ${total}`);
    await page.getByRole('button',{name:'Next project'}).click();
    await expect(page.locator('[data-project-position]')).toContainText(`02 / ${total}`);
    await expect(page.locator('.project-card.is-current h3')).toContainText(featured[1].title);
    await expect(page.locator('.project-card:not(.is-current)').first()).toHaveJSProperty('inert', true);
    await page.getByRole('button',{name:'Next project'}).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-project-position]')).toContainText(`03 / ${total}`);
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('[data-project-position]')).toContainText(`02 / ${total}`);
    const box = (await page.locator('[data-spiral]').boundingBox())!;
    await page.mouse.move(box.x + box.width * .7, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .3, box.y + box.height / 2, {steps:6});
    await page.mouse.up();
    await expect(page.locator('[data-project-position]')).toContainText(`03 / ${total}`);
    await expect(page.locator('.spiral-tile.is-front')).toHaveAttribute('data-project', featured[2].slug);
    // The pinned stage glides to the picked project; let it land before clicking.
    lastY = -1;
    await expect.poll(async () => { const y = await page.evaluate(() => scrollY); const settled = y === lastY; lastY = y; return settled; }, {intervals:[300]}).toBe(true);
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
      await expect(page.locator('.hero-panel')).toHaveCSS('background-color',theme==='dark'?'rgb(23, 23, 26)':'rgb(255, 250, 240)');
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


test('contact links and responsive section geometry', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({width,height:740});
    await page.goto('./');
    await expect(page.locator('.contact-email')).toHaveAttribute('href', /^mailto:/);
    for (const selector of ['.impact-card-inner', '.loss-chart', '.experience-item', '.contact-prompts']) {
      for (const item of await page.locator(selector).all()) {
        const box = (await item.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(await item.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
      }
    }
    await expect(page.locator('.project-card.is-current')).toBeVisible();
    await expect(page.locator('.spiral-tile.is-front')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.locator('#experience').scrollIntoViewIfNeeded();
    await expect(page.locator('.experience-side')).toHaveCSS('position','static');
  }
});

test('published impact, expanded work and grouped career chapters on desktop and mobile', async ({page}) => {
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});
    await page.goto('./');
    await expect(page.locator('#archive')).toHaveCount(0);
    await expect(page.locator('.selected-grid>.project-card')).toHaveCount(fallback.content.projects.length);
    await expect(page.locator('.impact-card')).toHaveCount(3);
    await expect(page.locator('#impact')).toContainText('AED 1.99M');
    await expect(page.locator('#impact')).toContainText('AED 1.33M');
    await expect(page.locator('#impact')).toContainText('45%');
    await expect(page.locator('#impact')).toContainText('not causal uplift');
    await page.getByRole('button',{name:/Conversation-attributed revenue/}).click();
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
      await page.evaluate(hash => { location.hash = hash; }, `#work/${slug}`);
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('dialog')).toContainText(fallback.content.projects.find(p=>p.slug===slug)!.outcomes.at(-1)!);
      await page.keyboard.press('Escape');
    }
  }
});

test('contact dots say hello, spell out a starter on hover and hold still when motion is paused', async ({page}) => {
  // A cheap fingerprint of the canvas: how many sampled pixels are lit, and where.
  const read = () => page.locator('[data-hello] canvas').evaluate(el => {
    const canvas = el as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0, sum = 0;
    for (let i = 3; i < data.length; i += 4 * 7) if (data[i] > 0) { lit++; sum = (sum + i) % 1000003; }
    return {lit, sum};
  });
  const films:string[]=[];
  page.on('request',r=>{if(/assets\/films\//.test(r.url()))films.push(r.url());});
  for (const width of [390, 1440]) {
    await page.setViewportSize({width, height:1000});
    await page.goto('./');
    const field = page.locator('[data-hello]');
    await field.scrollIntoViewIfNeeded();
    await expect(field).toBeVisible();
    await expect(field).toHaveAttribute('aria-hidden', 'true');
    await expect.poll(async () => (await read()).lit).toBeGreaterThan(200);
    const starters = page.locator('.contact-prompts a');
    await expect(starters).toHaveCount(3);
    await expect(starters.first()).toHaveAttribute('href', /^mailto:.*\?subject=I%20have%20an%20AI%20idea$/);
    await page.getByRole('button', {name:'Pause motion'}).click();
    const held = await read();
    expect(held.lit).toBeGreaterThan(200);
    await page.waitForTimeout(400);
    expect(await read()).toEqual(held);
    // Pointing at a starter redraws the dots as that starter, and leaving restores the greeting.
    await starters.first().hover();
    const said = await read();
    expect(said.sum).not.toBe(held.sum);
    await page.locator('.contact-email').hover();
    expect(await read()).toEqual(held);
    await page.locator('#contact').screenshot({path:`test-results/hello-${width}.png`});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  }
  expect(films).toEqual([]);
});

test('expertise follows both themes without losing the selected network', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  for (const width of [390,1440]) {
    await page.setViewportSize({width,height:1000});
    await page.goto('./');
    await page.locator('#skills').scrollIntoViewIfNeeded();
    const input = page.locator('#skills .node-input').first();
    await input.click();
    for (const theme of ['light','dark','light']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle').click();
      await expect(page.locator('#skills')).toHaveCSS('background-color', theme === 'light' ? 'rgb(244, 241, 232)' : 'rgb(11, 11, 13)');
      await expect(input).toHaveAttribute('aria-pressed','true');
      await expect(page.locator('.node-output.is-lit')).toHaveCount(3);
      const audit=await new AxeBuilder({page}).include('#skills').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      expect(audit.violations).toEqual([]);
      await page.locator('#skills').screenshot({path:`test-results/expertise-${theme}-${width}.png`});
    }
  }
});

test('impact dots draw each reported result, follow the tabs and hold still when motion is paused', async ({page}) => {
  // A cheap fingerprint of the canvas: how many sampled pixels are lit, and where.
  const read = () => page.locator('[data-signal] canvas').evaluate(el => {
    const canvas = el as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0, sum = 0;
    for (let i = 3; i < data.length; i += 4 * 7) if (data[i] > 0) { lit++; sum = (sum + i) % 1000003; }
    return {lit, sum};
  });
  const stories = ['automall-ai-search', 'automall-conversational-ai', 'real-time-lead-scoring'].map(slug => fallback.content.projects.find(p => p.slug === slug)!);
  for (const width of [390, 1440]) {
    await page.setViewportSize({width, height:900});
    await page.goto('./');
    const field = page.locator('[data-signal]');
    await field.scrollIntoViewIfNeeded();
    await expect(field).toBeVisible();
    await expect(field).toHaveAttribute('aria-hidden', 'true');
    await expect.poll(async () => (await read()).lit).toBeGreaterThan(200);
    const before = await read();
    await expect.poll(async () => (await read()).sum).not.toBe(before.sum);
    // Picking a result shows its project and stops the automatic turn.
    const tabs = page.locator('[data-impact-tab]');
    await expect(tabs).toHaveCount(3);
    await tabs.nth(2).click();
    await expect(tabs.nth(2)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.impact-card.is-current h3')).toHaveText(stories[2].title);
    await expect(page.locator('.impact-card:not(.is-current)').first()).toBeHidden();
    await page.waitForTimeout(6000);
    await expect(tabs.nth(2)).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', {name:'Pause motion'}).click();
    const held = await read();
    expect(held.lit).toBeGreaterThan(200);
    await page.waitForTimeout(400);
    expect(await read()).toEqual(held);
    await tabs.nth(0).click();
    await expect(page.locator('.impact-card.is-current h3')).toHaveText(stories[0].title);
    expect((await read()).sum).not.toBe(held.sum);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('./');
  await page.locator('[data-signal]').scrollIntoViewIfNeeded();
  await expect.poll(async () => (await read()).lit).toBeGreaterThan(200);
  const still = await read();
  await page.waitForTimeout(400);
  expect(await read()).toEqual(still);
});

test('work spiral pins and turns with scroll on laptop-height and phone windows', async ({page}) => {
  for (const [width, height] of [[1366, 650], [1200, 560], [1024, 480], [1440, 900], [390, 780]]) {
    await page.setViewportSize({width, height});
    await page.goto('./');
    const section = page.locator('#projects');
    await expect(section).toHaveClass(/is-pinned/);
    const top = await page.locator('[data-work-track]').evaluate(el => el.getBoundingClientRect().top + scrollY);
    await page.evaluate(y => window.scrollTo(0, y), top + height * 1.5);
    await expect(page.locator('.work-status')).not.toContainText('01 / 13');
    await expect(page.locator('.work-pin')).toBeInViewport();
  }
});

test('one wheel gesture moves the pinned work stage by exactly one project', async ({page}) => {
  test.setTimeout(60000);
  const position = page.locator('[data-project-position]');
  // A trackpad flick: a short rise, then a long fading run of wheel events,
  // sent from inside the page so their spacing matches a real device.
  const flick = async (direction: number) => {
    await page.evaluate(direction => new Promise<void>(done => {
      const sizes: number[] = [];
      let size = 20;
      while (size < 160) { sizes.push(size); size *= 1.6; }
      while (size > 1) { sizes.push(Math.round(size)); size *= 0.93; }
      const send = () => {
        const next = sizes.shift();
        if (next === undefined) return done();
        document.querySelector('.work-pin')!.dispatchEvent(new WheelEvent('wheel', {deltaY: direction * next, bubbles: true, cancelable: true}));
        setTimeout(send, 12);
      };
      send();
    }), direction);
    await page.waitForTimeout(500);
  };
  for (const [width, height] of [[1100, 600], [1440, 900]]) {
    await page.setViewportSize({width, height});
    await page.goto('./');
    const top = await page.locator('[data-work-track]').evaluate(el => el.getBoundingClientRect().top + scrollY);
    await page.evaluate(y => window.scrollTo(0, y + 10), top);
    await flick(1);
    await expect(position).toContainText('01 / 13');
    for (const label of ['02', '03', '04']) {
      await flick(1);
      await expect(position).toContainText(`${label} / 13`);
      await expect(page.locator('.work-pin')).toBeInViewport();
    }
    await flick(-1);
    await expect(position).toContainText('03 / 13');
  }
});
