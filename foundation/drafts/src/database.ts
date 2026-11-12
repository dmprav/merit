import { Dexie, type Table } from "dexie";

export type StoredDraft = {
  scope: string;
  kind: string;
  key: string;
  token: string;
  version: number;
  value?: unknown;
};

export type DraftScope = { scope: string; epoch: string };

// Constructing the database does not open IndexedDB, including during server rendering.
export const database = new Dexie("merit-drafts") as Dexie & {
  drafts: Table<StoredDraft, [string, string, string]>;
  scopes: Table<DraftScope, string>;
};

database.version(1).stores({
  drafts: "[scope+kind+key], scope, [scope+kind]",
  scopes: "scope",
});

database.on("versionchange", () => {
  // Keep writing in memory instead of reloading a page that may contain unsaved work.
  database.close();
  return false;
});
