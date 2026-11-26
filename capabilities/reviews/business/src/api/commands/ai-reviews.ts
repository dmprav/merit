import { z } from "zod";

import { publicIdSchema } from "@merit/db/identifiers";
import { workspaceSlugSchema } from "@merit/organizations/api";

import { aiReviewEntrySchema, type AiReviewAvailability } from "../../domain/ai-review";

/** Running and reading address one application, exactly like recording an assessment. */
export const aiReviewRequestSchema = z.strictObject({
  workspaceSlug: workspaceSlugSchema,
  publicId: publicIdSchema,
});

export type AiReviewRequest = z.infer<typeof aiReviewRequestSchema>;

/** The reasons a run is refused; `available` is the absence of one. */
export type AiReviewUnavailable = Exclude<AiReviewAvailability, "available">;

export const aiReviewOkSchema = z.object({ status: z.literal("ok"), review: aiReviewEntrySchema });

export type AiReviewRunResult =
  | { status: "ok"; review: z.output<typeof aiReviewEntrySchema> }
  | { status: "not_found" }
  | { status: "not_available"; availability: AiReviewUnavailable }
  /** The provider, its output or a citation could not be trusted. Nothing was saved. */
  | { status: "failed" };

export type AiReviewReadResult =
  | {
      status: "ok";
      applicationVersion: number;
      reviews: z.output<typeof aiReviewEntrySchema>[];
    }
  | { status: "not_found" };
