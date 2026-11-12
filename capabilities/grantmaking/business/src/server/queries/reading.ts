import { type z } from "zod";

import type { Actor } from "@merit/auth";
import { readTransaction, type Database } from "@merit/db";
import { decodeMoney, encodeMoney, fromMinorUnits, subtract } from "@merit/money";
import { compareReviewBasis, reviewCriteriaSchema, reviewFreshness } from "@merit/reviews/domain";

import {
  reviewListInput,
  reviewSummarySchema,
  contactApplicationListInput,
  roundReadInput,
  applicationReadInput,
  roundListInput,
  applicationListInput,
  roundContentInput,
  applicationContentInput,
  roundHistoryInput,
  applicationHistoryInput,
  roundSummarySchema,
  applicationSummarySchema,
  roundOverviewSchema,
  applicationContextSchema,
} from "../../api/queries/reading";
import * as reads from "../persistence/queries/reading";

export const listFundingRoundSummaries = async (
  db: Database,
  actor: Actor,
  input: z.input<typeof roundListInput>,
) => {
  return readTransaction(db, async (tx) => {
    const request = roundListInput.parse(input);
    const access = await reads.readGrantWorkspaceAccess(tx, actor.userId, request.workspaceSlug);
    if (!access) {
      return { status: "not_found" } as const;
    }
    if (!access.allowed) {
      return { status: "forbidden" } as const;
    }
    const rows = await reads.readRoundSummaries(tx, actor.userId, request);
    const items = rows.slice(0, request.limit).map((row) => roundSummarySchema.parse(row));
    return {
      status: "ok",
      rounds: items,
      nextCursor: rows.length > request.limit ? items.at(-1)!.roundId : null,
    } as const;
  });
};

export const getFundingRoundOverview = async (
  db: Database,
  actor: Actor,
  input: z.input<typeof roundReadInput>,
) => {
  return readTransaction(db, async (tx) => {
    const row = await reads.readRoundOverview(tx, actor.userId, roundReadInput.parse(input));
    if (!row) {
      return { status: "not_found" } as const;
    }
    const proposed = fromMinorUnits(BigInt(row.proposed));
    const budget = row.budget === null ? null : decodeMoney(row.budget);
    return {
      status: "ok",
      round: roundOverviewSchema.parse({
        ...row,
        totals: {
          requested: encodeMoney(fromMinorUnits(BigInt(row.requested))),
          unknownRequests: row.unknownRequests,
          proposed: encodeMoney(proposed),
          remaining: budget === null ? null : encodeMoney(subtract(budget, proposed)),
        },
      }),
    } as const;
  });
};

export const listFundingApplications = async (
  db: Database,
  actor: Actor,
  input: z.input<typeof applicationListInput>,
) => {
  return readTransaction(db, async (tx) => {
    const request = applicationListInput.parse(input);
    if (!(await reads.readRoundIdentity(tx, actor.userId, request))) {
      return { status: "not_found" } as const;
    }
    const rows = await reads.readApplicationSummaries(tx, actor.userId, request);
    const items = rows.slice(0, request.limit).map((row) => applicationSummarySchema.parse(row));
    return {
      status: "ok",
      applications: items,
      nextCursor: rows.length > request.limit ? items.at(-1)!.applicationId : null,
    } as const;
  });
};

export const getFundingApplicationContext = async (
  db: Database,
  actor: Actor,
  input: z.input<typeof applicationReadInput>,
) => {
  return readTransaction(db, async (tx) => {
    const row = await reads.readApplicationContext(
      tx,
      actor.userId,
      applicationReadInput.parse(input),
    );
    return row
      ? ({ status: "ok", application: applicationContextSchema.parse(row) } as const)
      : ({ status: "not_found" } as const);
  });
};

const contentResult = (
  row: Awaited<ReturnType<typeof reads.readApplicationContent>>,
  request: { offset: number; length: number; fingerprint?: string },
) => {
  if (!row || row.content === null || row.fingerprint === null || row.totalCharacters === null) {
    return { status: "not_found" } as const;
  }
  if (
    (request.offset > 0 && request.fingerprint === undefined) ||
    (request.fingerprint !== undefined && request.fingerprint !== row.fingerprint)
  ) {
    return { status: "conflict" } as const;
  }
  if (request.offset > row.totalCharacters) {
    return { status: "invalid_range" } as const;
  }
  const end = Math.min(request.offset + request.length, row.totalCharacters);
  return {
    status: "ok",
    format: "json",
    content: row.content,
    fingerprint: row.fingerprint,
    offset: request.offset,
    nextOffset: end < row.totalCharacters ? end : null,
    totalCharacters: row.totalCharacters,
  } as const;
};

export const getFundingRoundContent = async (
  db: Database,
  actor: Actor,
  input: z.input<typeof roundContentInput>,
) => {
  return readTransaction(db, async (tx) => {
    const request = roundContentInput.parse(input);
    if (request.section === "preparation_change" && request.revision === undefined) {
      return { status: "invalid_range" } as const;
    }
    return contentResult(await reads.readRoundContent(tx, actor.userId, request), request);
  });
};

export const getFundingApplicationContent = async (
  db: Database,
  actor: Actor,
  input: z.input<typeof applicationContentInput>,
) => {
  return readTransaction(db, async (tx) => {
    const request = applicationContentInput.parse(input);
    if (request.section === "material" && request.materialVersion === undefined) {
      return { status: "invalid_range" } as const;
    }
    if (
      (request.section === "intake_change" || request.section === "recommendation_change") &&
      request.revision === undefined
    ) {
      return { status: "invalid_range" } as const;
    }
    if (
      (request.section === "assessment" || request.section === "review_request") &&
      request.entryId === undefined
    ) {
      return { status: "invalid_range" } as const;
    }
    return contentResult(await reads.readApplicationContent(tx, actor.userId, request), request);
  });
};

export const listFundingRoundHistory = async (
  db: Database,
  actor: Actor,
  input: z.input<typeof roundHistoryInput>,
) => {
  return readTransaction(db, async (tx) => {
    const request = roundHistoryInput.parse(input);
    const access = await reads.readGrantWorkspaceAccess(tx, actor.userId, request.workspaceSlug);
    if (!access?.allowed) {
      return { status: "not_found" } as const;
    }
    const rows = await reads.readGrantHistory(tx, actor.userId, {
      ...request,
      history: "preparation",
    });
    const entries = rows
      .slice(0, request.limit)
      .map((row) => ({ ...row, recordedAt: row.recordedAt.toISOString() }));
    return {
      status: "ok",
      entries,
      nextRevision: rows.length > request.limit ? entries.at(-1)!.revision : null,
    } as const;
  });
};

export const listFundingApplicationHistory = async (
  db: Database,
  actor: Actor,
  input: z.input<typeof applicationHistoryInput>,
) => {
  return readTransaction(db, async (tx) => {
    const request = applicationHistoryInput.parse(input);
    const access = await reads.readGrantWorkspaceAccess(tx, actor.userId, request.workspaceSlug);
    if (!access?.allowed) {
      return { status: "not_found" } as const;
    }
    const rows = await reads.readGrantHistory(tx, actor.userId, request);
    const entries = rows
      .slice(0, request.limit)
      .map((row) => ({ ...row, recordedAt: row.recordedAt.toISOString() }));
    return {
      status: "ok",
      entries,
      nextRevision: rows.length > request.limit ? entries.at(-1)!.revision : null,
    } as const;
  });
};

export const listContactApplications = async (
  db: Database,
  actor: Actor,
  input: z.input<typeof contactApplicationListInput>,
) => {
  return readTransaction(db, async (tx) => {
    const request = contactApplicationListInput.parse(input);
    const access = await reads.readGrantWorkspaceAccess(tx, actor.userId, request.workspaceSlug);
    if (!access?.allowed) {
      return { status: "not_found" } as const;
    }
    const rows = await reads.readApplicationSummaries(tx, actor.userId, request);
    const applications = rows
      .slice(0, request.limit)
      .map((row) => applicationSummarySchema.parse(row));
    return {
      status: "ok",
      applications,
      nextCursor: rows.length > request.limit ? applications.at(-1)!.applicationId : null,
    } as const;
  });
};

export const listApplicationReviewSummaries = async (
  db: Database,
  actor: Actor,
  input: z.input<typeof reviewListInput>,
) => {
  return readTransaction(db, async (tx) => {
    const request = reviewListInput.parse(input);
    if (!(await reads.readApplicationContext(tx, actor.userId, request))) {
      return { status: "not_found" } as const;
    }
    const rows = await reads.readReviewSummaries(tx, actor.userId, request);
    const facts = reviewSummarySchema.omit({ freshness: true, basisComparison: true }).extend({
      recordedCriteria: reviewCriteriaSchema.nullable(),
      currentCriteria: reviewCriteriaSchema.nullable(),
    });
    const reviews = rows.slice(0, request.limit).map((row) => {
      const value = facts.parse(row);
      const basisComparison = compareReviewBasis(
        {
          applicationVersion: value.recordedApplicationVersion,
          criteriaVersion: value.recordedCriteriaVersion,
          criteria: value.recordedCriteria,
        },
        {
          applicationVersion: value.applicationVersion,
          criteriaVersion: value.criteriaVersion,
          criteria: value.currentCriteria,
        },
      );
      const freshness = value.kind === "request" ? "outstanding" : reviewFreshness(basisComparison);
      return reviewSummarySchema.parse({ ...value, basisComparison, freshness });
    });
    return {
      status: "ok",
      reviews,
      nextCursor:
        rows.length > request.limit ? `${reviews.at(-1)!.kind}:${reviews.at(-1)!.id}` : null,
    } as const;
  });
};
