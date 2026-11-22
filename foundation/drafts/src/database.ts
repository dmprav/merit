import { Dexie, type Table } from "dexie";

type StoredDraft = {
  scope: string;
  kind: string;
  key: string;
  token: string;
  version: number;
  value?: unknown;
};

type DraftScope = { scope: string; epoch: string };

class DraftDatabase extends Dexie {
  declare drafts: Table<StoredDraft, [string, string, string]>;
  declare scopes: Table<DraftScope, string>;

  constructor() {
    super("merit-drafts");
  }
}

// Constructing the database does not open IndexedDB, including during server rendering.
export const database = new DraftDatabase();

database.version(1).stores({
  drafts: "[scope+kind+key], scope, [scope+kind]",
  scopes: "scope",
});

database.on("versionchange", () => {
  // Keep writing in memory instead of reloading a page that may contain unsaved work.
  database.close();
  return false;
});
