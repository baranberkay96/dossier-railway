// Waits until Postgres answers before Dossier's start.sh runs its migrations.
//
// On Railway the app and Postgres start in parallel, and the database's
// private DNS name only resolves once its deployment is up. Upstream's
// start.sh exits on the first failed `prisma migrate deploy`, which would
// burn restart retries on a fresh deploy. This runs `SELECT 1` through the
// pg driver that ships inside the Dossier image (a TCP connect when the
// driver can't be found), retrying until DOSSIER_DB_WAIT_SECONDS runs out.
//
// Usage:
//   node railway-wait-db.mjs          wait for DATABASE_URL, exit 0 when it answers, 1 on timeout
//   node railway-wait-db.mjs --check  build-time check: which readiness test will be used

import { createRequire } from "node:module";
import net from "node:net";
import { pathToFileURL } from "node:url";

// pg is a dependency of Prisma's Postgres adapter in Dossier's standalone build.
const PG_RESOLVE_FROM = "/app/node_modules/@prisma/adapter-pg/package.json";
const ATTEMPT_TIMEOUT_MS = 5_000;
const PAUSE_MS = 3_000;
const DEFAULT_WAIT_SECONDS = 300;
const MAX_WAIT_SECONDS = 3_600;

const log = (message) => process.stdout.write(`[railway-wait-db] ${message}\n`);
const warn = (message) => process.stderr.write(`[railway-wait-db] ${message}\n`);

export function loadPg(from = PG_RESOLVE_FROM) {
  try {
    return createRequire(from)("pg");
  } catch {
    return null;
  }
}

/** Host, port and password of a postgres:// URL; throws when it isn't one. */
export function parseDatabaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") throw new Error("not a postgresql:// URL");
  if (!url.hostname) throw new Error("no host in DATABASE_URL");
  return {
    host: url.hostname.replace(/^\[|\]$/g, ""),
    port: Number(url.port || 5432),
    password: url.password ? decodeURIComponent(url.password) : "",
  };
}

/** Seconds to wait, from DOSSIER_DB_WAIT_SECONDS; null when the value is invalid. */
export function parseWaitSeconds(value) {
  if (value === undefined || value.trim() === "") return DEFAULT_WAIT_SECONDS;
  if (!/^\d+$/.test(value.trim())) return null;
  const seconds = Number(value.trim());
  return seconds <= MAX_WAIT_SECONDS ? seconds : null;
}

/** An error as one log line, with the database password removed. */
export function describeError(error, password) {
  const code = error && typeof error === "object" && "code" in error && error.code ? `${error.code}: ` : "";
  const message = error instanceof Error ? error.message : String(error);
  const text = `${code}${message}`.replace(/\s+/g, " ").trim();
  return password && password.length >= 4 ? text.split(password).join("***") : text;
}

export async function pgReady(pg, connectionString) {
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: ATTEMPT_TIMEOUT_MS,
    query_timeout: ATTEMPT_TIMEOUT_MS,
  });
  // A failed connection can also emit "error"; it's reported through connect().
  client.on?.("error", () => {});
  try {
    await client.connect();
    await client.query("SELECT 1");
  } finally {
    await Promise.resolve(client.end?.()).catch(() => {});
  }
}

export function tcpReady({ host, port }, timeoutMs = ATTEMPT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(Object.assign(new Error(`no answer within ${timeoutMs} ms`), { code: "ETIMEDOUT" }));
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      socket.destroy();
      reject(error);
    });
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retries `probe` until it resolves or `waitSeconds` have passed. */
export async function waitFor(probe, { waitSeconds, label, password, pauseMs = PAUSE_MS, now = Date.now }) {
  const deadline = now() + waitSeconds * 1000;
  for (let attempt = 1; ; attempt += 1) {
    try {
      await probe();
      log(`${label} is ready (attempt ${attempt}).`);
      return true;
    } catch (error) {
      const left = deadline - now();
      const reason = describeError(error, password);
      if (left <= 0) {
        warn(`${label} did not answer within ${waitSeconds} s: ${reason}`);
        return false;
      }
      log(`waiting for ${label} (attempt ${attempt}, ${Math.ceil(left / 1000)} s left): ${reason}`);
      await sleep(Math.min(pauseMs, left));
    }
  }
}

async function main(argv) {
  const pg = loadPg();
  if (argv.includes("--check")) {
    log(pg ? "readiness test: SELECT 1 through the image's pg driver." : "pg driver not found in the image: readiness test falls back to a TCP connect.");
    return 0;
  }

  const connectionString = process.env.DATABASE_URL ?? "";
  if (connectionString.trim() === "") {
    warn("DATABASE_URL is not set. Reference the Postgres service: ${{Postgres.DATABASE_URL}}.");
    return 1;
  }
  let target;
  try {
    target = parseDatabaseUrl(connectionString);
  } catch (error) {
    warn(`DATABASE_URL can't be used (${error instanceof Error ? error.message : "invalid"}); it must be a postgresql:// URL.`);
    return 1;
  }
  const waitSeconds = parseWaitSeconds(process.env.DOSSIER_DB_WAIT_SECONDS);
  if (waitSeconds === null) {
    warn(`DOSSIER_DB_WAIT_SECONDS must be a whole number of seconds from 0 to ${MAX_WAIT_SECONDS}.`);
    return 1;
  }

  const label = `Postgres at ${target.host}:${target.port}`;
  if (!pg) log("pg driver not found in the image; checking with a TCP connect only.");
  const probe = pg ? () => pgReady(pg, connectionString) : () => tcpReady(target);
  return (await waitFor(probe, { waitSeconds, label, password: target.password })) ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // process.exit: no stray sockets or timers may keep a finished wait alive.
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      warn(`unexpected error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    },
  );
}
