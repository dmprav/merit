import type { ContactGrantWork } from "@merit/contacts/server/grant-work";

import {
  contactApplicationTitles,
  outstandingContactRequests,
} from "./persistence/queries/contact-usage";

export const fundingRoundContactUsage: ContactGrantWork = {
  applicationTitles: contactApplicationTitles,
  outstandingRequests: outstandingContactRequests,
};

export { applicationWork } from "./persistence/commands/application-work";
