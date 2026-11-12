import { database } from "./database";
import { decodeDraft } from "./format";
import type { DraftRecovery, DraftWrite, DraftWriteResult } from "./persistence";
import type { DraftFormat, DraftValues } from "./types";

export const restoreDrafts = async <T>(
  scope: string,
  kind: string,
  format: DraftFormat<T>,
): Promise<DraftRecovery<T>> =>
  database.transaction("rw", database.scopes, database.drafts, async () => {
    let owner = await database.scopes.get(scope);
    if (!owner) {
      owner = {
        scope,
        epoch: crypto.randomUUID(),
      };
      await database.scopes.add(owner);
    }
    const rows = await database.drafts.where("[scope+kind]").equals([scope, kind]).toArray();
    const drafts: DraftValues<T> = {};
    const tokens = new Map<string, string>();
    const incompatible = new Set<string>();
    for (const row of rows) {
      tokens.set(row.key, row.token);
      if (row.value === undefined) {
        continue;
      }
      try {
        drafts[row.key] = decodeDraft(row, format);
      } catch {
        incompatible.add(row.key);
      }
    }
    return { epoch: owner.epoch, drafts, tokens, incompatible };
  });

export const writeDrafts = (
  scope: string,
  kind: string,
  epoch: string | undefined,
  version: number,
  changes: DraftWrite[],
): Promise<DraftWriteResult> =>
  database.transaction("rw", database.scopes, database.drafts, async () => {
    const owner = await database.scopes.get(scope);
    if (!owner || owner.epoch !== epoch) {
      return { status: "cleared" } as const;
    }
    const tokens = new Map<string, string>();
    const conflicts = new Set<string>();
    for (const change of changes) {
      const current = await database.drafts.get([scope, kind, change.key]);
      if (current?.token !== change.token) {
        // Discarding this tab's edit must leave another tab's newer recovery copy intact.
        if (change.value !== undefined) {
          conflicts.add(change.key);
        }
        continue;
      }
      const token = crypto.randomUUID();
      // Tombstones prevent an older tab from recreating a draft after another tab clears it.
      await database.drafts.put({
        scope,
        kind,
        key: change.key,
        value: change.value,
        version,
        token,
      });
      tokens.set(change.key, token);
    }
    return { status: "saved", tokens, conflicts } as const;
  });

export const clearStoredDrafts = (scope?: string) =>
  database.transaction("rw", database.scopes, database.drafts, async () => {
    if (scope === undefined) {
      await database.drafts.clear();
      await database.scopes.clear();
      return;
    }
    await database.scopes.put({ scope, epoch: crypto.randomUUID() });
    await database.drafts.where("scope").equals(scope).delete();
  });
