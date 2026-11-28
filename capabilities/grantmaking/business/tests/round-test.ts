import { assert } from "vite-plus/test";

import { editFundingApplication } from "@merit/applications/server";
import { applicationFixtures } from "@merit/applications/testing";
import { actor, workspaceTest } from "@merit/organizations/testing/workspace";
import { saveFundingRecommendation } from "@merit/recommendations/server";
import { isCurrentAssessment } from "@merit/reviews/server/integrations";
import { seedTestRounds } from "@merit/rounds/testing";

import { applicationWork } from "./application-work";

export const roundTest = workspaceTest.extend("rounds", { auto: true }, async ({ db }) => {
  const { pageInput } = await seedTestRounds(db);
  const { createApplication } = applicationFixtures(db, pageInput.publicId);

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
    const recommended = await saveFundingRecommendation(
      db,
      actor,
      {
        ...address,
        expectedRevision: 0,
        expectedApplicationVersion: 1,
        recommendation: {
          position: "Fund",
          allocation: { currency: "EUR", minorUnits },
          reasoning: "Support the community activities.",
        },
      },
      isCurrentAssessment,
    );
    assert(recommended.status === "ok", "Could not recommend the application fixture");
  };

  return { pageInput, createApplication, recommendApplication };
});
