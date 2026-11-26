import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

export const DEFAULT_COMPOSE_DATABASE_URL = "postgres://merit:merit@127.0.0.1:55432/merit";
const PROTECTED_DATABASE_NAMES = new Set(["merit", "postgres", "template0", "template1"]);

const LOCAL_COMPOSE_HOSTS = new Set(["127.0.0.1", "localhost"]);
const LOCAL_COMPOSE_PORT = "55432";
const FORBIDDEN_CONNECTION_PARAMS = new Set(["host", "hostaddr", "port", "user"]);
const VALID_DATABASE_NAME = /^[a-z][a-z0-9_]{0,62}$/;

type PgClient = {
  connect(): Promise<void>;
  query(sql: string, values?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
};

type PgClientConstructor = new (config: {
  connectionString: string;
  connectionTimeoutMillis?: number;
}) => PgClient;

export type LocalComposeDatabase = {
  databaseName: string;
  url: string;
  adminUrl: string;
  isDefault: boolean;
  isProtected: boolean;
};

export const assertSafeManagedDatabaseName = (databaseName: string): void => {
  if (!VALID_DATABASE_NAME.test(databaseName)) {
    throw new Error(
      `Invalid Postgres database identifier "${databaseName}". Expected lowercase alphanumeric/underscores starting with a letter.`,
    );
  }
  if (PROTECTED_DATABASE_NAMES.has(databaseName)) {
    throw new Error(`Refusing to modify protected database "${databaseName}".`);
  }
};

export const buildLocalDatabaseUrl = (
  databaseName: string,
  baseUrl = DEFAULT_COMPOSE_DATABASE_URL,
): string => {
  if (!VALID_DATABASE_NAME.test(databaseName)) {
    throw new Error(`Invalid Postgres database identifier "${databaseName}".`);
  }
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  return url.href;
};

const hasForbiddenConnectionParam = (url: URL): boolean =>
  Array.from(url.searchParams.keys()).some((key) =>
    FORBIDDEN_CONNECTION_PARAMS.has(key.toLowerCase()),
  );

/**
 * Parses a loopback PostgreSQL URL. `postgres:` is not a WHATWG special scheme, so `URL` keeps the
 * host's letter case; lowercase it so `LOCALHOST` and `localhost` select the same reset path.
 */
const parseLoopbackPostgresUrl = (
  connectionString: string | undefined,
): { url: URL; hostname: string } | null => {
  const url = connectionString?.trim() ? URL.parse(connectionString.trim()) : null;
  if (!url || (url.protocol !== "postgres:" && url.protocol !== "postgresql:")) {
    return null;
  }
  const hostname = url.hostname.toLowerCase();
  return LOCAL_COMPOSE_HOSTS.has(hostname) ? { url, hostname } : null;
};

/**
 * Reports whether a `DATABASE_URL` addresses loopback PostgreSQL but overrides where `pg` connects
 * with query parameters (`host`, `hostaddr`, `port`, `user`), so its real target is ambiguous.
 */
export const hasLocalConnectionOverride = (connectionString: string | undefined): boolean => {
  const loopback = parseLoopbackPostgresUrl(connectionString);
  return Boolean(loopback && hasForbiddenConnectionParam(loopback.url));
};

// `pg` drops only the first slash of the path, so `//merit_alpha` names the database `/merit_alpha`.
const readDatabaseName = (url: URL): string | null => {
  try {
    return decodeURIComponent(url.pathname.replace(/^\//, ""));
  } catch {
    return null;
  }
};

/**
 * Reports whether a `DATABASE_URL` addresses the local Compose PostgreSQL but names a database this
 * tooling cannot address safely (not a lowercase identifier), so no reset path may target it.
 */
export const hasUnsupportedLocalDatabaseName = (connectionString: string | undefined): boolean => {
  const loopback = parseLoopbackPostgresUrl(connectionString);
  if (
    !loopback ||
    hasForbiddenConnectionParam(loopback.url) ||
    loopback.url.port !== LOCAL_COMPOSE_PORT
  ) {
    return false;
  }
  const databaseName = readDatabaseName(loopback.url);
  return databaseName !== "" && (databaseName === null || !VALID_DATABASE_NAME.test(databaseName));
};

/**
 * Parses a `DATABASE_URL` targeting the local loopback Compose Postgres (`127.0.0.1:55432` or `localhost:55432`).
 * Returns `null` for remote URLs, query-string connection overrides (`host`, `hostaddr`, `port`, `user`),
 * non-Compose ports, unsupported database names, or malformed values.
 */
export const parseLocalComposeDatabase = (
  connectionString: string | undefined,
): LocalComposeDatabase | null => {
  const loopback = parseLoopbackPostgresUrl(connectionString);
  if (
    !loopback ||
    hasForbiddenConnectionParam(loopback.url) ||
    loopback.url.port !== LOCAL_COMPOSE_PORT
  ) {
    return null;
  }

  const databaseName = readDatabaseName(loopback.url);
  if (databaseName === null || !VALID_DATABASE_NAME.test(databaseName)) {
    return null;
  }

  const base = new URL(DEFAULT_COMPOSE_DATABASE_URL);
  base.hostname = loopback.hostname;
  const targetUrl = new URL(base.href);
  targetUrl.pathname = `/${databaseName}`;
  const adminUrl = new URL(base.href);
  adminUrl.pathname = "/postgres";

  return {
    databaseName,
    url: targetUrl.href,
    adminUrl: adminUrl.href,
    isDefault: databaseName === "merit",
    isProtected: PROTECTED_DATABASE_NAMES.has(databaseName),
  };
};

const isPgClientConstructor = (value: unknown): value is PgClientConstructor =>
  typeof value === "function";

let cachedPgClient: PgClientConstructor | null = null;

export const loadPgClient = (repoRoot?: string): PgClientConstructor => {
  const candidates: Array<string | URL> = [];
  if (repoRoot) {
    const repoDbPackage = join(repoRoot, "foundation", "db", "package.json");
    if (existsSync(repoDbPackage)) {
      candidates.push(repoDbPackage);
    }
  }
  candidates.push(new URL("../../foundation/db/package.json", import.meta.url));

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const requireFromDb = createRequire(candidate);
      const pg: unknown = requireFromDb("pg");
      if (
        typeof pg === "object" &&
        pg !== null &&
        "Client" in pg &&
        isPgClientConstructor(pg.Client)
      ) {
        cachedPgClient = pg.Client;
        return pg.Client;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (cachedPgClient) {
    return cachedPgClient;
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Could not load "Client" export from "pg".');
};

const defaultAdminUrl = () => buildLocalDatabaseUrl("postgres");

const withAdminClient = async <T>(
  adminUrl: string,
  timeoutMs: number,
  operation: (client: PgClient) => Promise<T>,
  repoRoot?: string,
): Promise<T> => {
  const Client = loadPgClient(repoRoot);
  const client = new Client({ connectionString: adminUrl, connectionTimeoutMillis: timeoutMs });
  await client.connect();
  try {
    return await operation(client);
  } finally {
    await client.end();
  }
};

export const isLocalPostgresReachable = async (
  adminUrl = defaultAdminUrl(),
  repoRoot?: string,
): Promise<boolean> => {
  try {
    await withAdminClient(
      adminUrl,
      2000,
      async (client) => {
        await client.query("SELECT 1");
      },
      repoRoot,
    );
    return true;
  } catch {
    return false;
  }
};

export const ensureLocalDatabase = async (
  databaseName: string,
  adminUrl = defaultAdminUrl(),
  repoRoot?: string,
): Promise<{ created: boolean }> => {
  assertSafeManagedDatabaseName(databaseName);
  return withAdminClient(
    adminUrl,
    5000,
    async (client) => {
      const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [
        databaseName,
      ]);
      if (existing.rows.length > 0) {
        return { created: false };
      }
      await client.query(`CREATE DATABASE "${databaseName}"`);
      return { created: true };
    },
    repoRoot,
  );
};

export const dropLocalDatabase = async (
  databaseName: string,
  adminUrl = defaultAdminUrl(),
  repoRoot?: string,
): Promise<void> => {
  assertSafeManagedDatabaseName(databaseName);
  await withAdminClient(
    adminUrl,
    5000,
    async (client) => {
      await client.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    },
    repoRoot,
  );
};

export const recreateLocalDatabase = async (
  databaseName: string,
  adminUrl = defaultAdminUrl(),
  repoRoot?: string,
): Promise<void> => {
  assertSafeManagedDatabaseName(databaseName);
  await withAdminClient(
    adminUrl,
    5000,
    async (client) => {
      await client.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      await client.query(`CREATE DATABASE "${databaseName}"`);
    },
    repoRoot,
  );
};
