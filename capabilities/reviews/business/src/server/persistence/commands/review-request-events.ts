import { recordAuditEvent } from "@merit/audit/server/record";
import { actorProvenance, type Actor } from "@merit/auth";
import type { Database } from "@merit/db";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** One review-request fact: created or cancelled, with the case it belongs to. */
export const recordReviewRequestEvent = (
  tx: Transaction,
  input: {
    action: "review_request.created" | "review_request.cancelled";
    organizationId: string;
    actor: Actor;
    name: string | null;
    request: {
      id: string;
      reviewer: string;
      contactId: string;
      applicationVersion: number | null;
      criteriaVersion: number | null;
    };
    revision: number;
    owner: { caseId: string; title: string; roundId: string | null };
    replacesId?: string | null;
    /** Why a manager did not close the request, when something else did. */
    cause?: "application_withdrawn";
  },
) =>
  recordAuditEvent(tx, {
    organizationId: input.organizationId,
    actor: {
      userId: input.actor.userId,
      name: input.name,
      provenance: actorProvenance(input.actor),
    },
    action: input.action,
    target: {
      type: "review_request",
      id: input.request.id,
      revision: input.revision,
      name: input.owner.title,
    },
    context: { roundId: input.owner.roundId, applicationId: input.owner.caseId },
    details: {
      reviewer: input.request.reviewer,
      contactId: input.request.contactId,
      applicationVersion: input.request.applicationVersion,
      criteriaVersion: input.request.criteriaVersion,
      replacesId: input.replacesId ?? null,
      ...(input.cause ? { cause: input.cause } : {}),
    },
  });
