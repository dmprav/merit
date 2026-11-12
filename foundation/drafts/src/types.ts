import type { z } from "zod";

/** Formats belong to features and must accept unfinished input and its original save baseline. */
export type DraftFormat<T> = {
  version: number;
  schema: z.ZodType<T>;
};

export type DraftStatus =
  | "memory"
  | "restoring"
  | "saving"
  | "saved"
  | "unavailable"
  | "conflict"
  | "cleared";

export type DraftValues<T> = Record<string, T | undefined>;

export type DraftSnapshot<T> = {
  drafts: DraftValues<T>;
  status: DraftStatus;
  ready: boolean;
  storageUnavailable: boolean;
};
