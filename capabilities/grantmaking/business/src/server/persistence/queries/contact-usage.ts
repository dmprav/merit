import { and, eq, sql } from "drizzle-orm";

import { applicationCases, materialVersions } from "@merit/applications/schema";
import { contacts } from "@merit/contacts/schema";
import type { Database } from "@merit/db";
import { reviewRequests, assessments } from "@merit/reviews/schema";

export const contactApplicationTitles = async (db: Database, organizationId: string) => {
  const contactId = sql`${contacts}.${sql.identifier(contacts.id.name)}`;
  const workspaceId = sql`${contacts}.${sql.identifier(contacts.organizationId.name)}`;
  const rows = await db
    .select({
      id: contacts.id,
      titles: sql<string[]>`coalesce((select array_agg(m.title order by related.position)
        from ${applicationCases} related
        join ${materialVersions} m on m.case_id = related.id and m.version = related.material_version
        where related.organization_id = ${workspaceId} and (
          related.contact_id = ${contactId}
          or exists (select 1 from ${reviewRequests} r where r.case_id = related.id and r.contact_id = ${contactId})
          or exists (select 1 from ${assessments} a where a.case_id = related.id and a.contact_id = ${contactId}))), '{}'::text[])`,
    })
    .from(contacts)
    .where(eq(contacts.organizationId, organizationId));

  return new Map(rows.map((row) => [row.id, row.titles]));
};

export const outstandingContactRequests = (
  db: Database,
  organizationId: string,
  contactId: string,
) =>
  db
    .select({
      publicId: applicationCases.id,
      title: materialVersions.title,
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
        sql`exists (select 1 from ${reviewRequests} where ${reviewRequests.caseId} = ${applicationCases.id} and ${reviewRequests.contactId} = ${contactId} and ${reviewRequests.status} = 'outstanding')`,
      ),
    );
