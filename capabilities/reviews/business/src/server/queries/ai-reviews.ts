import type { Actor } from "@merit/auth";
import type { Database } from "@merit/db";
import { readWorkspace } from "@merit/organizations/transactions";

import { aiReviewRequestSchema, type AiReviewRequest } from "../../api/commands/ai-reviews";
import { aiReviewEntry } from "../../domain/ai-review";
import { readAiReviewRecords, readCurrentAiReviewBasis } from "../persistence/ai-reviews";
import { readAiReviewWorkspace } from "../persistence/queries/ai-reviews";

/** All saved AI reviews of one application, newest first. Only program managers who work on grants read them. */
export const readApplicationAiReviews = (db: Database, actor: Actor, input: AiReviewRequest) =>
  readWorkspace(db, actor.userId, input?.workspaceSlug, async (tx) => {
    const parsed = aiReviewRequestSchema.safeParse(input);
    if (!parsed.success) {
      return { status: "not_found" } as const;
    }
    const request = parsed.data;
    const workspace = await readAiReviewWorkspace(
      tx,
      actor.userId,
      request.workspaceSlug,
      request.publicId,
    );
    const current =
      workspace && (await readCurrentAiReviewBasis(tx, workspace.organizationId, request.publicId));
    if (!workspace || !current?.applicationVersion) {
      return { status: "not_found" } as const;
    }
    const records = await readAiReviewRecords(tx, workspace.organizationId, request.publicId);
    return {
      status: "ok",
      applicationVersion: current.applicationVersion,
      reviews: records.map((record) => aiReviewEntry(record, current)),
    } as const;
  });
