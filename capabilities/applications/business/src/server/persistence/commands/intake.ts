import { and, eq, sql } from "drizzle-orm";

import { type Actor } from "@merit/auth";
import type { Database } from "@merit/db";
import { decodeMoney } from "@merit/money";

import {
  decodeIntakeApplication,
  encodeApplicationMaterial,
  encodeIntakeApplication,
} from "../../../domain/encoding";
import { workingRevisionSchema, type prepareIntakeChange } from "../../../domain/intake";
import type { IntakeApplication } from "../../../domain/model";
import {
  activeCase,
  readIntakeApplicationsMap,
  readWorkingRevisionsMap,
  requestedMoneyData,
} from "../projections";
import {
  applicationCreationReceipts,
  applicationCases,
  materialVersions,
  materialVersionAnswers,
  materialVersionEvidence,
  materialDrafts,
  materialDraftAnswers,
} from "../schema";
import { recordApplicationChange } from "./intake-history";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type ApplicationData = ReturnType<typeof encodeIntakeApplication>;

type MaterialData = ReturnType<typeof encodeApplicationMaterial>;

export const findIntakeApplication = async (
  db: Transaction,
  organizationId: string,
  publicId: string,
) => {
  const [row] = await db
    .select()
    .from(applicationCases)
    .where(
      and(eq(applicationCases.organizationId, organizationId), eq(applicationCases.id, publicId)),
    );
  if (!row) {
    return undefined;
  }
  const [applications, drafts] = await Promise.all([
    readIntakeApplicationsMap(db, organizationId, [row]),
    readWorkingRevisionsMap(db, [row.id]),
  ]);
  const snapshot = applications.get(row.id);
  if (!snapshot) {
    return undefined;
  }
  const working = drafts.get(row.id) ?? null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    roundId: row.roundId,
    revision: row.revision,
    application: decodeIntakeApplication(snapshot),
    workingRevision: working === null ? null : workingRevisionSchema.parse(working),
  };
};

type IntakeState = NonNullable<Awaited<ReturnType<typeof findIntakeApplication>>>;

// Search reads the current recorded title and applicant from the case row, so every write that
// advances `material_version` stores them in the same statement.
const caseContent = (snapshot: ApplicationData) => ({
  id: snapshot.id,
  materialVersion: snapshot.version,
  searchTitle: snapshot.title,
  searchApplicant: snapshot.submission?.organization ?? "",
  intakeStatus: snapshot.intakeStatus,
  withdrawnOn: snapshot.withdrawal?.withdrawnOn ?? null,
  withdrawalReason: snapshot.withdrawal?.reason ?? null,
  withdrawalRecorderUserId: snapshot.withdrawal?.recorder.userId ?? null,
  withdrawalRecorderName: snapshot.withdrawal?.recorder.name ?? null,
  withdrawalRecordedAt: snapshot.withdrawal
    ? new Date(snapshot.withdrawal.recorder.recordedAt)
    : null,
  summary: snapshot.summary,
  summaryAuthorUserId: snapshot.summaryAuthor?.userId ?? null,
  summaryAuthorName: snapshot.summaryAuthor?.name ?? null,
  summaryRecordedAt: snapshot.summaryAuthor ? new Date(snapshot.summaryAuthor.recordedAt) : null,
  attention: snapshot.attention,
  contactId: snapshot.contactId,
});

const insertMaterialVersionRows = async (
  db: Transaction,
  values: {
    caseId: string;
    material: MaterialData;
    changeKind: string;
    sourceKind: "recorded_external" | "fictional_example";
    reason?: string | null;
    recordedByUserId?: string;
    recordedAt?: Date;
  },
) => {
  const { material } = values;
  await db.insert(materialVersions).values({
    caseId: values.caseId,
    version: material.version,
    title: material.title,
    requestedMinorUnits: material.requested?.minorUnits ?? null,
    requestedCurrency: material.requested?.currency ?? null,
    hasSubmission: material.submission !== undefined,
    submissionVersion: material.submission?.version ?? null,
    applicantOrganization: material.submission?.organization ?? null,
    submittedOn: material.submission?.submittedOn ?? null,
    projectPeriod: material.submission?.projectPeriod ?? null,
    changeKind: values.changeKind,
    sourceKind: values.sourceKind,
    reason: values.reason ?? null,
    recordedByUserId: values.recordedByUserId,
    ...(values.recordedAt ? { recordedAt: values.recordedAt } : {}),
  });
  const answers = material.submission?.answers ?? [];
  if (answers.length > 0) {
    await db.insert(materialVersionAnswers).values(
      answers.map((answer, position) => ({
        caseId: values.caseId,
        materialVersion: material.version,
        position,
        questionId: answer.questionId,
        question: answer.question,
        response: answer.response,
      })),
    );
  }
  if (material.evidence.length > 0) {
    await db.insert(materialVersionEvidence).values(
      material.evidence.map((entry, position) => ({
        caseId: values.caseId,
        materialVersion: material.version,
        position,
        evidenceVersion: entry.version,
        passage: entry.passage,
      })),
    );
  }
};

export const insertIntakeApplication = async (
  db: Transaction,
  values: {
    organizationId: string;
    roundId: string;
    snapshot: ApplicationData;
    position?: number;
    revision?: number;
    recordedByUserId?: string;
    source?: { kind: "recorded_external" | "fictional_example" };
    changeKind?: string;
  },
) => {
  const [position] = await db
    .select({ next: sql<number>`coalesce(max(${applicationCases.position}), -1) + 1` })
    .from(applicationCases)
    .where(
      and(
        eq(applicationCases.organizationId, values.organizationId),
        eq(applicationCases.roundId, values.roundId),
      ),
    );
  const [saved] = await db
    .insert(applicationCases)
    .values({
      ...caseContent(values.snapshot),
      organizationId: values.organizationId,
      roundId: values.roundId,
      position: values.position ?? position!.next,
      revision: values.revision ?? 0,
    })
    .returning();
  await insertMaterialVersionRows(db, {
    caseId: saved!.id,
    material: encodeApplicationMaterial(decodeIntakeApplication(values.snapshot)),
    changeKind: values.changeKind ?? "recorded",
    sourceKind: values.source?.kind ?? "recorded_external",
    recordedByUserId: values.recordedByUserId,
  });
  return saved!;
};

export const insertDemoMaterialVersion = async (
  db: Transaction,
  values: {
    caseId: string;
    content: ReturnType<typeof encodeApplicationMaterial>;
    reason: string;
    recordedByUserId?: string;
    recordedAt: Date;
  },
) => {
  await insertMaterialVersionRows(db, {
    caseId: values.caseId,
    material: values.content,
    changeKind: "recorded",
    sourceKind: "fictional_example",
    reason: values.reason,
    recordedByUserId: values.recordedByUserId,
    recordedAt: values.recordedAt,
  });
};

const writeIntakeApplication = async (
  db: Transaction,
  publicId: string,
  values: {
    snapshot: ApplicationData;
    revision: number;
    workingRevision: unknown;
    recordedByUserId?: string;
    changeKind?: string;
    reason?: string | null;
  },
) => {
  const [current] = await db
    .select({ materialVersion: applicationCases.materialVersion })
    .from(applicationCases)
    .where(eq(applicationCases.id, publicId));
  if (current!.materialVersion !== values.snapshot.version) {
    const material = encodeApplicationMaterial(decodeIntakeApplication(values.snapshot));
    await insertMaterialVersionRows(db, {
      caseId: publicId,
      material,
      changeKind: values.changeKind ?? "recorded",
      sourceKind: "recorded_external",
      reason: values.reason,
      recordedByUserId: values.recordedByUserId,
    });
  }
  await db
    .update(applicationCases)
    .set({
      ...caseContent(values.snapshot),
      revision: values.revision,
    })
    .where(eq(applicationCases.id, publicId));
  if (values.workingRevision === null) {
    await db.delete(materialDrafts).where(eq(materialDrafts.caseId, publicId));
  } else {
    const draft = workingRevisionSchema.parse(values.workingRevision);
    const draftRow = {
      caseId: publicId,
      baseMaterialVersion: values.snapshot.version,
      kind: draft.kind,
      title: draft.content.title,
      applicant: draft.content.applicant,
      projectPeriod: draft.content.projectPeriod ?? null,
      requested: draft.content.requested,
      reason: draft.reason,
      revision: values.revision,
    };
    await db
      .insert(materialDrafts)
      .values(draftRow)
      .onConflictDoUpdate({ target: materialDrafts.caseId, set: draftRow });
    await db.delete(materialDraftAnswers).where(eq(materialDraftAnswers.caseId, publicId));
    if (draft.content.answers.length > 0) {
      await db.insert(materialDraftAnswers).values(
        draft.content.answers.map((answer, position) => ({
          caseId: publicId,
          position,
          questionId: answer.questionId,
          question: answer.question,
          response: answer.response,
        })),
      );
    }
  }
};

const deleteIntakeApplication = (db: Transaction, publicId: string) =>
  db.delete(applicationCases).where(eq(applicationCases.id, publicId));

export const readRequestedAmounts = async (
  db: Transaction,
  organizationId: string,
  roundId: string,
) => {
  const rows = await db
    .select({
      publicId: applicationCases.id,
      requestedMinorUnits: materialVersions.requestedMinorUnits,
      requestedCurrency: materialVersions.requestedCurrency,
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
        eq(applicationCases.roundId, roundId),
        activeCase("application_cases"),
      ),
    );

  return rows.map((row) => {
    const requested = requestedMoneyData(row.requestedMinorUnits, row.requestedCurrency);
    return {
      publicId: row.publicId,
      requested: requested === null ? null : decodeMoney(requested),
    };
  });
};

/** The caller holds the workspace and round locks for this transaction. */
export const recordIntakeCreation = async (
  tx: Transaction,
  organizationId: string,
  roundId: string,
  application: IntakeApplication,
  actor: Actor,
  requestId: string,
) => {
  const snapshot = encodeIntakeApplication(application);
  const saved = await insertIntakeApplication(tx, {
    organizationId,
    roundId,
    snapshot,
    recordedByUserId: actor.userId,
  });
  await tx
    .insert(applicationCreationReceipts)
    .values({ organizationId, publicId: saved.id, requestId });
  await recordApplicationChange(tx, {
    organizationId,
    publicId: saved.id,
    roundId,
    revision: 0,
    actor,
    action: "create",
    after: { application, workingRevision: null },
  });
  return saved.id;
};

/** The caller retains authorization and case locks until content and history commit together. */
export const recordIntakeChange = async (
  tx: Transaction,
  current: IntakeState,
  change: Omit<Extract<ReturnType<typeof prepareIntakeChange>, { ok: true }>, "ok" | "action"> & {
    action: Extract<ReturnType<typeof prepareIntakeChange>, { ok: true }>["action"] | "contact";
  },
  actor: Actor,
) => {
  const before = {
    application: encodeIntakeApplication(current.application),
    workingRevision: current.workingRevision,
  };
  const after = {
    application: encodeIntakeApplication(change.application),
    workingRevision: change.workingRevision,
  };
  if (change.action !== "delete" && JSON.stringify(before) === JSON.stringify(after)) {
    return current.revision;
  }

  const revision = current.revision + 1;
  const contactOnly =
    (change.action === "save_content" || change.action === "save_revision") &&
    current.application.version === change.application.version &&
    JSON.stringify(before.workingRevision) === JSON.stringify(after.workingRevision);
  await recordApplicationChange(tx, {
    organizationId: current.organizationId,
    publicId: current.id,
    roundId: current.roundId,
    revision,
    actor,
    action: contactOnly ? "contact" : change.action,
    reason: change.reason,
    before: { application: current.application, workingRevision: current.workingRevision },
    after:
      change.action === "delete"
        ? null
        : { application: change.application, workingRevision: change.workingRevision },
  });
  if (change.action === "delete") {
    await deleteIntakeApplication(tx, current.id);
  } else {
    await writeIntakeApplication(tx, current.id, {
      snapshot: after.application,
      revision,
      workingRevision: change.workingRevision,
      recordedByUserId: actor.userId,
      changeKind: change.action,
      reason: change.reason,
    });
  }
  return revision;
};

export const deleteDemoApplications = async (db: Transaction, organizationId: string) => {
  await db
    .delete(applicationCreationReceipts)
    .where(eq(applicationCreationReceipts.organizationId, organizationId));
  await db.delete(applicationCases).where(eq(applicationCases.organizationId, organizationId));
};
