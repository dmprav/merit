import { randomUUID } from "node:crypto";

import { assert } from "vite-plus/test";

import { createFundingApplication, editFundingApplication } from "@merit/applications/server";
import { type PublicRoundRequest } from "@merit/grantmaking/api";
import { actor, workspaceTest } from "@merit/organizations/testing/workspace";
import { saveFundingRecommendation } from "@merit/recommendations/server";
import { createFundingRound } from "@merit/rounds/server";

import { applicationWork } from "../src/server/persistence/commands/application-work";

export const roundTest = workspaceTest.extend("rounds", { auto: true }, async ({ db }) => {
  const addresses: PublicRoundRequest[] = [];
  for (const workspace of [
    { id: "alder", userId: "dana" },
    { id: "birch", userId: "birch-manager" },
  ]) {
    const created = await createFundingRound(
      db,
      { userId: workspace.userId },
      {
        workspaceSlug: workspace.id,
        requestId: randomUUID(),
        title: "Community grants",
        budget: "100.00",
        meetingDate: "2027-04-15",
      },
    );
    assert(created.status === "ok", "Could not create the round fixture");
    if (workspace.id === "alder") {
      addresses.push({ workspaceSlug: "alder", publicId: created.publicId, kind: "round" });
    }
  }

  const [pageInput] = addresses;
  assert.isDefined(pageInput, "Could not create the Alder round fixture");

  const createApplication = async (title: string, requested: string | null = "80.00") => {
    const created = await createFundingApplication(db, actor, {
      workspaceSlug: "alder",
      publicId: pageInput.publicId,
      requestId: randomUUID(),
      title,
      applicant: "Community group",
      ...(requested === null ? {} : { requested }),
      answers: [
        {
          questionId: "0e03fcf9-a422-5c35-9ac4-27be275d2f3e",
          question: "Purpose",
          response: "Weekly community activities.",
        },
      ],
    });
    assert(created.status === "ok", "Could not create the application fixture");
    return { workspaceSlug: "alder", publicId: created.publicId };
  };

  const recommendApplication = async (
    address: { workspaceSlug: string; publicId: string },
    minorUnits: string,
  ) => {
    const ready = await editFundingApplication(
      db,
      actor,
      {
        ...address,
        expectedRevision: 0,
        change: { action: "mark_ready" },
      },
      applicationWork,
    );
    assert(ready.status === "ok", "Could not mark the application fixture ready");
    const recommended = await saveFundingRecommendation(db, actor, {
      ...address,
      expectedRevision: 0,
      expectedApplicationVersion: 1,
      recommendation: {
        position: "Fund",
        allocation: { currency: "EUR", minorUnits },
        reasoning: "Support the community activities.",
      },
    });
    assert(recommended.status === "ok", "Could not recommend the application fixture");
  };

  return { pageInput, createApplication, recommendApplication };
});
