import { and, eq, inArray, or } from "drizzle-orm";

import type { Actor } from "@merit/auth";
import type { Database } from "@merit/db";

import { reviewAssignments } from "../reviewer-schema";
import {
  recordReviewerEvent,
  updateParticipatingRequest,
  updateReviewerAssignment,
} from "./reviewer";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Organizations holds the exclusive workspace lock before ending membership authority. */
export const revokeMembershipReviews = async (
  tx: Transaction,
  input: {
    organizationId: string;
    membershipId: string;
    userId: string;
    actor: Actor;
    name: string;
  },
) => {
  const assignments = await tx
    .select()
    .from(reviewAssignments)
    .where(
      and(
        eq(reviewAssignments.organizationId, input.organizationId),
        or(
          eq(reviewAssignments.membershipId, input.membershipId),
          eq(reviewAssignments.reviewerUserId, input.userId),
        ),
        inArray(reviewAssignments.status, ["invited", "accepted", "submitted", "conflict"]),
      ),
    );
  for (const assignment of assignments) {
    await updateReviewerAssignment(tx, assignment.id, {
      status: "cancelled",
      revision: assignment.revision + 1,
    });
    if (!assignment.assessmentId) {
      await updateParticipatingRequest(
        tx,
        assignment.caseId,
        assignment.requestId,
        "cancelled",
        input.actor,
        input.name,
      );
    }
    await recordReviewerEvent(tx, {
      assignmentId: assignment.id,
      actor: input.actor,
      name: input.name,
      action: "cancel",
      note: "Workspace review responsibilities ended.",
    });
  }
};
