import { and, eq, isNotNull } from "drizzle-orm";

import type { Database } from "@merit/db";

import { applicationCases, materialVersions } from "../schema";

/** Applications whose current applicant contact is set, with their current recorded title. */
export const applicantContactLinks = async (db: Database, organizationId: string) => {
  const rows = await db
    .select({
      contactId: applicationCases.contactId,
      id: applicationCases.id,
      title: materialVersions.title,
      position: applicationCases.position,
    })
    .from(applicationCases)
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
        isNotNull(applicationCases.contactId),
      ),
    );
  return rows.flatMap(({ contactId, ...link }) => (contactId ? [{ contactId, ...link }] : []));
};
