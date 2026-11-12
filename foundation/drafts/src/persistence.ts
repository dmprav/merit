import type { DraftValues } from "./types";

export type DraftRecovery<T> = {
  epoch: string;
  drafts: DraftValues<T>;
  tokens: Map<string, string>;
  incompatible: Set<string>;
};

export type DraftWrite = { key: string; value: unknown; token?: string };

export type DraftWriteResult =
  | { status: "cleared" }
  | { status: "saved"; tokens: Map<string, string>; conflicts: Set<string> };

/** Bound to one scope, workflow, and payload format by the persistence adapter. */
export type DraftPersistence<T> = {
  restore: () => Promise<DraftRecovery<T>>;
  /** Compare the epoch and record tokens atomically with committing the changes. */
  write: (epoch: string | undefined, changes: DraftWrite[]) => Promise<DraftWriteResult>;
};
