import { sql, type AnyColumn } from "drizzle-orm";

import { contacts } from "@merit/contacts/schema";
import { containsEveryWord, matchRank, titleOrder, type SearchTerms } from "@merit/db/search";

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
  'withdrawal', ${applicationCases.withdrawal}, 'summaryAuthor', ${applicationCases.summaryAuthor}, 'summary', ${applicationCases.summary},
  'contactId', ${applicationCases.contactId}, 'attention', ${applicationCases.attention})`;

export const currentIntakeApplication = sql<unknown>`jsonb_strip_nulls(${applicationDetails} - 'requested' - 'contactId') ||
 jsonb_build_object('requested', (${currentMaterial})->'requested', 'contactId', ${applicationCases.contactId},
 'evidence', coalesce((${currentMaterial})->'evidence', '[]'::jsonb)) ||
 case when ${currentSubmission} is null then '{}'::jsonb else jsonb_build_object('submission', ${currentSubmission}) end`;

// The one SQL meaning of "withdrawn". Round totals, review progress, sibling allocations, and
// lists all use these fragments, so the business predicate (`isWithdrawn`) has one storage form.
const withdrawnColumn = (alias: string) => sql.raw(`${alias}.withdrawal`);

/** Whether the case is withdrawn, for queries that select from `application_cases` directly. */
export const caseWithdrawn = sql<boolean>`${applicationCases.withdrawal} is not null`;

/** Withdrawn applications leave round totals and review progress. `alias` names the case table. */
export const activeCase = (alias: string) => sql<boolean>`${withdrawnColumn(alias)} is null`;

const withdrawnCase = (alias: string) => sql<boolean>`${withdrawnColumn(alias)} is not null`;

/** The number of withdrawn applications in the selected round, disclosed beside its totals. */
export const roundWithdrawnCount = (round: { organizationId: AnyColumn; id: AnyColumn }) =>
  sql<number>`(select count(*)::integer from ${applicationCases} withdrawn
    where withdrawn.organization_id = ${round.organizationId} and withdrawn.round_id = ${round.id}
    and ${withdrawnCase("withdrawn")})`;

// Workspace search reads the current recorded title and applicant stored on the case, so working
// revisions, drafts, and superseded versions never match. The index covers this exact expression.
const searchApplicant = sql`${applicationCases.searchApplicant}`;

/** The title shown for a search result: the current recorded title. */
export const applicationSearchTitle = sql<string>`${applicationCases.searchTitle}`;

/** The applicant shown for a search result; null when none was recorded. */
export const applicationSearchApplicant = sql<
  string | null
>`nullif(${applicationCases.searchApplicant}, '')`;

/** Orders applications by title the way people read it: case-insensitive, English. */
export const applicationSearchTitleOrder = titleOrder(applicationSearchTitle);

/** Whether every word appears in the application's title and applicant together. */
export const applicationSearchMatch = (terms: SearchTerms) =>
  containsEveryWord(
    sql`${applicationCases.searchTitle} || ' ' || ${applicationCases.searchApplicant}`,
    terms,
  );

/** 0 when the title or applicant equals the whole query, 1 when one starts with it, 2 otherwise. */
export const applicationSearchRank = (terms: SearchTerms) =>
  matchRank([applicationSearchTitle, searchApplicant], terms);
