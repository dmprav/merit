import type { RecordedChange } from "@merit/audit/api";
import type { MoneyData } from "@merit/money";

import type { IntakeApplication, MaterialVersion, WorkingRevision } from "../domain";

/** Current intake editing facts shared by interfaces, independently of page transport. */
export type IntakeState = {
  materialVersions?: MaterialVersion[];
  revision: number;
  workingRevision: WorkingRevision | null;
  history: RecordedChange<Omit<IntakeApplication, "requested"> & { requested: MoneyData | null }>[];
};
