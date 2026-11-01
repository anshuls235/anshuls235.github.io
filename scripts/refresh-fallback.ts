import { loadEnv } from "vite";
import { configuredProject } from "../src/lib/settings";
import { writeFile, rename } from "node:fs/promises";
import { fetchContent, validateSnapshot } from "../src/lib/content";
const env = { ...loadEnv("production", process.cwd(), ""), ...process.env };
const config = configuredProject(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_PUBLISHABLE_KEY,
);
if (!config) throw new Error("Set the public Supabase variables first");
const snapshot = validateSnapshot({
  version: 1,
  exported_at: new Date().toISOString(),
  content: await fetchContent(config),
});
if (snapshot.content.profile.length !== 1)
  throw new Error(
    "Refusing to replace the critical fallback without a published profile",
  );
const target = "src/content/fallback.json";
await writeFile(target + ".tmp", JSON.stringify(snapshot, null, 2) + "\n", {
  mode: 0o600,
});
await rename(target + ".tmp", target);
console.log(
  "Published snapshot refreshed. Review the diff and privacy before committing; never export drafts.",
);
