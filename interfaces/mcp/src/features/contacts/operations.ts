import type { ContactService } from "@merit/contacts/api";
import type { GrantmakingService } from "@merit/grantmaking/api";

export type ContactOperations = Pick<
  ContactService,
  "getContact" | "contactHistory" | "changeContact"
> &
  Pick<GrantmakingService, "listContactApplications"> & {
    listContacts: ContactService["listContactSummaries"];
  };
