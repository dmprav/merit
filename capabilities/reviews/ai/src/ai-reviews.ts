import { z } from "zod";

import { defineActorTool } from "@merit/ai";
import type { Actor } from "@merit/auth";
import { publicIdSchema } from "@merit/db/identifiers";
import { aiReviewRequestSchema, type ReviewService } from "@merit/reviews/api";
import { aiReviewAvailabilitySchema, aiReviewEntrySchema } from "@merit/reviews/domain";

const input = aiReviewRequestSchema
  .omit({ publicId: true })
  .extend({ applicationId: publicIdSchema });

const runInput = input.extend({ runId: z.uuid().optional() });

const notFound = z.object({ status: z.literal("not_found") });

const runErrorSchema = z.union([
  notFound,
  z.object({
    status: z.literal("not_available"),
    availability: aiReviewAvailabilitySchema.exclude(["available"]),
  }),
  z.object({ status: z.literal("failed") }),
]);

/** AI reviews are program-manager work: both tools are absent from a reviewer's catalog and refuse them. */
export const createAiReviewTools = (
  actor: Actor,
  reviews: Pick<ReviewService, "runAiReview" | "readAiReviews">,
) => [
  defineActorTool(
    actor,
    "run_ai_review",
    {
      errorSchema: runErrorSchema,
      inputSchema: runInput,
      outputSchema: z.object({
        status: z.literal("ok"),
        applicationId: publicIdSchema,
        review: aiReviewEntrySchema,
      }),
      description:
        "For program managers: ask Merit AI to review an application against its round's criteria and save the result. Sends the application's current material and the round's criteria to the configured model provider, which can take up to about two minutes. Returns the saved AI review: cited evidence, gaps, strengths, weaknesses, concerns and questions for the applicant per criterion, then an overall funding position and amount. An AI review is Merit AI's interpretation of the material, never an assessment by a reviewer. It needs the workspace's AI consent, a configured provider, and an application that is not withdrawn; otherwise status is not_available with the reason. A failed run, including unverifiable citations, saves nothing and returns status failed; running again saves a new review. Optional runId (a UUID you generate) names the run: repeating a run with the same runId returns the review it already saved instead of asking the provider again, so reuse it only to retry that run after a lost response.",
    },
    async ({ applicationId, workspaceSlug, runId }) => {
      const result = await reviews.runAiReview(actor, {
        workspaceSlug,
        publicId: applicationId,
        // One identity per run. Sending it again retries that run without a second review.
        runId: runId ?? crypto.randomUUID(),
      });
      return result.status === "ok"
        ? { status: "ok" as const, applicationId, review: result.review }
        : result;
    },
  ),
  defineActorTool(
    actor,
    "read_ai_reviews",
    {
      errorSchema: notFound,
      inputSchema: input,
      outputSchema: z.object({
        status: z.literal("ok"),
        applicationId: publicIdSchema,
        applicationVersion: z.number().int().positive(),
        aiReviews: z.array(aiReviewEntrySchema),
      }),
      description:
        "For program managers: read every saved AI review of an application, newest first, each with its model, who ran it, funding position and amount, reasoning, per-criterion evidence with verbatim citations, questions for the applicant and freshness against the current application and criteria. Cite an AI review as an AI review; it is not application material and not an assessment.",
    },
    async ({ applicationId, workspaceSlug }) => {
      const result = await reviews.readAiReviews(actor, { workspaceSlug, publicId: applicationId });
      return result.status === "ok"
        ? {
            status: "ok" as const,
            applicationId,
            applicationVersion: result.applicationVersion,
            aiReviews: result.reviews,
          }
        : result;
    },
  ),
];
