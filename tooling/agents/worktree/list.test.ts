import { join } from "node:path";

import { expect, test } from "vite-plus/test";

import {
  createDeferred,
  createIn,
  git,
  initTempRepo,
  interruptCreate,
  listIn,
  makeTempDir,
  useWorktreeFixtures,
} from "./tests/fixtures.ts";

useWorktreeFixtures();

test("lists active worktrees by slug with their checkout paths", async () => {
  const repo = initTempRepo();
  const customDir = join(makeTempDir("merit-custom-wt-"), "alpha-dir");
  const beta = await createIn(repo, { slug: "beta" });
  const alpha = await createIn(repo, { slug: "alpha", dir: customDir });

  expect(listIn(repo)).toEqual([
    {
      slug: "alpha",
      path: customDir,
      branch: "worktree/alpha",
      databaseName: "merit_alpha",
      databaseUrl: alpha.databaseUrl,
      ports: alpha.ports,
    },
    expect.objectContaining({ slug: "beta", path: beta.path }),
  ]);
});

test("hides a worktree while it is being created", async () => {
  const repo = initTempRepo();
  const bootstrapStarted = createDeferred();
  const releaseBootstrap = createDeferred();
  const creating = createIn(
    repo,
    { slug: "lifecycle" },
    {
      execCommand: async () => {
        bootstrapStarted.resolve();
        await releaseBootstrap.promise;
      },
    },
  );
  await bootstrapStarted.promise;

  expect(listIn(repo)).toEqual([]);

  releaseBootstrap.resolve();
  await creating;
  expect(listIn(repo).map((entry) => entry.slug)).toEqual(["lifecycle"]);
});

test("hides a worktree whose create was interrupted", async () => {
  const repo = initTempRepo();
  await createIn(repo, { slug: "killed" });
  interruptCreate(repo, "killed");

  expect(listIn(repo)).toEqual([]);
});

test("follows a moved checkout by its token and ignores another checkout at its old path", async () => {
  const repo = initTempRepo();
  const movedPath = join(makeTempDir("merit-moved-list-"), "alpha-moved");
  const alpha = await createIn(repo, { slug: "alpha" });
  git(repo, ["worktree", "move", alpha.path, movedPath]);
  git(repo, ["worktree", "add", "-b", "feat/other", alpha.path, "main"]);

  expect(listIn(repo)).toEqual([
    expect.objectContaining({
      slug: "alpha",
      path: movedPath,
      branch: "worktree/alpha",
      databaseName: "merit_alpha",
      ports: alpha.ports,
    }),
  ]);
});
