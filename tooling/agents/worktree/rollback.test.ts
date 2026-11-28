import { describe, expect, test } from "vite-plus/test";

import { type CheckoutRollback, decideRegistryRollback, rollbackError } from "./rollback.ts";

const removed: CheckoutRollback = { preserved: false, remains: false, metadataRemoved: false };
const stuck: CheckoutRollback = {
  preserved: false,
  removalError: new Error("worktree is locked"),
  remains: true,
  metadataRemoved: false,
};

const progress = { registryReserved: true, databaseCreated: false };

describe("decideRegistryRollback", () => {
  test.each([
    {
      name: "a failure before the registry record was written",
      progress: { ...progress, registryReserved: false },
      checkout: removed,
      cleanup: { action: "none" },
    },
    {
      name: "a removed checkout",
      progress,
      checkout: removed,
      cleanup: { action: "remove" },
    },
    {
      name: "a target another job occupies",
      progress,
      checkout: { ...removed, preserved: true },
      cleanup: { action: "remove" },
    },
    {
      name: "a checkout Git refused to remove",
      progress: { ...progress, databaseCreated: true },
      checkout: stuck,
      cleanup: { action: "retain", partialRemoval: false, databaseCreated: true },
    },
    {
      name: "a checkout whose `.git` Git removed before failing",
      progress,
      checkout: { ...stuck, metadataRemoved: true },
      cleanup: { action: "retain", partialRemoval: true, databaseCreated: false },
    },
  ])("undoes $name", ({ progress: made, checkout, cleanup }) => {
    expect(decideRegistryRollback(made, checkout, made.databaseCreated)).toEqual(cleanup);
  });

  test("keeps the record of a removed checkout whose database rollback could not drop", () => {
    expect(decideRegistryRollback(progress, removed, true)).toEqual({
      action: "retain",
      partialRemoval: false,
      databaseCreated: true,
    });
  });

  test("records a retained checkout's database as dropped once rollback dropped it", () => {
    expect(decideRegistryRollback(progress, stuck, false)).toEqual({
      action: "retain",
      partialRemoval: false,
      databaseCreated: false,
    });
  });
});

describe("rollbackError", () => {
  const original = new Error("doctor check failed");
  const path = "/repo/.tmp/worktrees/alpha";

  test("reports both failures when rollback can remove neither the checkout nor the database", () => {
    const error = rollbackError(original, path, stuck, "inspect database merit_alpha manually");
    expect(error).toMatchObject({
      message: `doctor check failed (rollback could not remove checkout at "${path}": worktree is locked; inspect database merit_alpha manually)`,
      cause: original,
    });
  });

  test("reports the original error when rollback removed everything", () => {
    expect(rollbackError(original, path, removed)).toBe(original);
  });

  test.each([
    {
      name: "Git's removal error",
      checkout: stuck,
      message: `doctor check failed (rollback could not remove checkout at "${path}": worktree is locked)`,
    },
    {
      name: "a non-Error removal failure",
      checkout: { ...stuck, removalError: "permission denied" },
      message: `doctor check failed (rollback could not remove checkout at "${path}": permission denied)`,
    },
    {
      name: "a checkout left behind without an error",
      checkout: { ...stuck, removalError: undefined },
      message: `doctor check failed (rollback could not remove checkout at "${path}": directory still exists after removal)`,
    },
    {
      name: "a target rollback preserved",
      checkout: { ...removed, preserved: true },
      message: `doctor check failed (rollback preserved "${path}" because its Git metadata does not show that this attempt created it)`,
    },
  ])("adds $name to the original error", ({ checkout, message }) => {
    const error = rollbackError(original, path, checkout);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ message, cause: original });
  });
});
