import type { Database, Transaction } from "@merit/db";

/** Grant usage supplied by the host; archival checks run under the organization lock. */
export interface ContactGrantWork {
  applicationTitles: (db: Database, organizationId: string) => Promise<Map<string, string[]>>;
  outstandingRequests: (
    tx: Transaction,
    organizationId: string,
    contactId: string,
  ) => Promise<{ publicId: string; title: string }[]>;
}
