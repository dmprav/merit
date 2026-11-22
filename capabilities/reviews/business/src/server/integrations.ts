import type { ContactGrantWork } from "@merit/contacts/server/grant-work";

import { outstandingContactRequests } from "./persistence/commands/contact-work";
import { reviewContactLinks } from "./persistence/queries/contact-links";

export { applicationReviewWork } from "./persistence/commands/application-work";
export { revokeMembershipReviews } from "./persistence/commands/membership";
export { isCurrentAssessment } from "./persistence/overview";

export const contactReviewWork: ContactGrantWork["reviews"] = {
  applicationLinks: reviewContactLinks,
  outstandingRequests: outstandingContactRequests,
};
