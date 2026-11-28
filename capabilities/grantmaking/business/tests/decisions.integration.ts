import { randomUUID } from "node:crypto";

import { assert, describe, expect } from "vite-plus/test";

import { editFundingApplication } from "@merit/applications/server";
import { type Database } from "@merit/db";
import { recordCommitteeDecision } from "@merit/decisions/server";
import { createDecisionCases, decisionOf, today } from "@merit/decisions/testing";
import { encodeMoney } from "@merit/money";
import { actor } from "@merit/organizations/testing/workspace";
import { createFundingRound, editFundingRound } from "@merit/rounds/server";

import {
  getFundingApplicationContent,
  getFundingApplicationPage,
  getFundingRoundOverview,
  getFundingRoundPage,
  listFundingApplicationHistory,
  listWorkspaceActivity,
  listWorkspaceApplications,
} from "../src/server";
import { applicationWork, roundCommitments } from "./application-work";
import { roundTest } from "./round-test";

const it = roundTest.extend("scenario", async ({ db, rounds }) => {
  const cases = await createDecisionCases(db, rounds.createApplication);

  const page = async (address: { workspaceSlug: string; publicId: string }) =>
    (await getFundingApplicationPage(db, actor, address))!;

  const roundPage = async () => (await getFundingRoundPage(db, actor, rounds.pageInput))!;

  const edit = async (
    address: { workspaceSlug: string; publicId: string },
    change: Parameters<typeof editFundingApplication>[2]["change"],
  ) =>
    editFundingApplication(
      db,
      actor,
      { ...address, expectedRevision: (await page(address)).intake.revision, change },
      applicationWork,
    );

  const budget = (amount: string, reason = "Changed for the test.") =>
    editFundingRound(
      db,
      actor,
      {
        workspaceSlug: rounds.pageInput.workspaceSlug,
        publicId: rounds.pageInput.publicId,
        expectedRevision: 0,
        change: { section: "budget", amount, reason },
      },
      roundCommitments,
    );

  return { ...cases, page, roundPage, edit, budget };
});

describe("committee decisions", () => {
  it("records the decision without requiring or changing a manager recommendation", async ({
    scenario: s,
  }) => {
    const before = await s.page(s.first);
    expect(before.application.managerRecommendation).toBeNull();
    expect(await s.record(s.first, {})).toMatchObject({ status: "ok" });
    const after = await s.page(s.first);
    expect(after.application.managerRecommendation).toBeNull();
    expect(after.recommendationVersion).toBe(0);
    expect(after.decision).toMatchObject({
      revision: 1,
      versions: [{ revision: 1, decision: { outcome: "Fund", amount: { minorUnits: "5000" } } }],
    });
    expect(encodeMoney(after.round.totals.committed).minorUnits).toBe("5000");
    expect(encodeMoney(after.round.totals.proposed).minorUnits).toBe("0");

    expect(
      await s.record(
        s.first,
        {
          amount: { minorUnits: "4000", currency: "EUR" },
          changeExplanation: "Budget reduced.",
        },
        1,
      ),
    ).toMatchObject({ status: "ok" });
    const amended = await s.page(s.first);
    expect(amended.decision.versions.map((version) => version.revision)).toEqual([2, 1]);
    expect(encodeMoney(amended.round.totals.committed).minorUnits).toBe("4000");
    expect(amended.application.managerRecommendation).toBeNull();
  });

  it("leaves a saved manager recommendation and the round's proposed total unchanged", async ({
    rounds,
    scenario: s,
  }) => {
    const address = await rounds.createApplication("Recommended application");
    await rounds.recommendApplication(address, "3000");
    const before = await s.page(address);
    assert(before.application.managerRecommendation !== null);
    expect(encodeMoney(before.round.totals.proposed).minorUnits).toBe("3000");

    expect(await s.record(address, {})).toMatchObject({ status: "ok" });

    const after = await s.page(address);
    expect(after.application.managerRecommendation).toEqual(
      before.application.managerRecommendation,
    );
    expect(after.recommendationVersion).toBe(before.recommendationVersion);
    expect(encodeMoney(after.round.totals.proposed)).toEqual(
      encodeMoney(before.round.totals.proposed),
    );
    expect(encodeMoney(after.round.totals.committed).minorUnits).toBe("5000");
  });

  it("refuses a round budget below the committed total and allows one that covers it", async ({
    scenario: s,
  }) => {
    expect(
      await s.record(s.first, { amount: { minorUnits: "6000", currency: "EUR" } }),
    ).toMatchObject({
      status: "ok",
    });
    expect(await s.budget("")).toEqual({
      status: "invalid",
      error: "budget_below_commitments",
      committed: { minorUnits: "6000", currency: "EUR" },
    });
    expect(await s.budget("59.99")).toMatchObject({
      status: "invalid",
      error: "budget_below_commitments",
      committed: { minorUnits: "6000" },
    });
    expect(await s.budget("60.00")).toMatchObject({ status: "ok" });
    const page = await s.roundPage();
    expect(encodeMoney(page.round.totals.committed).minorUnits).toBe("6000");
    expect(encodeMoney(page.round.totals.available!).minorUnits).toBe("0");
    expect(encodeMoney(page.round.totals.proposed).minorUnits).toBe("0");
  });
});

describe("decisions and application lifecycle", () => {
  it("blocks withdrawing a funded application until a new version supersedes the commitment", async ({
    scenario: s,
  }) => {
    expect(await s.record(s.first, {})).toMatchObject({ status: "ok" });
    expect(
      await s.edit(s.first, { action: "withdraw", withdrawnOn: today(), reason: "Withdrawn." }),
    ).toEqual({ status: "invalid", error: "application_has_commitment" });

    expect(
      await s.record(
        s.first,
        {
          outcome: "Decline",
          amount: { minorUnits: "0", currency: "EUR" },
          changeExplanation: "The applicant cannot proceed.",
        },
        1,
      ),
    ).toMatchObject({ status: "ok" });
    const page = await s.roundPage();
    expect(encodeMoney(page.round.totals.committed).minorUnits).toBe("0");
    expect(encodeMoney(page.round.totals.available!).minorUnits).toBe("10000");

    expect(
      await s.edit(s.first, { action: "withdraw", withdrawnOn: today(), reason: "Withdrawn." }),
    ).toMatchObject({ status: "ok" });
  });

  it("makes a withdrawn application's decision read-only until it is reinstated", async ({
    scenario: s,
  }) => {
    expect(
      await s.record(s.first, { outcome: "Defer", amount: { minorUnits: "0", currency: "EUR" } }),
    ).toMatchObject({ status: "ok" });
    expect(
      await s.edit(s.first, { action: "withdraw", withdrawnOn: today(), reason: "Withdrawn." }),
    ).toMatchObject({ status: "ok" });

    expect(await s.record(s.first, { reason: "Changed." }, 1)).toEqual({
      status: "invalid",
      error: "application_withdrawn",
    });
    expect((await s.page(s.first)).decision.versions).toHaveLength(1);

    expect(await s.edit(s.first, { action: "reinstate", reason: "Back." })).toMatchObject({
      status: "ok",
    });
    expect(
      await s.record(
        s.first,
        {
          reason: "Considered again.",
          outcome: "Defer",
          amount: { minorUnits: "0", currency: "EUR" },
          changeExplanation: "Next meeting.",
        },
        1,
      ),
    ).toMatchObject({ status: "ok" });
  });

  it("rejects deleting an application that has any decision", async ({ scenario: s }) => {
    expect(
      await s.record(s.preparing, {
        outcome: "Defer",
        amount: { minorUnits: "0", currency: "EUR" },
      }),
    ).toMatchObject({ status: "ok" });
    expect(await s.edit(s.preparing, { action: "delete" })).toEqual({
      status: "invalid",
      error: "application_in_use",
    });
  });
});

describe("decision reads", () => {
  it("lists the decision outcome beside the recommendation status and the round's committed totals", async ({
    db,
    scenario: s,
  }) => {
    expect(await s.record(s.first, {})).toMatchObject({ status: "ok" });
    const list = await listWorkspaceApplications(db, actor, {
      workspaceSlug: s.first.workspaceSlug,
      filter: {},
      offset: 0,
    } as never);
    assert(list.status === "ok");
    expect(
      Object.fromEntries(
        list.applications.map((row) => [row.title, row.decision?.outcome ?? null]),
      ),
    ).toEqual({
      "First application": "Fund",
      "Second application": null,
      "Still in preparation": null,
    });

    const overview = await getFundingRoundOverview(db, actor, {
      workspaceSlug: s.first.workspaceSlug,
      roundId: (await s.roundPage()).round.id,
    });
    assert(overview.status === "ok");
    expect(overview.round.totals).toMatchObject({
      committed: { minorUnits: "5000" },
      available: { minorUnits: "5000" },
      proposed: { minorUnits: "0" },
    });
  });

  it("reads decision sections and history for the MCP surface", async ({ db, scenario: s }) => {
    expect(await s.record(s.first, {})).toMatchObject({ status: "ok" });
    expect(
      await s.record(s.first, { reason: "Revised.", changeExplanation: "Corrected." }, 1),
    ).toMatchObject({ status: "ok" });

    const current = await getFundingApplicationContent(db, actor, {
      workspaceSlug: s.first.workspaceSlug,
      applicationId: s.first.publicId,
      section: "decision",
    } as never);
    assert(current.status === "ok");
    expect(JSON.parse(current.content)).toMatchObject({
      revision: 2,
      decision: { reason: "Revised.", changeExplanation: "Corrected." },
    });
    const change = await getFundingApplicationContent(db, actor, {
      workspaceSlug: s.first.workspaceSlug,
      applicationId: s.first.publicId,
      section: "decision_change",
      revision: 1,
    } as never);
    assert(change.status === "ok");
    expect(JSON.parse(change.content)).toMatchObject({
      revision: 1,
      decision: { reason: "Meets the round's priorities." },
    });

    const history = await listFundingApplicationHistory(db, actor, {
      workspaceSlug: s.first.workspaceSlug,
      applicationId: s.first.publicId,
      history: "decision",
    } as never);
    assert(history.status === "ok");
    expect(history.entries.map((entry) => [entry.revision, entry.action])).toEqual([
      [1, "decision.recorded"],
      [2, "decision.amended"],
    ]);
  });

  it("lists decisions in activity with the explanation as the reason, filtered by round", async ({
    db,
    scenario: s,
  }) => {
    expect(await s.record(s.first, {})).toMatchObject({ status: "ok" });
    expect(
      await s.record(s.first, { reason: "Revised.", changeExplanation: "Corrected." }, 1),
    ).toMatchObject({ status: "ok" });
    const round = await s.roundPage();
    const activity = await listWorkspaceActivity(db, actor, {
      workspaceSlug: s.first.workspaceSlug,
      roundId: round.round.id,
      limit: 50,
    });
    assert(activity.status === "ok");
    const decisions = activity.entries
      .filter((entry) => entry.action.startsWith("decision."))
      .map((entry) => [entry.action, entry.reason, entry.record?.title]);
    expect(decisions).toEqual([
      ["decision.amended", "Corrected.", "First application"],
      ["decision.recorded", null, "First application"],
    ]);
    const other = await createFundingRound(db, actor, {
      workspaceSlug: s.first.workspaceSlug,
      requestId: randomUUID(),
      title: "Another round",
    });
    assert(other.status === "ok");
    const filtered = await listWorkspaceActivity(db, actor, {
      workspaceSlug: s.first.workspaceSlug,
      roundId: other.publicId,
      limit: 50,
    });
    assert(filtered.status === "ok");
    expect(filtered.entries.filter((entry) => entry.action.startsWith("decision."))).toEqual([]);
  });
});
describe("concurrent commitments", () => {
  const reduceBudget = (
    connection: Database,
    pageInput: { workspaceSlug: string; publicId: string },
  ) =>
    editFundingRound(
      connection,
      actor,
      {
        workspaceSlug: pageInput.workspaceSlug,
        publicId: pageInput.publicId,
        expectedRevision: 0,
        change: { section: "budget", amount: "50.00", reason: "Reduced for the test." },
      },
      roundCommitments,
    );

  it("refuses a budget reduction that a competing decision save has made too low", async ({
    locks,
    rounds,
    scenario: s,
  }) => {
    const reduced = await locks.race(
      (tx) =>
        recordCommitteeDecision(tx, actor, {
          ...s.first,
          expectedRevision: 0,
          decision: decisionOf({ amount: { minorUnits: "6000", currency: "EUR" } }),
        }),
      (connection) => reduceBudget(connection, rounds.pageInput),
    );

    expect(reduced).toMatchObject({ status: "invalid", error: "budget_below_commitments" });
  });

  it("refuses a decision save that a competing budget reduction has made too large", async ({
    locks,
    rounds,
    scenario: s,
  }) => {
    const saved = await locks.race(
      (tx) => reduceBudget(tx, rounds.pageInput),
      (connection) =>
        recordCommitteeDecision(connection, actor, {
          ...s.first,
          expectedRevision: 0,
          decision: decisionOf({ amount: { minorUnits: "6000", currency: "EUR" } }),
        }),
    );

    expect(saved).toMatchObject({ status: "invalid", error: "commitment_exceeds_budget" });
    expect((await s.page(s.first)).decision.versions).toEqual([]);
  });
});
