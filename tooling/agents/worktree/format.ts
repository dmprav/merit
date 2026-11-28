import { type WorktreeCleanResult } from "./clean.ts";
import { type WorktreeCreateResult } from "./create.ts";
import { type WorktreeListEntry } from "./list.ts";
import { type WorktreePorts } from "./ports.ts";

const formatPorts = (ports: WorktreePorts): string =>
  `  ports:    dev=${ports.MERIT_DEV_PORT}, app=${ports.MERIT_APP_PORT}, workspace=${ports.MERIT_WORKSPACE_PORT}, storybook=${ports.MERIT_STORYBOOK_DEV_PORT}/${ports.MERIT_STORYBOOK_PORT}`;

export const formatCreateSummary = (result: WorktreeCreateResult): string =>
  [
    `Created worktree "${result.slug}"`,
    `  path:     ${result.path}`,
    `  branch:   ${result.branch} (from ${result.baseRef})`,
    `  database: ${result.databaseName} (${result.databaseCreated ? "created" : "not created"})`,
    `  db url:   ${result.databaseUrl}`,
    formatPorts(result.ports),
  ].join("\n");

export const formatListSummary = (entries: readonly WorktreeListEntry[]): string => {
  if (entries.length === 0) {
    return "No active worktrees.";
  }
  return entries
    .map((entry) =>
      [
        `${entry.slug}  (${entry.branch})`,
        `  path:     ${entry.path}`,
        `  database: ${entry.databaseName} (${entry.databaseUrl})`,
        formatPorts(entry.ports),
      ].join("\n"),
    )
    .join("\n\n");
};

export const formatCleanSummary = (result: WorktreeCleanResult): string =>
  [
    `Cleaned worktree "${result.slug}"`,
    `  path:     ${result.path} (${result.worktreeRemoved ? "removed" : "already absent"})`,
    `  database: ${result.databaseName} (${result.databaseDropped ? "dropped" : "skipped"})`,
    `  branch:   ${result.branch} (${result.branchDeleted ? "deleted" : "kept/absent"})`,
  ].join("\n");
