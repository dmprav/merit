import type { Provenance } from "@merit/auth";

import type { ContactDetails } from "../domain/index";

export type ContactRecord = ContactDetails & {
  id: string;
  organizationId: string;
  archived: boolean;
  revision: number;
};

export type ContactHistoryEntry = {
  contactId: string;
  revision: number;
  actor: string | null;
  provenance: Provenance | null;
  recordedAt: string;
  before: (ContactDetails & { archived: boolean }) | null;
  after: ContactDetails & { archived: boolean };
};
