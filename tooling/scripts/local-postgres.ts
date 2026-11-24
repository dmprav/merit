import { createRequire } from "node:module";

import { loadRepoEnvLocal } from "../env.ts";

export const DEFAULT_COMPOSE_DATABASE_URL = "postgres://merit:merit@127.0.0.1:55432/merit";
const PROTECTED_DATABASE_NAMES = new Set(["merit", "postgres", "template0", "template1"]);

const LOCAL_COMPOSE_HOSTS = new Set(["127.0.0.1", "localhost"]);
const LOCAL_COMPOSE_PORT = "55432";
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

/** Loads `<rootDir>/.env.local` into `process.env` without overriding variables already set in the environment. */
export const loadRootEnvLocal = (rootDir: string): void => {
  loadRepoEnvLocal(rootDir);
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

/**
 * Parses a `DATABASE_URL` targeting the local loopback Compose Postgres (`127.0.0.1:55432` or `localhost:55432`).
 * Returns `null` for remote URLs, Unix-socket overrides, non-Compose ports, or malformed values.
 */
export const parseLocalComposeDatabase = (
  connectionString: string | undefined,
): LocalComposeDatabase | null => {
  if (!connectionString?.trim()) {
    return null;
  }
  const parsed = URL.parse(connectionString.trim());
  if (
    !parsed ||
    (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") ||
    parsed.searchParams.has("host") ||
    !LOCAL_COMPOSE_HOSTS.has(parsed.hostname) ||
    parsed.port !== LOCAL_COMPOSE_PORT
  ) {
    return null;
  }

  let databaseName: string;
  try {
    databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  } catch {
    return null;
  }
  if (!VALID_DATABASE_NAME.test(databaseName)) {
    return null;
  }

  const base = new URL(DEFAULT_COMPOSE_DATABASE_URL);
  base.hostname = parsed.hostname;
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

const loadPgClient = (): PgClientConstructor => {
  const requireFromDb = createRequire(new URL("../../foundation/db/package.json", import.meta.url));
  const pg: unknown = requireFromDb("pg");
  if (typeof pg === "object" && pg !== null && "Client" in pg && isPgClientConstructor(pg.Client)) {
    return pg.Client;
  }
  throw new Error('Could not load "Client" export from "pg".');
};

const defaultAdminUrl = () => buildLocalDatabaseUrl("postgres");

const withAdminClient = async <T>(
  adminUrl: string,
  timeoutMs: number,
  operation: (client: PgClient) => Promise<T>,
): Promise<T> => {
  const Client = loadPgClient();
  const client = new Client({ connectionString: adminUrl, connectionTimeoutMillis: timeoutMs });
  await client.connect();
  try {
    return await operation(client);
  } finally {
    await client.end();
  }
};

export const isLocalPostgresReachable = async (adminUrl = defaultAdminUrl()): Promise<boolean> => {
  try {
    await withAdminClient(adminUrl, 2000, async (client) => {
      await client.query("SELECT 1");
    });
    return true;
  } catch {
    return false;
  }
};

export const ensureLocalDatabase = async (
  databaseName: string,
  adminUrl = defaultAdminUrl(),
): Promise<{ created: boolean }> => {
  assertSafeManagedDatabaseName(databaseName);
  return withAdminClient(adminUrl, 5000, async (client) => {
    const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [
      databaseName,
    ]);
    if (existing.rows.length > 0) {
      return { created: false };
    }
    await client.query(`CREATE DATABASE "${databaseName}"`);
    return { created: true };
  });
};

export const dropLocalDatabase = async (
  databaseName: string,
  adminUrl = defaultAdminUrl(),
): Promise<void> => {
  assertSafeManagedDatabaseName(databaseName);
  await withAdminClient(adminUrl, 5000, async (client) => {
    await client.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  });
};

export const recreateLocalDatabase = async (
  databaseName: string,
  adminUrl = defaultAdminUrl(),
): Promise<void> => {
  assertSafeManagedDatabaseName(databaseName);
  await withAdminClient(adminUrl, 5000, async (client) => {
    await client.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${databaseName}"`);
  });
};
