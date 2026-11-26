import { describe, expect, test } from "vite-plus/test";

import { type CheckoutObservation, checkoutIdentityRefusal } from "./checkout-identity.ts";

const PATH = "/repo/.tmp/worktrees/alpha";
const GIT_DIR = "/repo/.git/worktrees/alpha";

const identity = { gitDir: GIT_DIR, checkoutToken: "token" };

/** The registered checkout, unmoved and intact. */
const intact: CheckoutObservation = {
  expectedGitDir: GIT_DIR,
  movedPath: PATH,
  checkoutExists: true,
  dotGitExists: true,
  actualGitDir: GIT_DIR,
  actualGitDirExists: true,
  actualToken: "token",
};

describe("checkoutIdentityRefusal", () => {
  test.each([
    { name: "the registered checkout", identity, seen: intact, refusal: undefined },
    {
      name: "a checkout already removed",
      identity,
      seen: { ...intact, movedPath: null, checkoutExists: false, dotGitExists: false },
      refusal: undefined,
    },
    {
      name: "a registered checkout moved elsewhere",
      identity,
      seen: { ...intact, movedPath: "/elsewhere/alpha" },
      refusal: /was moved to "\/elsewhere\/alpha".*git worktree move "\/elsewhere\/alpha"/,
    },
    {
      name: "residue of an interrupted removal",
      identity: { ...identity, partialRemoval: true },
      seen: { ...intact, movedPath: null, dotGitExists: false, actualGitDir: null },
      refusal: undefined,
    },
    {
      name: "a checkout that reappeared at residue of an interrupted removal",
      identity: { ...identity, partialRemoval: true },
      seen: { ...intact, actualGitDir: "/repo/.git/worktrees/other" },
      refusal: /identity mismatch \(expected gitdir ".*alpha", found gitdir ".*other"\)/,
    },
    {
      name: "a directory that is not a linked checkout",
      identity,
      seen: { ...intact, movedPath: null, dotGitExists: false, actualGitDir: null },
      refusal: /found no matching linked-worktree \.git file/,
    },
    {
      name: "another checkout reusing the Git metadata name",
      identity,
      seen: { ...intact, movedPath: null, actualToken: "replacement" },
      refusal: /belongs to a different checkout/,
    },
    {
      name: "a checkout whose Git metadata was pruned",
      identity,
      seen: { ...intact, movedPath: null, actualGitDirExists: false, actualToken: null },
      refusal: undefined,
    },
    {
      name: "a checkout registered before tokens were recorded",
      identity: { gitDir: GIT_DIR },
      seen: { ...intact, actualToken: null },
      refusal: undefined,
    },
  ])("decides whether clean may remove $name", ({ identity: registered, seen, refusal }) => {
    const result = checkoutIdentityRefusal(PATH, registered, seen);
    if (refusal) {
      expect(result).toMatch(refusal);
    } else {
      expect(result).toBeUndefined();
    }
  });
});
