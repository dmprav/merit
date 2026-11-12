import type { Database } from "@merit/db";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Grant usage supplied by the host; archival checks run under the organization lock. */
export interface ContactGrantWork {
  applicationTitles: (db: Database, organizationId: string) => Promise<Map<string, string[]>>;
  outstandingRequests: (
    tx: Transaction,
    organizationId: string,
    contactId: string,
  ) => Promise<{ publicId: string; title: string }[]>;
}
