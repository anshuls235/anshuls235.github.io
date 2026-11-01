# Portfolio rebuild plan

## Preserve / migrate / replace

- Preserve public identity, email, social profile URLs, portrait, favicon, `resume.pdf` URL and all existing section anchors (`home`, `about`, `projects`, `experience`, `skills`, `education`, `contact`).
- Keep original source files for provenance; build an explicit allowlist into `dist` so tooling, the old JSON and original private CV do not leak into the new deployment.
- Replace JSON runtime rendering, icon/font CDNs, theme handling, navigation and project cards. Preserve GitHub Pages hosting; no client router is needed.
- Verify content against the current live site, local CV, public GitHub projects and Medium. Resolve conflicting employment dates with the owner. Do not scrape LinkedIn or invent article/notebook achievements.

## Information architecture and visual direction

Introduction → selected project narratives → searchable/filterable archive → experience → expertise → writing & data notebooks → education & certifications → about/contact → privacy.
Editorial technical field notes: warm paper, deep ink, cobalt, generous type, thin rules and diagrammatic project art. A coordinated dark theme, reduced motion, semantic landmarks and visible keyboard focus are built in.

## Technology

Vite + TypeScript with semantic HTML and CSS; no framework or Supabase SDK payload is needed for read-only PostgREST requests. Build-time prerendered published fallback content works without JavaScript. Runtime fetches replace it atomically when Supabase succeeds. Typed validation and safe DOM rendering protect content boundaries.

## Database and content migration

UUIDs, stable slugs, draft/published, timestamps and ordering on content. Tables: profile, projects, project_links, experiences, education, skills, certifications, publications and social_links. Separate private schema for page_views, interaction_events, rate counters and reporting. SQL migrations + deterministic idempotent seed. Fallback snapshot is refreshed with the public key and validated before replacing the tracked file.

## Analytics and security

Browser → anonymous Edge Function → service-only ingestion RPC → private tables. No cookies, stored IP, fingerprint, exact location or persistent visitor ID. Optional tab-memory session ID; DNT/GPC respected. Allowlisted event schema, strict sizes/URLs/origins, atomic per-session and global database quotas. Public keys are public; grants and RLS are the boundary. No client writes or analytics reads. Tests exercise roles and parent-child draft access.

## Deployment / verification

Pinned GitHub Actions, least permissions, Node lockfile, `dist` only; root and repository subpaths supported. Preserve any CNAME if supplied (none found). Run lint, types, data/security unit tests, real PostgreSQL policy tests, Edge validation tests, production build and browser scenarios (mobile/desktop, keyboard, filter/detail, themes, empty/error/offline/DNT). Document any unavailable hosted checks honestly. No push or production publication until sources and deployment are reviewable.

## Account dependency

Supabase must be created under the owner's account. The Supabase plugin was discovered but is not connected. All schema, seed, functions and operations documentation can be completed independently; live provisioning/advisors require that connection or a local authenticated CLI. No credentials should be sent in chat except the browser-safe publishable key and project URL.
