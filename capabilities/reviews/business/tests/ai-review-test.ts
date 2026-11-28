import { randomUUID } from "node:crypto";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { assert, vi } from "vite-plus/test";

import { createFundingApplication, editFundingApplication } from "@merit/applications/server";
import { noApplicationWork } from "@merit/applications/testing";
import { withDatabase, type DatabaseRunner } from "@merit/db";
import { fromMinorUnits } from "@merit/money";
import { actor, workspaceSlug } from "@merit/organizations/testing/workspace";
import type { AiReviewer, AiReviewerRequest } from "@merit/reviews/domain";
import { runAiReview } from "@merit/reviews/server";
import { createFundingRound, editFundingRound } from "@merit/rounds/server";

import { reviewerTest } from "./reviewer-test";

export const questionId = "9841b190-2a06-5fe1-a7af-5e5b534662c5";

export const criteria = [
  {
    id: "6ab5c8b6-9ad8-5941-b120-30092274597f",
    title: "Community benefit",
    description: "Who gains",
  },
  { id: "dc1f55ac-e713-51a8-8d91-f27f1c3d9959", title: "Feasibility", description: "" },
];

/** A reply that verifies against whatever the model was sent. */
export const validReply = ({ input }: AiReviewerRequest) => ({
  criteria: (input.criteria.length > 0 ? input.criteria.map(({ id }) => id) : [null]).map(
    (criterionId) => ({
      criterionId,
      claims: [
        {
          text: "The workshops use a free venue.",
          citations: [{ source: questionId, quote: "Repair workshops with a free venue" }],
        },
      ],
      gaps: ["No participant numbers."],
      strengths: [],
      weaknesses: [],
      concerns: [],
    }),
  ),
  questions: ["How many people will attend?"],
  reasoning: "A practical plan that needs participant numbers.",
  position: "Fund",
  amount: { minorUnits: "1800000", currency: "EUR" },
});

/** A provider stand-in that records each request it receives. */
export const stub = (review: (request: AiReviewerRequest) => unknown = validReply) => {
  const calls: AiReviewerRequest[] = [];
  const reviewer: AiReviewer = {
    provider: "Test provider",
    model: "test-model",
    review: vi.fn(async (request: AiReviewerRequest) => {
      calls.push(request);
      return review(request);
    }),
  };
  return { reviewer, calls };
};

const noRoundCommitments = async () => fromMinorUnits(0n);

/** AI review scenarios: a consenting workspace, a round with criteria, one application, a manager and a reviewer. */
export const aiReviewTest = reviewerTest.extend(
  "aiReviewSetup",
  async ({ db, database, runtimeUrl }) =>
    async ({ withCriteria = true }: { withCriteria?: boolean } = {}) => {
      const round = await createFundingRound(db, actor, {
        workspaceSlug,
        requestId: randomUUID(),
        title: "AI review round",
      });
      assert(round.status === "ok");
      if (withCriteria) {
        const edited = await editFundingRound(
          db,
          actor,
          {
            workspaceSlug,
            publicId: round.publicId,
            expectedRevision: 0,
            change: { section: "criteria", criteria },
          },
          noRoundCommitments,
        );
        assert(edited.status === "ok");
      }
      const application = await createFundingApplication(db, actor, {
        workspaceSlug,
        publicId: round.publicId,
        requestId: randomUUID(),
        title: "Workshop Saturdays",
        applicant: "Repair Collective",
        requested: "18000",
        answers: [
          { questionId, question: "Plan", response: "Repair workshops with a free venue." },
        ],
      });
      assert(application.status === "ok");
      await database.client.query(
        "INSERT INTO assistant_consents (organization_id) VALUES ('alder')",
      );
      await database.client.query(
        "INSERT INTO app_users (id, name, clerk_user_id) VALUES ('rita','Rita Reviewer','seed_rita')",
      );
      await database.client.query(
        "INSERT INTO memberships (organization_id, user_id, email, role) VALUES ('alder', 'rita', 'rita@example.test', 'reviewer')",
      );

      const address = { workspaceSlug, publicId: application.publicId };

      const runtime = <T>(operation: (db: NodePgDatabase) => Promise<T>) =>
        withDatabase(runtimeUrl, operation);

      const run = (
        reviewer: AiReviewer | undefined,
        options: {
          as?: Parameters<typeof runAiReview>[1];
          onSaved?: () => void;
          runId?: string;
          publicId?: string;
          runner?: DatabaseRunner;
        } = {},
      ) =>
        runAiReview(
          options.runner ?? runtime,
          options.as ?? actor,
          {
            ...address,
            publicId: options.publicId ?? address.publicId,
            runId: options.runId ?? randomUUID(),
          },
          { reviewer, onSaved: options.onSaved },
        );

      const rows = async () =>
        Number(
          (await database.client.query<{ count: string }>("SELECT count(*) FROM ai_reviews"))
            .rows[0]?.count,
        );

      const applicationState = async () => {
        const { rows: found } = await database.client.query<{
          revision: number;
          material_version: number;
        }>("SELECT revision, material_version FROM application_cases WHERE id = $1", [
          address.publicId,
        ]);
        assert(found[0]);
        return { revision: found[0].revision, version: found[0].material_version };
      };

      const edit = async (change: Parameters<typeof editFundingApplication>[2]["change"]) =>
        editFundingApplication(
          db,
          actor,
          { ...address, expectedRevision: (await applicationState()).revision, change },
          noApplicationWork,
        );

      return { round, address, runtime, run, rows, edit, applicationState };
    },
);
