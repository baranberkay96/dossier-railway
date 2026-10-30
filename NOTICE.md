# NOTICE

This Railway template is a community package. It is not affiliated with, sponsored by or endorsed by the Dossier project, AienTech or its authors.

## What this template runs

| Component | Source | License |
|---|---|---|
| Dossier 1.10.0 | `ghcr.io/aientech/dossier:v1.10.0` (index digest `sha256:2a4dd7b790637fbf9135b462c584ccfdf056f28836a6dd17fd8a660cffd2d677`, linux/amd64 manifest `sha256:dc7632417ab6648d1c258c9c50a7f2ba18f54ed32321f68ddf829165d473a132`, created 2026-10-29, built from https://github.com/AienTech/dossier tag `v1.10.0`, commit `a1ab9216b8723c25cf4ed60596cd886e753086da`), used unmodified as the base image | GNU Affero General Public License v3.0 only (`AGPL-3.0-only` in upstream `package.json`; full text in upstream `LICENSE`) |
| Inside that image | Node.js 24.22.2 on Debian trixie (`node:24-trixie-slim`), Next.js, Prisma, Playwright's Chromium headless shell and Dossier's other npm dependencies | Their own licenses, as shipped by upstream |
| Postgres | `ghcr.io/railwayapp-templates/postgres-ssl:18` (service definition copied from Railway's own Postgres template in `_railway-base`) | PostgreSQL License; Railway image MIT |

The name "Dossier" and the upstream icon (`src/app/icon.svg`, loaded from the `v1.10.0` tag through jsDelivr as the template icon) are used only to identify the software this template deploys.

## AGPL-3.0 notes

These notes describe how this package relates to Dossier's license. They are practical guidance, not legal advice; get qualified advice for your own situation.

- **No Dossier source is modified or copied.** The Dockerfile starts `FROM` the official image and adds three new files next to it (below). Dossier's own code, its `start.sh` and its `hash-password` tool run exactly as upstream ships them. The deployed app is unmodified Dossier 1.10.0, whose corresponding source is the upstream repository at tag `v1.10.0`.
- **Where the source is offered.** Dossier's sidebar links to https://github.com/AienTech/dossier, which serves the unmodified version's source. This template keeps that link and adds the version and source links to its README.
- **If you modify Dossier** (for example by changing its code in a fork and deploying that) and let other people use it over a network, AGPL-3.0 section 13 requires you to offer those users the complete corresponding source of your modified version, under AGPL-3.0. Changing environment variables or the wrapper scripts in this package does not modify Dossier.
- **Running it for yourself** (the intended single-user case) carries no extra obligations beyond keeping the license notices intact.
- **The wrapper files are separate works.** `railway-entrypoint.sh`, `railway-password.mjs` and `railway-wait-db.mjs` run before Dossier as separate programs, exchange data with it only through environment variables and the database, and contain no Dossier code.

## What this package adds (original work)

- `services/dossier/Dockerfile`: `FROM` the upstream image, adds the three files below, build-time checks, `ENTRYPOINT`. No volume declaration (Railway attaches the `/data` volume).
- `services/dossier/railway-entrypoint.sh`: prepares the Railway volume as root, drops root with `setpriv`, produces `DOSSIER_PASSWORD` from the generated password and removes the plain one, waits for Postgres, then runs upstream's unchanged `./start.sh`.
- `services/dossier/railway-password.mjs`: an independent implementation, with `node:crypto`, of the `argon2id:m=…,t=…,p=…:<salt>:<hash>` format that Dossier documents for `DOSSIER_PASSWORD`, using the same argon2id settings as Dossier's `hash-password` (19 MiB, 2 passes, 1 lane) and a salt derived from `DOSSIER_SECRET`. Written from the format description; no upstream code is copied into it.
- `services/dossier/railway-wait-db.mjs`: a bounded `SELECT 1` wait that loads the `pg` driver already present in the Dossier image at runtime (falls back to a TCP connect).
- `template.json`, `TEMPLATE.md`, `README.md`, this file.

## Upstream material checked (Dossier v1.10.0, 2026-10-30)

Read from `_upstream/AienTech__dossier` (AGPL-3.0). Every file relied on was compared with tag `v1.10.0` through the GitHub contents API (blob SHA) and is identical: `Dockerfile`, `docker/start.sh`, `compose.yml`, `compose.production.yml`, `.env.example`, `package.json`, `LICENSE`, `README.md`, `DEVELOPMENT.md`, `SECURITY.md`, `PRIVACY.md`, `next.config.ts`, `prisma7.config.ts`, `scripts/hash-password.ts`, `src/instrumentation.ts`, `src/proxy.ts`, `src/lib/env.ts`, `src/lib/auth/password-hash.ts`, `src/lib/auth/session.ts`, `src/lib/auth/client-ip.ts`, `src/lib/pdf/render.ts`, `src/app/api/health/route.ts`, `src/lib/backups.ts`, `src/lib/backup-schedule.ts`, `src/lib/jobs/zip-pdfs.ts`, `src/lib/job-search/sources.ts`, `src/lib/startups/sources/yc.ts`, `src/lib/startups/sources/hn.ts`, `src/lib/startups/robots.ts`, `src/lib/posting-fetch.ts`, `src/lib/ai/config.ts`, `src/lib/settings.ts`, `src/lib/google/origin.ts`, `src/lib/auth/login-throttle.ts`, `src/lib/prisma.ts`, `src/lib/releases.ts`, `src/app/(app)/repository-link.tsx`.

Registry (GHCR, anonymous token): `aientech/dossier` tags `v1.0.0` … `v1.10.0`, `latest`, `main` and commit tags; `v1.10.0` = `latest`. Image config: user `node`, `WORKDIR /app`, entrypoint `docker-entrypoint.sh`, command `./start.sh`, `PORT=3000`, `HOSTNAME=0.0.0.0`, `DOSSIER_DATA_DIR=/data`, `NODE_VERSION=24.22.2`, no volume declaration. Layer listings: the Debian base layer contains `/usr/bin/setpriv`, `find`, `chown`, `stat`, `id`, `env`, `tr`; the standalone layer contains `/app/server.js` and `pg` under `/app/node_modules/@prisma/adapter-pg/node_modules/pg`; `/app/start.sh` is executable; `/data` and `/app/.next/cache` are owned by uid 1000.

## Market templates

The Railway marketplace template in `_market/` ("Dossier", image `ghcr.io/onepush-dev/dossier:1.10.0`) has no license. It was read for its service layout and variables, and its image's wrapper script was read to understand its behaviour; no file, script or README text from it is reused.
