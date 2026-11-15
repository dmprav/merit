import { and, asc, eq, inArray, sql, type AnyColumn } from "drizzle-orm";

import { contacts } from "@merit/contacts/schema";
import type { Database } from "@merit/db";
import { containsEveryWord, matchRank, titleOrder, type SearchTerms } from "@merit/db/search";

import {
  applicationCases,
  materialVersions,
  materialVersionAnswers,
  materialVersionEvidence,
  materialDrafts,
  materialDraftAnswers,
} from "./schema";

type AnswerRecord = { questionId: string; question: string; response: string };

type EvidenceRecord = { version: number; passage: string };

type ContactProfile = { name: string; email: string };

type MaterialRow = typeof materialVersions.$inferSelect;

type CaseRow = typeof applicationCases.$inferSelect;

type ApplicationMaterialData = {
  title: string;
  version: number;
  requested: { minorUnits: string; currency: "EUR" } | null;
  submission?: {
    version: number;
    organization?: string;
    submittedOn?: string;
    projectPeriod?: string;
    answers: AnswerRecord[];
  };
  evidence: EvidenceRecord[];
};

const materialVersionKey = (caseId: string, version: number) => `${caseId}:${version}`;

export const requestedMoneyData = (minorUnits: string | null, currency: string | null) =>
  minorUnits === null || currency === null ? null : { minorUnits, currency: currency as "EUR" };

const assembleWithdrawal = (caseRow: CaseRow) =>
  caseRow.withdrawnOn === null ||
  caseRow.withdrawalReason === null ||
  caseRow.withdrawalRecorderUserId === null ||
  caseRow.withdrawalRecorderName === null ||
  caseRow.withdrawalRecordedAt === null
    ? undefined
    : {
        withdrawnOn: caseRow.withdrawnOn,
        reason: caseRow.withdrawalReason,
        recorder: {
          userId: caseRow.withdrawalRecorderUserId,
          name: caseRow.withdrawalRecorderName,
          recordedAt: caseRow.withdrawalRecordedAt.toISOString(),
        },
      };

const assembleSummaryAuthor = (caseRow: CaseRow) =>
  caseRow.summaryAuthorUserId === null ||
  caseRow.summaryAuthorName === null ||
  caseRow.summaryRecordedAt === null
    ? undefined
    : {
        userId: caseRow.summaryAuthorUserId,
        name: caseRow.summaryAuthorName,
        recordedAt: caseRow.summaryRecordedAt.toISOString(),
      };

const assembleMaterialContent = (
  row: MaterialRow,
  answers: AnswerRecord[],
  evidence: EvidenceRecord[],
): ApplicationMaterialData => ({
  title: row.title,
  version: row.version,
  requested: requestedMoneyData(row.requestedMinorUnits, row.requestedCurrency),
  ...(row.hasSubmission
    ? {
        submission: {
          version: row.submissionVersion ?? row.version,
          ...(row.applicantOrganization !== null
            ? { organization: row.applicantOrganization }
            : {}),
          ...(row.submittedOn !== null ? { submittedOn: row.submittedOn } : {}),
          ...(row.projectPeriod !== null ? { projectPeriod: row.projectPeriod } : {}),
          answers,
        },
      }
    : {}),
  evidence,
});

export const assembleCurrentSubmission = (
  row: MaterialRow,
  answers: AnswerRecord[],
  contact?: ContactProfile,
) => {
  if (!row.hasSubmission && !contact) {
    return undefined;
  }
  const base = row.hasSubmission
    ? {
        version: row.submissionVersion ?? row.version,
        ...(row.applicantOrganization !== null ? { organization: row.applicantOrganization } : {}),
        ...(row.submittedOn !== null ? { submittedOn: row.submittedOn } : {}),
        ...(row.projectPeriod !== null ? { projectPeriod: row.projectPeriod } : {}),
        answers,
      }
    : {
        version: row.version,
        answers: [] as AnswerRecord[],
      };
  return contact ? { ...base, contact: contact.name, contactEmail: contact.email } : base;
};

export const assembleApplicationDetails = (caseRow: CaseRow, materialRow: MaterialRow) => {
  const withdrawal = assembleWithdrawal(caseRow);
  const summaryAuthor = assembleSummaryAuthor(caseRow);
  return {
    id: caseRow.id,
    title: materialRow.title,
    version: caseRow.materialVersion,
    requested: requestedMoneyData(materialRow.requestedMinorUnits, materialRow.requestedCurrency),
    intakeStatus: caseRow.intakeStatus,
    ...(withdrawal ? { withdrawal } : {}),
    ...(summaryAuthor ? { summaryAuthor } : {}),
    summary: caseRow.summary,
    contactId: caseRow.contactId,
    attention: caseRow.attention,
  };
};

const assembleIntakeApplication = (
  caseRow: CaseRow,
  materialRow: MaterialRow,
  answers: AnswerRecord[],
  evidence: EvidenceRecord[],
  contact?: ContactProfile,
) => {
  const submission = assembleCurrentSubmission(materialRow, answers, contact);
  return {
    ...assembleApplicationDetails(caseRow, materialRow),
    evidence,
    ...(submission ? { submission } : {}),
  };
};

type MaterialBundle = {
  row: MaterialRow;
  answers: AnswerRecord[];
  evidence: EvidenceRecord[];
};

const readMaterialBundles = async (
  db: Database,
  targets: { caseId: string; version: number }[],
): Promise<Map<string, MaterialBundle>> => {
  const result = new Map<string, MaterialBundle>();
  if (targets.length === 0) {
    return result;
  }
  const caseIds = [...new Set(targets.map((target) => target.caseId))];
  const versions = [...new Set(targets.map((target) => target.version))];
  const targetKeys = new Set(
    targets.map((target) => materialVersionKey(target.caseId, target.version)),
  );

  const [rows, answers, evidence] = await Promise.all([
    db
      .select()
      .from(materialVersions)
      .where(
        and(inArray(materialVersions.caseId, caseIds), inArray(materialVersions.version, versions)),
      ),
    db
      .select()
      .from(materialVersionAnswers)
      .where(
        and(
          inArray(materialVersionAnswers.caseId, caseIds),
          inArray(materialVersionAnswers.materialVersion, versions),
        ),
      )
      .orderBy(asc(materialVersionAnswers.position)),
    db
      .select()
      .from(materialVersionEvidence)
      .where(
        and(
          inArray(materialVersionEvidence.caseId, caseIds),
          inArray(materialVersionEvidence.materialVersion, versions),
        ),
      )
      .orderBy(asc(materialVersionEvidence.position)),
  ]);

  const answersByKey = new Map<string, AnswerRecord[]>();
  for (const row of answers) {
    const key = materialVersionKey(row.caseId, row.materialVersion);
    if (!targetKeys.has(key)) {
      continue;
    }
    const list = answersByKey.get(key) ?? [];
    list.push({ questionId: row.questionId, question: row.question, response: row.response });
    answersByKey.set(key, list);
  }

  const evidenceByKey = new Map<string, EvidenceRecord[]>();
  for (const row of evidence) {
    const key = materialVersionKey(row.caseId, row.materialVersion);
    if (!targetKeys.has(key)) {
      continue;
    }
    const list = evidenceByKey.get(key) ?? [];
    list.push({ version: row.evidenceVersion, passage: row.passage });
    evidenceByKey.set(key, list);
  }

  for (const row of rows) {
    const key = materialVersionKey(row.caseId, row.version);
    if (targetKeys.has(key)) {
      result.set(key, {
        row,
        answers: answersByKey.get(key) ?? [],
        evidence: evidenceByKey.get(key) ?? [],
      });
    }
  }

  return result;
};

export const readMaterialVersionRecord = async (db: Database, caseId: string, version: number) => {
  const bundle = (await readMaterialBundles(db, [{ caseId, version }])).get(
    materialVersionKey(caseId, version),
  );
  if (!bundle) {
    return undefined;
  }
  return {
    version: bundle.row.version,
    content: assembleMaterialContent(bundle.row, bundle.answers, bundle.evidence),
    source: { kind: bundle.row.sourceKind },
    changeKind: bundle.row.changeKind,
    reason: bundle.row.reason,
    recordedByUserId: bundle.row.recordedByUserId,
    recordedAt: bundle.row.recordedAt.toISOString(),
  };
};

export const readContactsProfileMap = async (
  db: Database,
  organizationId: string,
  contactIds: (string | null)[],
) => {
  const uniqueIds = [...new Set(contactIds.filter((id): id is string => id !== null))];
  if (uniqueIds.length === 0) {
    return new Map<string, ContactProfile>();
  }
  const rows = await db
    .select({ id: contacts.id, name: contacts.name, email: contacts.email })
    .from(contacts)
    .where(and(eq(contacts.organizationId, organizationId), inArray(contacts.id, uniqueIds)));
  return new Map(rows.map((row) => [row.id, { name: row.name, email: row.email }]));
};

export const readIntakeApplicationsMap = async (
  db: Database,
  organizationId: string,
  cases: CaseRow[],
) => {
  if (cases.length === 0) {
    return new Map<string, ReturnType<typeof assembleIntakeApplication>>();
  }
  const [bundles, contactsMap] = await Promise.all([
    readMaterialBundles(
      db,
      cases.map((row) => ({ caseId: row.id, version: row.materialVersion })),
    ),
    readContactsProfileMap(
      db,
      organizationId,
      cases.map((row) => row.contactId),
    ),
  ]);
  const result = new Map<string, ReturnType<typeof assembleIntakeApplication>>();
  for (const caseRow of cases) {
    const bundle = bundles.get(materialVersionKey(caseRow.id, caseRow.materialVersion));
    if (!bundle) {
      continue;
    }
    const contact = caseRow.contactId ? contactsMap.get(caseRow.contactId) : undefined;
    result.set(
      caseRow.id,
      assembleIntakeApplication(caseRow, bundle.row, bundle.answers, bundle.evidence, contact),
    );
  }
  return result;
};

export const readWorkingRevisionsMap = async (db: Database, caseIds: string[]) => {
  const uniqueIds = [...new Set(caseIds)];
  const result = new Map<
    string,
    {
      kind: "correction" | "revision";
      reason: string;
      content: {
        title: string;
        applicant: string;
        projectPeriod?: string;
        requested: string;
        answers: AnswerRecord[];
      };
    }
  >();
  if (uniqueIds.length === 0) {
    return result;
  }
  const [drafts, answers] = await Promise.all([
    db.select().from(materialDrafts).where(inArray(materialDrafts.caseId, uniqueIds)),
    db
      .select()
      .from(materialDraftAnswers)
      .where(inArray(materialDraftAnswers.caseId, uniqueIds))
      .orderBy(asc(materialDraftAnswers.position)),
  ]);
  const answersByCase = new Map<string, AnswerRecord[]>();
  for (const answer of answers) {
    const list = answersByCase.get(answer.caseId) ?? [];
    list.push({
      questionId: answer.questionId,
      question: answer.question,
      response: answer.response,
    });
    answersByCase.set(answer.caseId, list);
  }
  for (const draft of drafts) {
    result.set(draft.caseId, {
      kind: draft.kind,
      reason: draft.reason,
      content: {
        title: draft.title,
        applicant: draft.applicant,
        ...(draft.projectPeriod !== null ? { projectPeriod: draft.projectPeriod } : {}),
        requested: draft.requested,
        answers: answersByCase.get(draft.caseId) ?? [],
      },
    });
  }
  return result;
};

// The one SQL meaning of "withdrawn". Round totals, review progress, sibling allocations, and
// lists all use these fragments, so the business predicate (`isWithdrawn`) has one storage form.
const withdrawnColumn = (alias: string) => sql.raw(`${alias}.withdrawn_on`);

/** Whether the case is withdrawn, for queries that select from `application_cases` directly. */
export const caseWithdrawn = sql<boolean>`${applicationCases.withdrawnOn} is not null`;

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
