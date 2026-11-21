import { and, eq } from "drizzle-orm";

import { applicationCases, materialVersions } from "@merit/applications/schema";
import type { Transaction } from "@merit/db";

import { reviewRequests } from "../schema";

/** Applications where the contact still has an outstanding review request, which blocks archival. */
export const outstandingContactRequests = (
  tx: Transaction,
  organizationId: string,
  contactId: string,
) =>
  tx
    .selectDistinct({ publicId: applicationCases.id, title: materialVersions.title })
    .from(reviewRequests)
    .innerJoin(applicationCases, eq(applicationCases.id, reviewRequests.caseId))
    .innerJoin(
      materialVersions,
      and(
        eq(materialVersions.caseId, applicationCases.id),
        eq(materialVersions.version, applicationCases.materialVersion),
      ),
    )
    .where(
      and(
        eq(applicationCases.organizationId, organizationId),
        eq(reviewRequests.contactId, contactId),
        eq(reviewRequests.status, "outstanding"),
      ),
    );
