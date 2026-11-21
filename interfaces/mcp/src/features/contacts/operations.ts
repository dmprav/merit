import type { ContactService } from "@merit/contacts/api";
import type { GrantmakingQueries } from "@merit/grantmaking/api";

export type ContactOperations = Pick<
  ContactService,
  "listContactSummaries" | "getContact" | "changeContact"
>;

export type ContactApplicationOperations = Pick<GrantmakingQueries, "listContactApplications">;
