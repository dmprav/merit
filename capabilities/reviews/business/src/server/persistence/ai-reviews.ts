import { and, desc, eq, inArray } from "drizzle-orm";

import { materialVersionSchema } from "@merit/applications/domain";
import { applicationCases } from "@merit/applications/schema";
import { readMaterialVersionRecord } from "@merit/applications/scope";
import type { Provenance } from "@merit/auth";
import type { Database, Transaction } from "@merit/db";
import { readAssistantConsent } from "@merit/organizations/scope";
import { criteriaVersionSchema, reviewCriteriaSchema } from "@merit/rounds/domain";
import {
  criteriaVersionKey,
  readCriteriaByVersionsMap,
  readRoundCriteria,
} from "@merit/rounds/scope";

import { aiReviewSchema, wholeApplicationTitle, type AiReviewRecord } from "../../domain/ai-review";
import type { AiReviewOutput } from "../../domain/ai-review";
import type { ReviewBasis } from "../../domain/basis";
import {
  aiReviewCitations,
  aiReviewItems,
  aiReviewQuestions,
  aiReviewSections,
  aiReviews,
} from "./schema";

const decodeProvenance = (interfaceValue: string, clientId: string | null): Provenance =>
  interfaceValue === "mcp" && clientId ? { interface: "mcp", clientId } : { interface: "web" };

/** Read the current material and criteria of an application, the facts a run is based on. */
export const readAiReviewBasis = async (
  db: Transaction,
  organizationId: string,
  caseId: string,
) => {
  const [row] = await db
    .select({ roundId: applicationCases.roundId, version: applicationCases.materialVersion })
    .from(applicationCases)
    .where(
      and(eq(applicationCases.organizationId, organizationId), eq(applicationCases.id, caseId)),
    );
  if (!row) {
    return undefined;
  }
  const material = await readMaterialVersionRecord(db, caseId, row.version);
  if (!material) {
    return undefined;
  }
  return {
    roundId: row.roundId,
    applicationVersion: materialVersionSchema.parse(row.version),
    material: material.content,
  };
};

/** Whether the workspace has agreed to send application material to the AI provider. */
export const readAiReviewConsent = (db: Database, organizationId: string) =>
  readAssistantConsent(db, organizationId);

/** The application version and round criteria a saved run is compared with now. */
export const readCurrentAiReviewBasis = async (
  db: Transaction,
  organizationId: string,
  caseId: string,
): Promise<ReviewBasis | undefined> => {
  const [row] = await db
    .select({ roundId: applicationCases.roundId, version: applicationCases.materialVersion })
    .from(applicationCases)
    .where(
      and(eq(applicationCases.organizationId, organizationId), eq(applicationCases.id, caseId)),
    );
  const round = row && (await readRoundCriteria(db, organizationId, row.roundId));
  return row && round
    ? {
        applicationVersion: materialVersionSchema.parse(row.version),
        criteriaVersion: criteriaVersionSchema.parse(round.criteriaVersion),
        criteria: reviewCriteriaSchema.parse(round.criteria),
      }
    : undefined;
};

type NewAiReview = {
  organizationId: string;
  runId: string;
  caseId: string;
  applicationVersion: number;
  roundId: string;
  criteriaVersion: number;
  provider: string;
  model: string;
  runBy: { userId: string; name: string };
  provenance: Provenance;
  /** Section titles in output order; null criterion IDs take the whole-application title. */
  titles: string[];
  output: AiReviewOutput;
  recordedAt?: Date;
};

/** Sections, items, citations and questions of one run. */
const insertContent = async (
  db: Transaction,
  organizationId: string,
  aiReviewId: string,
  titles: string[],
  output: AiReviewOutput,
) => {
  await db.insert(aiReviewSections).values(
    output.criteria.map((section, ordinal) => ({
      organizationId,
      aiReviewId,
      ordinal,
      criterionId: section.criterionId,
      criterionTitle: titles[ordinal] ?? wholeApplicationTitle,
    })),
  );
  const items = output.criteria.flatMap((section, sectionOrdinal) =>
    (
      [
        ["claim", section.claims.map((claim) => claim.text)],
        ["gap", section.gaps],
        ["strength", section.strengths],
        ["weakness", section.weaknesses],
        ["concern", section.concerns],
      ] as const
    ).flatMap(([kind, texts]) =>
      texts.map((text, ordinal) => ({
        organizationId,
        aiReviewId,
        sectionOrdinal,
        kind,
        ordinal,
        text,
      })),
    ),
  );
  if (items.length > 0) {
    await db.insert(aiReviewItems).values(items);
  }
  const citations = output.criteria.flatMap((section, sectionOrdinal) =>
    section.claims.flatMap((claim, itemOrdinal) =>
      claim.citations.map((citation, ordinal) => ({
        organizationId,
        aiReviewId,
        sectionOrdinal,
        itemOrdinal,
        ordinal,
        source: citation.source,
        quote: citation.quote,
      })),
    ),
  );
  if (citations.length > 0) {
    await db.insert(aiReviewCitations).values(citations);
  }
  if (output.questions.length > 0) {
    await db
      .insert(aiReviewQuestions)
      .values(
        output.questions.map((text, ordinal) => ({ organizationId, aiReviewId, ordinal, text })),
      );
  }
};

/** The saved run with this identity, wherever it was saved. */
export const readAiReviewByRun = async (db: Transaction, organizationId: string, runId: string) => {
  const [row] = await db
    .select({ id: aiReviews.id, caseId: aiReviews.caseId })
    .from(aiReviews)
    .where(and(eq(aiReviews.organizationId, organizationId), eq(aiReviews.runId, runId)));
  return row;
};

/**
 * Insert one run with its sections, items, citations and questions under the caller's
 * transaction. A run whose identity is already saved, by a concurrent duplicate, inserts nothing
 * and answers undefined.
 */
export const insertAiReview = async (db: Transaction, value: NewAiReview) => {
  const { output, organizationId } = value;
  const [saved] = await db
    .insert(aiReviews)
    .values({
      organizationId,
      runId: value.runId,
      caseId: value.caseId,
      applicationVersion: value.applicationVersion,
      roundId: value.roundId,
      criteriaVersion: value.criteriaVersion,
      provider: value.provider,
      model: value.model,
      runByUserId: value.runBy.userId,
      runByName: value.runBy.name,
      provenanceInterface: value.provenance.interface,
      provenanceClientId: value.provenance.interface === "mcp" ? value.provenance.clientId : null,
      ...(value.recordedAt ? { recordedAt: value.recordedAt } : {}),
      position: output.position,
      amountMinorUnits: output.amount.minorUnits,
      amountCurrency: output.amount.currency,
      reasoning: output.reasoning,
    })
    .onConflictDoNothing({ target: [aiReviews.organizationId, aiReviews.runId] })
    .returning({ id: aiReviews.id });
  if (!saved) {
    return undefined;
  }
  const aiReviewId = saved.id;

  await insertContent(db, organizationId, aiReviewId, value.titles, output);
  return aiReviewId;
};

/** Every run for one application, newest first, with the criteria content each was written against. */
export const readAiReviewRecords = async (
  db: Database,
  organizationId: string,
  caseId: string,
): Promise<AiReviewRecord[]> => {
  const rows = await db
    .select()
    .from(aiReviews)
    .where(and(eq(aiReviews.organizationId, organizationId), eq(aiReviews.caseId, caseId)))
    .orderBy(desc(aiReviews.recordedAt), desc(aiReviews.id));
  if (rows.length === 0) {
    return [];
  }
  const ids = rows.map((row) => row.id);
  const [sections, items, citations, questions, criteriaMap] = await Promise.all([
    db.select().from(aiReviewSections).where(inArray(aiReviewSections.aiReviewId, ids)),
    db.select().from(aiReviewItems).where(inArray(aiReviewItems.aiReviewId, ids)),
    db.select().from(aiReviewCitations).where(inArray(aiReviewCitations.aiReviewId, ids)),
    db.select().from(aiReviewQuestions).where(inArray(aiReviewQuestions.aiReviewId, ids)),
    readCriteriaByVersionsMap(
      db,
      rows.map((row) => ({ roundId: row.roundId, version: row.criteriaVersion })),
    ),
  ]);

  return rows.map((row) => {
    const mine = <T extends { aiReviewId: string }>(values: T[]) =>
      values.filter((value) => value.aiReviewId === row.id);

    const myItems = mine(items);
    const myCitations = mine(citations);
    const criteria = mine(sections)
      .toSorted((left, right) => left.ordinal - right.ordinal)
      .map((section) => {
        const texts = (kind: (typeof myItems)[number]["kind"]) =>
          myItems
            .filter((item) => item.sectionOrdinal === section.ordinal && item.kind === kind)
            .toSorted((left, right) => left.ordinal - right.ordinal);

        return {
          criterionId: section.criterionId,
          title: section.criterionTitle,
          claims: texts("claim").map((claim) => ({
            text: claim.text,
            citations: myCitations
              .filter(
                (citation) =>
                  citation.sectionOrdinal === section.ordinal &&
                  citation.itemOrdinal === claim.ordinal,
              )
              .toSorted((left, right) => left.ordinal - right.ordinal)
              .map(({ source, quote }) => ({ source, quote })),
          })),
          gaps: texts("gap").map((item) => item.text),
          strengths: texts("strength").map((item) => item.text),
          weaknesses: texts("weakness").map((item) => item.text),
          concerns: texts("concern").map((item) => item.text),
        };
      });
    const review = aiReviewSchema.parse({
      id: row.id,
      applicationVersion: row.applicationVersion,
      criteriaVersion: row.criteriaVersion,
      provider: row.provider,
      model: row.model,
      runBy: { userId: row.runByUserId, name: row.runByName },
      provenance: decodeProvenance(row.provenanceInterface, row.provenanceClientId),
      recordedAt: row.recordedAt.toISOString(),
      position: row.position,
      amount: { minorUnits: row.amountMinorUnits, currency: row.amountCurrency },
      reasoning: row.reasoning,
      criteria,
      questions: mine(questions)
        .toSorted((left, right) => left.ordinal - right.ordinal)
        .map((question) => question.text),
    });
    return {
      ...review,
      recordedCriteria:
        criteriaMap.get(criteriaVersionKey(row.roundId, row.criteriaVersion)) ?? null,
    };
  });
};
