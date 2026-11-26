import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { assert, describe, expect } from "vite-plus/test";

import { createFundingApplication, editFundingApplication } from "@merit/applications/server";
import { withDatabase, type Database } from "@merit/db";
import type { RecordDecisionRequest } from "@merit/decisions/api";
import { recordCommitteeDecision } from "@merit/decisions/server";
import { encodeMoney } from "@merit/money";
import { actor } from "@merit/organizations/testing/workspace";
import { readWorkspace } from "@merit/organizations/transactions";
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
import { recordedEvents, withAuditFailure } from "./audit-events";
import { roundTest } from "./round-test";

const today = () => new Date().toISOString().slice(0, 10);

const decisionOf = (
  overrides: Partial<RecordDecisionRequest["decision"]> = {},
): RecordDecisionRequest["decision"] => ({
  outcome: "Fund",
  amount: { minorUnits: "5000", currency: "EUR" },
  conditions: "",
  reason: "Meets the round's priorities.",
  decidedBy: "Funding committee",
  decisionDate: today(),
  ...overrides,
});

// The round budget is €100.00 and each application requests €80.00.
const it = roundTest.extend("scenario", async ({ db, database, rounds }) => {
  const ready = async (title: string) => {
    const address = await rounds.createApplication(title);
    const marked = await editFundingApplication(
      db,
      actor,
      { ...address, expectedRevision: 0, change: { action: "mark_ready" } },
      applicationWork,
    );
    assert(marked.status === "ok", "Could not mark the fixture ready");
    return address;
  };

  const first = await ready("First application");
  const second = await ready("Second application");
  const preparing = await rounds.createApplication("Still in preparation");

  const record = (
    address: { workspaceSlug: string; publicId: string },
    decision: Partial<RecordDecisionRequest["decision"]>,
    expectedRevision = 0,
    as: Parameters<typeof recordCommitteeDecision>[1] = actor,
  ) =>
    recordCommitteeDecision(db, as, {
      ...address,
      expectedRevision,
      decision: decisionOf(decision),
    });

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

  return { first, second, preparing, record, page, roundPage, edit, budget, database };
});

const minor = (value: { minorUnits: string }) => value.minorUnits;

describe("committee decisions", () => {
  it("records a first decision with its recorder, budget effect, history, and audit event", async ({
    database,
    scenario: s,
  }) => {
    const saved = await s.record(s.first, {});
    assert(saved.status === "ok");
    expect(saved.recorded).toBe(true);
    expect(saved.decision.revision).toBe(1);
    expect(saved.decision.decision).toMatchObject({
      outcome: "Fund",
      decidedBy: "Funding committee",
      recorder: { userId: actor.userId, provenance: { interface: "web" } },
      applicationVersion: 1,
    });
    expect(encodeMoney(saved.totals.committed)).toEqual({ minorUnits: "5000", currency: "EUR" });
    expect(encodeMoney(saved.totals.available!).minorUnits).toBe("5000");

    const read = await s.page(s.first);
    expect(read.decision.revision).toBe(1);
    expect(read.decision.versions).toHaveLength(1);
    expect(read.decision.versions[0]).toMatchObject({
      revision: 1,
      decision: { outcome: "Fund", amount: { minorUnits: "5000" } },
    });
    expect(encodeMoney(read.round.totals.committed).minorUnits).toBe("5000");
    expect(encodeMoney(read.round.totals.proposed).minorUnits).toBe("0");

    expect(await recordedEvents(database.client, "action like 'decision.%'")).toEqual([
      `decision.recorded decision/${s.first.publicId}@1`,
    ]);
    const { rows } = await database.client.query<{ round_id: string | null; case_id: string }>(
      "SELECT round_id, case_id FROM audit_events WHERE action = 'decision.recorded'",
    );
    expect(rows.map((row) => row.case_id)).toEqual([s.first.publicId]);
    expect(rows[0]?.round_id).toBeTruthy();
  });

  it("records the decision without requiring or changing a manager recommendation", async ({
    scenario: s,
  }) => {
    const before = await s.page(s.first);
    expect(before.application.managerRecommendation).toBeNull();
    expect(await s.record(s.first, {})).toMatchObject({ status: "ok" });
    const after = await s.page(s.first);
    expect(after.application.managerRecommendation).toBeNull();
    expect(after.recommendationVersion).toBe(0);
    expect(encodeMoney(after.round.totals.proposed).minorUnits).toBe("0");
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

  it("enforces the outcome, amount, and conditions rules", async ({ scenario: s }) => {
    const invalid = (error: string) => ({ status: "invalid", error });

    expect(await s.record(s.first, { amount: { minorUnits: "0", currency: "EUR" } })).toEqual(
      invalid("positive_amount"),
    );
    expect(await s.record(s.first, { outcome: "Fund with conditions" })).toEqual(
      invalid("conditions_required"),
    );
    expect(await s.record(s.first, { conditions: "Match funding." })).toEqual(
      invalid("conditions_not_allowed"),
    );
    expect(await s.record(s.first, { outcome: "Defer" })).toEqual(invalid("unfunded_amount"));
    expect(
      await s.record(s.first, { outcome: "Decline", amount: { minorUnits: "1", currency: "EUR" } }),
    ).toEqual(invalid("unfunded_amount"));
    expect(await s.record(s.first, { reason: "  " })).toEqual(invalid("reason_required"));
    expect(await s.record(s.first, { decidedBy: " " })).toEqual(invalid("decided_by_required"));
    expect(await s.record(s.first, { decisionDate: "2999-01-01" })).toEqual(
      invalid("decision_date_in_future"),
    );
    expect(await s.record(s.first, { amount: { minorUnits: "-5", currency: "EUR" } })).toEqual(
      invalid("invalid_decision"),
    );
    expect((await s.page(s.first)).decision.versions).toEqual([]);
  });

  it("requires ready material to fund, but not to defer or decline", async ({ scenario: s }) => {
    expect(await s.record(s.preparing, {})).toEqual({
      status: "invalid",
      error: "application_not_ready",
    });
    expect(
      await s.record(s.preparing, {
        outcome: "Defer",
        amount: { minorUnits: "0", currency: "EUR" },
      }),
    ).toMatchObject({ status: "ok" });
  });

  it("holds funding to the round budget and counts conditional awards in full", async ({
    scenario: s,
  }) => {
    // €100 budget: €50 award and €30 conditional award leave €20 available.
    expect(await s.record(s.first, {})).toMatchObject({ status: "ok" });
    const conditional = await s.record(s.second, {
      outcome: "Fund with conditions",
      amount: { minorUnits: "3000", currency: "EUR" },
      conditions: "Confirm the venue.",
    });
    assert(conditional.status === "ok");
    expect(encodeMoney(conditional.totals.available!).minorUnits).toBe("2000");

    const third = await s.record(s.preparing, {});
    expect(third).toEqual({ status: "invalid", error: "application_not_ready" });

    const rejected = await s.record(
      s.second,
      {
        amount: { minorUnits: "6000", currency: "EUR" },
        outcome: "Fund",
        conditions: "",
        changeExplanation: "Increase.",
      },
      1,
    );
    assert(rejected.status === "invalid" && rejected.error === "commitment_exceeds_budget");
    expect(encodeMoney(rejected.budget!).minorUnits).toBe("10000");
    expect(encodeMoney(rejected.committed).minorUnits).toBe("11000");
    expect(encodeMoney(rejected.excess!).minorUnits).toBe("1000");
  });

  it("rejects a commitment above the available budget with the excess", async ({ scenario: s }) => {
    expect(
      await s.record(s.first, { amount: { minorUnits: "6000", currency: "EUR" } }),
    ).toMatchObject({
      status: "ok",
    });
    const result = await s.record(s.second, { amount: { minorUnits: "5000", currency: "EUR" } });
    assert(result.status === "invalid" && result.error === "commitment_exceeds_budget");
    expect(result.excess && minor(encodeMoney(result.excess))).toBe("1000");
    expect(minor(encodeMoney(result.committed))).toBe("11000");
    expect((await s.page(s.second)).decision.versions).toEqual([]);
  });

  it("never blocks a deferral or decline on budget, and requires a budget to fund", async ({
    scenario: s,
  }) => {
    expect(
      await s.record(s.first, { amount: { minorUnits: "10000", currency: "EUR" } }),
    ).toMatchObject({
      status: "ok",
    });
    expect(
      await s.record(s.second, {
        outcome: "Decline",
        amount: { minorUnits: "0", currency: "EUR" },
      }),
    ).toMatchObject({ status: "ok" });

    // Removing the budget while anything is committed is refused.
    const removal = await s.budget("");
    expect(removal).toEqual({
      status: "invalid",
      error: "budget_below_commitments",
      committed: { minorUnits: "10000", currency: "EUR" },
    });
  });

  it("rejects funding when the round has no budget", async ({ scenario: s }) => {
    expect(await s.budget("")).toMatchObject({ status: "ok" });
    const result = await s.record(s.first, {});
    assert(result.status === "invalid" && result.error === "budget_required");
    expect(result.budget).toBeNull();
    expect(result.excess).toBeNull();
    expect(encodeMoney(result.committed)).toEqual({ minorUnits: "5000", currency: "EUR" });
  });

  it("refuses a round budget below the committed total and allows one that covers it", async ({
    scenario: s,
  }) => {
    expect(
      await s.record(s.first, { amount: { minorUnits: "6000", currency: "EUR" } }),
    ).toMatchObject({
      status: "ok",
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

  it("appends versions that need an explanation, and treats an unchanged save as a no-op", async ({
    database,
    scenario: s,
  }) => {
    expect(await s.record(s.first, {})).toMatchObject({ status: "ok" });
    expect(await s.record(s.first, { amount: { minorUnits: "4000", currency: "EUR" } }, 1)).toEqual(
      { status: "invalid", error: "change_explanation_required" },
    );

    const amended = await s.record(
      s.first,
      { amount: { minorUnits: "4000", currency: "EUR" }, changeExplanation: "Budget reduced." },
      1,
    );
    assert(amended.status === "ok");
    expect(amended.decision.revision).toBe(2);
    expect(amended.decision.decision.changeExplanation).toBe("Budget reduced.");

    const unchanged = await s.record(
      s.first,
      { amount: { minorUnits: "4000", currency: "EUR" } },
      2,
    );
    assert(unchanged.status === "ok");
    expect(unchanged.recorded).toBe(false);
    expect(unchanged.decision.revision).toBe(2);

    expect(await recordedEvents(database.client, "action like 'decision.%'")).toEqual([
      `decision.amended decision/${s.first.publicId}@2`,
      `decision.recorded decision/${s.first.publicId}@1`,
    ]);
    const read = await s.page(s.first);
    expect(read.decision.versions.map((version) => version.revision)).toEqual([2, 1]);
    expect(encodeMoney(read.round.totals.committed).minorUnits).toBe("4000");
  });

  it("allows every outcome to change, including a final one, with an explanation", async ({
    scenario: s,
  }) => {
    expect(
      await s.record(s.first, { outcome: "Decline", amount: { minorUnits: "0", currency: "EUR" } }),
    ).toMatchObject({ status: "ok" });
    expect(
      await s.record(
        s.first,
        {
          outcome: "Fund with conditions",
          conditions: "Secure match funding.",
          changeExplanation: "A later meeting reconsidered.",
        },
        1,
      ),
    ).toMatchObject({ status: "ok", decision: { revision: 2 } });
  });

  it("returns a conflict for a stale revision without writing", async ({ scenario: s }) => {
    expect(await s.record(s.first, {})).toMatchObject({ status: "ok" });
    expect(await s.record(s.first, { reason: "Another." }, 0)).toEqual({ status: "conflict" });
    expect(
      await s.record(s.first, { reason: "Another.", changeExplanation: "Changed." }, 5),
    ).toEqual({ status: "conflict" });
    expect((await s.page(s.first)).decision.revision).toBe(1);
  });

  it("denies other workspaces and non-members", async ({ scenario: s }) => {
    expect(await s.record(s.first, {}, 0, { userId: "birch-manager" })).toEqual({
      status: "not_found",
    });
    expect(await s.record(s.first, {}, 0, { userId: "nobody" })).toEqual({ status: "not_found" });
  });

  it("denies an active member of the workspace who is not a manager", async ({
    database,
    scenario: s,
  }) => {
    await database.client.query(
      "INSERT INTO app_users (id, clerk_user_id, name) VALUES ('alder-member', 'seed_member', 'Alder member')",
    );
    await database.client.query(
      "INSERT INTO memberships (user_id, organization_id, role, administration, email) VALUES ('alder-member', 'alder', 'member', 'none', 'member@example.test')",
    );

    const denied = await s.record(s.first, {}, 0, { userId: "alder-member" });

    expect(denied.status).not.toBe("ok");
    expect((await s.page(s.first)).decision.versions).toEqual([]);
    expect((await database.client.query("SELECT 1 FROM committee_decision_versions")).rows).toEqual(
      [],
    );
  });

  it("records MCP provenance for the recorder", async ({ database, scenario: s }) => {
    const saved = await s.record(s.first, {}, 0, {
      ...actor,
      provenance: { interface: "mcp", clientId: "claude" },
    });
    assert(saved.status === "ok");
    expect(saved.decision.decision.recorder.provenance).toEqual({
      interface: "mcp",
      clientId: "claude",
    });
    expect(
      (
        await database.client.query(
          "SELECT provenance_interface, provenance_client_id FROM committee_decision_versions",
        )
      ).rows,
    ).toEqual([{ provenance_interface: "mcp", provenance_client_id: "claude" }]);
  });

  it("stores the recording time that the save returns", async ({ database, scenario: s }) => {
    const saved = await s.record(s.first, {});
    assert(saved.status === "ok");

    const { rows } = await database.client.query<{ recorded_at: Date }>(
      "SELECT recorded_at FROM committee_decision_versions",
    );
    expect(rows.map((row) => row.recorded_at.toISOString())).toEqual([
      saved.decision.decision.recordedAt,
    ]);
  });

  it("keeps saved versions immutable", async ({ database, scenario: s }) => {
    expect(await s.record(s.first, {})).toMatchObject({ status: "ok" });
    await expect(
      database.client.query("UPDATE committee_decision_versions SET reason = 'Edited'"),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      database.client.query("DELETE FROM committee_decision_versions"),
    ).rejects.toMatchObject({ code: "23514" });
  });

  const brokenRows: [string, Record<string, unknown>][] = [
    ["a funded outcome with no amount", { outcome: "Fund", amount_minor_units: 0 }],
    ["a deferral that reserves funding", { outcome: "Defer", amount_minor_units: 1 }],
    ["a decline that reserves funding", { outcome: "Decline", amount_minor_units: 1 }],
    ["conditional funding without conditions", { outcome: "Fund with conditions" }],
    ["conditions on funding without conditions", { conditions: "Match funding." }],
    ["a blank reason", { reason: "  " }],
    ["a blank deciding body", { decided_by: "  " }],
    ["an explanation on the first version", { change_explanation: "Why." }],
    ["a later version without an explanation", { revision: 2 }],
    ["a later version with a blank explanation", { revision: 2, change_explanation: " " }],
    ["a client-less MCP recorder", { provenance_interface: "mcp" }],
    ["a client without an interface", { provenance_client_id: "claude" }],
    ["a funded amount that is not a number", { outcome: "Fund", amount_minor_units: "NaN" }],
    ["an unknown outcome", { outcome: "Approve" }],
    ["another currency", { amount_currency: "USD" }],
    ["a revision of zero", { revision: 0 }],
  ];
  for (const [name, overrides] of brokenRows) {
    it(`rejects a stored row with ${name}`, async ({ database, scenario: s }) => {
      const row = {
        case_id: s.first.publicId,
        revision: 1,
        outcome: "Fund",
        amount_minor_units: 5000,
        amount_currency: "EUR",
        conditions: null,
        reason: "Meets the round's priorities.",
        decided_by: "Funding committee",
        decision_date: "2026-01-18",
        change_explanation: null,
        actor_name: "Dana Reed",
        provenance_interface: null,
        provenance_client_id: null,
        ...overrides,
      };
      const columns = Object.keys(row);
      const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
      await expect(
        database.client.query(
          `INSERT INTO committee_decision_versions (${columns.join(", ")}) VALUES (${placeholders})`,
          Object.values(row),
        ),
      ).rejects.toMatchObject({ code: "23514" });
    });
  }

  it("protects decision rows with workspace row security", async ({ database }) => {
    const { rows } = await database.client.query<{ rowsecurity: boolean }>(
      "SELECT relrowsecurity AS rowsecurity FROM pg_class WHERE relname = 'committee_decision_versions'",
    );
    expect(rows).toEqual([{ rowsecurity: true }]);
  });

  it("shows a workspace transaction only its own workspace's decisions", async ({
    database,
    db,
    scenario: s,
  }) => {
    // Dana manages both workspaces, so only the transaction's workspace separates their rows.
    await database.client.query(
      "INSERT INTO memberships (user_id, organization_id, role) VALUES ('dana', 'birch', 'program_manager')",
    );
    const round = await createFundingRound(db, actor, {
      workspaceSlug: "birch",
      requestId: randomUUID(),
      title: "Birch round",
      budget: "100.00",
    });
    assert(round.status === "ok");
    const created = await createFundingApplication(db, actor, {
      workspaceSlug: "birch",
      publicId: round.publicId,
      requestId: randomUUID(),
      title: "Birch application",
      applicant: "Community group",
      requested: "80.00",
      answers: [
        {
          questionId: "0e03fcf9-a422-5c35-9ac4-27be275d2f3e",
          question: "Purpose",
          response: "Weekly community activities.",
        },
      ],
    });
    assert(created.status === "ok");
    const birch = { workspaceSlug: "birch", publicId: created.publicId };
    const ready = await editFundingApplication(
      db,
      actor,
      { ...birch, expectedRevision: 0, change: { action: "mark_ready" } },
      applicationWork,
    );
    assert(ready.status === "ok");
    expect(await s.record(birch, {})).toMatchObject({ status: "ok" });
    expect(await s.record(s.first, {})).toMatchObject({ status: "ok" });

    const runtimeUrl = await database.createRuntimeConnection();

    const visible = async (slug: string) =>
      withDatabase(runtimeUrl, (runtime) =>
        readWorkspace(runtime, actor.userId, slug, async (tx) =>
          (
            await tx.execute<{ case_id: string }>(
              sql`select case_id from committee_decision_versions`,
            )
          ).rows.map((row) => row.case_id),
        ),
      );

    expect(await visible("alder")).toEqual([s.first.publicId]);
    expect(await visible("birch")).toEqual([birch.publicId]);
  });

  it("leaves nothing saved when the audit event fails", async ({ database, scenario: s }) => {
    await expect(
      withAuditFailure(database.client, () => s.record(s.first, {})),
    ).rejects.toMatchObject({ cause: { message: "Audit recording failed" } });
    expect((await s.page(s.first)).decision.versions).toEqual([]);
    expect((await database.client.query("SELECT 1 FROM committee_decision_versions")).rows).toEqual(
      [],
    );
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

  it("releases a commitment when a Fund decision is superseded by a decline", async ({
    scenario: s,
  }) => {
    const funded = await s.record(s.first, {});
    assert(funded.status === "ok");
    expect(encodeMoney(funded.totals.committed).minorUnits).toBe("5000");
    expect(encodeMoney(funded.totals.available!).minorUnits).toBe("5000");

    const declined = await s.record(
      s.first,
      {
        outcome: "Decline",
        amount: { minorUnits: "0", currency: "EUR" },
        changeExplanation: "The applicant cannot proceed.",
      },
      1,
    );
    assert(declined.status === "ok");
    expect(encodeMoney(declined.totals.committed).minorUnits).toBe("0");
    expect(encodeMoney(declined.totals.available!).minorUnits).toBe("10000");

    const page = await s.roundPage();
    expect(encodeMoney(page.round.totals.committed).minorUnits).toBe("0");
    expect(encodeMoney(page.round.totals.available!).minorUnits).toBe("10000");
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

/**
 * Holds `first` open in a transaction, starts `competing` on another connection, and returns
 * its result once the first commits. The competitor must wait on the first transaction, so a
 * weaker lock than the one decisions rely on fails here instead of passing by luck.
 */
const raceHeld = async <T>(
  database: { connectionString: string; client: Client },
  first: (tx: Database) => Promise<{ status: string }>,
  competing: (connection: Database) => Promise<T>,
) => {
  const options = { connectionString: database.connectionString, statement_timeout: 5000 };
  const holder = new Client(options);
  const competitor = new Client(options);
  try {
    await Promise.all([holder.connect(), competitor.connect()]);

    const pid = async (client: Client) => {
      const row = (await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0];
      assert(row, "Could not read the backend");
      return row.pid;
    };

    const [holderPid, competitorPid] = [await pid(holder), await pid(competitor)];
    return await holdAndRace({
      database,
      holder,
      competitor,
      holderPid,
      competitorPid,
      first,
      competing,
    });
  } finally {
    await Promise.all([holder.end(), competitor.end()]);
  }
};

const holdAndRace = async <T>(input: {
  database: { client: Client };
  holder: Client;
  competitor: Client;
  holderPid: number;
  competitorPid: number;
  first: (tx: Database) => Promise<{ status: string }>;
  competing: (connection: Database) => Promise<T>;
}) => {
  const { database, holder, competitor, holderPid, competitorPid, first, competing } = input;
  let release!: () => void;
  let opened!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  const held = new Promise<void>((resolve) => (opened = resolve));
  const transaction = drizzle(holder).transaction(async (tx) => {
    expect(await first(tx)).toMatchObject({ status: "ok" });
    opened();
    await released;
  });
  const settled = transaction.catch(() => undefined);
  try {
    await Promise.race([held, transaction]);
    const result = competing(drizzle(competitor));
    const settledResult = result.catch(() => undefined);
    await expect
      .poll(
        async () =>
          (
            await database.client.query<{ blockers: number[] }>(
              "SELECT pg_blocking_pids($1) AS blockers",
              [competitorPid],
            )
          ).rows[0]?.blockers,
        { timeout: 2500 },
      )
      .toContain(holderPid);
    release();
    await transaction;
    const outcome = await result;
    await settledResult;
    return outcome;
  } finally {
    release();
    await settled;
  }
};

describe("concurrent commitments", () => {
  it("lets only the first of two competing funding saves in a round fit the budget", async ({
    database,
    scenario: s,
  }) => {
    const fund = (connection: Database, address: typeof s.first) =>
      recordCommitteeDecision(connection, actor, {
        ...address,
        expectedRevision: 0,
        decision: decisionOf({ amount: { minorUnits: "6000", currency: "EUR" } }),
      });

    // The second €60.00 fits the €100.00 budget only if the first, still uncommitted, is ignored.
    const second = await raceHeld(
      database,
      (tx) => fund(tx, s.first),
      (connection) => fund(connection, s.second),
    );

    expect(second).toMatchObject({ status: "invalid", error: "commitment_exceeds_budget" });
    expect((await s.page(s.second)).decision.versions).toEqual([]);
    expect((await s.page(s.first)).decision.versions).toHaveLength(1);
  });

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
    database,
    rounds,
    scenario: s,
  }) => {
    const reduced = await raceHeld(
      database,
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
    database,
    rounds,
    scenario: s,
  }) => {
    const saved = await raceHeld(
      database,
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
