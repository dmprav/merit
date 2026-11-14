import { and, eq, sql } from "drizzle-orm";

import { type Actor } from "@merit/auth";
import type { Database } from "@merit/db";
import { decodeMoney } from "@merit/money";

import { workingRevisionSchema, type prepareIntakeChange } from "../../../domain/intake";
import type { IntakeApplication } from "../../../domain/model";
import {
  decodeIntakeApplication,
  encodeApplicationMaterial,
  encodeIntakeApplication,
} from "../encoding";
import {
  currentIntakeApplication,
  currentMaterial,
  activeCase,
  workingRevision,
} from "../projections";
import {
  applicationCreationReceipts,
  applicationCases,
  materialVersions,
  materialDrafts,
} from "../schema";
import { recordApplicationChange } from "./intake-history";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type ApplicationData = ReturnType<typeof encodeIntakeApplication>;

export const findIntakeApplication = async (
  db: Transaction,
  organizationId: string,
  publicId: string,
) => {
  const [row] = await db
    .select({
      id: applicationCases.id,
      organizationId: applicationCases.organizationId,
      roundId: applicationCases.roundId,
      revision: applicationCases.revision,
      snapshot: currentIntakeApplication,
      workingRevision,
    })
    .from(applicationCases)
    .where(
      and(eq(applicationCases.organizationId, organizationId), eq(applicationCases.id, publicId)),
    );
  if (!row) {
    return undefined;
  }
  return {
    id: row.id,
    organizationId: row.organizationId,
    roundId: row.roundId,
    revision: row.revision,
    application: decodeIntakeApplication(row.snapshot),
    workingRevision:
      row.workingRevision === null ? null : workingRevisionSchema.parse(row.workingRevision),
  };
};

type IntakeState = NonNullable<Awaited<ReturnType<typeof findIntakeApplication>>>;

const caseContent = (snapshot: ApplicationData) => ({
  id: snapshot.id,
  intakeStatus: snapshot.intakeStatus,
  withdrawal: snapshot.withdrawal ?? null,
  summary: snapshot.summary,
  summaryAuthor: snapshot.summaryAuthor ?? null,
  attention: snapshot.attention,
  contactId: snapshot.contactId,
});

export const insertIntakeApplication = async (
  db: Transaction,
  values: {
    organizationId: string;
    roundId: string | null;
    snapshot: ApplicationData;
    position?: number;
    revision?: number;
    recordedByUserId?: string;
    source?: unknown;
    changeKind?: string;
  },
) => {
  const [position] = await db
    .select({ next: sql<number>`coalesce(max(${applicationCases.position}), -1) + 1` })
    .from(applicationCases)
    .where(
      and(
        eq(applicationCases.organizationId, values.organizationId),
        values.roundId === null
          ? sql`${applicationCases.roundId} IS NULL`
          : eq(applicationCases.roundId, values.roundId),
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
  await db.insert(materialVersions).values({
    caseId: saved!.id,
    version: values.snapshot.version,
    content: encodeApplicationMaterial(decodeIntakeApplication(values.snapshot)),
    changeKind: values.changeKind ?? "recorded",
    source: values.source ?? { kind: "recorded_external" },
    recordedByUserId: values.recordedByUserId,
  });
  await db
    .update(applicationCases)
    .set({ materialVersion: values.snapshot.version })
    .where(eq(applicationCases.id, saved!.id));
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
  await db.insert(materialVersions).values({
    caseId: values.caseId,
    version: values.content.version,
    content: values.content,
    changeKind: "recorded",
    source: { kind: "fictional_example" },
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
    await db.insert(materialVersions).values({
      caseId: publicId,
      version: values.snapshot.version,
      content: material,
      changeKind: values.changeKind ?? "recorded",
      source: { kind: "recorded_external" },
      reason: values.reason,
      recordedByUserId: values.recordedByUserId,
    });
  }
  await db
    .update(applicationCases)
    .set({
      ...caseContent(values.snapshot),
      revision: values.revision,
      materialVersion: values.snapshot.version,
    })
    .where(eq(applicationCases.id, publicId));
  if (values.workingRevision === null) {
    await db.delete(materialDrafts).where(eq(materialDrafts.caseId, publicId));
  } else {
    const draft = workingRevisionSchema.parse(values.workingRevision);
    const row = {
      caseId: publicId,
      baseMaterialVersion: values.snapshot.version,
      ...draft,
      revision: values.revision,
    };
    await db
      .insert(materialDrafts)
      .values(row)
      .onConflictDoUpdate({ target: materialDrafts.caseId, set: row });
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
      requested: sql<unknown>`(${currentMaterial})->'requested'`,
    })
    .from(applicationCases)
    .where(
      and(
        eq(applicationCases.organizationId, organizationId),
        eq(applicationCases.roundId, roundId),
        activeCase("application_cases"),
      ),
    );

  return rows.map((row) => ({
    publicId: row.publicId,
    requested: row.requested === null ? null : decodeMoney(row.requested),
  }));
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
