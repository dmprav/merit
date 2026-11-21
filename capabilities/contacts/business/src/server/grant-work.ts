import type { Database, Transaction } from "@merit/db";

import type { ApplicationLink } from "../domain/linked-applications";

/** Every link the supplying capability records between a contact and an application. */
type ApplicationLinks = (db: Database, organizationId: string) => Promise<ApplicationLink[]>;

/** Grant work supplied by application assembly; archival checks run under the organization lock. */
export interface ContactGrantWork {
  /** Applications whose applicant contact is the person, supplied by Applications. */
  applications: { applicationLinks: ApplicationLinks };
  /** Review requests and assessments involving the person, supplied by Reviews. */
  reviews: {
    applicationLinks: ApplicationLinks;
    outstandingRequests: (
      tx: Transaction,
      organizationId: string,
      contactId: string,
    ) => Promise<{ publicId: string; title: string }[]>;
  };
}
