import type {
  IntakeApplication,
  WorkingRevision,
  MaterialVersion,
} from "@merit/applications/domain";
import type { Provenance } from "@merit/auth";
import type { MoneyData } from "@merit/money";

type ChangeRecord<T> = {
  revision: number;
  action: string;
  reason: string | null;
  recordedAt: string;
  actor: string | null;
  provenance: Provenance | null;
  before: T | null;
  after: T | null;
};

/** Current editing facts shared by interfaces, independently of page transport. */
export type IntakeState = {
  materialVersions?: MaterialVersion[];
  revision: number;
  workingRevision: WorkingRevision | null;
  history: ChangeRecord<Omit<IntakeApplication, "requested"> & { requested: MoneyData | null }>[];
};

export type PreparationState = {
  revision: number;
  managers: { userId: string; name: string | null; email: string | null }[];
  budgetHistory: ChangeRecord<MoneyData>[];
};
