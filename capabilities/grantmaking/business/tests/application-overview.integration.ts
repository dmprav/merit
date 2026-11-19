import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { assert, expect } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { createFundingApplication } from "@merit/applications/server";
import { changeWorkspaceContact } from "@merit/contacts/server";
import {
  matchesApplicationCriteria,
  workspaceApplicationsInput,
  type ApplicationFilter,
} from "@merit/grantmaking/api";
import {
  getFundingRoundOverview,
  getFundingRoundPage,
  getFundingApplicationPage,
  listWorkspaceApplications,
} from "@merit/grantmaking/server";
import { fundingExampleIds } from "@merit/grantmaking/server/demo";
import { fundingRoundContactUsage } from "@merit/grantmaking/server/integrations";
import { seedExampleRounds } from "@merit/grantmaking/testing";
import { encodeMoney, fromMinorUnits } from "@merit/money";
import { actor } from "@merit/organizations/testing/workspace";
import { recommendationVersions } from "@merit/recommendations/schema";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import { saveApplicationReview } from "@merit/reviews/server";
import { criteriaVersionSchema } from "@merit/rounds/domain";
import { createFundingRound, editFundingRound } from "@merit/rounds/server";

import { readApplicationOverviews } from "../src/server/persistence/queries/application-overview";
import { roundTest as it } from "./round-test";

it("reads recommendations only for the page or the round's selected filter and sort", async ({
  db,
  database,
  rounds,
}) => {
  await seedExampleRounds(db);
  await rounds.createApplication("First local application");
  await rounds.createApplication("Second local application");
  const queries: { text: string; values: unknown[] }[] = [];
  const measured = drizzle(database.client, {
    logger: { logQuery: (text, values) => queries.push({ text, values }) },
  });
  for (const [selection, expectedReads] of [
    [{}, 1],
    [{ roundId: rounds.pageInput.publicId }, 1],
    [{ roundId: rounds.pageInput.publicId, filter: { recommendation: "missing" } }, 2],
    [{ roundId: rounds.pageInput.publicId, sort: "proposed" }, 2],
  ] as const) {
    queries.length = 0;
    await readApplicationOverviews(
      measured,
      actor.userId,
      workspaceApplicationsInput.parse({ workspaceSlug: "alder", ...selection }),
      1,
    );
    const query = queries[0];
    assert.isDefined(query);

    type Plan = { "Relation Name"?: string; "Actual Loops": number; Plans?: Plan[] };

    const plan = await database.client.query<{ "QUERY PLAN": [{ Plan: Plan }] }>(
      `explain (analyze, format json) ${query.text}`,
      query.values,
    );

    const recommendationReads = (node: Plan): number =>
      (node["Relation Name"] === "recommendation_versions" ? node["Actual Loops"] : 0) +
      (node.Plans ?? []).reduce((count, child) => count + recommendationReads(child), 0);

    const result = plan.rows[0];
    assert.isDefined(result);
    expect(recommendationReads(result["QUERY PLAN"][0].Plan)).toBe(expectedReads);
  }
});

it("lists applications across rounds with the same review facts as their round pages", async ({
  db,
  rounds,
}) => {
  await seedExampleRounds(db);
  const created = await rounds.createApplication("Another round's application");
  const example = await fundingExampleIds("alder");
  const result = await listWorkspaceApplications(db, actor, { workspaceSlug: "alder" });
  assert(result.status === "ok");

  expect(result.applications).toHaveLength(4);
  expect(result.applications.find((item) => item.id === created.publicId)).toMatchObject({
    title: "Another round's application",
    applicant: "Community group",
    roundId: rounds.pageInput.publicId,
    roundTitle: "Community grants",
    intakeStatus: "in_preparation",
    reviews: { current: 0, outdated: 0, outstanding: 0, unknown: 0 },
    recommendation: null,
  });
  const page = await getFundingRoundPage(db, actor, {
    workspaceSlug: "alder",
    publicId: example.roundId,
    kind: "round",
  });
  assert.isNotNull(page);
  expect(page.round.applicationCount).toBe(3);
  expect(page.round).not.toHaveProperty("applications");
  for (const overviewRow of result.applications.filter((row) => row.roundId === example.roundId)) {
    const detail = await getFundingApplicationPage(db, actor, {
      workspaceSlug: "alder",
      publicId: overviewRow.id,
    });
    assert.isNotNull(detail);
    const { application } = detail;
    const overview = result.applications.find((item) => item.id === application.id);
    expect(overview).toMatchObject({
      title: application.title,
      roundTitle: page.round.title,
      reviews: {
        current: application.assessments.filter((review) => review.status === "current").length,
        outdated: application.assessments.filter((review) => review.status === "outdated").length,
        outstanding: application.assessments.filter((review) => review.status === "outstanding")
          .length,
        unknown: application.assessments.filter((review) => review.status === "unknown").length,
      },
      recommendation: application.managerRecommendation
        ? {
            position: application.managerRecommendation.position,
            outdated: Boolean(
              application.managerRecommendation.recorded &&
              application.managerRecommendation.recorded.applicationVersion !== application.version,
            ),
          }
        : null,
    });
    expect(overview).not.toHaveProperty("submission");
    expect(overview).not.toHaveProperty("reviewBases");
    expect(overview).not.toHaveProperty("criteria");
  }
});

it("uses the latest allocation and only reports changed evidence for a known material mismatch", async ({
  db,
  rounds,
}) => {
  const { pageInput } = rounds;

  const expectProposed = async (minorUnits: string) => {
    const overview = await getFundingRoundOverview(db, actor, {
      workspaceSlug: pageInput.workspaceSlug,
      roundId: pageInput.publicId,
    });
    const page = await getFundingRoundPage(db, actor, pageInput);
    assert(overview.status === "ok" && page);
    expect(overview.round.totals.proposed.minorUnits).toBe(minorUnits);
    expect(encodeMoney(page.round.totals.proposed)).toEqual(overview.round.totals.proposed);
  };

  await expectProposed("0");
  const application = await rounds.createApplication("Community studio");
  await rounds.recommendApplication(application, "5000");
  await db.insert(recommendationVersions).values({
    caseId: application.publicId,
    revision: 2,
    position: "Fund",
    allocationMinorUnits: "3200",
    reasoning: "Revised proposal with no recorded material basis.",
  });

  expect((await listAlder(db)).applications).toMatchObject([
    {
      id: application.publicId,
      recommendation: { outdated: false, allocation: { minorUnits: "3200" } },
    },
  ]);
  expect((await listAlder(db, { filter: { evidence: "changed" } })).matching).toBe(0);
  expect((await listAlder(db, { filter: { recommendation: "missing" } })).matching).toBe(0);
  await expectProposed("3200");
});

it("uses the latest assessment version and counts a replacement only once", async ({
  db,
  rounds,
}) => {
  const address = await rounds.createApplication("Assessed application");
  const reviewer = await changeWorkspaceContact(
    db,
    actor,
    {
      workspaceSlug: "alder",
      contactId: randomUUID(),
      action: "create",
      details: { name: "Sam Morgan", email: "", affiliation: "" },
    },
    fundingRoundContactUsage,
  );
  assert(reviewer.status === "ok");
  const content = {
    applicationVersion: materialVersionSchema.parse(1),
    criteriaVersion: criteriaVersionSchema.parse(1),
    date: null,
    position: "Fund" as const,
    amount: encodeMoney(fromMinorUnits(8000n)),
    reasoning: "Clear plan for weekly activities.",
    observations: [],
  };
  const input = {
    ...address,
    expectedApplicationVersion: materialVersionSchema.parse(1),
    expectedCriteriaVersion: criteriaVersionSchema.parse(1),
  };

  const reviews = async () => {
    const result = await listWorkspaceApplications(db, actor, { workspaceSlug: "alder" });
    assert(result.status === "ok");
    return result.applications.find((item) => item.id === address.publicId);
  };

  const assessmentId = randomUUID();
  const recorded = await saveApplicationReview(db, actor, {
    ...input,
    expectedRevision: reviewRevisionSchema.parse(0),
    change: {
      action: "record",
      id: assessmentId,
      contactId: reviewer.contact.id,
      requestId: null,
      previousId: null,
      content,
    },
  });
  assert(recorded.status === "ok");
  const edited = await saveApplicationReview(db, actor, {
    ...input,
    expectedRevision: recorded.revision,
    change: {
      action: "edit",
      id: assessmentId,
      content: { ...content, applicationVersion: null, criteriaVersion: null },
      note: "Basis not supplied",
    },
  });
  assert(edited.status === "ok");
  expect((await reviews())?.reviews).toEqual({
    current: 0,
    unknown: 1,
    outdated: 0,
    outstanding: 0,
  });

  const replaced = await saveApplicationReview(db, actor, {
    ...input,
    expectedRevision: edited.revision,
    change: {
      action: "record",
      id: randomUUID(),
      contactId: reviewer.contact.id,
      requestId: null,
      previousId: assessmentId,
      content,
    },
  });
  assert(replaced.status === "ok");
  expect((await reviews())?.reviews).toEqual({
    current: 1,
    unknown: 0,
    outdated: 0,
    outstanding: 0,
  });

  const page = await getFundingRoundPage(db, actor, rounds.pageInput);
  assert.isNotNull(page);
  const revised = await editFundingRound(db, actor, {
    workspaceSlug: "alder",
    publicId: rounds.pageInput.publicId,
    expectedRevision: page.preparation.revision,
    change: {
      section: "criteria",
      criteria: [
        {
          id: "20000000-0000-4000-8000-000000000001",
          title: "Venue",
          description: "Check the replacement venue.",
        },
      ],
    },
  });
  assert(revised.status === "ok");
  expect(await reviews()).toMatchObject({
    criteriaChanged: true,
    reviews: { current: 0, unknown: 0, outdated: 1, outstanding: 0 },
  });
});

it("returns empty authorized workspaces and rechecks grant access on every read", async ({
  db,
  database,
}) => {
  expect(await listWorkspaceApplications(db, actor, { workspaceSlug: "alder" })).toEqual({
    status: "ok",
    applications: [],
    total: 0,
    matching: 0,
    offset: 0,
  });
  expect(await listWorkspaceApplications(db, actor, { workspaceSlug: "birch" })).toEqual({
    status: "not_found",
  });
  for (const role of ["reviewer", "committee_reader", "member"]) {
    await database.client.query("UPDATE memberships SET role=$1 WHERE user_id='dana'", [role]);
    expect(await listWorkspaceApplications(db, actor, { workspaceSlug: "alder" })).toEqual({
      status: "forbidden",
    });
  }
  await database.client.query("DELETE FROM memberships WHERE user_id='dana'");
  expect(await listWorkspaceApplications(db, actor, { workspaceSlug: "alder" })).toEqual({
    status: "not_found",
  });
});

it("keeps unknown applicants distinct from known applicants", async ({
  db,
  rounds: { pageInput },
}) => {
  const created = await createFundingApplication(db, actor, {
    workspaceSlug: pageInput.workspaceSlug,
    publicId: pageInput.publicId,
    requestId: randomUUID(),
    title: "Title only",
  });
  assert(created.status === "ok");
  const result = await listWorkspaceApplications(db, actor, { workspaceSlug: "alder" });
  assert(result.status === "ok");
  expect(result.applications).toMatchObject([{ id: created.publicId, applicant: null }]);
});

const pageSize = 50;

/**
 * Adds 125 light applications after the round's first one, so lists cross three pages without
 * exercising creation writes. Titles run "Project 001" to "Project 124", then "alpha";
 * applicants cycle through none, "birch", and "Alder"; even positions are ready.
 */
const addLightApplications = (
  db: Parameters<typeof listWorkspaceApplications>[0],
  roundId: string,
) =>
  db.transaction(async (tx) => {
    await tx.execute(sql`
      insert into application_cases (organization_id, round_id, position, intake_status, material_version, search_title, search_applicant)
      select 'alder', ${roundId}, n, case when n % 2 = 0 then 'ready' else 'in_preparation' end, 1,
        case when n = 125 then 'alpha' else 'Project ' || lpad(n::text, 3, '0') end,
        case when n % 3 = 0 then '' when n % 3 = 1 then 'birch' else 'Alder' end
      from generate_series(1, 125) n
    `);
    await tx.execute(sql`
      insert into material_versions (case_id, version, title, applicant_organization, has_submission, submission_version, change_kind, recorded_at)
      select id, 1, search_title, search_applicant,
        true, 1, 'initial', now()
      from application_cases where round_id = ${roundId} and position > 0
    `);
  });

const listAlder = async (
  db: Parameters<typeof listWorkspaceApplications>[0],
  options: Omit<Parameters<typeof listWorkspaceApplications>[2], "workspaceSlug"> = {},
) => {
  const result = await listWorkspaceApplications(db, actor, { ...options, workspaceSlug: "alder" });
  assert(result.status === "ok");
  return result;
};

const readAllPages = async (
  db: Parameters<typeof listWorkspaceApplications>[0],
  options: Omit<Parameters<typeof listWorkspaceApplications>[2], "workspaceSlug" | "offset">,
) => {
  const pages = await Promise.all(
    [0, pageSize, 2 * pageSize].map((offset) => listAlder(db, { ...options, offset })),
  );
  return pages.flatMap((page) => page.applications);
};

it("pages summaries with exact counts and clamps an offset past the last page", async ({
  db,
  rounds,
}) => {
  await rounds.createApplication("Zulu");
  await addLightApplications(db, rounds.pageInput.publicId);

  const first = await listAlder(db);
  const second = await listAlder(db, { offset: 50 });
  const last = await listAlder(db, { offset: 100 });

  expect(first).toMatchObject({ total: 126, matching: 126, offset: 0 });
  expect([first, second, last].map((page) => [page.offset, page.applications.length])).toEqual([
    [0, 50],
    [50, 50],
    [100, 26],
  ]);
  expect(
    new Set([first, second, last].flatMap((page) => page.applications.map((a) => a.id))).size,
  ).toBe(126);
  expect(await listAlder(db, { offset: 1000 })).toMatchObject({ offset: 100, matching: 126 });
});

it("sorts titles and applicants ignoring case, with missing applicants last in either direction", async ({
  db,
  rounds,
}) => {
  await rounds.createApplication("Zulu");
  await addLightApplications(db, rounds.pageInput.publicId);

  expect((await listAlder(db, { sort: "application" })).applications[0]?.title).toBe("alpha");
  expect(
    (await listAlder(db, { sort: "application", direction: "descending" })).applications[0]?.title,
  ).toBe("Zulu");
  for (const [direction, firstApplicant] of [
    ["ascending", "Alder"],
    ["descending", "Community group"],
  ] as const) {
    const rows = await readAllPages(db, { sort: "applicant", direction });
    expect(rows).toHaveLength(126);
    expect(rows[0]?.applicant).toBe(firstApplicant);
    expect(rows.slice(-41).map((row) => row.applicant)).toEqual(Array(41).fill(null));
  }
});

it("breaks sort ties by application ID so pages neither repeat nor skip rows", async ({
  db,
  rounds,
}) => {
  await rounds.createApplication("Zulu");
  await addLightApplications(db, rounds.pageInput.publicId);

  for (const direction of ["ascending", "descending"] as const) {
    const rows = await readAllPages(db, { sort: "applicant", direction });
    expect(new Set(rows.map((row) => row.id)).size).toBe(126);
    const tied = rows.filter((row) => row.applicant === "birch").map((row) => row.id);
    expect(tied).toHaveLength(42);
    expect(tied).toEqual([...tied].sort());
  }
});

it("searches titles and applicants as trimmed, case-insensitive literal text", async ({
  db,
  rounds,
}) => {
  await rounds.createApplication("Zulu");
  await addLightApplications(db, rounds.pageInput.publicId);

  expect(await listAlder(db, { query: "  ALPHA  " })).toMatchObject({
    total: 126,
    matching: 1,
    applications: [{ title: "alpha" }],
  });
  expect((await listAlder(db, { query: "BIRCH" })).matching).toBe(42);
  expect((await listAlder(db, { query: "001 birch" })).matching).toBe(1);
  expect((await listAlder(db, { query: "birch Project" })).matching).toBe(0);
  for (const query of ["%", "_", "'", "\\"]) {
    expect((await listAlder(db, { query })).matching).toBe(0);
  }
});

it("keeps accents and literal wildcards in contiguous phrases", async ({ db, rounds }) => {
  await rounds.createApplication("Café 50%_match");
  await rounds.createApplication("Cafe 50xxmatch");
  for (const query of ["CAFÉ 50%", "50%_MATCH Community"]) {
    expect((await listAlder(db, { query })).applications.map((row) => row.title)).toEqual([
      "Café 50%_match",
    ]);
  }
  expect((await listAlder(db, { query: "CAFE 50%" })).matching).toBe(0);
});

it("filters before paging and returns to the first page when fewer applications match", async ({
  db,
  rounds,
}) => {
  await rounds.createApplication("Zulu");
  await addLightApplications(db, rounds.pageInput.publicId);
  const filter = { readiness: "ready", reviews: "unassigned", recommendation: "missing" } as const;

  const pages = await Promise.all([0, 50].map((offset) => listAlder(db, { filter, offset })));

  expect(pages.map((page) => [page.total, page.matching, page.applications.length])).toEqual([
    [126, 62, 50],
    [126, 62, 12],
  ]);
  const rows = pages.flatMap((page) => page.applications);
  expect(new Set(rows.map((row) => row.id)).size).toBe(62);
  expect(rows.every((row) => row.intakeStatus === "ready")).toBe(true);
  expect(await listAlder(db, { query: "project 002", filter, offset: 100 })).toMatchObject({
    total: 126,
    matching: 1,
    offset: 0,
    applications: [{ title: "Project 002" }],
  });
});

it("limits summaries to the selected round", async ({ db, rounds }) => {
  await rounds.createApplication("Selected round application");
  const other = await createFundingRound(db, actor, {
    workspaceSlug: "alder",
    requestId: randomUUID(),
    title: "Other round",
  });
  assert(other.status === "ok");
  const elsewhere = await createFundingApplication(db, actor, {
    workspaceSlug: "alder",
    publicId: other.publicId,
    requestId: randomUUID(),
    title: "Other round application",
  });
  assert(elsewhere.status === "ok");

  expect(await listAlder(db, { roundId: rounds.pageInput.publicId })).toMatchObject({
    total: 2,
    matching: 1,
    applications: [{ title: "Selected round application" }],
  });
  expect((await listAlder(db, { roundId: "000000000000" })).matching).toBe(0);
});

it("lists only the requested workspace for a person who belongs to several", async ({
  db,
  database,
  rounds,
}) => {
  await database.client.query(
    "INSERT INTO memberships (organization_id, user_id, role, administration) VALUES ('birch', 'dana', 'program_manager', 'none')",
  );
  const birchRound = (
    await database.client.query<{ id: string }>(
      "SELECT id FROM funding_rounds WHERE organization_id = 'birch'",
    )
  ).rows[0];
  assert.isDefined(birchRound);
  await rounds.createApplication("Alder application");
  const birchApplication = await createFundingApplication(db, actor, {
    workspaceSlug: "birch",
    publicId: birchRound.id,
    requestId: randomUUID(),
    title: "Birch application",
  });
  assert(birchApplication.status === "ok");

  expect(await listAlder(db)).toMatchObject({
    total: 1,
    applications: [{ title: "Alder application" }],
  });
  expect(await listWorkspaceApplications(db, actor, { workspaceSlug: "birch" })).toMatchObject({
    status: "ok",
    total: 1,
    applications: [{ title: "Birch application", roundId: birchRound.id }],
  });
});

it("sorts requested and proposed amounts exactly beyond JavaScript's safe integers, unknown last", async ({
  db,
  rounds,
}) => {
  const larger = await rounds.createApplication("Larger", "90071992547409.93");
  await addLightApplications(db, rounds.pageInput.publicId);
  const smaller = await rounds.createApplication("Smaller", "90071992547409.92");
  await rounds.createApplication("Modest", "80.00");
  await rounds.recommendApplication(larger, "9007199254740993");
  await rounds.recommendApplication(smaller, "9007199254740992");

  for (const sort of ["requested", "proposed"] as const) {
    const ascending =
      sort === "requested" ? ["Modest", "Smaller", "Larger"] : ["Smaller", "Larger"];
    for (const direction of ["ascending", "descending"] as const) {
      const rows = await readAllPages(db, { roundId: rounds.pageInput.publicId, sort, direction });
      const known = direction === "ascending" ? ascending : [...ascending].reverse();
      expect(rows).toHaveLength(128);
      expect(new Set(rows.map((row) => row.id)).size).toBe(128);
      expect(rows.slice(0, known.length).map((row) => row.title)).toEqual(known);
      for (const row of rows.slice(known.length)) {
        expect(sort === "requested" ? row.requested : row.recommendation).toBeNull();
      }
    }
  }
});

it("totals a round's requested and proposed amounts exactly beyond JavaScript's safe integers", async ({
  db,
  rounds,
}) => {
  const larger = await rounds.createApplication("Larger", "90071992547409.93");
  await addLightApplications(db, rounds.pageInput.publicId);
  const smaller = await rounds.createApplication("Smaller", "90071992547409.92");
  await rounds.createApplication("Modest", "80.00");
  await rounds.recommendApplication(larger, "9007199254740993");
  await rounds.recommendApplication(smaller, "9007199254740992");

  const page = await getFundingRoundPage(db, actor, rounds.pageInput);
  assert.isNotNull(page);

  expect(page.round.applicationCount).toBe(128);
  expect(encodeMoney(page.round.totals.requested).minorUnits).toBe(
    String(9007199254740993n + 9007199254740992n + 8000n),
  );
  expect(encodeMoney(page.round.totals.proposed).minorUnits).toBe(
    String(9007199254740993n + 9007199254740992n),
  );
  expect(page.round.totals.unknownRequests).toBe(125);
});

it("compares criteria content rather than criteria IDs or versions for work filters", async ({
  db,
  database,
}) => {
  await seedExampleRounds(db);
  const examples = await fundingExampleIds("alder");
  const original = await listWorkspaceApplications(db, actor, {
    workspaceSlug: "alder",
    roundId: examples.roundId,
  });
  assert(original.status === "ok");
  await database.client.query("BEGIN");
  await database.client.query(
    `insert into criteria_versions (round_id, version) values ($1, 100)`,
    [examples.roundId],
  );
  await database.client.query(
    `insert into criteria_version_items (round_id, version, position, criterion_id, title, description)
    select round_id, 100, position, gen_random_uuid(), title, description from criteria_version_items
    where round_id = $1 and version = (select criteria_version from funding_rounds where id = $1)`,
    [examples.roundId],
  );
  await database.client.query(`update funding_rounds set criteria_version = 100 where id = $1`, [
    examples.roundId,
  ]);
  await database.client.query("COMMIT");
  const unchanged = await listWorkspaceApplications(db, actor, {
    workspaceSlug: "alder",
    roundId: examples.roundId,
  });
  assert(unchanged.status === "ok");
  expect(unchanged.applications).toEqual(original.applications);
  const cases: ApplicationFilter[] = [
    {},
    { participation: "active" },
    { participation: "withdrawn" },
    { readiness: "preparing" },
    { readiness: "ready" },
    { reviews: "awaiting" },
    { reviews: "unassigned" },
    { evidence: "changed" },
    { evidence: "unknown" },
    { recommendation: "missing" },
    { participation: "active", reviews: "awaiting", evidence: "changed" },
  ];
  for (const filter of cases) {
    const result = await listWorkspaceApplications(db, actor, { workspaceSlug: "alder", filter });
    assert(result.status === "ok");
    expect(result.applications.map((a) => a.id)).toEqual(
      original.applications
        .filter((application) => matchesApplicationCriteria(application, filter))
        .map((a) => a.id),
    );
  }
  // Outstanding reviews remain outstanding even when their criteria content changes.
  await database.client.query("BEGIN");
  await database.client.query(
    `insert into criteria_versions (round_id, version) values ($1, 101)`,
    [examples.roundId],
  );
  await database.client.query(
    `insert into criteria_version_items (round_id, version, position, criterion_id, title, description)
    select round_id, 101, position, criterion_id, title || ' changed', description from criteria_version_items where round_id = $1 and version = 100`,
    [examples.roundId],
  );
  await database.client.query(`update funding_rounds set criteria_version = 101 where id = $1`, [
    examples.roundId,
  ]);
  await database.client.query("COMMIT");
  const changed = await listWorkspaceApplications(db, actor, {
    workspaceSlug: "alder",
    filter: { evidence: "changed" },
  });
  assert(changed.status === "ok");
  expect(changed.applications.some((a) => a.criteriaChanged)).toBe(true);
  expect(changed.applications.some((a) => a.reviews.outstanding > 0)).toBe(true);
});
