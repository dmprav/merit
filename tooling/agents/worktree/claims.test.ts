import { describe, expect, test } from "vite-plus/test";

import {
  type CleanClaim,
  cleanRefusal,
  createRefusal,
  matchesCleanClaim,
  withoutCleanClaim,
} from "./claims.ts";
import { worktreeRecord } from "./tests/fixtures.ts";

const alpha = worktreeRecord({ slug: "alpha", path: "/repo/.tmp/worktrees/alpha" });

describe("createRefusal", () => {
  test.each([
    { name: "a free slug", existing: undefined, ownerAlive: false, refusal: undefined },
    {
      name: "a slug being cleaned",
      existing: { ...alpha, status: "cleaning" as const },
      ownerAlive: true,
      refusal: /currently being cleaned/,
    },
    {
      name: "a slug a live create holds",
      existing: { ...alpha, status: "creating" as const, ownerPid: 42 },
      ownerAlive: true,
      refusal: /currently being created at .* by process 42/,
    },
    {
      name: "a slug an exited create left behind",
      existing: { ...alpha, status: "creating" as const, ownerPid: 42 },
      ownerAlive: false,
      refusal: /was interrupted\. Run `vp run worktree:clean alpha`/,
    },
    {
      name: "an active slug",
      existing: { ...alpha, status: "active" as const },
      ownerAlive: false,
      refusal: /already exists/,
    },
  ])("decides whether a create may take $name", ({ existing, ownerAlive, refusal }) => {
    const result = createRefusal("alpha", existing, ownerAlive);
    if (refusal) {
      expect(result).toMatch(refusal);
    } else {
      expect(result).toBeUndefined();
    }
  });
});

describe("cleanRefusal", () => {
  test.each([
    { name: "an unrecorded slug", record: undefined, ownerAlive: false, refusal: undefined },
    { name: "an active record", record: alpha, ownerAlive: false, refusal: undefined },
    {
      name: "a record a live create holds",
      record: { ...alpha, status: "creating" as const, ownerPid: 42 },
      ownerAlive: true,
      refusal: /currently being created by process 42/,
    },
    {
      name: "a record an exited create left behind",
      record: { ...alpha, status: "creating" as const, ownerPid: 42 },
      ownerAlive: false,
      refusal: undefined,
    },
    {
      name: "a record a live clean holds",
      record: { ...alpha, status: "cleaning" as const, cleanToken: "other", ownerPid: 42 },
      ownerAlive: true,
      refusal: /already being cleaned by another operation \(process 42\)/,
    },
    {
      name: "a record an exited clean left behind",
      record: { ...alpha, status: "cleaning" as const, cleanToken: "other", ownerPid: 42 },
      ownerAlive: false,
      refusal: undefined,
    },
    {
      name: "a record a failed clean released",
      record: { ...alpha, status: "cleaning" as const },
      ownerAlive: false,
      refusal: undefined,
    },
  ])("decides whether a clean may claim $name", ({ record, ownerAlive, refusal }) => {
    const result = cleanRefusal("alpha", record, ownerAlive);
    if (refusal) {
      expect(result).toMatch(refusal);
    } else {
      expect(result).toBeUndefined();
    }
  });
});

describe("matchesCleanClaim", () => {
  const claim: CleanClaim = {
    claimed: true,
    cleanToken: "mine",
    normalizedPath: alpha.path,
    databaseName: alpha.databaseName,
  };
  const claimed = { ...alpha, status: "cleaning" as const, cleanToken: "mine" };

  test.each([
    { name: "the claimed record", current: claimed, matches: true },
    { name: "a removed record", current: undefined, matches: false },
    { name: "another clean's token", current: { ...claimed, cleanToken: "other" }, matches: false },
    {
      name: "a released claim",
      current: { ...claimed, status: "active" as const },
      matches: false,
    },
    { name: "a different path", current: { ...claimed, path: "/elsewhere" }, matches: false },
    {
      name: "a different database",
      current: { ...claimed, databaseName: "merit_other" },
      matches: false,
    },
  ])("matches a claimed record against $name", ({ current, matches }) => {
    expect(matchesCleanClaim(current, claim)).toBe(matches);
  });

  test.each([
    { name: "no record", current: undefined, matches: true },
    { name: "a record a create added since", current: alpha, matches: false },
  ])("matches an unrecorded slug's claim against $name", ({ current, matches }) => {
    expect(matchesCleanClaim(current, { ...claim, claimed: false })).toBe(matches);
  });
});

test("releasing a clean claim keeps the record's identity for a retry", () => {
  const released = withoutCleanClaim({
    ...alpha,
    gitDir: "/repo/.git/worktrees/alpha",
    checkoutToken: "token",
    status: "cleaning",
    cleanToken: "mine",
    ownerPid: 42,
  });

  expect(released).toEqual({
    ...alpha,
    gitDir: "/repo/.git/worktrees/alpha",
    checkoutToken: "token",
    status: "cleaning",
  });
});
