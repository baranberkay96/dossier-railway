# syntax=docker/dockerfile:1
#
# Dossier for Railway (community template, not affiliated with the Dossier
# project). The official image, unchanged, plus three small files:
#   railway-entrypoint.sh  gives the Railway volume (mounted root-owned) to the
#                          image's `node` user and drops root before anything else runs;
#   railway-password.mjs   hashes the generated sign-in password into the
#                          argon2id form Dossier requires (stable across boots);
#   railway-wait-db.mjs    waits for Postgres before the image's ./start.sh migrates.
#
# Upgrade: set the DOSSIER_VERSION service variable (Railway passes it in as a
# build argument) to a newer tag of ghcr.io/aientech/dossier and redeploy, after
# reading https://github.com/AienTech/dossier/wiki/Upgrading and backing up.
# Migrations run on boot through the image's own start.sh.
#
# Persistence is declared in the template only (a Railway volume at /data):
# Railway's builder rejects volume declarations in Dockerfiles.
ARG DOSSIER_VERSION=v1.10.0
FROM ghcr.io/aientech/dossier:${DOSSIER_VERSION}

USER root

COPY railway-entrypoint.sh /usr/local/bin/railway-entrypoint.sh
COPY railway-password.mjs railway-wait-db.mjs /app/railway/

# Fail the build, not the deploy, when an image tag no longer provides what
# the entrypoint relies on.
RUN set -eu; \
    chmod 0755 /usr/local/bin/railway-entrypoint.sh; \
    chmod 0755 /app/railway; \
    chmod 0644 /app/railway/railway-password.mjs /app/railway/railway-wait-db.mjs; \
    for tool in setpriv find chown stat id env tr node; do \
      command -v "$tool" >/dev/null || { echo "missing $tool in the base image" >&2; exit 1; }; \
    done; \
    id node; \
    test -d /home/node; \
    test -x /app/start.sh; \
    test -f /app/server.js; \
    test -f /app/tools/seed.mjs; \
    test -f /app/tools/node_modules/prisma/build/index.js; \
    test -d "$PLAYWRIGHT_BROWSERS_PATH"; \
    sh -n /usr/local/bin/railway-entrypoint.sh; \
    node /app/railway/railway-password.mjs --self-test; \
    node /app/railway/railway-wait-db.mjs --check

EXPOSE 3000

# Starts as root only to fix the volume's ownership; Dossier itself runs as `node`.
ENTRYPOINT ["/usr/local/bin/railway-entrypoint.sh"]
CMD ["./start.sh"]
