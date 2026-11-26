import { assertSafeManagedDatabaseName } from "../../scripts/local-postgres.ts";

const WORKTREE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_WORKTREE_SLUG_LENGTH = 48;

const PROTECTED_BRANCH_NAMES = new Set(["main", "master"]);

export const validateWorktreeSlug = (slug: string): string => {
  if (!slug || slug.length > MAX_WORKTREE_SLUG_LENGTH || !WORKTREE_SLUG_PATTERN.test(slug)) {
    throw new Error(
      `Invalid worktree slug "${slug}". Use lowercase alphanumeric characters and single hyphens (1-${MAX_WORKTREE_SLUG_LENGTH} chars, e.g. "feat-auth").`,
    );
  }
  return slug;
};

export const databaseNameForSlug = (slug: string): string => {
  validateWorktreeSlug(slug);
  const name = `merit_${slug.replaceAll("-", "_")}`;
  assertSafeManagedDatabaseName(name);
  return name;
};

export const defaultBranchForSlug = (slug: string): string => `worktree/${slug}`;

/** Branches a worktree may never create or delete, whatever its registry record says. */
export const isProtectedBranch = (branch: string): boolean => PROTECTED_BRANCH_NAMES.has(branch);
