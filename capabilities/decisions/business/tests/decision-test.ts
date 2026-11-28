import { assert } from "vite-plus/test";

import { editFundingApplication } from "@merit/applications/server";
import { noApplicationWork } from "@merit/applications/testing";
import { type Database } from "@merit/db";
import type { RecordDecisionRequest } from "@merit/decisions/api";
import { recordCommitteeDecision } from "@merit/decisions/server";
import { actor } from "@merit/organizations/testing/workspace";

export const today = () => new Date().toISOString().slice(0, 10);

export const decisionOf = (
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

type Address = { workspaceSlug: string; publicId: string };

export const createDecisionCases = async (
  db: Database,
  createApplication: (title: string) => Promise<Address>,
) => {
  const ready = async (title: string) => {
    const address = await createApplication(title);
    const marked = await editFundingApplication(
      db,
      actor,
      { ...address, expectedRevision: 0, change: { action: "mark_ready" } },
      noApplicationWork,
    );
    assert(marked.status === "ok", "Could not mark the fixture ready");
    return address;
  };

  const first = await ready("First application");
  const second = await ready("Second application");
  const preparing = await createApplication("Still in preparation");

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

  return { first, second, preparing, record };
};
