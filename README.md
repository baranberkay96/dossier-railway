# Deploy and Host Dossier with Railway

Dossier is an open-source (AGPL-3.0), self-hosted job search workspace: one career profile, a tailored resume and cover letter for each job, PDF export, and every application tracked from draft to offer. This community template runs the official Dossier 1.10.0 image with Postgres, a backup volume and a generated, hashed sign-in password.

## About Hosting Dossier

Dossier is a single Next.js server for one person. It keeps your profile, applications, documents and history in PostgreSQL, prints PDFs with a bundled headless Chromium, and runs its nightly backups, job agent and AI task queue inside the same process, so it runs as exactly one instance. Hosting it well means a private database, a volume for backups, HTTPS, a long secret that encrypts saved API keys, and a sign-in password stored only as an argon2id hash. This template builds on the official image, waits for Postgres before migrating, runs the app without root, and turns a generated password into that hash on every boot, so you can sign in as soon as it is up.

## Common Use Cases

- Writing a tailored resume and cover letter for each posting from one profile, with requirements your profile doesn't cover shown as gaps instead of invented experience
- Tracking every application on a board and a dashboard, from saved posting to interview and offer
- Searching postings through Adzuna, JSearch or FreeHire and scoring them against your profile, optionally with a daily job agent that never applies for you
- Keeping a job search private: your data in your own database, and your choice of AI provider, including a local model
- Using Dossier from Claude through its optional connector, or sending applications from Gmail with your own Google OAuth client

## Dependencies for Dossier Hosting

- PostgreSQL for all app data (included: Railway Postgres 18 on the private network)
- A persistent volume at `/data` for nightly backups and PDF zip downloads (included)
- A generated `DOSSIER_SECRET` and sign-in password (included)
- Optional: an AI provider for writing documents, added after sign-in under Settings, AI provider: an OpenAI-compatible API, Anthropic or Mistral key (billed by that provider), or a local model server
- Optional: a free Adzuna key, a JSearch key, or no key with FreeHire, for Find jobs

### Deployment Dependencies

- Dossier repository: https://github.com/AienTech/dossier
- Release 1.10.0: https://github.com/AienTech/dossier/releases/tag/v1.10.0
- Installation and operations guide: https://github.com/AienTech/dossier/wiki
- Choosing an AI provider: https://github.com/AienTech/dossier/wiki/Choosing-an-AI-provider
- Choosing a job source: https://github.com/AienTech/dossier/wiki/Choosing-a-job-source
- Security and privacy notes: https://github.com/AienTech/dossier/blob/main/SECURITY.md and https://github.com/AienTech/dossier/blob/main/PRIVACY.md
- Railway volumes: https://docs.railway.com/volumes/reference

### Implementation Details

| Service | Source | Purpose |
|---|---|---|
| Dossier | `ghcr.io/aientech/dossier:v1.10.0` plus a small entrypoint (repo `baranberkay96/dossier-railway`, `services/dossier`) | Web app, API, PDF printing and background timers on port 3000 (public, healthcheck `/api/health`); volume `/data` |
| Postgres | `ghcr.io/railwayapp-templates/postgres-ssl:18` | App database, private network only; volume `/var/lib/postgresql/data` |

**First login**

1. Deploy. Nothing has to be filled in.
2. Open the Dossier service, Variables tab, and copy `DOSSIER_LOGIN_PASSWORD` (24 random characters). On every boot it is hashed with argon2id into `DOSSIER_PASSWORD`, the only form Dossier accepts, and the plain value is removed before Dossier starts.
3. Open `https://{your-domain}` and sign in. There are no user accounts or sign-up page: Dossier is single-user and will not start without a password hash, so nobody can claim the install before you.
4. Fill in your profile (or import a PDF, Word or Markdown resume), then choose an AI provider under Settings. Keys entered there are stored encrypted with `DOSSIER_SECRET`, which is safer than putting them in Railway variables.

**Password**: to change it, edit `DOSSIER_LOGIN_PASSWORD` (at least 12 characters) and redeploy; existing sessions end. Restarts and redeploys with the same password keep you signed in. To keep no plain password in Railway at all, run `docker run --rm -it --platform linux/amd64 ghcr.io/aientech/dossier:v1.10.0 hash-password` on your computer, put the printed line in `DOSSIER_PASSWORD` and delete `DOSSIER_LOGIN_PASSWORD`. Keep `DOSSIER_SECRET` safe: without it, saved API keys cannot be read.

**Job sources and site terms**: Find jobs is off until you pick a source. Adzuna is an official API; JSearch is a commercial API returning Google for Jobs results (LinkedIn, Indeed and others), governed by that vendor's terms; FreeHire is a public catalogue of company career pages. The unofficial Bundesagentur für Arbeit source is switched off in this template because its terms do not allow automated access (`DOSSIER_JOBS_ARBEITSAGENTUR=on` brings it back, behind Dossier's own warning). Dossier does not scrape LinkedIn. Sites like LinkedIn and Indeed prohibit automated access in their terms, so for their postings paste the text instead of using Fetch. The Startups screen reads Hacker News' public API and a few pages of each startup's own site, following robots.txt, only after you press Refresh. This is guidance, not legal advice.

**Email and calendar**: Gmail and Google Calendar use Google's HTTP APIs, so they work on every Railway plan. Create a Google OAuth client and add `https://{your-domain}/api/google/callback` as redirect URI. When you add a custom domain, set `DOSSIER_PUBLIC_URL` to `https://{your-domain}` too.

**Backups**: Dossier writes a full export to `/data/backups` every night at 03:00 in `TZ` and keeps 14 days. Turn on Railway backups for the `/data` volume and for the Postgres volume (Backups tab of each service) so you also have copies outside the running services.

**Scaling**: Dossier must run as a single instance (its timers and job queue live in the process), so scale vertically. It idles around 0.3 GB of RAM and peaks near 0.5 GB while Chromium prints PDFs. AI work happens at your provider, not on Railway.

**Pinning and upgrades**: the image tag is the `DOSSIER_VERSION` variable (default `v1.10.0`). Read the release notes and the upgrade guide, back up, set the new tag and redeploy. Migrations run on boot, and the build stops before deploying if a new image no longer fits the entrypoint.

**License**: Dossier is AGPL-3.0. Running it for yourself needs nothing extra; if you modify it and let others use it over a network, you must offer them your modified source. This template is a community package and is not affiliated with the Dossier project.

### Why Deploy Dossier on Railway?

Railway runs Dossier, its database and its backup volume in one private project with HTTPS and no server to maintain, so your job search data stays in infrastructure you control. The template is secure from the first deploy: a generated password stored as a hash, a private database and the app running without root.
