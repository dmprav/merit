import { sql } from "drizzle-orm";

import { applicationCases } from "@merit/applications/schema";
import { criteriaVersions } from "@merit/rounds/schema";

import { reviewRequests, assessments, assessmentVersions, reviewStates } from "./schema";

export const reviewRevision = sql<number>`coalesce((select ${reviewStates.revision} from ${reviewStates} where ${reviewStates.caseId} = ${applicationCases.id}), 0)`;
export const reviewRequestRecord = sql<unknown>`jsonb_build_object(
  'id', ${reviewRequests.id}, 'contactId', ${reviewRequests.contactId}, 'reviewer', ${reviewRequests.reviewer},
  'applicationVersion', ${reviewRequests.applicationVersion}, 'criteriaVersion', ${reviewRequests.criteriaVersion},
  'criteria', (select ${criteriaVersions.criteria} from ${criteriaVersions}
    where ${criteriaVersions.roundPublicId} = ${reviewRequests.criteriaRoundPublicId} and ${criteriaVersions.version} = ${reviewRequests.criteriaVersion}),
  'status', ${reviewRequests.status}, 'recorder', ${reviewRequests.recorder}, 'closedBy', ${reviewRequests.closedBy})`;

export const assessmentRecord = sql<unknown>`jsonb_build_object(
  'id', ${assessments.id}, 'contactId', ${assessments.contactId}, 'reviewer', ${assessments.reviewer},
  'requestId', ${assessments.requestId}, 'previousId', ${assessments.previousId}, 'authorUserId', ${assessments.authorUserId},
  'versions', (select coalesce(jsonb_agg(jsonb_build_object(
    'content', ${assessmentVersions.content},
    'criteria', (select ${criteriaVersions.criteria} from ${criteriaVersions}
      where ${criteriaVersions.roundPublicId} = ${assessmentVersions.criteriaRoundPublicId} and ${criteriaVersions.version} = ${assessmentVersions.criteriaVersion}),
    'recorder', ${assessmentVersions.recorder}, 'note', ${assessmentVersions.note}) order by ${assessmentVersions.version}), '[]'::jsonb)
    from ${assessmentVersions} where ${assessmentVersions.caseId} = ${assessments.caseId} and ${assessmentVersions.assessmentId} = ${assessments.id}))`;

export const currentReviews = sql<unknown>`jsonb_build_object(
  'revision', ${reviewRevision},
  'requests', (select coalesce(jsonb_agg(${reviewRequestRecord} order by ${reviewRequests.position}), '[]'::jsonb)
    from ${reviewRequests} where ${reviewRequests.caseId} = ${applicationCases.id}),
  'assessments', (select coalesce(jsonb_agg(${assessmentRecord} order by ${assessments.position}), '[]'::jsonb)
    from ${assessments} where ${assessments.caseId} = ${applicationCases.id}))`;
