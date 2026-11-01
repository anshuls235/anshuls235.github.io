# Portfolio operations

## Edit content without code

Open [Table Editor](https://supabase.com/dashboard/project/dopakyjcuasdjxzubwyy/editor). All content tables are in the public schema; raw analytics is in private. You administer content as the signed-in owner in Supabase, not as an anonymous website visitor.

- **Profile / current role:** edit `profile` for name, title, headline (newline for intentional break), introduction, about, public location, email and CV/portrait URLs. Update `experiences` when you change roles: set the previous role's end date, insert the new role and order it first. Each role is a separate row. Only one profile can be published.
- **Add a project:** insert a row in `projects` as `draft`. UUID and timestamps are automatic. Set a unique stable slug, title, category, summary and description. Fill role, organization, problem, approach, responsibilities, outcomes and technologies only when supported by your work. Leave unknown dates null. Lower `sort_order` comes first. Set `featured=true` to include it in selected work.
- **Publish / unpublish:** change `status` to `published` or `draft`. Public reads select only published records, with RLS enforcing the same restriction. Project links also require a published parent. Publish a project and its links together when ready. Changing a draft to published does not require a frontend build: the next visit fetches it from Supabase.
- **Add links:** create `project_links` with the parent UUID, label, kind and full HTTPS URL. Supported analytics kinds: github, website, demo, article, notebook, case-study, other. Links render even if analytics ignores an unsupported classification.
- **Images:** use a public HTTPS image URL (for example a Supabase Storage public URL) and meaningful `image_alt`. Optimize before upload. Use `assets/...` only for assets already committed and deployed. For public Storage, upload through the owner dashboard; do not add anonymous upload policies. Keep private source media in a separate private bucket.
- **No image:** select a restrained schematic `visual_kind`: search, retrieval, pipeline, chart or vision. These are decorative, not claims of real product UI or measured charts.
- **Skills:** each skill is a `skills` row with category and order. Repeated category names group together in the UI. Project technologies are project-owned arrays and can differ from the main expertise section.
- **Writing / education:** edit `publications`, `education`, `certifications`. Keep unknown dates null. Social links are separate `social_links` rows. Use HTTPS; the frontend rejects script/data URLs and credentials in URLs.

The site checks for the latest content on each load with a 4.5-second total deadline. It updates all collections atomically after validation, and keeps the prerendered saved version on any failed request. A deliberate empty project collection renders an empty archive, not resurrected project records. Search/filter state is local to the page.

## Refresh the fallback

Supabase is primary; `src/content/fallback.json` is a tracked last-known-good public snapshot, not a second manual CMS. After substantial dashboard changes:

```bash
npm run fallback:refresh
npm run check
npm run security:scan
git diff -- src/content/fallback.json
```

Review the diff for draft/private content, commit, and deploy through GitHub Pages. The refresh uses only public SELECT permissions, rejects invalid data and a missing published profile, and replaces the file atomically. The prebuilt snapshot also supplies SEO and no-JavaScript content; those reflect the last deployment until refreshed. Runtime browser content reflects dashboard updates immediately on the next load.

**Unpublishing is not erasure from historical artifacts.** Refresh and redeploy after removing anything public from the database: a paused project or disabled JavaScript otherwise shows the old public snapshot. Git history and previously deployed artifacts can also retain prior content. Never put confidential data in a published row.

## Database setup / repeatability

For a new Supabase project, apply both SQL files in `supabase/migrations` in filename order, then `supabase/seed.sql`. The seed inserts missing stable UUIDs only and does not overwrite owner dashboard edits. Run schema changes as migrations; do not edit an already-applied migration for later changes.

The initial owner project was provisioned through the dashboard SQL Editor. Before first using the CLI migration workflow on that same project, authenticate locally, link, and mark the already applied migration:

```bash
supabase login
supabase link --project-ref dopakyjcuasdjxzubwyy
supabase migration repair --status applied 202611010001 202611010002
supabase gen types typescript --linked > src/lib/database.generated.ts
```

Use supported Supabase CLI installation, with credentials in its secure local session. Do not paste access tokens into shell history or chat. For a completely new local Supabase stack, `supabase db reset` applies the migration and seed; it destroys the local database, so use only a disposable development stack. The policy script uses its own temporary instance instead.

## Analytics

Deploy `supabase/functions/analytics` as `analytics`, with JWT verification disabled because ingestion intentionally accepts anonymous public events. The function applies explicit origin/body/event checks and uses its server-side service role only for the restricted RPC. CORS and a public key are not authentication or bot-proofing.

The deployed code defaults to the following explicit allowlist. To change it, set `ALLOWED_ORIGINS` in Supabase Edge Function secrets/configuration to exact comma-separated origins:

```text
https://anshuls235.github.io,http://127.0.0.1:4173,http://127.0.0.1:5173
```

No trailing slashes. Add a custom production domain before enabling traffic from it; do not use `*`. `localhost` is different from `127.0.0.1` and must be explicitly listed if used. The Edge Function limits requests to 2 KB, checks streamed body size and read time, uses server timestamps, validates published project references, and enforces database-atomic per-session (60/min) and global (600/min) quotas. Rotating session IDs cannot bypass the global storage cap. This does not guarantee resistance to request floods or perfectly accurate statistics; use provider infrastructure controls for sustained abuse.

Analytics is enabled in the checked-in public settings after verifying the hosted endpoint. Set `VITE_ANALYTICS_ENABLED=false` to disable it. DNT/GPC prevents browser analytics requests; endpoint failures never block navigation. No identifier survives a page reload. No raw/hashed IP, full user-agent, contact content, search query or exact location is stored by this application.

Run `supabase/reporting.sql` in SQL Editor as owner. It provides total views, approximate sessions, top pages, project views/clicks, link clicks, referrers, daily/monthly totals, CV downloads, contact and social actions. No reporting view is exposed publicly. Enable Cron and run `supabase/retention.sql` once; this schedules daily cleanup of events older than 90 days and quota buckets older than one day. Check `cron.job` for the active job. If Cron is disabled, run `select private.prune_analytics();` manually; retention is not automatic without the job.

## Paused project

In Supabase, open the project and select Resume. Wait for Healthy, then reload the portfolio. The public snapshot keeps the site useful while resuming. If the project was deleted rather than paused, provision a replacement, restore the content backup, deploy the function and update the two public frontend variables; do not “fix” access by disabling RLS.

## Backups

Use Supabase database backups where available for your plan. For a separate owner-controlled database export, use authenticated Supabase CLI `db dump` into a private location outside this public repository, including private schema only if intended. Never commit a database connection string or full private dump. Separately run `fallback:refresh` to retain a safe public-only content export. Keep original media privately backed up. Test restore on a disposable project; retain UUIDs so links remain connected.

## GitHub deployment and rollback

The default public settings already connect the owner database. Use optional repository variable overrides from `.env.example` when needed, and enable GitHub Actions as the Pages source. SITE_URL must include BASE_PATH, e.g. `https://name.github.io/repo/` with `/repo/`. The build keeps all asset links and privacy links within that path. Hash routing requires no SPA rewrite. A public content edit needs no deployment; updating CSS, images, fallback/SEO or frontend configuration does.

Review changes locally, commit and push to `main`. The workflow verifies then uploads `dist`, with no environment files, SQL, scripts, tests, legacy data or tooling. For rollback, revert the frontend commit and rerun the workflow (or redeploy a retained known-good Pages artifact). Database content is independent: restore an owner-reviewed export or edit dashboard rows. Use a forward SQL migration for schema corrections; never drop production tables to match an old frontend.

## Exposed credentials

A publishable key is intentionally public. If a _secret_ is exposed, revoke/rotate the affected credential in its provider dashboard, update server-side function secrets, and redeploy the affected backend. Inspect logs and privileges, then remove it from the current source. Coordinate any Git history rewrite separately; this task does not rewrite history or rotate existing credentials. Never substitute a service-role key for the public publishable key.

## Public CV

`resume.pdf` and `public/resume.pdf` are a public copy of the owner's latest supplied July 2026 CV, retaining its original one-page layout with the private phone removed. The original supplied file in Downloads is untouched. To prepare a revised owner-reviewed source:

```bash
python3 scripts/redact-cv.py /absolute/path/to/reviewed-cv.pdf
```

This helper targets the reviewed CV's header geometry; inspect the rendered page in `tmp/pdfs` and all links before using a different layout. Reopen the PDF and verify that the private phone is no longer extractable. Copy the reviewed `public/resume.pdf` to the root `resume.pdf`, then build and deploy. `scripts/build-public-cv.py` is an alternative for generating a standalone CV from the reviewed snapshot; it is not used for the current download.

Alternatively set `profile.resume_url` to a new public HTTPS PDF in the dashboard; the download changes on the next visit without code. Prior phone details remain in historical commits; no history was rewritten. Standalone territory-planning and lead-scoring case studies are drafts pending editorial review and are excluded from the public fallback.
