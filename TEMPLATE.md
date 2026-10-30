# Dossier v1 AI Job Search and Resume Tailor: Railway template spec

## Listing

| Field | Value |
|---|---|
| Name | **Dossier v1 AI Job Search and Resume Tailor** (given name, unchanged; "v1" = upstream major of the pinned 1.10.0) |
| Description | Track job applications and generate tailored resumes and cover letters. (71 chars, unchanged) |
| Category | AI/ML |
| Tags | dossier, job-search, resume, cover-letter, job-tracker, career, ai, self-hosted, postgres, nextjs |
| Icon | `https://cdn.jsdelivr.net/gh/AienTech/dossier@v1.10.0/src/app/icon.svg` (200, image/svg+xml; homarr dashboard-icons has no Dossier icon: 404) |

The description is deliverable as written. Application tracking (board, table, dashboard) works with no extra input. Tailored resumes and cover letters need an AI model, which the user chooses after sign-in: a hosted provider key (OpenAI-compatible, Anthropic or Mistral, billed by that provider), a local model server, or the optional Claude connector, which hands the writing to the user's own Claude plan. The template boots and runs without any key, so no AI input is required at deploy time.

## Base market template

- **"Dossier"** (code `deploy-dossier-ai-job-search-tracker`, 0 active, 1 project, created 2026-10-30): third-party image `ghcr.io/onepush-dev/dossier:1.10.0` plus Railway Postgres 18, volume `/data`, healthcheck `/api/health`, restart ALWAYS, `HOSTNAME=::`, a generated plain password that a wrapper hashes at start, AI defaults `openai`/`gpt-4o-mini`, job source `freehire`, telemetry `off`. It is the only market template and the base for layout (two services, `/data`, `/api/health`, port 3000, `DOSSIER_PUBLIC_URL`).
- Kept: service layout, volume path, healthcheck path, port, `HOSTNAME=::`, the idea of hashing a generated password at boot, `TZ`, `DOSSIER_BACKUP_RETENTION_DAYS`, `DOSSIER_PUBLIC_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}`, private-only Postgres.
- Changed: see "Improvements over market templates" below. The market wrapper was read (image layer listing, script text) for ideas only; nothing from it or the market README is reused.

## Pinned versions

| Service | Image / source | Tag | Release date | Checked |
|---|---|---|---|---|
| Dossier | repo `baranberkay96/dossier-railway`, `/services/dossier` → `FROM ghcr.io/aientech/dossier:${DOSSIER_VERSION}` | `v1.10.0` (= `latest` today; index digest `sha256:2a4dd7b7…2d677`, linux/amd64 only, label revision `a1ab9216`) | 2026-10-29 | 2026-10-30 |
| ↳ runtime in that image | Node 24.22.2 on Debian trixie (`node:24-trixie-slim`), Next.js 16.4.3 standalone, Prisma 7, Playwright Chromium headless shell | as built by upstream | 2026-10-29 | 2026-10-30 |
| Postgres | `ghcr.io/railwayapp-templates/postgres-ssl` | `18` (Railway base; upstream compose uses `postgres:18-alpine`) | Railway base | 2026-10-30 |

Upstream publishes tags with a `v` prefix (`v1.0.0` … `v1.10.0`); `1.10.0` without `v` does not exist on `ghcr.io/aientech/dossier`.

## Architecture

```
            Internet (HTTPS, Railway edge, X-Forwarded-Proto/For)
                               │  one domain, port 3000
                               ▼
  ┌──────────────────────────────────────────────────────┐  healthcheck GET /api/health
  │ Dossier (Next.js standalone, user node)              │  (200 only when Postgres answers)
  │  UI + Server Actions + API, Claude connector (MCP),  │
  │  in-process timers: nightly backup 03:00, job agent, │  volume /data
  │  Gmail check, startups refresh, AI job queue         │   ├─ backups/    nightly + pre-import JSON exports
  │  headless Chromium (on demand) prints PDFs from      │   └─ downloads/  "Download all PDFs" zips
  │  http://localhost:3000/print/*                       │
  └───────────────────────────┬──────────────────────────┘
                              │ postgresql:// private network
                              ▼
                 ┌─────────────────────────┐
                 │ Postgres 18 (private)   │  volume /var/lib/postgresql/data
                 └─────────────────────────┘
```

There are no separate workers: upstream runs the AI job queue, nightly backups, the job agent, the Gmail check and the startups refresh as timers inside the app process and supports exactly one instance per database. Resume and cover letter PDFs are rendered on demand by the bundled Chromium and not stored; profile, documents, photos and history live in Postgres. Only backups and PDF zips go to disk, so a Railway volume at `/data` is the right store (Dossier has no S3/Bucket support).

Boot sequence (`railway-entrypoint.sh`, then upstream's unchanged `./start.sh`):

1. As root: `mkdir -p $DOSSIER_DATA_DIR`, warn if it is on the root filesystem (no volume attached), `chown` to `node` only the files not yet owned by it (`find -xdev`).
2. `exec setpriv --reuid=node --regid=node --init-groups env HOME=/home/node …` back into the script. Everything after this runs unprivileged, as upstream's image does.
3. Sign-in password: if `DOSSIER_PASSWORD` holds a value, it is passed through (Dossier validates it). Otherwise `DOSSIER_LOGIN_PASSWORD` (min. 12 characters, no leading/trailing whitespace) is hashed by `railway-password.mjs` into Dossier's `argon2id:m=19456,t=2,p=1:<salt>:<hash>` format with `node:crypto`. The salt is `HMAC-SHA256(DOSSIER_SECRET, fixed label)[0..16]`, so the hash is identical on every boot. The plain password is then `unset` and never reaches the Node server's environment. Neither set → exit 1 (Dossier would refuse to start anyway).
4. `railway-wait-db.mjs`: `SELECT 1` through the pg driver inside the image (`/app/node_modules/@prisma/adapter-pg` → `pg`), 5 s per attempt, 3 s apart, up to `DOSSIER_DB_WAIT_SECONDS` (default 300); falls back to a TCP connect if the driver moves in a future image. Password redacted from logs. Timeout → exit 1 → Railway restarts.
5. `exec ./start.sh` (upstream): `prisma migrate deploy`, the idempotent seed (built-in themes), `exec node server.js`. Dossier's own startup check (`instrumentation.ts`) validates every variable and stops with a clear message on a bad one.

**Why migrations are not a `preDeployCommand` (Rule 8.6).** Upstream's `start.sh` already runs `migrate deploy` and the seed in the web service, which is what Rule 8.6 asks for (no separate init service). A pre-deploy command would run before Postgres exists on the very first deploy and fail it; here the bounded wait precedes the migration and the 600 s healthcheck window covers wait plus migrations.

## Services

### Dossier
- Source: repo `baranberkay96/dossier-railway`, root directory `/services/dossier` (Dockerfile). Build arg `DOSSIER_VERSION` (from the service variable) selects the upstream tag. The build fails early if the image lacks `setpriv`, `find`, `chown`, `stat`, `tr`, `node`, the `node` user or its home, `/app/start.sh`, `/app/server.js`, `/app/tools/seed.mjs`, the Prisma CLI or the Playwright browsers, if the entrypoint has a syntax error, if `node:crypto` has no argon2 (`--self-test`), or prints which DB readiness test will be used (`--check`).
- Start command: none (image `ENTRYPOINT railway-entrypoint.sh`, `CMD ./start.sh`). Pre-deploy: none (see above).
- Healthcheck: `/api/health` (upstream readiness endpoint: 200 when Postgres answers within 3 s, else 503; open without a session, returns only the version), timeout 600 s.
- Public domain: yes, target port 3000. TCP proxy: none.
- Volume: `/data`.
- Restart: ON_FAILURE, 10 retries. Replicas: 1 (upstream supports one instance per database; the volume also prevents overlapping deployments).
- Listens on `::` (Node is dual-stack). Chromium reaches the app at `http://localhost:3000`.
- No Dockerfile volume declaration (Rule 8.17); persistence is only the template volume.

| Variable | Default | Description |
|---|---|---|
| DOSSIER_LOGIN_PASSWORD | `${{secret(24, "<57 unambiguous letters/digits>")}}` (exact string in template.json) | Generated sign-in password, ≈140 bits. Hashed at boot; never in the app process. |
| DOSSIER_PASSWORD | *(empty)* | Optional argon2id hash from `hash-password`; wins over the plain password. |
| DOSSIER_SECRET | `${{secret(48, "<a-z A-Z 0-9>")}}` | Sessions, encryption of saved keys, login-hash salt. Dossier needs ≥ 32 chars. |
| DATABASE_URL | `${{Postgres.DATABASE_URL}}` | Private Postgres URL. |
| PORT | `3000` | Listen port; domain and healthcheck target. |
| HOSTNAME | `::` | Bind address (dual-stack). |
| DOSSIER_PUBLIC_URL | `https://${{RAILWAY_PUBLIC_DOMAIN}}` | Origin for Google OAuth redirect and Claude connector metadata. Pinning it avoids trusting the request's Host header. |
| DOSSIER_DATA_DIR | `/data` | Backups and PDF zips. |
| DOSSIER_BACKUP_RETENTION_DAYS | `14` | Nightly backup retention. |
| TZ | `UTC` | Time zone of the 03:00 backup and agent schedule (Node's ICU data, no tzdata needed). |
| DOSSIER_AI_PROVIDER | *(empty)* | Optional default provider; Settings wins once saved. |
| DOSSIER_AI_KEY | *(empty)* | Optional; entering the key in Settings stores it encrypted instead of in plain Railway variables. |
| DOSSIER_AI_MODEL | *(empty)* | Optional default model. |
| DOSSIER_AI_URL | *(empty)* | Optional base URL (OpenAI-compatible server, Ollama). |
| DOSSIER_JOBS_SOURCE | *(empty)* | Optional default job source; empty keeps Find jobs off until chosen (upstream default). |
| DOSSIER_JOBS_ARBEITSAGENTUR | `off` | Removes the unofficial Bundesagentur für Arbeit source server-wide (see below). |
| DOSSIER_TELEMETRY | *(empty)* | Empty = Dossier asks once, sends nothing before a yes (upstream default). |
| DOSSIER_DB_WAIT_SECONDS | `300` | Postgres wait budget at boot (0–3600). |
| DOSSIER_VERSION | `v1.10.0` | Image tag, used as a build argument. |

Image defaults not exposed: `NODE_ENV=production`, `NEXT_TELEMETRY_DISABLED=1`, `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`. Settable later if needed (all read by upstream `src/lib/env.ts`): `DOSSIER_AI_TIMEOUT_SECONDS`, `DOSSIER_JSEARCH_KEY`, `DOSSIER_JSEARCH_HOST`, `DOSSIER_ADZUNA_APP_ID`, `DOSSIER_ADZUNA_KEY`, `DOSSIER_FREEHIRE_URL`, `DOSSIER_GOOGLE_CLIENT_ID`, `DOSSIER_GOOGLE_CLIENT_SECRET`. Job-source keys and the Google client are better entered in Settings, where they are stored encrypted with keys derived from `DOSSIER_SECRET`.

### Postgres
Copied from `_railway-base/postgres.json`: image `ghcr.io/railwayapp-templates/postgres-ssl:18`, volume `/var/lib/postgresql/data`, `PGDATA`, `PG*`, `POSTGRES_*`, private `DATABASE_URL`, `SSL_CERT_DAYS`, `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=60`. No public domain, no TCP proxy. Restart ON_FAILURE, 10.

## Authentication model

Dossier is single-user by design: one password, no accounts, no sign-up endpoint and no setup wizard. The server refuses to start without a valid `DOSSIER_PASSWORD` hash and a `DOSSIER_SECRET` of at least 32 characters, so there is no window in which an unauthenticated visitor can claim the install. Every page, Server Action and route handler checks the encrypted session cookie (HttpOnly, SameSite=Lax, Secure over HTTPS; 24 h, or 30 days with "Keep me signed in"). Failed sign-ins are rate-limited per client IP and globally, stored in Postgres. The template's job is to generate a strong password (`secret(24)`) and turn it into the required hash without user steps, which is the "owner created from `secret()`, sign-up closed" requirement in Dossier's terms.

Residual exposure: the plain password is visible to project members in the Railway Variables tab and in `railway shell`/`ssh` sessions. Users who want no plain password stored can generate a hash, put it in `DOSSIER_PASSWORD` and delete `DOSSIER_LOGIN_PASSWORD` (README explains).

## Job sources and the sites' terms

Dossier never scrapes LinkedIn, Indeed or Glassdoor itself. What each feature contacts, and the template's default:

| Feature | How it gets data | Terms situation | Template default |
|---|---|---|---|
| Find jobs: **Adzuna** | Adzuna's official public API with the user's free app ID and key | Allowed under Adzuna's API terms; Dossier shows the attribution they require ("Jobs by Adzuna", linked) | Off until chosen |
| Find jobs: **JSearch** | Commercial API from OpenWeb Ninja or RapidAPI (user's key) returning Google for Jobs results, which include LinkedIn, Indeed and Glassdoor postings | Dossier calls the vendor's API only. How the vendor collects the data is under the vendor's terms; users should read them before relying on it | Off until chosen |
| Find jobs: **FreeHire** | Public catalogue at freehire.me (or a self-hosted FreeHire) built from company career pages on Greenhouse, Lever, Workday and similar | Third-party service; read its terms. No key | Off until chosen |
| Find jobs: **Bundesagentur für Arbeit** | No official API; Dossier uses the access the BA's own web search uses | The BA's terms of use do not allow automated access (upstream says so in the app, the docs and the server log) | **Removed** (`DOSSIER_JOBS_ARBEITSAGENTUR=off`); setting `on` offers it again, still behind upstream's "I understand" step, and the job agent never uses it |
| **Startups** | Hacker News' official Firebase API and Algolia's public HN search API, then a few public pages of each matched startup's own site | APIs are public; site reads follow robots.txt (product token `Dossier`), at most home, `/careers`, `/jobs`, `/contact` (and `/about`, `/team` on request), one page at a time, stop on 403/429 | Runs only after the user presses Refresh, then daily while the screen is used |
| **Fetch** a posting URL | One plain HTTP GET of the URL the user pastes, never to private networks | Sites such as LinkedIn and Indeed prohibit automated access in their user agreements; for those, paste the posting text instead | User action only |
| **Job agent** | One search a day through the chosen source (never the BA) | Same as the source | Off (upstream default) |

Upstream sources: `src/lib/job-search/sources.ts`, `src/lib/startups/*`, `src/lib/posting-fetch.ts`, `PRIVACY.md` ("What leaves your server"). This is a summary for operators, not legal advice; whether a given use complies with a site's terms is the user's call.

## Improvements over market templates

1. **Official image instead of a third-party rebuild.** The market template runs `ghcr.io/onepush-dev/dossier:1.10.0`, an unaffiliated image (root user, `gosu` added) built the day after the release. This template builds `FROM ghcr.io/aientech/dossier:v1.10.0` and adds only three readable scripts, with build-time checks.
2. **Sessions survive restarts and redeploys.** The market wrapper re-hashes the plain password with a random salt on every start. Dossier binds each session to a fingerprint of the `DOSSIER_PASSWORD` hash, so every restart, redeploy or crash-restart there signs the user out. Here the salt is derived from `DOSSIER_SECRET`, the hash is stable, and only a real password or secret change ends sessions (upstream's intended behaviour).
3. **The plain password never reaches the app process.** The market wrapper leaves `DOSSIER_LOGIN_PASSWORD` in the Node server's environment; upstream's design is that the environment holds only a hash. Here it is unset before `exec`. A user-supplied hash in `DOSSIER_PASSWORD` takes precedence, so the plain password can be removed from Railway entirely.
4. **Real database readiness, bounded and loud.** The market wrapper does a TCP check for 120 s and then continues anyway (exit 0), so a slow Postgres fails the migration. Here `SELECT 1` through the image's pg driver, 300 s by default, a clear error and a non-zero exit on timeout.
5. **Scraping-style source off by default.** The unofficial Bundesagentur für Arbeit source, whose terms forbid automated access, is removed server-wide (`DOSSIER_JOBS_ARBEITSAGENTUR=off`); the market template leaves it on. No job source is preselected (upstream default), and the sites' terms are documented.
6. **No stale AI defaults.** The market template presets OpenAI with `gpt-4o-mini`. Here the AI provider is chosen in Settings (keys stored encrypted) or by optional variables; the template boots with none.
7. **Telemetry consent left to the user**, as upstream intends (ask once, send nothing before a yes), instead of being answered by the template; `DOSSIER_TELEMETRY` is exposed for those who want to answer in advance.
8. **Pinned tag that exists upstream** (`v1.10.0`), one-variable upgrade path (`DOSSIER_VERSION`), and a build that fails fast if a new tag breaks the wrapper's assumptions.
9. **Ownership fix only where needed** (`find -xdev` on files not owned by `node`, errors not swallowed) instead of `chown -R … || true` on every boot; warning when `/data` has no volume.
10. Restart policy ON_FAILURE with 10 retries plus the wait loop, so a bad configuration stops instead of crash-looping forever; 600 s healthcheck window.
11. Every variable documented, including the custom-domain step for `DOSSIER_PUBLIC_URL` and a Railway-internal Ollama URL example.

## Resource estimate

Not measured on Railway (no Docker run). Basis: upstream's own measurement (production build, 2 vCPU / 1 GB container: at most about 520 MB with Chromium printing; "give the container at least 768 MB"), Chromium closing after five idle minutes, and typical Postgres idle use.

| Service | Idle RAM | Typical RAM | Typical vCPU | Volume |
|---|---|---|---|---|
| Dossier | ~0.25 GB | 0.35–0.55 GB (Chromium while printing PDFs, AI calls are remote) | 0.03–0.08 (bursts to 1–2 vCPU for a second per PDF) | 0.1–1 GB (14 nightly exports + zips) |
| Postgres | ~0.07 GB | 0.1–0.15 GB | 0.01–0.02 | 0.3–0.5 GB |
| **Total** | **~0.32 GB, ~0.02 vCPU** | **~0.6 GB, ~0.07 vCPU** | | **~0.5–1.5 GB** |

At Railway prices (RAM $10/GB-month, vCPU $20/vCPU-month, volume $0.15/GB-month):
- Idle / just deployed: 0.32 × 10 + 0.02 × 20 + 0.5 × 0.15 ≈ **$3.7 / month**.
- Active job search (daily use, a few PDFs and AI drafts a day): 0.6 × 10 + 0.07 × 20 + 1.5 × 0.15 ≈ **$7.6 / month**.
- Not included: the AI provider's own token charges (billed by the provider), or nothing with a local model / the Claude connector on the user's Claude plan.

Minimum plan: **Trial** boots it (both services under 1 GB RAM, small volumes). **Hobby** is recommended for real use. Pro is not needed.

## Verification checklist

1. Deploy with no inputs. Dossier build log: the RUN step prints `uid=1000(node)`, `[railway-password] self-test passed on Node v24.22.2` and `[railway-wait-db] readiness test: SELECT 1 through the image's pg driver.`
2. Dossier deploy logs, in order: `[railway-entrypoint] volume /data prepared; continuing as node` (no "no volume" warning), `sign-in: DOSSIER_LOGIN_PASSWORD hashed with argon2id`, `[railway-wait-db] Postgres at postgres.railway.internal:5432 is ready`, `starting Dossier: ./start.sh`, Prisma `migrate deploy` output, then the Next.js "Ready" line. No `Dossier can't start:` lines, no `EACCES`.
3. `GET https://{domain}/api/health` → 200 `{"status":"ok","version":"1.10.0","db":"ok"}`. `GET https://{domain}/` → redirect to `/login`. `GET /api/export` without a cookie → 401 JSON.
4. Sign in with `DOSSIER_LOGIN_PASSWORD`. A wrong password is refused; repeated failures are throttled.
5. **Session survives a restart:** sign in with "Keep me signed in", restart the Dossier service and redeploy it; the browser stays signed in. Change `DOSSIER_LOGIN_PASSWORD`, redeploy: the old session is gone and only the new password works.
6. `railway ssh` into Dossier: `ps -o user,cmd` shows `node` for `node server.js`; `cat /proc/$(pgrep -f "node server.js")/environ | tr '\0' '\n' | grep DOSSIER_` shows `DOSSIER_PASSWORD=argon2id:…` and **no** `DOSSIER_LOGIN_PASSWORD`; `ls -ln /data` shows uid 1000.
7. Fill the profile, open the base resume and download its PDF (Chromium works in the container). Settings → Your data: export the data, then import the same file; the import first writes `dossier-backup-before-import-….json` to `/data/backups` (the nightly one appears after 03:00 in `TZ`). "Download all PDFs" produces a zip in `/data/downloads`.
8. Choose an AI provider in Settings (key stored encrypted), paste a posting, generate a tailored resume and cover letter.
9. Settings → Job search: the Bundesagentur für Arbeit is not offered; choose Adzuna or FreeHire and run a search.
10. Redeploy Dossier: data, backups and the session survive. Restart Postgres while Dossier runs, and redeploy both at once: Dossier waits and comes up without manual steps.
11. Postgres has no public networking.

## Open questions

- Nothing was built or run: the Dockerfile build on Railway, `node:crypto` `argon2Sync` inside the image (Node 24.22.2 should have it; added in 24.7), resolving `pg` from `/app/node_modules/@prisma/adapter-pg`, `setpriv` in Railway's runtime, and Chromium printing inside a Railway container all need the deploy test. The scripts themselves were exercised locally (see the report): hashing via an OpenSSL-backed stand-in for `argon2Sync`, verified against an independent re-implementation of Dossier's check; the entrypoint under `dash` with fake `id/setpriv/stat/find`.
- Whether Railway passes the `DOSSIER_VERSION` service variable into the `ARG` before `FROM`; if not, the Dockerfile default `v1.10.0` is used, which is still correct.
- Railway's edge and `X-Forwarded-For`: Dossier rate-limits sign-in by the last `X-Forwarded-For` entry. If Railway's edge puts the real client address last, per-IP limits work as designed; if not, clients may share one bucket or spoof it, and the global limit (all IPs together) still applies. Check the header in the deploy test.
- Railway's edge does not let the template add `Strict-Transport-Security`, which upstream recommends setting at the proxy. The Railway domain is served over HTTPS and Dossier marks the session cookie Secure there; a custom domain behind a proxy that sets HSTS closes the gap. Not checked whether Railway's edge adds HSTS itself.
- RAM and CPU figures are estimates.
