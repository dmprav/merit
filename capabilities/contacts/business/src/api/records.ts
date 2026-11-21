import type { ContactDetails } from "../domain/index";

export type ContactRecord = ContactDetails & {
  id: string;
  organizationId: string;
  archived: boolean;
  revision: number;
};
