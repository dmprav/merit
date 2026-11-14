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
import { revokeMembershipReviews } from "@merit/reviews/server/integrations";
import { createRoundsService } from "@merit/rounds/server";
import { instrumentService, withSpan } from "@merit/telemetry";

import type { EmailSender } from "./email-delivery.server";
import type { OrganizationIdentity } from "./identity.server";
import { sendInvitationEmail } from "./invitation-email.server";

const createGrantmakingServices = (
  database: <T>(operation: (db: Database) => Promise<T>) => Promise<T>,
) => {
  const grantmakingQueries = instrumentService(
    "grantmaking",
    createGrantmakingService({ database }),
  );
  const rounds = instrumentService(
    "rounds",
    createRoundsService({ database, roundHasApplications }),
  );
  const applications = instrumentService(
    "applications",
    createApplicationsService({ database, work: applicationWork }),
  );
  const recommendations = instrumentService(
    "recommendations",
    createRecommendationsService({ database }),
  );
  const reviews = instrumentService("reviews", createReviewService({ database }));

  return {
    grantmaking: {
      ...grantmakingQueries,
      ...rounds,
      ...applications,
      ...recommendations,
      ...reviews,
    },
    grantmakingQueries,
    rounds,
    applications,
    recommendations,
    reviews,
  };
};

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
  const { grantmaking, grantmakingQueries, rounds, applications, recommendations, reviews } =
    createGrantmakingServices(database);
  const navigation = instrumentService(
    "navigation",
    createNavigationService({ database, verifiedEmails: identity.verifiedEmails }),
  );
  const reviewer = instrumentService(
    "reviewer",
    createReviewerService({
      database,
      verifiedEmails: identity.verifiedEmails,
      reviewerUrl: (id) => new URL(productLinks.review(id), invitationOrigin).href,
      managerUrl: (slug, id) =>
        new URL(productLinks.application(slug, id, { tab: "reviews" }), invitationOrigin).href,
      send: async (message) =>
        sendEmail({ id: message.id, to: message.to, ...(await renderReviewerEmail(message)) }),
    }),
  );
  const contacts = instrumentService(
    "contacts",
    createContactService({ database, grantWork: fundingRoundContactUsage }),
  );
  const organizations = instrumentService(
    "organizations",
    createOrganizationService({
      revokeReviewAccess: revokeMembershipReviews,
      database,
      ...identity,
      networkAddress,
      invitationUrl: (token) => new URL(productLinks.invitation(token), invitationOrigin).href,
      sendInvitation: (message) => sendInvitationEmail(message, sendEmail),
    }),
  );

  const readWorkspace: WorkspaceServices["readWorkspace"] = (actor, slug) =>
    withSpan("service.organizations.readWorkspace", () =>
      database((db) => getWorkspace(db, actor, slug)),
    );

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
