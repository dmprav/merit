import { randomUUID } from "node:crypto";

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
  getFundingRoundPage,
  getFundingApplicationPage,
  listWorkspaceApplications,
} from "@merit/grantmaking/server";
import { fundingExampleIds } from "@merit/grantmaking/server/demo";
import { fundingRoundContactUsage } from "@merit/grantmaking/server/integrations";
import { seedExampleRounds } from "@merit/grantmaking/testing";
import { encodeMoney } from "@merit/money";
import { actor } from "@merit/organizations/testing/workspace";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import { saveApplicationReview } from "@merit/reviews/server";
import { criteriaVersionSchema } from "@merit/rounds/domain";
import { editFundingRound } from "@merit/rounds/server";

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
            outdated:
              application.managerRecommendation.recorded?.applicationVersion !==
              application.version,
          }
        : null,
    });
    expect(overview).not.toHaveProperty("submission");
    expect(overview).not.toHaveProperty("reviewBases");
    expect(overview).not.toHaveProperty("criteria");
  }
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
    amount: "80.00",
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

it("pages globally filtered and sorted summaries with exact counts and stable ties", async ({
  db,
  database,
  rounds,
}) => {
  const first = await rounds.createApplication("Zulu");
  // A large light fixture crosses three page boundaries without exercising creation writes.
  await database.client.query("BEGIN");
  await database.client.query(
    `
    insert into application_cases (organization_id, round_id, position, intake_status, material_version)
    select 'alder', $1, n, 'in_preparation', 1 from generate_series(1, 125) n
  `,
    [rounds.pageInput.publicId],
  );
  await database.client.query(
    `
    insert into material_versions (case_id, version, title, applicant_organization, has_submission, submission_version, change_kind, recorded_at)
    select id, 1, case when position = 125 then 'alpha' else 'Project ' || lpad(position::text, 3, '0') end,
      case when position % 3 = 0 then '' when position % 3 = 1 then 'birch' else 'Alder' end,
      true, 1, 'initial', now()
    from application_cases where organization_id = 'alder' and id <> $1
  `,
    [first.publicId],
  );
  await database.client.query("COMMIT");

  const read = async (
    options: Omit<Parameters<typeof listWorkspaceApplications>[2], "workspaceSlug"> = {},
  ) => {
    const result = await listWorkspaceApplications(db, actor, {
      ...options,
      workspaceSlug: "alder",
    });
    assert(result.status === "ok");
    return result;
  };

  const firstPage = await read();
  expect(firstPage).toMatchObject({ total: 126, matching: 126, offset: 0 });
  expect(firstPage.applications).toHaveLength(50);
  const next = await read({ offset: 50 });
  const last = await read({ offset: 100 });
  expect(next.applications).toHaveLength(50);
  expect(last.applications).toHaveLength(26);
  expect(
    new Set(
      [...firstPage.applications, ...next.applications, ...last.applications].map((a) => a.id),
    ).size,
  ).toBe(126);
  expect((await read({ offset: 1000 })).offset).toBe(100);
  expect((await read({ sort: "application" })).applications[0]?.title).toBe("alpha");
  expect(
    (await read({ sort: "application", direction: "descending" })).applications[0]?.title,
  ).toBe("Zulu");
  const sorted = await read({ sort: "applicant" });
  expect(sorted.applications[0]?.applicant).toBe("Alder");
  for (const direction of ["ascending", "descending"] as const) {
    const pages = await Promise.all(
      [0, 50, 100].map((offset) => read({ sort: "applicant", direction, offset })),
    );
    const all = pages.flatMap((page) => page.applications);
    expect(all.at(-1)?.applicant).toBeNull();
    expect(new Set(all.map((a) => a.id)).size).toBe(126);
    expect(all.filter((a) => a.applicant === "birch").map((a) => a.id)).toEqual(
      all
        .filter((a) => a.applicant === "birch")
        .map((a) => a.id)
        .sort(),
    );
  }
  expect(await read({ query: "  ALPHA  " })).toMatchObject({
    total: 126,
    matching: 1,
    applications: [{ title: "alpha" }],
  });
  expect((await read({ roundId: "000000000000" })).matching).toBe(0);
  expect((await read({ filter: { reviews: "unassigned" } })).matching).toBe(126);
  expect((await read({ filter: { evidence: "unknown" } })).matching).toBe(0);
  expect((await read({ filter: { recommendation: "missing" } })).matching).toBe(126);
  const combined = {
    readiness: "preparing",
    reviews: "unassigned",
    recommendation: "missing",
  } as const;
  const combinedPages = await Promise.all(
    [0, 50, 100].map((offset) => read({ filter: combined, offset })),
  );
  expect(combinedPages.map((page) => page.matching)).toEqual([126, 126, 126]);
  expect(combinedPages.map((page) => page.applications.length)).toEqual([50, 50, 26]);
  expect(new Set(combinedPages.flatMap((page) => page.applications.map((a) => a.id))).size).toBe(
    126,
  );
  expect(await read({ query: "alpha", filter: combined, offset: 100 })).toMatchObject({
    total: 126,
    matching: 1,
    offset: 0,
    applications: [{ title: "alpha" }],
  });
  expect((await read({ filter: { ...combined, readiness: "ready" } })).matching).toBe(0);
  for (const query of ["%", "_", "'", "\\"]) {
    expect((await read({ query })).matching).toBe(0);
  }
  await seedExampleRounds(db);
  const awaiting = await read({ filter: { reviews: "awaiting" } });
  expect(awaiting.matching).toBeGreaterThan(0);
  expect(awaiting.applications.every((a) => a.reviews.outstanding > 0)).toBe(true);
  expect(awaiting.applications.every((a) => a.roundId !== rounds.pageInput.publicId)).toBe(true);
  const other = await listWorkspaceApplications(
    db,
    { userId: "birch-manager" },
    { workspaceSlug: "birch" },
  );
  assert(other.status === "ok");
  expect(other.total).toBe(3);
  expect(
    other.applications.every((application) => application.roundId !== rounds.pageInput.publicId),
  ).toBe(true);

  await database.client.query(
    `insert into material_versions (case_id, version, title, requested_minor_units, requested_currency, change_kind)
     select a.id, 2, m.title, case
       when a.position = 0 then 9007199254740993
       when a.position = 1 then 9007199254740992
       when a.position = 125 then null else a.position end,
       case when a.position = 125 then null else 'EUR' end, 'correction'
     from application_cases a join material_versions m on m.case_id = a.id and m.version = 1 where a.round_id = $1`,
    [rounds.pageInput.publicId],
  );
  await database.client.query(
    "update application_cases set material_version = 2 where round_id = $1",
    [rounds.pageInput.publicId],
  );
  await database.client.query(
    `insert into recommendation_versions (case_id, revision, position, allocation_minor_units, reasoning)
     select a.id, 1, 'Fund', m.requested_minor_units, 'Support the work'
     from application_cases a join material_versions m on m.case_id = a.id and m.version = a.material_version
     where a.round_id = $1 and a.position < 2`,
    [rounds.pageInput.publicId],
  );
  for (const sort of ["requested", "proposed"] as const) {
    for (const direction of ["ascending", "descending"] as const) {
      const pages = await Promise.all(
        [0, 50, 100].map((offset) =>
          read({ roundId: rounds.pageInput.publicId, sort, direction, offset }),
        ),
      );
      const rows = pages.flatMap((page) => page.applications);
      const amounts = rows.map((row) =>
        sort === "requested"
          ? row.requested?.minorUnits
          : row.recommendation?.allocation.minorUnits,
      );
      expect(rows).toHaveLength(126);
      expect(amounts.at(-1)).toBeUndefined();
      const known = amounts.filter((amount) => amount !== undefined);
      expect(direction === "descending" ? known.slice(0, 2) : known.slice(-2)).toEqual(
        direction === "descending"
          ? ["9007199254740993", "9007199254740992"]
          : ["9007199254740992", "9007199254740993"],
      );
    }
  }
  const roundPage = await getFundingRoundPage(db, actor, rounds.pageInput);
  assert.isNotNull(roundPage);
  expect(roundPage.round).not.toHaveProperty("applications");
  expect(roundPage.round.applicationCount).toBe(126);
  expect(encodeMoney(roundPage.round.totals.requested).minorUnits).toBe(
    String(9007199254740993n + 9007199254740992n + 7749n),
  );
  expect(encodeMoney(roundPage.round.totals.proposed).minorUnits).toBe("18014398509481985");
  expect(roundPage.round.totals.unknownRequests).toBe(1);
  await read({ query: "alpha", roundId: rounds.pageInput.publicId });
  expect((await getFundingRoundPage(db, actor, rounds.pageInput))?.round.totals).toEqual(
    roundPage.round.totals,
  );
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
  expect(
    (await listWorkspaceApplications(db, actor, { workspaceSlug: "birch", query: "Project" }))
      .status,
  ).toBe("not_found");
});
