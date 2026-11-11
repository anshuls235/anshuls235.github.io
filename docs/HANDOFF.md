# Portfolio handoff

The portfolio is configured for public deployment at https://anshuls235.github.io/ through the verified GitHub Actions workflow. The Supabase backend is live.

## Ready now

- Editorial, responsive portfolio with coordinated light/dark themes, accessible navigation, a spiral gallery of every project, shareable project dialogs, role details, writing, skills, education and contact links.
- Owner Supabase project: [anshul-portfolio](https://supabase.com/dashboard/project/dopakyjcuasdjxzubwyy), Mumbai, free personal organization.
- Eight public projects; territory planning and lead scoring are private editorial drafts. Profile, roles, skills, links, projects and writing update through the dashboard and are fetched on the next page load.
- Primary schema migration plus dashboard-trigger hardening migration, generated public database types, repeatable published-content seed, tested RLS/grants, live analytics function, and private reporting queries.
- Latest July 2026 CV download, retaining the source's one-page layout and links with its private phone removed. The supplied file in Downloads is untouched.
- Published-only local fallback and static SEO/no-JavaScript content. Old section anchors, CV and legacy portrait/favicon URLs preserved.
- GitHub Pages workflow, least-privilege permissions, pinned official action SHAs, root/subpath asset handling, sitemap/robots, Open Graph image and structured data.

## Review and publish

1. Review the design and content (desktop/mobile screenshots are in ignored `tmp/screenshots`); run `npm run dev` for a local interactive preview.
2. Push reviewed changes to `main`; the workflow validates the source, builds the static artifact and deploys it to GitHub Pages.
3. Set GitHub Pages Source to **GitHub Actions**. The checked-in project URL and publishable key already connect the correct Supabase project; optional environment overrides are documented in README. These values are deliberately public, not secret credentials.
4. If adopting CLI migrations on the already-provisioned project, authenticate/link locally and mark both dashboard-applied migrations as applied, as documented in OPERATIONS. This is not needed for routine dashboard content edits.
5. Review/publish the two draft project narratives when ready. Automatic deletion is disabled; retain history or separately approve the prepared optional retention policy.

## Validation

Lint, TypeScript, 14 unit tests, real PostgreSQL policy/quota tests, hosted policy tests, Deno type checking and production build pass. Browser checks cover desktop/mobile layouts, keyboard access, filtering, case studies, themes, CV/privacy, no JavaScript, real content fetches, empty/error/paused/offline behavior, DNT, and a repository subpath. Axe found no violations in the tested desktop/mobile/dark/dialog states. Lighthouse mobile simulation scored **99 / 100 / 100 / 100** (performance / accessibility / best practices / SEO). npm audit reports zero vulnerabilities. See REVIEW for scope and practical limits.

No privileged credential was added to frontend output or repository source. Anonymous API modification and analytics reads/bypass were denied in hosted tests. The credential-pattern scan found no matches in current source/build or reachable Git objects. Old phone details remain in historical commits; history was not rewritten.

## Further details

- [Final schema](DATABASE.md)
- [Variables, dashboard editing, fallback, analytics, backups and rollback](OPERATIONS.md)
- [Sources and conflicting versions](CONTENT-SOURCES.md)
- [Security/accessibility/performance evidence](REVIEW.md)

## Exact files changed

The existing untracked `.gitignore` entries were preserved and extended. Local tool directories, private draft SQL, original attachments, environment files, `dist`, screenshots and test artifacts are ignored and excluded from this inventory and deployment.

### Modified tracked files

- `README.md`
- `data.json`
- `index.html`
- `resume.pdf`
- `styles.css`

### Added source files

- `.env.example`
- `.github/workflows/pages.yml`
- `.gitignore`
- `docs/CONTENT-SOURCES.md`
- `docs/DATABASE.md`
- `docs/HANDOFF.md`
- `docs/IMPLEMENTATION-PLAN.md`
- `docs/OPERATIONS.md`
- `docs/REVIEW.md`
- `docs/lighthouse-summary.json`
- `eslint.config.js`
- `package-lock.json`
- `package.json`
- `playwright.config.ts`
- `public/404.html`
- `public/assets/FONT-LICENSE.txt`
- `public/assets/favicon.svg`
- `public/assets/inter-latin.woff2`
- `public/assets/portrait-small.webp`
- `public/assets/portrait.webp`
- `public/assets/social-preview.png`
- `public/favicon.ico`
- `public/privacy.html`
- `public/profile.jpg`
- `public/resume.pdf`
- `scripts/build-public-cv.py`
- `scripts/build.ts`
- `scripts/generate-db-types.py`
- `scripts/generate-seed.ts`
- `scripts/redact-cv.py`
- `scripts/refresh-fallback.ts`
- `scripts/security-scan.py`
- `scripts/test-policies.sh`
- `src/content/fallback.json`
- `src/content/public-settings.json`
- `src/lib/analytics.ts`
- `src/lib/content.ts`
- `src/lib/database.generated.ts`
- `src/lib/database.types.ts`
- `src/lib/render.ts`
- `src/lib/settings.ts`
- `src/lib/types.ts`
- `src/main.ts`
- `src/theme.ts`
- `supabase/config.toml`
- `supabase/functions/analytics/handler.ts`
- `supabase/functions/analytics/index.ts`
- `supabase/functions/analytics/validation.ts`
- `supabase/migrations/202611010001_portfolio.sql`
- `supabase/migrations/202611010002_harden_dashboard_trigger.sql`
- `supabase/reporting.sql`
- `supabase/retention.sql`
- `supabase/seed.sql`
- `supabase/tests/policies.sql`
- `tests/analytics.test.ts`
- `tests/browser/basepath.spec.ts`
- `tests/browser/portfolio.spec.ts`
- `tests/content.test.ts`
- `tsconfig.json`
- `vite.config.ts`
