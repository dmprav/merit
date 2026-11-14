import { and, eq, sql } from "drizzle-orm";

import { applicationCases } from "@merit/applications/schema";
import { currentMaterial } from "@merit/applications/scope";
import type { Actor } from "@merit/auth";
import type { Database } from "@merit/db";

import { reviewRequests, reviewStates } from "../schema";
import { recordReviewRequestEvent } from "./review-request-events";
import { cancelParticipatingRequest, updateParticipatingRequest } from "./reviewer";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Closes every outstanding request because the application was withdrawn, records the same
 * cancellation fact a manager's cancellation does, and ends the reviewer access linked to each.
 * Received and cancelled requests, assessments, and private drafts are untouched. The caller
 * holds the case lock.
 */
export const closeReviewsForWithdrawal = async (
  tx: Transaction,
  caseId: string,
  actor: Actor,
  name: string,
) => {
  const outstanding = await tx
    .select()
    .from(reviewRequests)
    .where(and(eq(reviewRequests.caseId, caseId), eq(reviewRequests.status, "outstanding")))
    .orderBy(reviewRequests.position);
  const [owner] = await tx
    .select({ title: sql<string>`${currentMaterial}->>'title'`, roundId: applicationCases.roundId })
    .from(applicationCases)
    .where(eq(applicationCases.id, caseId));
  if (!owner) {
    throw new Error("Application lock must remain held while closing its reviews");
  }

  for (const request of outstanding) {
    await updateParticipatingRequest(
      tx,
      caseId,
      request.id,
      "cancelled",
      actor,
      name,
      "application_withdrawn",
    );
    const [state] = await tx
      .select({ revision: reviewStates.revision })
      .from(reviewStates)
      .where(eq(reviewStates.caseId, caseId));
    await recordReviewRequestEvent(tx, {
      action: "review_request.cancelled",
      organizationId: request.organizationId,
      actor,
      name,
      request,
      revision: state?.revision ?? 0,
      owner: { caseId, title: owner.title, roundId: owner.roundId },
      cause: "application_withdrawn",
    });
    await cancelParticipatingRequest(tx, caseId, request.id, actor, name);
  }
};
