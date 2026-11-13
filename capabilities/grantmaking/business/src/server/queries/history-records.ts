import { encodeIntakeApplication } from "@merit/applications/encoding";
import { decodeApplicationHistory } from "@merit/applications/history";
import { readAuditHistory } from "@merit/audit/server/read";
import type { Database } from "@merit/db";
import { moneyDataSchema } from "@merit/money";

const fields = (entry: Awaited<ReturnType<typeof readAuditHistory>>["entries"][number]) => ({
  revision: entry.targetRevision!,
  action: entry.action,
  reason: typeof entry.details.reason === "string" ? entry.details.reason : null,
  recordedAt: entry.recordedAt.toISOString(),
  actor: entry.actorName,
  provenance: entry.provenance,
});

type Page = { after?: string; limit?: number };

/** The caller authorizes this workspace and record in the same read transaction. */
export const readApplicationHistory = async (
  db: Database,
  organizationId: string,
  publicId: string,
  page: Page = {},
) => {
  const result = await readAuditHistory(db, {
    ...page,
    organizationId,
    targetTypes: ["application"],
    targetId: publicId,
  });

  const historical = (value: unknown) =>
    value == null ? null : encodeIntakeApplication(decodeApplicationHistory(value).application);

  return {
    ...result,
    entries: result.entries.map((entry) => ({
      ...fields(entry),
      before: historical(entry.details.before),
      after: historical(entry.details.after),
    })),
  };
};

export const readRoundHistory = async (
  db: Database,
  organizationId: string,
  publicId: string,
  page: Page = {},
) => {
  const result = await readAuditHistory(db, {
    ...page,
    organizationId,
    targetTypes: ["round"],
    targetId: publicId,
    action: "round.budget_changed",
  });

  const budget = (value: unknown) =>
    moneyDataSchema
      .nullable()
      .parse(value && typeof value === "object" && "budget" in value ? value.budget : null);

  return {
    ...result,
    entries: result.entries.map((entry) => ({
      ...fields(entry),
      before: budget(entry.details.before),
      after: budget(entry.details.after),
    })),
  };
};
