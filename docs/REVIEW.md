# Verification and review — 1 November 2026

## Implementation / content

Production static build succeeds. The connected Supabase project contains eight published projects and two editorial project drafts, six employment roles, 42 skills, three publications, two certifications, one education entry and four social profiles. The primary profile and links are dashboard-maintained. The saved public snapshot was refreshed through anonymous SELECT access after the latest CV updates; drafts are absent from it.

The latest owner-supplied July 2026 CV is the public download, preserving its one-page layout and hyperlinks with its private phone text removed through actual PDF redaction. The source PDF in Downloads is unchanged. The output was reopened, text-checked and visually inspected. LinkedIn's precise Gartner and SAP role splits are preserved; the CV groups those periods more broadly. Project results from the CV are explicitly dated July 2026.

## Checks completed

- ESLint and TypeScript: passed.
- Unit tests: 14 passed; content/schema validation, published-only reads, unsafe URLs/HTML, empty/error semantics, filters, CORS, DNT/GPC, Edge validation, body limits, upstream errors and quota responses.
- Real PostgreSQL: migration and idempotent seed applied in an isolated temporary database; all-table published/draft visibility, parent-child drafts, anonymous mutations, authenticated-role restrictions, analytics read/write denial, service-only ingestion, deduplication and atomic per-session/global quotas passed. The temporary database is removed after the run.
- Hosted Supabase: the transaction-scoped policy suite passed with its test mutations rolled back. Browser-key PATCH and direct ingestion RPC requests returned HTTP 401 with PostgreSQL permission-denied errors. A known draft returned an empty public result. The private schema request returned HTTP 406 because only public/graphql_public are exposed. Public published-content fetch succeeded. Anonymous Edge ingestion of a synthetic event returned HTTP 204.
- Edge Function: deployed bundle was verified byte-for-byte against the checked source (SHA-256 recorded at deployment); Deno check passed. JWT verification is off as designed for anonymous ingestion; strict function validation, server-only RPC privileges and RLS remain active.
- Repository subpath: dedicated preview check passed for page content, portrait/font paths, CV and privacy assets; all five main browser scenarios also passed under `/portfolio/`.
- Browser main flows: five scenarios passed against the built real-config site, including project dialog/deep link, filter/search/reset, CV, privacy, themes, 320/390/768/1440px layouts, keyboard skip/menu/Escape behavior, no-JavaScript content and asset requests. Database calls are mocked in the repeatable baseline suite; a separate manual browser run fetched the real hosted collections successfully.
- Configured failure scenarios: two passed against a fake endpoint build: dashboard-like content updates, published empty collections, paused/error API fallback, offline in-page interaction and DNT preventing analytics requests.
- Axe: zero WCAG A/AA violations in tested desktop, mobile, dark and open-dialog states. Semantic browser snapshots were inspected. This is not a claim that a complete manual screen-reader audit was performed.
- Lighthouse mobile simulation after optimization: **99 performance / 100 accessibility / 100 best practices / 100 SEO**. FCP 1.5s, LCP 1.7s, CLS 0, TBT 100ms, speed index 1.7s. See `lighthouse-summary.json`. These are local lab results, not a field-performance guarantee.
- npm audit: zero known vulnerabilities after patching Vite and the minimatch dependency.
- Redacted credential-pattern scan: no matches in source, `dist` or reachable Git objects. Browser output contains the deliberately public publishable key and project URL; no service-role/secret key, database password, PAT or private credential was retrieved into frontend source or output. A heuristic scan cannot prove that every arbitrary string is non-secret.
- Existing project links: four old GitHub URLs returned 404 and were removed from displayed links. Automall and the two preserved certificate URLs returned 200. Individual Medium/Kaggle access limits are documented in the source inventory.

## Supabase advisors

Security and Performance Advisors were run against the hosted project. Both report **zero errors and zero warnings**. Two warnings on Supabase's dashboard-created `public.rls_auto_enable()` SECURITY DEFINER function were corrected by migration 002, revoking anonymous/authenticated direct execution while preserving owner event-trigger behavior.

Three security information notices identify RLS enabled without policies on private analytics tables. This is deliberate deny-by-default: no anonymous/authenticated access or private-schema exposure; only the trusted server role bypasses RLS. Six performance information notices identify newly unused indexes, retained for FK joins, event reporting and chronological/session access as traffic begins. No warning was hidden or suppressed.

## Privacy and remaining practical limits

No visitor cookies, saved visitor IDs, fingerprints, raw/hashed IPs, precise location, full user-agent or form contents are stored by this application. The optional theme preference stays in browser storage only. Page-memory UUIDs approximate sessions and reset on reload. Providers may process network metadata in their own operational logs, as the privacy notice states. CORS is not authentication; an attacker can spoof origins outside the browser. Atomic global quotas cap stored events but do not prevent all endpoint request flooding or statistical manipulation.

The owner did not approve automatic raw-data deletion. The proposed daily Cron cleanup remains **disabled**; no analytics was deleted. The reviewable optional script is `supabase/retention.sql`. Reports retain their history under the current configuration. If enabling retention later, consider historical aggregate rollups first; the current reporting views derive from raw events.

Static fallback and SEO reflect the last deployment. After unpublishing previously public content, refresh and redeploy the snapshot; disabling access in the database cannot retroactively erase public artifacts or Git history. Historical commits still contain the old CV/contact phone. No history rewrite or existing credential rotation was performed.

GitHub Pages deployment is configured through the checked-in Actions workflow. Each push to main runs validation before deploying the built public artifact. Private editorial draft SQL is excluded from Git and the public seed. Supabase content and the analytics backend are already provisioned. Initial dashboard SQL migrations should be marked applied with the documented CLI repair command before adopting future CLI migrations.
