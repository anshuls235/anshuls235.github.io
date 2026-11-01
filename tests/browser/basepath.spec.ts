import { test, expect } from "@playwright/test";
test("repository subpath serves content, portrait, CV and privacy assets", async ({
  page,
}) => {
  test.skip(
    !process.env.PORTFOLIO_TEST_BASE_PATH,
    "Dedicated repository-subpath preview",
  );
  const failures: string[] = [];
  page.on("response", (r) => {
    if (r.url().startsWith("http://127.0.0.1:4174") && r.status() >= 400)
      failures.push(r.url());
  });
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Making intelligence work in the real world.",
  );
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".hero-actions a[download]")).toHaveAttribute(
    "href",
    "/portfolio/resume.pdf",
  );
  expect((await page.request.get("/portfolio/resume.pdf")).status()).toBe(200);
  await page.getByRole("link", { name: "Privacy & analytics" }).click();
  await expect(
    page.getByRole("heading", { name: "Privacy, by design." }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(failures).toEqual([]);
});
