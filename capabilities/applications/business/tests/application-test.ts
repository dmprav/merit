import { randomUUID } from "node:crypto";

import { assert } from "vite-plus/test";

import { createFundingApplication } from "@merit/applications/server";
import type { ApplicationWork } from "@merit/applications/server/grant-work";
import type { Database } from "@merit/db";
import { actor } from "@merit/organizations/testing/workspace";
import { roundTest } from "@merit/rounds/testing";

/** An application with no recorded downstream work. */
export const noApplicationWork: ApplicationWork = {
  reviews: { hasActivity: async () => false, closeForWithdrawal: async () => {} },
  recommendations: {
    hasRecommendation: async () => false,
    allocationTotalProblem: async () => null,
  },
  decisions: { hasDecision: async () => false, hasCommitment: async () => false },
};

export const applicationFixtures = (db: Database, roundId: string) => {
  const createApplication = async (title: string, requested: string | null = "80.00") => {
    const created = await createFundingApplication(db, actor, {
      workspaceSlug: "alder",
      publicId: roundId,
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

  return { createApplication };
};

export const applicationTest = roundTest.extend("applications", async ({ db, rounds }) =>
  applicationFixtures(db, rounds.pageInput.publicId),
);
