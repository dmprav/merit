import type { ContactService } from "@merit/contacts/api";

export type ContactOperations = Pick<
  ContactService,
  "listContactSummaries" | "getContact" | "changeContact"
>;
