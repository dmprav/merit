import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { assert, expect } from "vite-plus/test";

import type { IntakeChange } from "@merit/applications/domain";
import { createFundingApplication, editFundingApplication } from "@merit/applications/server";
import { searchWorkspace } from "@merit/grantmaking/server";
import { actor, workspaceTest as it, workspaceSlug } from "@merit/organizations/testing/workspace";
import { createFundingRound, editFundingRound } from "@merit/rounds/server";

import { applicationWork } from "../src/server/persistence/commands/application-work";

const createRound = async (
  db: NodePgDatabase,
  title: string,
  options: { workspace?: string; userId?: string; meetingDate?: string } = {},
) => {
  const created = await createFundingRound(
    db,
    { userId: options.userId ?? actor.userId },
    {
      workspaceSlug: options.workspace ?? workspaceSlug,
      requestId: randomUUID(),
      title,
      ...(options.meetingDate ? { meetingDate: options.meetingDate } : {}),
    },
  );
  assert(created.status === "ok");
  return created.publicId;
};

const createApplication = async (
  db: NodePgDatabase,
  roundId: string,
  title: string,
  applicant?: string,
  options: { workspace?: string; userId?: string } = {},
) => {
  const created = await createFundingApplication(
    db,
    { userId: options.userId ?? actor.userId },
    {
      workspaceSlug: options.workspace ?? workspaceSlug,
      publicId: roundId,
      requestId: randomUUID(),
      title,
      ...(applicant === undefined ? {} : { applicant }),
    },
  );
  assert(created.status === "ok");
  return created.publicId;
};

const search = async (db: NodePgDatabase, query: string, workspace = workspaceSlug) => {
  const result = await searchWorkspace(db, actor, { workspaceSlug: workspace, query });
  assert(result.status === "ok");
  return result;
};

const answers = [
  {
    questionId: "535419fe-0936-5505-9046-3d66510742c3",
    question: "Plan",
    response: "Weekly meals.",
  },
];

const titles = (group: { results: { title: string }[] }) => group.results.map((row) => row.title);

it("finds rounds and applications by name or applicant, ignoring case and accents", async ({
  db,
}) => {
  const round = await createRound(db, "Écoles du Quartier", { meetingDate: "2027-06-15" });
  const other = await createRound(db, "Harbour fund");
  const kitchen = await createApplication(db, round, "Community kitchen", "Café Société");
  await createApplication(db, other, "Boat repairs", "Trust for the Harbour");

  expect(await search(db, "ecoles QUARTIER")).toMatchObject({
    rounds: { total: 1, results: [{ title: "Écoles du Quartier", meetingDate: "2027-06-15" }] },
    applications: { total: 0, results: [] },
  });
  expect(await search(db, "societe cafe")).toMatchObject({
    rounds: { total: 0 },
    applications: {
      total: 1,
      results: [
        {
          id: kitchen,
          title: "Community kitchen",
          applicant: "Café Société",
          roundId: round,
          roundTitle: "Écoles du Quartier",
          intakeStatus: "in_preparation",
          withdrawn: false,
          matchQuality: "contains",
        },
      ],
    },
  });
});

it("matches every word in any order across the title and applicant together", async ({ db }) => {
  const round = await createRound(db, "Community grants");
  await createApplication(db, round, "Boat repairs", "Trust for the Harbour");
  await createApplication(db, round, "Harbour lights", "Dock committee");

  expect(titles((await search(db, "harbour trust")).applications)).toEqual(["Boat repairs"]);
  expect(titles((await search(db, "  trust   boat\t")).applications)).toEqual(["Boat repairs"]);
  expect(titles((await search(db, "harbour")).applications)).toEqual([
    "Harbour lights",
    "Boat repairs",
  ]);
  expect((await search(db, "harbour dock trust")).applications.total).toBe(0);
  expect((await search(db, "harbr")).applications.total).toBe(0);
});

it.for([
  { query: "%", expected: ["Fifty% off"] },
  { query: "_", expected: ["Under_score"] },
  { query: "\\", expected: ["Back\\slash"] },
  { query: "50%", expected: [] },
  { query: "fifty%", expected: ["Fifty% off"] },
])("treats wildcard characters in %j as literal text", async ({ query, expected }, { db }) => {
  const round = await createRound(db, "Community grants");
  for (const title of ["Fifty% off", "Under_score", "Back\\slash", "Plain title"]) {
    await createApplication(db, round, title);
  }

  expect(titles((await search(db, query)).applications)).toEqual(expected);
});

it("finds nothing for an empty query and does not search for whitespace", async ({ db }) => {
  const round = await createRound(db, "Community grants");
  await createApplication(db, round, "Community kitchen");

  for (const query of ["", "  \n\t "]) {
    expect(await search(db, query)).toEqual({
      status: "ok",
      rounds: { results: [], total: 0 },
      applications: { results: [], total: 0 },
    });
  }
});

it("orders by match quality, then active before withdrawn, then title and ID", async ({ db }) => {
  const round = await createRound(db, "Spring round");
  const withdrawn = await createApplication(db, round, "Garden club");
  await createApplication(db, round, "The garden");
  await createApplication(db, round, "garden");
  await createApplication(db, round, "Garden tools");
  await createApplication(db, round, "Window", "Garden");
  await createApplication(db, round, "Allotment garden");
  await createApplication(db, round, "Zebra", "Garden society");
  const result = await editFundingApplication(
    db,
    actor,
    {
      workspaceSlug,
      publicId: withdrawn,
      expectedRevision: 0,
      change: { action: "withdraw", withdrawnOn: "2020-05-06", reason: "Applicant withdrew." },
    },
    applicationWork,
  );
  expect(result).toMatchObject({ status: "ok" });

  const found = await search(db, "Garden");

  expect(
    found.applications.results.map((row) => [row.title, row.matchQuality, row.withdrawn]),
  ).toEqual([
    ["garden", "exact", false],
    ["Window", "exact", false],
    ["Garden tools", "prefix", false],
    ["Zebra", "prefix", false],
    ["Garden club", "prefix", true],
    ["Allotment garden", "contains", false],
    ["The garden", "contains", false],
  ]);
});

it("limits each group, reports its total, and applies access before counting", async ({
  db,
  database,
}) => {
  const round = await createRound(db, "Match round");
  for (let index = 0; index < 7; index += 1) {
    await createRound(db, `Match round ${index}`);
  }
  for (let index = 0; index < 13; index += 1) {
    await createApplication(db, round, `Match ${String(index).padStart(2, "0")}`);
  }
  const birch = await createRound(db, "Match elsewhere", {
    workspace: "birch",
    userId: "birch-manager",
  });
  await createApplication(db, birch, "Match elsewhere", undefined, {
    workspace: "birch",
    userId: "birch-manager",
  });

  const found = await search(db, "match");

  expect(found.rounds.total).toBe(8);
  expect(found.rounds.results).toHaveLength(5);
  expect(found.rounds.results[0]).toMatchObject({ title: "Match round", matchQuality: "prefix" });
  expect(found.applications.total).toBe(13);
  expect(titles(found.applications)).toEqual(
    Array.from({ length: 10 }, (_, index) => `Match ${String(index).padStart(2, "0")}`),
  );
  expect(
    await searchWorkspace(
      db,
      { userId: "birch-manager" },
      { workspaceSlug: "birch", query: "match" },
    ),
  ).toMatchObject({ rounds: { total: 1 }, applications: { total: 1 } });
  await database.client.query("UPDATE memberships SET role = 'member' WHERE user_id = 'dana'");
  expect(await searchWorkspace(db, actor, { workspaceSlug, query: "match" })).toEqual({
    status: "forbidden",
  });
});

it.for([
  { workspace: "unknown", userId: "dana" },
  { workspace: "birch", userId: "dana" },
  { workspace: "Not A Slug", userId: "dana" },
  { workspace: "alder", userId: "stranger" },
])("answers $workspace for $userId as not found", async ({ workspace, userId }, { db }) => {
  const round = await createRound(db, "Community grants");
  await createApplication(db, round, "Community kitchen");

  expect(
    await searchWorkspace(db, { userId }, { workspaceSlug: workspace, query: "community" }),
  ).toEqual({ status: "not_found" });
});

it("finds only the current recorded version, never a working revision", async ({ db }) => {
  const round = await createRound(db, "Community grants");
  const id = await createApplication(db, round, "Original harbour", "Old Society");

  const change = async (action: IntakeChange, expectedRevision: number) => {
    const result = await editFundingApplication(
      db,
      actor,
      { workspaceSlug, publicId: id, expectedRevision, change: action },
      applicationWork,
    );
    expect(result).toMatchObject({ status: "ok" });
    assert(result.status === "ok");
    return result.revision;
  };

  let revision = await change(
    {
      action: "save_content",
      content: {
        title: "Original harbour",
        applicant: "Old Society",
        requested: "100.00",
        answers,
      },
    },
    0,
  );
  revision = await change({ action: "mark_ready" }, revision);
  revision = await change({ action: "start_revision", kind: "revision" }, revision);
  revision = await change(
    {
      action: "save_revision",
      draft: {
        kind: "revision",
        reason: "New name",
        content: {
          title: "Renamed lighthouse",
          applicant: "New Society",
          requested: "100.00",
          answers,
        },
      },
    },
    revision,
  );

  expect(titles((await search(db, "original")).applications)).toEqual(["Original harbour"]);
  expect((await search(db, "renamed")).applications.total).toBe(0);
  expect((await search(db, "new society")).applications.total).toBe(0);

  await change({ action: "publish_revision" }, revision);

  expect((await search(db, "original")).applications.total).toBe(0);
  expect((await search(db, "old society")).applications.total).toBe(0);
  expect(await search(db, "renamed new")).toMatchObject({
    applications: { results: [{ id, title: "Renamed lighthouse", applicant: "New Society" }] },
  });
});

it("labels applications in preparation and shows a missing applicant as null", async ({ db }) => {
  const round = await createRound(db, "Community grants");
  await createApplication(db, round, "Anonymous project", "");

  expect(await search(db, "anonymous")).toMatchObject({
    applications: {
      results: [{ title: "Anonymous project", applicant: null, intakeStatus: "in_preparation" }],
    },
  });
});

it("follows a renamed round without rewriting application rows", async ({ db, database }) => {
  const round = await createRound(db, "Old name");
  await createApplication(db, round, "Kitchen");
  const before = await database.client.query("SELECT xmin::text FROM application_cases");
  const edited = await editFundingRound(db, actor, {
    workspaceSlug,
    publicId: round,
    expectedRevision: 0,
    change: { section: "details", title: "New name" },
  });
  expect(edited).toMatchObject({ status: "ok" });

  expect(await search(db, "kitchen")).toMatchObject({
    applications: { results: [{ roundTitle: "New name" }] },
  });
  expect((await search(db, "old name")).rounds.total).toBe(0);
  expect((await search(db, "new name")).rounds.total).toBe(1);
  expect((await database.client.query("SELECT xmin::text FROM application_cases")).rows).toEqual(
    before.rows,
  );
});

it("backfills the stored search text from each current recorded version", async ({
  db,
  database,
}) => {
  const round = await createRound(db, "Community grants");
  await createApplication(db, round, "Backfilled title", "Backfilled applicant");
  await database.client.query(
    "UPDATE application_cases SET search_title = '', search_applicant = ''",
  );
  expect((await search(db, "backfilled")).applications.total).toBe(0);

  const migration = readFileSync(
    new URL(
      "../../../../foundation/db/database/migrations/0001_workspace_search.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const backfill = migration
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .find((statement) => statement.includes("UPDATE application_cases"));
  assert(backfill);
  await database.client.query(backfill);

  expect(await search(db, "backfilled applicant")).toMatchObject({
    applications: { results: [{ title: "Backfilled title", applicant: "Backfilled applicant" }] },
  });
});
