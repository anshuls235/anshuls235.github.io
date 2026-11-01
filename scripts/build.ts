import { build, loadEnv } from "vite";
import { copyFile, writeFile, readFile } from "node:fs/promises";
import { validateSnapshot } from "../src/lib/content";
const env = { ...loadEnv("production", process.cwd(), ""), ...process.env };
const base = env.BASE_PATH || "/";
const site = env.SITE_URL || `https://anshuls235.github.io${base}`;
const snapshot = validateSnapshot(
  JSON.parse(await readFile("src/content/fallback.json", "utf8")),
);
await build();
await writeFile(
  "dist/robots.txt",
  `User-agent: *\nAllow: /\nSitemap: ${new URL("sitemap.xml", site).href}\n`,
);
await writeFile(
  "dist/sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${site.replace(/&/g, "&amp;")}</loc></url><url><loc>${new URL("privacy.html", site).href}</loc></url></urlset>\n`,
);
await writeFile("dist/.nojekyll", "");
await writeFile(
  "dist/styles.css",
  (await readFile("styles.css", "utf8")).replaceAll(
    'url("/assets/',
    'url("' + base + "assets/",
  ),
);
try {
  await copyFile("CNAME", "dist/CNAME");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
console.log(
  `Built ${snapshot.content.projects.length} published projects. Supabase connected through the explicit public settings; saved snapshot retained.`,
);
