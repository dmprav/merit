import { createApplicationsService } from "@merit/applications/server";
import { roundHasApplications } from "@merit/applications/server/integrations";
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
  const grantmakingQueries = createGrantmakingService({ database });
  const rounds = createRoundsService({ database, roundHasApplications });
  const applications = createApplicationsService({ database, work: applicationWork });
  const recommendations = createRecommendationsService({ database });
  const reviews = createReviewService({ database });
  const grantmaking = {
    ...grantmakingQueries,
    ...rounds,
    ...applications,
    ...recommendations,
    ...reviews,
  };
  const navigation = createNavigationService({ database, verifiedEmails: identity.verifiedEmails });
  const reviewer = createReviewerService({
    database,
    verifiedEmails: identity.verifiedEmails,
    reviewerUrl: (id) => new URL(productLinks.review(id), invitationOrigin).href,
    managerUrl: (slug, id) =>
      new URL(productLinks.application(slug, id, { tab: "reviews" }), invitationOrigin).href,
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

  return {
    grantmaking,
    grantmakingQueries,
    rounds,
    applications,
    recommendations,
    reviews,
    reviewer,
    navigation,
    contacts,
    organizations,
    readWorkspace,
  };
};
