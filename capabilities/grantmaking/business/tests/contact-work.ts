import { contactApplicationWork } from "@merit/applications/server/integrations";
import type { ContactGrantWork } from "@merit/contacts/server/grant-work";
import { contactReviewWork } from "@merit/reviews/server/integrations";

/** The grant work application assembly supplies to Contacts. */
export const contactWork: ContactGrantWork = {
  applications: contactApplicationWork,
  reviews: contactReviewWork,
};
