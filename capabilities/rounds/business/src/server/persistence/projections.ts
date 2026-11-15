import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { accessScope } from "@merit/access/scope";
import { appUsers } from "@merit/auth/schema";
import type { Database } from "@merit/db";
import { containsEveryWord, matchRank, titleOrder, type SearchTerms } from "@merit/db/search";
import { memberships, organizations } from "@merit/organizations/schema";

import { fundingRounds, criteriaVersions, criteriaVersionItems } from "./schema";

export type CriterionRecord = { id: string; title: string; description?: string };

export type CriteriaHistoryEntry = { version: number; criteria: CriterionRecord[] };

export const toMoneyData = (minorUnits: string | null, currency = "EUR") =>
  minorUnits === null ? null : { minorUnits, currency };

export const criteriaVersionKey = (roundId: string, version: number) => `${roundId}:${version}`;

const toCriterionRecord = (item: typeof criteriaVersionItems.$inferSelect): CriterionRecord => ({
  id: item.id,
  title: item.title,
  ...(item.description !== null ? { description: item.description } : {}),
});

export const readCriteriaVersionsMap = async (
  db: Database,
  roundIds: string[],
): Promise<Map<string, CriteriaHistoryEntry[]>> => {
  const uniqueRoundIds = [...new Set(roundIds)];
  const result = new Map<string, CriteriaHistoryEntry[]>();
  if (uniqueRoundIds.length === 0) {
    return result;
  }

  const [versions, items] = await Promise.all([
    db
      .select({ roundPublicId: criteriaVersions.roundPublicId, version: criteriaVersions.version })
      .from(criteriaVersions)
      .where(inArray(criteriaVersions.roundPublicId, uniqueRoundIds))
      .orderBy(asc(criteriaVersions.roundPublicId), asc(criteriaVersions.version)),
    db
      .select()
      .from(criteriaVersionItems)
      .where(inArray(criteriaVersionItems.roundPublicId, uniqueRoundIds))
      .orderBy(
        asc(criteriaVersionItems.roundPublicId),
        asc(criteriaVersionItems.version),
        asc(criteriaVersionItems.position),
      ),
  ]);

  const itemsByKey = new Map<string, CriterionRecord[]>();
  for (const item of items) {
    const key = criteriaVersionKey(item.roundPublicId, item.version);
    const list = itemsByKey.get(key) ?? [];
    list.push(toCriterionRecord(item));
    itemsByKey.set(key, list);
  }

  for (const row of versions) {
    const entries = result.get(row.roundPublicId) ?? [];
    entries.push({
      version: row.version,
      criteria: itemsByKey.get(criteriaVersionKey(row.roundPublicId, row.version)) ?? [],
    });
    result.set(row.roundPublicId, entries);
  }

  return result;
};

export const readCriteriaByVersionsMap = async (
  db: Database,
  pairs: { roundId: string; version: number }[],
): Promise<Map<string, CriterionRecord[]>> => {
  const result = new Map<string, CriterionRecord[]>();
  if (pairs.length === 0) {
    return result;
  }

  const roundIds = [...new Set(pairs.map((pair) => pair.roundId))];
  const versions = [...new Set(pairs.map((pair) => pair.version))];
  const requestedKeys = new Set(
    pairs.map((pair) => criteriaVersionKey(pair.roundId, pair.version)),
  );

  const [recordedVersions, items] = await Promise.all([
    db
      .select({ roundPublicId: criteriaVersions.roundPublicId, version: criteriaVersions.version })
      .from(criteriaVersions)
      .where(
        and(
          inArray(criteriaVersions.roundPublicId, roundIds),
          inArray(criteriaVersions.version, versions),
        ),
      ),
    db
      .select()
      .from(criteriaVersionItems)
      .where(
        and(
          inArray(criteriaVersionItems.roundPublicId, roundIds),
          inArray(criteriaVersionItems.version, versions),
        ),
      )
      .orderBy(asc(criteriaVersionItems.position)),
  ]);

  for (const row of recordedVersions) {
    const key = criteriaVersionKey(row.roundPublicId, row.version);
    if (requestedKeys.has(key)) {
      result.set(key, []);
    }
  }
  for (const item of items) {
    const key = criteriaVersionKey(item.roundPublicId, item.version);
    const list = result.get(key);
    if (list) {
      list.push(toCriterionRecord(item));
    }
  }

  return result;
};

export const readRoundCriteria = async (db: Database, organizationId: string, roundId: string) => {
  const [round] = await db
    .select({ criteriaVersion: fundingRounds.criteriaVersion })
    .from(fundingRounds)
    .where(and(eq(fundingRounds.organizationId, organizationId), eq(fundingRounds.id, roundId)));
  if (!round) {
    return undefined;
  }
  const historyMap = await readCriteriaVersionsMap(db, [roundId]);
  const history = historyMap.get(roundId) ?? [];
  const current = history.find((entry) => entry.version === round.criteriaVersion)?.criteria;
  return {
    criteria: current,
    criteriaVersion: round.criteriaVersion,
    criteriaHistory: history,
  };
};

export const assembleRoundRecord = (
  round: typeof fundingRounds.$inferSelect,
  foundation: string,
  history: CriteriaHistoryEntry[],
) => ({
  id: round.id,
  title: round.title,
  foundation,
  purpose: round.purpose,
  manager: round.managerName,
  managerUserId: round.managerUserId,
  currency: round.currency,
  budget: toMoneyData(round.budget, round.currency),
  meetingDate: round.meetingDate,
  snapshotDate: round.snapshotDate,
  decisionStatus: round.decisionStatus,
  criteria: history.find((entry) => entry.version === round.criteriaVersion)?.criteria,
  criteriaVersion: round.criteriaVersion,
  criteriaHistory: history,
});

export const readRoundRecord = async (db: Database, organizationId: string, roundId: string) => {
  const [row] = await db
    .select({
      round: fundingRounds,
      foundation: organizations.name,
    })
    .from(fundingRounds)
    .innerJoin(organizations, eq(organizations.id, fundingRounds.organizationId))
    .where(and(eq(fundingRounds.organizationId, organizationId), eq(fundingRounds.id, roundId)));
  if (!row) {
    return undefined;
  }
  const historyMap = await readCriteriaVersionsMap(db, [row.round.id]);
  return assembleRoundRecord(row.round, row.foundation, historyMap.get(row.round.id) ?? []);
};

const responsible = alias(memberships, "responsible");
const person = alias(appUsers, "person");
export const managerNeedsReassignment = sql<boolean>`NOT EXISTS (
  SELECT 1 FROM ${memberships} AS responsible
  JOIN ${appUsers} AS person ON ${person.id} = ${responsible.userId}
  WHERE ${responsible.userId} = ${fundingRounds.managerUserId}
    AND ${accessScope("work_on_grants", {
      "subject.active": person.active,
      "subject.organizationId": responsible.organizationId,
      "subject.role": responsible.role,
      "subject.administration": responsible.administration,
      "resource.organizationId": fundingRounds.organizationId,
    })}
)`;

// The round title is searched where it is stored, so renaming a round updates search with no
// extra writes. The index covers this exact expression.
const searchTitle = sql`${fundingRounds.title}`;

/** Whether every word appears in the round's title. */
export const roundSearchMatch = (terms: SearchTerms) => containsEveryWord(searchTitle, terms);

/** Orders rounds by title the way people read it. */
export const roundSearchTitleOrder = titleOrder(searchTitle);

/** 0 when the title equals the whole query, 1 when it starts with it, 2 otherwise. */
export const roundSearchRank = (terms: SearchTerms) => matchRank([searchTitle], terms);
