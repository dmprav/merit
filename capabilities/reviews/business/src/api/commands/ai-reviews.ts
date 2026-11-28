import { z } from "zod";

import { materialVersionSchema } from "@merit/applications/domain";
import { publicIdSchema } from "@merit/db/identifiers";
import { workspaceSlugSchema } from "@merit/organizations/api";
import { criteriaVersionSchema } from "@merit/rounds/domain";

import { aiReviewEntrySchema, type AiReviewAvailability } from "../../domain/ai-review";

/** Running and reading address one application, exactly like recording an assessment. */
export const aiReviewRequestSchema = z.strictObject({
  workspaceSlug: workspaceSlugSchema,
  publicId: publicIdSchema,
});

export type AiReviewRequest = z.infer<typeof aiReviewRequestSchema>;

/**
 * A run names itself, so a retry of the same run, after a lost response or a worker that died
 * after saving, returns the review it saved instead of asking the provider again. Every caller
 * generates one identity per run and reuses it only to retry that run.
 *
 * A caller that showed a person the material it would send names the application and criteria
 * versions it showed. A run that finds either has moved on sends nothing and answers `conflict`.
 * Callers that send the current material, as the web and MCP do, name none.
 */
export const aiReviewRunRequestSchema = aiReviewRequestSchema.extend({
  runId: z.uuid(),
  expectedApplicationVersion: materialVersionSchema.optional(),
  expectedCriteriaVersion: criteriaVersionSchema.optional(),
});

export type AiReviewRunRequest = z.infer<typeof aiReviewRunRequestSchema>;

/** A run already made, found by its identity. */
export const aiReviewRunLookupSchema = aiReviewRunRequestSchema.pick({
  workspaceSlug: true,
  publicId: true,
  runId: true,
});

export type AiReviewRunLookup = z.infer<typeof aiReviewRunLookupSchema>;

/** The reasons a run is refused; `available` is the absence of one. */
export type AiReviewUnavailable = Exclude<AiReviewAvailability, "available">;

export const aiReviewOkSchema = z.object({ status: z.literal("ok"), review: aiReviewEntrySchema });

export type AiReviewRunResult =
  | { status: "ok"; review: z.output<typeof aiReviewEntrySchema> }
  | { status: "not_found" }
  | { status: "not_available"; availability: AiReviewUnavailable }
  /** The application or its criteria changed since the caller's expected versions; nothing was sent. */
  | { status: "conflict" }
  /** The run was stopped before it saved; nothing was saved. */
  | { status: "stopped" }
  /** The provider, its output or a citation could not be trusted. Nothing was saved. */
  | { status: "failed" };

export type AiReviewReadResult =
  | {
      status: "ok";
      applicationVersion: number;
      reviews: z.output<typeof aiReviewEntrySchema>[];
    }
  | { status: "not_found" };

/** `not_found` also answers a run that saved nothing, so a lookup never says whether one is under way. */
export type AiReviewRunLookupResult =
  | { status: "ok"; review: z.output<typeof aiReviewEntrySchema> }
  | { status: "not_found" };
