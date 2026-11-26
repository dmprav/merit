import { describe, expect, test } from "vite-plus/test";

import { type CheckoutRemovalFacts, decideCheckoutRemoval } from "./clean.ts";

describe("decideCheckoutRemoval", () => {
  const facts: CheckoutRemovalFacts = {
    gitEntry: { prunable: false },
    exists: true,
    owned: true,
    partialRemoval: false,
  };

  test.each([
    {
      name: "lets Git remove a checkout it tracks",
      facts,
      removal: { action: "git-remove", removed: true },
    },
    {
      name: "lets Git remove a checkout it tracks even outside .tmp/worktrees",
      facts: { ...facts, owned: false },
      removal: { action: "git-remove", removed: true },
    },
    {
      name: "counts a tracked checkout whose directory is gone as removed",
      facts: { ...facts, exists: false },
      removal: { action: "none", removed: true },
    },
    {
      name: "leaves a prunable entry's missing checkout to `git worktree prune`",
      facts: { ...facts, gitEntry: { prunable: true }, exists: false },
      removal: { action: "none", removed: true },
    },
    {
      name: "reports nothing removed when neither Git nor the disk has the checkout",
      facts: { ...facts, gitEntry: undefined, exists: false },
      removal: { action: "none", removed: false },
    },
    {
      name: "deletes an owned directory Git no longer tracks",
      facts: { ...facts, gitEntry: undefined },
      removal: { action: "delete-directory", removed: true },
    },
    {
      name: "refuses an untracked directory it does not own",
      facts: { ...facts, gitEntry: undefined, owned: false },
      removal: { action: "refuse", reason: "unowned" },
    },
    {
      name: "refuses residue of an interrupted removal outside .tmp/worktrees",
      facts: { ...facts, gitEntry: undefined, owned: false, partialRemoval: true },
      removal: { action: "refuse", reason: "interrupted-removal" },
    },
  ])("$name", ({ facts: found, removal }) => {
    expect(decideCheckoutRemoval(found)).toEqual(removal);
  });
});
