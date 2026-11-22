import { env } from "node:process";

const localPreview = () => env.MERIT_LOCAL_PREVIEW === "1";

const localDefaults = () => import.meta.env.DEV || localPreview();

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
