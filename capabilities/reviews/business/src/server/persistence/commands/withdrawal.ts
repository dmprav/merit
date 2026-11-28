import { and, eq } from "drizzle-orm";

import { applicationCases, materialVersions } from "@merit/applications/schema";
import type { ApplicationReviewWork } from "@merit/applications/server/grant-work";

import { reviewRequests, reviewStates } from "../schema";
import { recordReviewRequestEvent } from "./review-request-events";
import { cancelParticipatingRequest, updateParticipatingRequest } from "./reviewer";

/**
 * Closes every outstanding request because the application was withdrawn, records the same
 * cancellation fact a manager's cancellation does, and ends the reviewer access linked to each.
 * Received and cancelled requests, assessments, and private drafts are untouched.
 */
export const closeReviewsForWithdrawal: ApplicationReviewWork["closeForWithdrawal"] = async (
  { tx, caseId },
  { actor, name },
) => {
  const outstanding = await tx
    .select()
    .from(reviewRequests)
    .where(and(eq(reviewRequests.caseId, caseId), eq(reviewRequests.status, "outstanding")))
    .orderBy(reviewRequests.position);
  const [owner] = await tx
    .select({ title: materialVersions.title, roundId: applicationCases.roundId })
    .from(applicationCases)
    .innerJoin(
      materialVersions,
      and(
        eq(materialVersions.caseId, applicationCases.id),
        eq(materialVersions.version, applicationCases.materialVersion),
      ),
    )
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
