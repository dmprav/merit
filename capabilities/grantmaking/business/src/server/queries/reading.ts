import { type z } from "zod";

import type { Actor } from "@merit/auth";
import type { Database } from "@merit/db";
import { decodeMoney, encodeMoney, fromMinorUnits, subtract } from "@merit/money";
import { readWorkspace } from "@merit/organizations/transactions";
import { compareReviewBasis, reviewCriteriaSchema, reviewFreshness } from "@merit/reviews/domain";
import { readRoundPreparationHistory } from "@merit/rounds/readers";

import {
  reviewListInput,
  reviewSummarySchema,
  contactApplicationListInput,
  contactApplicationSummarySchema,
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
  return readWorkspace(db, actor.userId, input?.workspaceSlug, async (tx) => {
    const parsed = roundListInput.safeParse(input);
    if (!parsed.success) {
      return { status: "not_found" } as const;
    }
    const request = parsed.data;
    const access = await reads.readGrantWorkspaceAccess(tx, actor.userId, request.workspaceSlug);
    if (!access) {
      return { status: "not_found" } as const;
    }
    if (!access.allowed) {
      return { status: "forbidden" } as const;
    }
    const rows = await reads.readRoundSummaries(tx, actor.userId, request);
    const items = rows.slice(0, request.limit).map((row) => roundSummarySchema.parse(row));
    const last = items.at(-1);
    return {
      status: "ok",
      rounds: items,
      nextCursor: rows.length > request.limit && last ? last.roundId : null,
    } as const;
  });
};

export const getFundingRoundOverview = async (
  db: Database,
  actor: Actor,
  input: z.input<typeof roundReadInput>,
) => {
  return readWorkspace(db, actor.userId, input?.workspaceSlug, async (tx) => {
    const parsed = roundReadInput.safeParse(input);
    if (!parsed.success) {
      return { status: "not_found" } as const;
    }
    const row = await reads.readRoundOverview(tx, actor.userId, parsed.data);
    if (!row) {
      return { status: "not_found" } as const;
    }
    const proposed = fromMinorUnits(BigInt(row.proposed));
    const committed = fromMinorUnits(BigInt(row.committed));
    const budget = row.budget === null ? null : decodeMoney(row.budget);
    return {
      status: "ok",
      round: roundOverviewSchema.parse({
        ...row,
        totals: {
          requested: encodeMoney(fromMinorUnits(BigInt(row.requested))),
          unknownRequests: row.unknownRequests,
          withdrawnApplications: row.withdrawnApplications,
          proposed: encodeMoney(proposed),
          remaining: budget === null ? null : encodeMoney(subtract(budget, proposed)),
          committed: encodeMoney(committed),
          available: budget === null ? null : encodeMoney(subtract(budget, committed)),
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
  return readWorkspace(db, actor.userId, input?.workspaceSlug, async (tx) => {
    const parsed = applicationListInput.safeParse(input);
    if (!parsed.success) {
      return { status: "not_found" } as const;
    }
    const request = parsed.data;
    if (!(await reads.readRoundIdentity(tx, actor.userId, request))) {
      return { status: "not_found" } as const;
    }
    const rows = await reads.readApplicationSummaries(tx, actor.userId, request);
    const items = rows.slice(0, request.limit).map((row) => applicationSummarySchema.parse(row));
    const last = items.at(-1);
    return {
      status: "ok",
      applications: items,
      nextCursor: rows.length > request.limit && last ? last.applicationId : null,
    } as const;
  });
};

export const getFundingApplicationContext = async (
  db: Database,
  actor: Actor,
  input: z.input<typeof applicationReadInput>,
) => {
  return readWorkspace(db, actor.userId, input?.workspaceSlug, async (tx) => {
    const parsed = applicationReadInput.safeParse(input);
    if (!parsed.success) {
      return { status: "not_found" } as const;
    }
    const row = await reads.readApplicationContext(tx, actor.userId, parsed.data);
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
  return readWorkspace(db, actor.userId, input?.workspaceSlug, async (tx) => {
    const parsed = roundContentInput.safeParse(input);
    if (!parsed.success) {
      const rangeIssue = parsed.error.issues.some((issue) =>
        ["offset", "length", "fingerprint", "revision", "criteriaVersion"].includes(
          String(issue.path[0]),
        ),
      );
      return { status: rangeIssue ? "invalid_range" : "not_found" } as const;
    }
    const request = parsed.data;
    if (request.criteriaVersion !== undefined && request.section !== "criteria") {
      return { status: "invalid_range" } as const;
    }
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
  return readWorkspace(db, actor.userId, input?.workspaceSlug, async (tx) => {
    const parsed = applicationContentInput.safeParse(input);
    if (!parsed.success) {
      const rangeIssue = parsed.error.issues.some((issue) =>
        ["offset", "length", "fingerprint", "revision", "materialVersion", "entryId"].includes(
          String(issue.path[0]),
        ),
      );
      return { status: rangeIssue ? "invalid_range" : "not_found" } as const;
    }
    const request = parsed.data;
    if (request.section === "material" && request.materialVersion === undefined) {
      return { status: "invalid_range" } as const;
    }
    if (
      (request.section === "intake_change" ||
        request.section === "recommendation_change" ||
        request.section === "decision_change") &&
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
  return readWorkspace(db, actor.userId, input?.workspaceSlug, async (tx) => {
    const parsed = roundHistoryInput.safeParse(input);
    if (!parsed.success) {
      return { status: "not_found" } as const;
    }
    const request = parsed.data;
    const access = await reads.readGrantWorkspaceAccess(tx, actor.userId, request.workspaceSlug);
    if (!access?.allowed) {
      return { status: "not_found" } as const;
    }
    const rows = await readRoundPreparationHistory(tx, access.organizationId, request);
    const entries = rows
      .slice(0, request.limit)
      .map((row) => ({ ...row, recordedAt: row.recordedAt.toISOString() }));
    const last = entries.at(-1);
    return {
      status: "ok",
      entries,
      nextRevision: rows.length > request.limit && last ? last.revision : null,
    } as const;
  });
};

export const listFundingApplicationHistory = async (
  db: Database,
  actor: Actor,
  input: z.input<typeof applicationHistoryInput>,
) => {
  return readWorkspace(db, actor.userId, input?.workspaceSlug, async (tx) => {
    const parsed = applicationHistoryInput.safeParse(input);
    if (!parsed.success) {
      return { status: "not_found" } as const;
    }
    const request = parsed.data;
    const access = await reads.readGrantWorkspaceAccess(tx, actor.userId, request.workspaceSlug);
    if (!access?.allowed) {
      return { status: "not_found" } as const;
    }
    const rows = await reads.readApplicationHistorySummaries(tx, actor.userId, request);
    const entries = rows
      .slice(0, request.limit)
      .map((row) => ({ ...row, recordedAt: row.recordedAt.toISOString() }));
    const last = entries.at(-1);
    return {
      status: "ok",
      entries,
      nextRevision: rows.length > request.limit && last ? last.revision : null,
    } as const;
  });
};

export const listContactApplications = async (
  db: Database,
  actor: Actor,
  input: z.input<typeof contactApplicationListInput>,
) => {
  return readWorkspace(db, actor.userId, input?.workspaceSlug, async (tx) => {
    const parsed = contactApplicationListInput.safeParse(input);
    if (!parsed.success) {
      return { status: "not_found" } as const;
    }
    const request = parsed.data;
    const access = await reads.readGrantWorkspaceAccess(tx, actor.userId, request.workspaceSlug);
    if (!access?.allowed) {
      return { status: "not_found" } as const;
    }
    const rows = await reads.readApplicationSummaries(tx, actor.userId, request);
    const applications = rows.slice(0, request.limit).map((row) =>
      contactApplicationSummarySchema.parse({
        ...row,
        relationships: [
          ...(row.applicantContact ? ["applicant_contact"] : []),
          ...(row.reviewRequested ? ["review_requested"] : []),
          ...(row.assessmentRecorded ? ["assessment_recorded"] : []),
        ],
      }),
    );
    const last = applications.at(-1);
    return {
      status: "ok",
      applications,
      nextCursor: rows.length > request.limit && last ? last.applicationId : null,
    } as const;
  });
};

export const listApplicationReviewSummaries = async (
  db: Database,
  actor: Actor,
  input: z.input<typeof reviewListInput>,
) => {
  return readWorkspace(db, actor.userId, input?.workspaceSlug, async (tx) => {
    const parsed = reviewListInput.safeParse(input);
    if (!parsed.success) {
      return { status: "not_found" } as const;
    }
    const request = parsed.data;
    const rows = await reads.readReviewSummaries(tx, actor.userId, request);
    if (!rows) {
      return { status: "not_found" } as const;
    }
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
    const last = reviews.at(-1);
    return {
      status: "ok",
      reviews,
      nextCursor: rows.length > request.limit && last ? `${last.kind}:${last.id}` : null,
    } as const;
  });
};
