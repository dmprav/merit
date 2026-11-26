import {
  buildLocalDatabaseUrl,
  DEFAULT_COMPOSE_DATABASE_URL,
  dropLocalDatabase,
  ensureLocalDatabase,
  isLocalPostgresReachable,
  loadPgClient,
} from "../../scripts/local-postgres.ts";

/** The PostgreSQL server that holds each worktree's dedicated database. */
export type WorktreeDatabase = {
  isReachable: () => Promise<boolean>;
  ensure: (databaseName: string) => Promise<{ created: boolean }>;
  drop: (databaseName: string) => Promise<void>;
};

/** Where the shared Compose PostgreSQL listens, for messages that name it. */
export const LOCAL_POSTGRES_ADDRESS = new URL(DEFAULT_COMPOSE_DATABASE_URL).host;

/**
 * The shared Compose PostgreSQL. `pg` is loaded from the primary checkout up front, so a clean run
 * from inside the worktree it deletes can still drop that worktree's database afterwards.
 */
export const localPostgres = (primaryRepoRoot: string): WorktreeDatabase => {
  try {
    loadPgClient(primaryRepoRoot);
  } catch {
    // Without `pg`, `isReachable` reports false and the database steps are skipped or refused.
  }
  const adminUrl = buildLocalDatabaseUrl("postgres");
  return {
    isReachable: () => isLocalPostgresReachable(adminUrl, primaryRepoRoot),
    ensure: (databaseName) => ensureLocalDatabase(databaseName, adminUrl, primaryRepoRoot),
    drop: (databaseName) => dropLocalDatabase(databaseName, adminUrl, primaryRepoRoot),
  };
};
