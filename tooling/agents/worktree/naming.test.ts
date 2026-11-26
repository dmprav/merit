import { expect, test } from "vite-plus/test";

import { databaseNameForSlug, isProtectedBranch, validateWorktreeSlug } from "./naming.ts";

test.each(["a", "feat-auth-2", "a".repeat(48)])("accepts the slug %j", (slug) => {
  expect(validateWorktreeSlug(slug)).toBe(slug);
});

test.each([
  "",
  "Upper",
  "-leading",
  "trailing-",
  "double--hyphen",
  "has_underscore",
  "../escape",
  "a/b",
  "a".repeat(49),
])("rejects the slug %j", (slug) => {
  expect(() => validateWorktreeSlug(slug)).toThrow(/Invalid worktree slug/);
});

test("builds a safe Postgres database name from a slug", () => {
  expect(databaseNameForSlug("feat-auth-2")).toBe("merit_feat_auth_2");
});

test.each([
  ["main", true],
  ["master", true],
  ["worktree/main", false],
])("treats %j as protected: %j", (branch, protectedBranch) => {
  expect(isProtectedBranch(branch)).toBe(protectedBranch);
});
