import type { RecordedChange } from "@merit/audit/api";
import type { MoneyData } from "@merit/money";

import type { IntakeApplication, MaterialVersion, WorkingRevision } from "../domain";

/** Current intake editing facts shared by interfaces, independently of page transport. */
export type IntakeState = {
  materialVersions?: MaterialVersion[];
  revision: number;
  workingRevision: WorkingRevision | null;
  /** Committee decision facts Decisions owns, for actions the case's decision rules out. */
  decisions?: { hasDecision: boolean; hasCommitment: boolean };
  history: RecordedChange<Omit<IntakeApplication, "requested"> & { requested: MoneyData | null }>[];
};
