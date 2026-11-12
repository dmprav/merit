import { createApplicationsService } from "@merit/applications/server";
import { roundHasApplications } from "@merit/applications/server/integrations";
import { recordAuditEvent } from "@merit/audit/server/record";
import { createContactService } from "@merit/contacts/server";
import type { Database } from "@merit/db";
import { renderReviewerEmail } from "@merit/emails/reviewer";
import { createGrantmakingService, createNavigationService } from "@merit/grantmaking/server";
import { applicationWork } from "@merit/grantmaking/server/integrations";
import { fundingRoundContactUsage } from "@merit/grantmaking/server/integrations";
import { createOrganizationService, getWorkspace } from "@merit/organizations/server";
import type { WorkspaceServices } from "@merit/product/context";
import { productLinks } from "@merit/product/links";
import { createRecommendationsService } from "@merit/recommendations/server";
import { createReviewService } from "@merit/reviews/server";
import { createReviewerService } from "@merit/reviews/server";
import { createRoundsService } from "@merit/rounds/server";

import type { EmailSender } from "./email-delivery.server";
import type { OrganizationIdentity } from "./identity.server";
import { sendInvitationEmail } from "./invitation-email.server";

export const createApplicationServices = ({
  database,
  identity,
  invitationOrigin,
  networkAddress,
  sendEmail,
}: {
  database: <T>(operation: (db: Database) => Promise<T>) => Promise<T>;
  identity: OrganizationIdentity;
  invitationOrigin: string;
  networkAddress?: string;
  sendEmail: EmailSender;
}) => {
  const grantmaking = {
    ...createGrantmakingService({ database }),
    ...createRoundsService({ database, roundHasApplications, recordAuditEvent }),
    ...createApplicationsService({ database, work: applicationWork, recordAuditEvent }),
    ...createRecommendationsService({ database, recordAuditEvent }),
    ...createReviewService({ database, recordAuditEvent }),
  };
  const navigation = createNavigationService({ database, verifiedEmails: identity.verifiedEmails });
  const reviewer = createReviewerService({
    database,
    verifiedEmails: identity.verifiedEmails,
    recordAuditEvent,
    reviewerUrl: (id) => new URL(productLinks.review(id), invitationOrigin).href,
    managerUrl: (slug, id) =>
      new URL(
        `/app/${encodeURIComponent(slug)}/applications/${encodeURIComponent(id)}?tab=reviews`,
        invitationOrigin,
      ).href,
    send: async (message) =>
      sendEmail({ id: message.id, to: message.to, ...(await renderReviewerEmail(message)) }),
  });
  const contacts = createContactService({ database, grantWork: fundingRoundContactUsage });
  const organizations = createOrganizationService({
    database,
    ...identity,
    networkAddress,
    invitationUrl: (token) => new URL(productLinks.invitation(token), invitationOrigin).href,
    sendInvitation: (message) => sendInvitationEmail(message, sendEmail),
  });

  const readWorkspace: WorkspaceServices["readWorkspace"] = (actor, slug) =>
    database((db) => getWorkspace(db, actor, slug));

  return { grantmaking, reviewer, navigation, contacts, organizations, readWorkspace };
};
