import { and, eq } from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";

import { applicationCases, materialVersions } from "@merit/applications/schema";
import type { Database } from "@merit/db";

import { assessments, reviewRequests } from "../schema";

const linksThrough = (
  db: Database,
  organizationId: string,
  source: typeof reviewRequests | typeof assessments,
) =>
  db
    .select({
      contactId: source.contactId,
      id: applicationCases.id,
      title: materialVersions.title,
      position: applicationCases.position,
    })
    .from(source)
    .innerJoin(applicationCases, eq(applicationCases.id, source.caseId))
    .innerJoin(
      materialVersions,
      and(
        eq(materialVersions.caseId, applicationCases.id),
        eq(materialVersions.version, applicationCases.materialVersion),
      ),
    )
    .where(eq(applicationCases.organizationId, organizationId));

/** Applications with any review request or assessment for each contact, including cancelled requests. */
export const reviewContactLinks = (db: Database, organizationId: string) =>
  unionAll(
    linksThrough(db, organizationId, reviewRequests),
    linksThrough(db, organizationId, assessments),
  );
