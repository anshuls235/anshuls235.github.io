import { defineConfig, loadEnv } from "vite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { validateSnapshot } from "./src/lib/content";
import { configuredProject } from "./src/lib/settings";
import { metadata, renderSite } from "./src/lib/render";
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const config = configuredProject(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
  for (const name of Object.keys(env))
    if (
      name.startsWith("VITE_") &&
      ![
        "VITE_SUPABASE_URL",
        "VITE_SUPABASE_PUBLISHABLE_KEY",
        "VITE_ANALYTICS_ENABLED",
      ].includes(name)
    )
      throw new Error(
        "Unexpected VITE variable; only explicit public configuration is allowed",
      );
  if (
    env.VITE_ANALYTICS_ENABLED &&
    !["true", "false"].includes(env.VITE_ANALYTICS_ENABLED)
  )
    throw new Error("VITE_ANALYTICS_ENABLED must be true or false");
  const base = env.BASE_PATH || "/";
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base))
    throw new Error("BASE_PATH must start and end with /");
  const site = new URL(env.SITE_URL || `https://anshuls235.github.io${base}`);
  if (
    site.protocol !== "https:" ||
    site.search ||
    site.hash ||
    site.username ||
    site.password
  )
    throw new Error("SITE_URL must be a public HTTPS URL");
  if (site.pathname !== base)
    throw new Error("SITE_URL path must equal BASE_PATH");
  const snapshot = validateSnapshot(
    JSON.parse(readFileSync("src/content/fallback.json", "utf8")),
  );
  return {
    base,
    publicDir: "public",
    build: { target: "es2022", sourcemap: false, assetsInlineLimit: 0 },
    plugins: [
      {
        name: "published-portfolio",
        transformIndexHtml: {
          order: "pre",
          handler(html) {
            const profile = snapshot.content.profile[0];
            const person = profile
              ? JSON.stringify({
                  "@context": "https://schema.org",
                  "@type": "Person",
                  name: profile.name,
                  jobTitle: profile.title,
                  url: site.href,
                  sameAs: snapshot.content.social_links.map((s) => s.url),
                }).replaceAll("<", "\\u003c")
              : "";
            const hash = createHash("sha256").update(person).digest("base64");
            const csp = `default-src 'self'; script-src 'self' 'sha256-${hash}'; style-src 'self'; img-src 'self' https:; font-src 'self'; connect-src 'self'${config ? " " + config.url : ""}; object-src 'none'; base-uri 'self'; form-action 'none'; upgrade-insecure-requests`;
            return html
              .replace(
                "<!--META-->",
                `<meta http-equiv="Content-Security-Policy" content="${csp}">${profile ? metadata(profile, site.href, base) + `<script type="application/ld+json">${person}</script>` : "<title>Portfolio</title>"}`,
              )
              .replace("<!--CONTENT-->", renderSite(snapshot.content, base));
          },
        },
      },
    ],
  };
});
