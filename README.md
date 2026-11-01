# Anshul Sharma — portfolio

A static, editorial portfolio for GitHub Pages. Vite + TypeScript; Supabase is the primary content source, with a reviewed prerendered snapshot so the portfolio still works during outages and without JavaScript. No runtime framework, third-party font requests, tracking cookies, public admin UI or service credentials in the client.

## Develop and verify

```bash
npm ci
cp .env.example .env.local
npm run dev
npm run check
npm run test:policies     # PostgreSQL 15+; creates and removes an isolated instance
npm run preview -- --port 4173
npm run test:browser     # installed Chrome locally; Chromium in CI
npm run security:scan
```

Node 22.14+ is supported. The local server binds to loopback. In a sandbox, starting test servers may require network/socket permission. Do not use the original `script.js` or Jekyll build; they are legacy references, and are not included in `dist`.

## Supabase

The owner project is `anshul-portfolio` (`dopakyjcuasdjxzubwyy`), in Mumbai, under the free “Anshul Sharma — Portfolio” organization.

[Open Supabase project](https://supabase.com/dashboard/project/dopakyjcuasdjxzubwyy)

The owner project’s public URL and publishable key are deliberately checked into `src/content/public-settings.json`, so the default build is already connected. Optional overrides belong in ignored `.env.local` for development and GitHub repository **variables** for deployment. They are public, including in built JavaScript. RLS and table grants are the security boundary.

| Variable                        | Visibility / use                                                                                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`             | Public HTTPS `*.supabase.co` project URL.                                                                                                                                           |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public `sb_publishable_…` browser key. Secret/service-role/legacy JWT keys are rejected by the build.                                                                               |
| `VITE_ANALYTICS_ENABLED`        | Public `true` or `false`; optional override; enabled in the reviewed public settings.                                                                                               |
| `SITE_URL`                      | Public canonical URL ending in `/`; default `https://anshuls235.github.io/`. Its path must match BASE_PATH.                                                                         |
| `BASE_PATH`                     | Public `/` or `/repository-name/`; default `/`.                                                                                                                                     |
| `ALLOWED_ORIGINS`               | Optional Edge Function configuration override in Supabase, comma-separated exact origins. Defaults are the production site and explicit loopback ports 4173/5173. Not a credential. |
| `SUPABASE_URL`                  | Automatically supplied to Edge Functions by Supabase.                                                                                                                               |
| `SUPABASE_SERVICE_ROLE_KEY`     | **Secret**, supplied only inside the Supabase Edge runtime. Never copy it to `.env`, GitHub frontend variables, source, chat or browser code.                                       |

No database password, PAT, SMTP credential or admin key is required to build or read this site. The database password was generated inside Supabase's project-creation UI and not copied into the repository. Reset it through Supabase and save it in your password manager before using a direct database connection.

## Documentation

- [Content sources and conflict resolution](docs/CONTENT-SOURCES.md)
- [Final database schema and permission model](docs/DATABASE.md)
- [Dashboard maintenance, fallback refresh, deployment and rollback](docs/OPERATIONS.md)
- [Security, accessibility, performance and verification](docs/REVIEW.md)
- [Implementation decisions](docs/IMPLEMENTATION-PLAN.md)
- [Exact changed-file inventory and handoff](docs/HANDOFF.md)

## GitHub Pages

`.github/workflows/pages.yml` runs lint, types, unit tests, database policy tests, production build, a redacted credential scan and browser checks before uploading only `dist`. Actions are pinned to verified immutable commit SHAs; write permissions belong only to the deployment job. Enable **Settings → Pages → Source → GitHub Actions**. No custom domain was found; a later `CNAME` is copied into the artifact.

Hash links preserve existing section URLs and permit shareable project details without a server rewrite. The workflow only runs after you push; this task does not silently commit or push your local checkout.
