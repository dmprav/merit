import { env } from "node:process";

import { readPayloadKey } from "@merit/workflows/client";

const localPreview = () => env.MERIT_LOCAL_PREVIEW === "1";

// The worker runs in Node.js without Vite, so it has no `import.meta.env`; its start-up command
// sets MERIT_LOCAL_WORKER only for development and preview.
const viteDevelopment = () => (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

const localDefaults = () => viteDevelopment() || localPreview() || env.MERIT_LOCAL_WORKER === "1";

const isLoopback = (hostname: string) => ["localhost", "127.0.0.1", "[::1]"].includes(hostname);

export const readAppOrigin = (request?: Request) => {
  if (
    request &&
    localDefaults() &&
    (import.meta.env.MERIT_LOCAL_WORKSPACE || env.APP_ORIGIN === undefined)
  ) {
    const local = new URL(request.url);
    if (local.protocol === "http:" && isLoopback(local.hostname)) {
      return local.origin;
    }
  }
  const value = env.APP_ORIGIN ?? (localDefaults() ? "http://localhost:3000" : "");
  const url = URL.parse(value);
  if (!url || url.href !== url.origin + "/") {
    throw new Error("APP_ORIGIN must be the public HTTPS origin.");
  }
  const loopback = isLoopback(url.hostname);
  if (localPreview() && !loopback) {
    throw new Error("Local preview requires a loopback APP_ORIGIN.");
  }
  if (url.protocol !== "https:" && !(localDefaults() && loopback && url.protocol === "http:")) {
    throw new Error("APP_ORIGIN must use HTTPS outside local development and loopback preview.");
  }
  return url.origin;
};

export const readDatabaseUrl = () => {
  const url =
    env.DATABASE_URL ??
    (localDefaults() ? "postgres://merit_runtime:merit@127.0.0.1:55432/merit" : "");
  if (!url.trim()) {
    throw new Error("DATABASE_URL is required.");
  }
  return url;
};

export const readInvitationKey = () =>
  readPayloadKey(env.TEMPORAL_PAYLOAD_KEY, { local: localDefaults() });
