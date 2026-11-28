import { and, eq, sql } from "drizzle-orm";

import { materialVersionSchema } from "@merit/applications/domain";
import { applicationCases, materialVersions } from "@merit/applications/schema";
import { requestedMoneyData, roundWithdrawnCount } from "@merit/applications/scope";
import type { Provenance } from "@merit/auth";
import type { Transaction } from "@merit/db";
import { decodeMoney } from "@merit/money";
import { fundingRounds } from "@merit/rounds/schema";
import { toMoneyData } from "@merit/rounds/scope";

import type { Decision } from "../../../domain/decision";
import {
  decisionDataSchema,
  decodeCommitmentContext,
  decodeDecision,
} from "../../../domain/encoding";
import { encodeDecision } from "../../../domain/encoding";
import { readDecisionHead, readRoundCommitments } from "../projections";
import { committeeDecisionVersions } from "../schema";

export const readDecisionState = async (
  db: Transaction,
  organizationId: string,
  publicId: string,
) => {
  const [row] = await db
    .select({
      title: materialVersions.title,
      requestedMinorUnits: materialVersions.requestedMinorUnits,
      requestedCurrency: materialVersions.requestedCurrency,
      applicationVersion: applicationCases.materialVersion,
      intakeStatus: applicationCases.intakeStatus,
      roundId: fundingRounds.id,
      roundBudget: fundingRounds.budgetMinorUnits,
      roundCurrency: fundingRounds.currency,
      withdrawnApplications: roundWithdrawnCount(fundingRounds),
    })
    .from(applicationCases)
    .innerJoin(
      materialVersions,
      and(
        eq(materialVersions.caseId, applicationCases.id),
        eq(materialVersions.version, applicationCases.materialVersion),
      ),
    )
    .innerJoin(
      fundingRounds,
      and(
        eq(fundingRounds.organizationId, applicationCases.organizationId),
        eq(fundingRounds.id, applicationCases.roundId),
      ),
    )
    .where(
      and(eq(applicationCases.organizationId, organizationId), eq(applicationCases.id, publicId)),
    );
  if (!row) {
    return null;
  }

  const [head, commitments] = await Promise.all([
    readDecisionHead(db, publicId),
    readRoundCommitments(db, organizationId, row.roundId),
  ]);
  const requestedData = requestedMoneyData(row.requestedMinorUnits, row.requestedCurrency);

  return {
    decisionRevision: head?.revision ?? 0,
    title: row.title,
    roundId: row.roundId,
    application: {
      version: materialVersionSchema.parse(row.applicationVersion),
      intakeStatus: row.intakeStatus,
      requested: requestedData === null ? null : decodeMoney(requestedData),
    },
    current: head ? decodeDecision(head.decision) : null,
    round: decodeCommitmentContext(
      toMoneyData(row.roundBudget, row.roundCurrency),
      commitments.map((amount) => ({ minorUnits: amount.minorUnits, currency: amount.currency })),
      row.withdrawnApplications,
    ),
  };
};

export const decisionColumns = (
  decision: Decision,
  recorder: { userId: string | null; provenance: Provenance | null },
) => {
  const content = decisionDataSchema.parse(encodeDecision(decision));
  return {
    outcome: content.outcome,
    amountMinorUnits: content.amount.minorUnits,
    amountCurrency: content.amount.currency,
    conditions: content.conditions === "" ? null : content.conditions,
    reason: content.reason,
    decidedBy: content.decidedBy,
    decisionDate: content.decisionDate,
    changeExplanation: content.changeExplanation ?? null,
    recordedAt: new Date(content.recordedAt),
    applicationVersion: content.applicationVersion,
    actorUserId: recorder.userId,
    actorName: content.recorder.name,
    provenanceInterface: recorder.provenance?.interface ?? null,
    provenanceClientId:
      recorder.provenance?.interface === "mcp" ? recorder.provenance.clientId : null,
  };
};

/** Appends the next version when the case's head is still the revision the caller read. */
export const writeDecision = async (
  db: Transaction,
  input: {
    publicId: string;
    expectedRevision: number;
    recorder: { userId: string; provenance: Provenance };
    after: Decision;
  },
) => {
  const [head] = await db
    .select({ revision: sql<number>`coalesce(max(${committeeDecisionVersions.revision}), 0)` })
    .from(committeeDecisionVersions)
    .where(eq(committeeDecisionVersions.caseId, input.publicId));
  if (!head || head.revision !== input.expectedRevision) {
    return false;
  }
  await db.insert(committeeDecisionVersions).values({
    caseId: input.publicId,
    revision: input.expectedRevision + 1,
    ...decisionColumns(input.after, input.recorder),
  });
  return true;
};
