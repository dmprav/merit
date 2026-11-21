import type { ContactGrantWork } from "@merit/contacts/server/grant-work";

import { applicantContactLinks } from "./persistence/queries/contact-links";

export { roundHasApplications } from "./persistence/commands/round-usage";

export const contactApplicationWork: ContactGrantWork["applications"] = {
  applicationLinks: applicantContactLinks,
};
