import { buildLocalDatabaseUrl } from "../../../scripts/local-postgres.ts";
import { WORKTREE_PORT_BASES } from "../ports.ts";
import { type WorktreeRecord } from "../registry.ts";

export const worktreeRecord = (
  record: Pick<WorktreeRecord, "slug" | "path"> & Partial<WorktreeRecord>,
): WorktreeRecord => {
  const databaseName = `merit_${record.slug.replaceAll("-", "_")}`;
  return {
    branch: `worktree/${record.slug}`,
    baseRef: "main",
    databaseName,
    databaseUrl: buildLocalDatabaseUrl(databaseName),
    databaseCreated: false,
    ports: WORKTREE_PORT_BASES,
    createdAt: "2026-11-24T00:00:00.000Z",
    ...record,
  };
};
