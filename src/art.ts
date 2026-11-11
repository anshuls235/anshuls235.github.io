// Cover artwork shipped with the site, keyed by project slug. A project
// without one falls back to its illustrated vignette or a typographic tile.
const COVERS = new Set([
  "automall-ai-search",
  "enterprise-knowledge",
  "ml-pipeline-optimization",
  "automall-conversational-ai",
  "expected-credit-loss",
  "recruitment-studio",
  "covid19-dashboard",
  "freshness-detector",
  "real-time-lead-scoring",
  "command-center-ask-ai",
  "qualification-bot",
  "test-drive-mcp",
  "genie-builder",
]);
export const hasCover = (slug: string) => COVERS.has(slug);
export function coverUrl(slug: string, base: string, width: 600 | 1200 = 1200) {
  return `${base}assets/work/${slug}-${width}.webp`;
}
/** A decorative cover image; titles and results always stay in the text beside it. */
export function coverImage(slug: string, base: string, sizes: string) {
  return `<img src="${coverUrl(slug, base)}" srcset="${coverUrl(slug, base, 600)} 600w, ${coverUrl(slug, base)} 1200w" sizes="${sizes}" width="1200" height="900" alt="" loading="lazy" decoding="async" draggable="false">`;
}
