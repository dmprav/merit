import { createApplicationsService } from "@merit/applications/server";
import {
  contactApplicationWork,
  roundHasApplications,
} from "@merit/applications/server/integrations";
import { createContactService } from "@merit/contacts/server";
import type { Database } from "@merit/db";
import { renderReviewerEmail } from "@merit/emails/reviewer";
import { createGrantmakingService, createNavigationService } from "@merit/grantmaking/server";
import { createOrganizationService } from "@merit/organizations/server";
import { productLinks } from "@merit/product/links";
import { createRecommendationsService } from "@merit/recommendations/server";
import { applicationRecommendationWork } from "@merit/recommendations/server/integrations";
import { createReviewService } from "@merit/reviews/server";
import { createReviewerService } from "@merit/reviews/server";
import {
  applicationReviewWork,
  contactReviewWork,
  revokeMembershipReviews,
} from "@merit/reviews/server/integrations";
import { createRoundsService } from "@merit/rounds/server";
import { instrumentService } from "@merit/telemetry";

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
  const grantmaking = instrumentService("grantmaking", createGrantmakingService({ database }));
  const rounds = instrumentService(
    "rounds",
    createRoundsService({ database, roundHasApplications }),
  );
  const applications = instrumentService(
    "applications",
    createApplicationsService({
      database,
      work: { reviews: applicationReviewWork, recommendations: applicationRecommendationWork },
    }),
  );
  const recommendations = instrumentService(
    "recommendations",
    createRecommendationsService({ database }),
  );
  const reviews = instrumentService("reviews", createReviewService({ database }));

  const navigation = instrumentService("navigation", createNavigationService({ database }));
  const reviewer = instrumentService(
    "reviewer",
    createReviewerService({
      database,
      reviewerUrl: (slug, id) => new URL(productLinks.review(slug, id), invitationOrigin).href,
      managerUrl: (slug, id) =>
        new URL(productLinks.application(slug, id, { tab: "reviews" }), invitationOrigin).href,
      send: async (message) =>
        sendEmail({ id: message.id, to: message.to, ...(await renderReviewerEmail(message)) }),
    }),
  );
  const contacts = instrumentService(
    "contacts",
    createContactService({
      database,
      grantWork: { applications: contactApplicationWork, reviews: contactReviewWork },
    }),
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

  return {
    grantmaking,
    rounds,
    applications,
    recommendations,
    reviews,
    reviewer,
    navigation,
    contacts,
    organizations,
  };
};
