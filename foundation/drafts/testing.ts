import { database } from "./src/database";
import { clearDrafts } from "./src/index";

/** Reset browser persistence between tests. */
export const resetDraftStorage = async () => {
  await clearDrafts();
};

/** Inspect recovery values without exposing database tables to consumer tests. */
export const readDraftStorage = async (
  scope: string,
  kind: string,
): Promise<Record<string, unknown>> => {
  const rows = await database.drafts.where("[scope+kind]").equals([scope, kind]).toArray();
  return Object.fromEntries(
    rows.filter((row) => row.value !== undefined).map((row) => [row.key, row.value]),
  );
};

/** Seed current-format recovery copies for consumer tests. */
export const seedDraftStorage = async (
  scope: string,
  kind: string,
  drafts: Record<string, unknown>,
) => {
  await database.drafts.bulkPut(
    Object.entries(drafts).map(([key, value]) => ({
      scope,
      kind,
      key,
      value,
      version: 1,
      token: crypto.randomUUID(),
    })),
  );
};
