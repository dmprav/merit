import type { Database } from "@merit/db";

import type { ApplicationUsage } from "../domain/model";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Collaborators use the caller's transaction and existing workspace/round/case locks. */
export type ApplicationWork = {
  usage: (tx: Transaction, organizationId: string, caseId: string) => Promise<ApplicationUsage>;
};
