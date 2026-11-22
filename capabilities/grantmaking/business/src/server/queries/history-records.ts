import { applicationHistorySchema } from "@merit/applications/history";
import { readAuditHistory } from "@merit/audit/server/read";
import type { Database } from "@merit/db";

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
    value == null ? null : applicationHistorySchema.parse(value).application;

  return {
    ...result,
    entries: result.entries.map((entry) => ({
      ...fields(entry),
      before: historical(entry.details.before),
      after: historical(entry.details.after),
    })),
  };
};
