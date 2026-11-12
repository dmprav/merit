import { sql } from "drizzle-orm";

import { contacts } from "@merit/contacts/schema";

import { applicationCases, materialVersions, materialDrafts } from "./schema";

export const currentMaterial = sql<unknown>`(select ${materialVersions.content} from ${materialVersions}
  where ${materialVersions.caseId} = ${applicationCases.id}
    and ${materialVersions.version} = ${applicationCases.materialVersion})`;

export const workingRevision = sql<unknown>`(select jsonb_build_object('kind', ${materialDrafts.kind}, 'reason', ${materialDrafts.reason}, 'content', ${materialDrafts.content})
  from ${materialDrafts} where ${materialDrafts.caseId} = ${applicationCases.id})`;

// Contact details are a live profile projection, independent of preserved material.
export const currentSubmission = sql<unknown>`case when ${applicationCases.contactId} is null
  then ((${currentMaterial})->'submission') - 'contact' - 'contactEmail'
  else coalesce((${currentMaterial})->'submission', jsonb_build_object('version', ${applicationCases.materialVersion}, 'answers', '[]'::jsonb)) ||
    (select jsonb_build_object('contact', ${contacts.name}, 'contactEmail', ${contacts.email}) from ${contacts}
      where ${contacts.id} = ${applicationCases.contactId} and ${contacts.organizationId} = ${applicationCases.organizationId}) end`;

export const applicationDetails = sql<unknown>`jsonb_build_object(
  'id', ${applicationCases.id}, 'title', (${currentMaterial})->'title', 'version', ${applicationCases.materialVersion},
  'requested', (${currentMaterial})->'requested', 'intakeStatus', ${applicationCases.intakeStatus},
  'summaryAuthor', ${applicationCases.summaryAuthor}, 'summary', ${applicationCases.summary},
  'contactId', ${applicationCases.contactId}, 'attention', ${applicationCases.attention})`;

export const currentIntakeApplication = sql<unknown>`jsonb_strip_nulls(${applicationDetails} - 'requested' - 'contactId') ||
 jsonb_build_object('requested', (${currentMaterial})->'requested', 'contactId', ${applicationCases.contactId},
 'evidence', coalesce((${currentMaterial})->'evidence', '[]'::jsonb)) ||
 case when ${currentSubmission} is null then '{}'::jsonb else jsonb_build_object('submission', ${currentSubmission}) end`;
