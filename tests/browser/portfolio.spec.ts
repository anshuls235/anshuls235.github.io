import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import type { Snapshot } from "../../src/lib/types";
import { modelTopics, storyProjects } from "../../src/lib/story";
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
  await expect(page.locator('html')).not.toHaveClass(/is-screen-jump/); // let the chapter jump land
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
  await expect(page.locator('html')).not.toHaveClass(/is-screen-jump/); // let the chapter jump land
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
  const featured = storyProjects(fallback.content); // the spiral follows the career
  const total = String(fallback.content.projects.length).padStart(2, '0');
  for (const width of [1440, 390]) {
    await page.setViewportSize({width,height:1000});
    await page.goto('./');
    await page.getByRole('link',{name:/Explore my work/}).click();
    await expect(page.locator('html')).not.toHaveClass(/is-screen-jump/); // let the chapter jump land
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

test('the model is a knowledge orb: topics light up their skills, and skills open the work behind them', async ({page}) => {
  const topics = modelTopics(fallback.content);
  for (const width of [1440, 390]) {
    await page.setViewportSize({width,height:900});
    await page.goto('./');
    await page.locator('#skills').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-orb] canvas')).toBeVisible();
    // Every skill is in the page for assistive technology, and one screen holds the chapter on desktop.
    for (const skill of fallback.content.skills) await expect(page.locator('#skills .sr-only li', {hasText: skill.name}).first()).toBeAttached();
    const buttons = page.locator('[data-orb-topic]');
    await expect(buttons).toHaveCount(topics.length);
    await buttons.first().click();
    await expect(buttons.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-orb-detail] h3')).toHaveText(topics[0].name);
    await expect(page.locator('[data-orb-detail] a[data-project]')).toHaveCount(topics[0].projects.length);
    if (width === 1440) {
      const box = (await page.locator('.orb-grid').boundingBox())!;
      expect(box.height).toBeLessThanOrEqual(900);
    }
    await page.locator('[data-orb-detail] a[data-project]').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.screenshot({path:`test-results/orb-${width}.png`});
    const audit = await new AxeBuilder({page}).include('#skills').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    expect(audit.violations).toEqual([]);
  }
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
    for (const selector of ['.impact-card-inner', '.journey-map', '.boarding-pass', '.contact-prompts', '.sky-cities']) {
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
    // With reduced motion the journey is a plain list: every pass shows, nothing pins.
    await expect(page.locator('#experience')).not.toHaveClass(/is-pinned/);
    await expect(page.locator('.journey-stop').last()).toBeVisible();
  }
});

test('published impact, expanded work and grouped career chapters on desktop and mobile', async ({page}) => {
  // Two widths, the dialog, both themes, an audit and a ticket flip: slower CI machines need room.
  test.setTimeout(60000);
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
    await page.locator('.impact-card').nth(1).getByRole('link').click();
    await expect(page.getByRole('dialog')).toContainText('Attribution is by lead match, not proof of causation.');
    await page.keyboard.press('Escape');
    await page.locator('#experience').scrollIntoViewIfNeeded();
    // Bengaluru, Delhi NCR, Dubai, and the return to SAP.
    await expect(page.locator('.journey-stop')).toHaveCount(4);
    // Pinned, the city title steps aside for the route; it stays in the markup.
    await expect(page.locator('#experience .pass-title h3', {hasText: /^Delhi NCR$/})).toHaveCount(1);
    // Passes off the pinned screen are hidden, so count the markup rather than the accessibility tree.
    await expect(page.locator('#experience h4', {hasText: /^Gartner$/})).toHaveCount(1);
    await expect(page.locator('#experience h4', {hasText: /^SAP Labs India$/})).toHaveCount(2);
    await expect(page.locator('#experience .career-role')).toHaveCount(fallback.content.experiences.length);
    const gartner=page.locator('.pass-chapter').filter({has:page.getByRole('heading',{name:'Gartner',exact:true})});
    await expect(gartner).toContainText('Jul 2022');
    await expect(gartner).toContainText('Jun 2025');
    await expect(gartner).toContainText('Senior Data Scientist');
    await expect(gartner).toContainText('Data Scientist');
    // Bring Delhi's pass forward on the pinned map before opening it.
    await page.locator('.journey-stop[data-stop="1"]').evaluate(el => {
      const track = document.querySelector<HTMLElement>('[data-journey]')!;
      const pinned = document.querySelector('#experience')!.classList.contains('is-pinned');
      const top = track.getBoundingClientRect().top + scrollY;
      // Park in the middle of Delhi's stretch, so a small nudge never flies on to the next city.
      const steps = document.querySelectorAll('.journey-stop').length;
      window.scrollTo(0, pinned ? top + (track.offsetHeight - innerHeight) * (1.5 / steps) : el.getBoundingClientRect().top + scrollY - 100);
    });
    await expect(gartner).toBeVisible();
    // Roles read oldest first, the way the flight runs; territory planning came with the senior role.
    // Smooth scrolling may still be gliding to the stop; let it land first, or the
    // journey moves on to the next city (which rightly closes any open log).
    let settledAt = -1;
    await expect.poll(async () => { const y = await page.evaluate(() => scrollY); const still = y === settledAt; settledAt = y; return still; }, {intervals: [300]}).toBe(true);
    // On phones the pass body scrolls on its own; bring the row up inside it, so
    // reaching it never scrolls the page (which would fly on to the next city).
    await gartner.locator('.role-row').last().evaluate(row => {
      const body = row.closest<HTMLElement>('.pass-body')!;
      const below = row.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom;
      if (below > 0) body.scrollTop += below + 12;
    });
    // A role's highlights are on the back of the ticket.
    await gartner.locator('.role-row').last().click();
    await expect(page.locator('.boarding-pass.is-turning')).toHaveCount(0);
    const log = page.locator('.boarding-pass.show-log .pass-log.is-open');
    await expect(log).toContainText('territory planning');
    await expect(log).toBeInViewport();
    await log.getByRole('button', {name: /Back to the pass/}).click();
    await expect(page.locator('.boarding-pass.show-log')).toHaveCount(0);
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

test('the plane lands in a 3D city that visitors can fly, then hand back to the conversation', async ({page}) => {
  // Real cities in a software renderer, plus a 3-second launch count, take a while in CI.
  // Game time advances at most 0.05s per frame, so at a few frames a second the count
  // alone can take 20 seconds or more of wall time.
  test.setTimeout(180000);
  for (const width of [390, 1440]) {
    await page.setViewportSize({width, height:900});
    await page.goto('./');
    const sky = page.locator('[data-sky]');
    await sky.scrollIntoViewIfNeeded();
    await expect(sky).toHaveClass(/is-ready|is-unsupported/, {timeout: 30000});
    if (await sky.evaluate(el => el.classList.contains('is-unsupported'))) {
      // Without WebGL the conversation still works over a painted sky.
      await expect(page.locator('.contact-email')).toBeVisible();
      await expect(page.locator('.contact-prompts a')).toHaveCount(3);
      continue;
    }
    await expect(page.locator('.sky-credit')).toContainText('OpenStreetMap');
    const starters = page.locator('.contact-prompts a');
    await expect(starters).toHaveCount(3);
    await expect(starters.first()).toHaveAttribute('href', /^mailto:.*\?subject=I%20have%20an%20AI%20idea$/);
    await page.getByRole('button', {name:/Bengaluru/}).click();
    await expect(page.getByRole('button', {name:/Bengaluru/})).toHaveAttribute('aria-pressed', 'true');
    await expect(sky).toHaveAttribute('data-city', 'bengaluru');
    await expect(sky).not.toHaveClass(/is-loading/, {timeout: 30000});
    await page.getByRole('button', {name:/Take the controls/}).click();
    await expect(page.locator('html')).toHaveClass(/is-flying/);
    await expect(page.locator('.sky-hud')).toBeVisible();
    await expect(page.locator('[data-sky-status]')).toContainText('You have the controls');
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(400);
    await page.keyboard.up('ArrowLeft');
    await expect.poll(async () => Number(await page.locator('[data-hud="score"]').textContent()), {timeout: 60000}).toBeGreaterThan(0);
    // Holding Space fires the booster.
    await page.keyboard.down(' ');
    await expect(sky).toHaveClass(/is-boosting/);
    await page.keyboard.up(' ');
    // The game is a game: no captions pop up over the flight.
    await expect(page.locator('.sky-toast')).toHaveCount(0);
    await page.screenshot({path:`test-results/sky-${width}.png`});
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveClass(/is-flying/);
    await expect(page.locator('.contact-email')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  }
});

test('the model follows both themes and stays accessible', async ({page}) => {
  test.setTimeout(60000);
  await page.emulateMedia({reducedMotion:'reduce'});
  for (const width of [390,1440]) {
    await page.setViewportSize({width,height:1000});
    await page.goto('./');
    await page.locator('#skills').scrollIntoViewIfNeeded();
    for (const theme of ['light','dark','light']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle').click();
      await expect(page.locator('#skills')).toHaveCSS('background-color', theme === 'light' ? 'rgb(244, 241, 232)' : 'rgb(11, 11, 13)');
      const audit=await new AxeBuilder({page}).include('#skills').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      expect(audit.violations).toEqual([]);
      await page.locator('.orb-grid').screenshot({path:`test-results/expertise-${theme}-${width}.png`});
    }
  }
});

test('results arrive on a split-flap board, settle on the reported figures and open their notes', async ({page}) => {
  const stories = ['automall-ai-search', 'automall-conversational-ai', 'real-time-lead-scoring'].map(slug => fallback.content.projects.find(p => p.slug === slug)!);
  const flapsOf = (i: number) => page.locator('.board-row').nth(i).locator('.flap').evaluateAll(els => els.map(e => e.textContent!.replace(/\u00a0/g, ' ')).join('').trim());
  for (const width of [390, 1440]) {
    await page.setViewportSize({width, height:900});
    await page.goto('./');
    await page.locator('[data-board]').scrollIntoViewIfNeeded();
    await expect(page.locator('.board-row')).toHaveCount(3);
    await expect(page.locator('[data-board-clock]')).toHaveText(/^\d{2}:\d{2}$/);
    // The flaps clatter, then settle on exactly the published figure.
    await expect.poll(() => flapsOf(0), {timeout: 8000}).toBe('AED 1.99M');
    await expect.poll(() => flapsOf(2), {timeout: 8000}).toBe('45%');
    await expect(page.locator('.board-row').nth(1)).toContainText(stories[1].summary);
    await page.locator('.board-row').nth(1).getByRole('link').click();
    await expect(page.getByRole('dialog')).toContainText(stories[1].title);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('./');
  await page.locator('[data-board]').scrollIntoViewIfNeeded();
  expect(await flapsOf(0)).toBe('AED 1.99M');
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

test('scrolling through the pinned work visits every project in order', async ({page}) => {
  test.setTimeout(60000);
  const total = fallback.content.projects.length;
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await page.setViewportSize({width, height});
    await page.goto('./');
    await expect(page.locator('#projects')).toHaveClass(/is-pinned/);
    const seen = new Set<string>();
    for (let k = 0; k <= 40; k++) {
      await page.locator('[data-work-track]').evaluate((el, f) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY + ((el as HTMLElement).offsetHeight - innerHeight) * f), k / 40);
      await page.waitForTimeout(120);
      seen.add(((await page.locator('[data-project-position]').textContent()) ?? '').slice(0, 2));
      await expect(page.locator('.work-pin')).toBeInViewport();
    }
    expect(seen.size).toBe(total);
  }
});
