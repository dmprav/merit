import type { GrantOutcome, ServerAnalytics } from "@merit/analytics/server";
import { createApplicationsService } from "@merit/applications/server";
import {
  contactApplicationWork,
  roundHasApplications,
} from "@merit/applications/server/integrations";
import { createContactService } from "@merit/contacts/server";
import type { Database } from "@merit/db";
import { createDecisionsService } from "@merit/decisions/server";
import { applicationDecisionWork, roundCommitments } from "@merit/decisions/server/integrations";
import { renderReviewerEmail } from "@merit/emails/reviewer";
import { createGrantmakingService, createNavigationService } from "@merit/grantmaking/server";
import type { WorkspaceChangeObserver } from "@merit/organizations/domain";
import { createOrganizationService } from "@merit/organizations/server";
import { productLinks } from "@merit/product/links";
import { createRecommendationsService } from "@merit/recommendations/server";
import { applicationRecommendationWork } from "@merit/recommendations/server/integrations";
import type { ReviewerMessage } from "@merit/reviews/api";
import { createReviewService } from "@merit/reviews/server";
import { createReviewerService, type ReviewerDelivery } from "@merit/reviews/server";
import {
  applicationReviewWork,
  contactReviewWork,
  isCurrentAssessment,
  revokeMembershipReviews,
} from "@merit/reviews/server/integrations";
import { createRoundsService } from "@merit/rounds/server";
import { instrumentService } from "@merit/telemetry";

import type { EmailSender } from "./email-delivery.server";
import type { OrganizationIdentity } from "./identity.server";
import { sendInvitationEmail } from "./invitation-email.server";

type Dependencies = {
  database: <T>(operation: (db: Database) => Promise<T>) => Promise<T>;
  analytics?: ServerAnalytics;
  identity: OrganizationIdentity;
  invitationOrigin: string;
  networkAddress?: string;
  sendEmail: EmailSender;
  deferReviewerDelivery?: (delivery: ReviewerDelivery) => void;
};

export const reviewerDelivery = ({
  database,
  invitationOrigin,
  sendEmail,
}: Pick<Dependencies, "database" | "invitationOrigin" | "sendEmail">) => ({
  database,
  reviewerUrl: (slug: string, id: string) =>
    new URL(productLinks.review(slug, id), invitationOrigin).href,
  managerUrl: (slug: string, id: string) =>
    new URL(productLinks.application(slug, id, { tab: "reviews" }), invitationOrigin).href,
  send: async (message: ReviewerMessage) =>
    sendEmail({ id: message.id, to: message.to, ...(await renderReviewerEmail(message)) }),
});

type Observe = (event: GrantOutcome["event"]) => WorkspaceChangeObserver | undefined;

/** The services that carry grant work through its lifecycle, from rounds to committee decisions. */
const createGrantWorkServices = (database: Dependencies["database"], observe: Observe) => ({
  grantmaking: instrumentService("grantmaking", createGrantmakingService({ database })),
  rounds: instrumentService(
    "rounds",
    createRoundsService({
      database,
      roundHasApplications,
      roundCommitments,
      onCreated: observe("round_created"),
    }),
  ),
  applications: instrumentService(
    "applications",
    createApplicationsService({
      database,
      onCreated: observe("application_recorded"),
      work: {
        reviews: applicationReviewWork,
        recommendations: applicationRecommendationWork,
        decisions: applicationDecisionWork,
      },
    }),
  ),
  recommendations: instrumentService(
    "recommendations",
    createRecommendationsService({
      database,
      isCurrentAssessment,
      onSaved: observe("funding_recommendation_saved"),
    }),
  ),
  decisions: instrumentService(
    "decisions",
    createDecisionsService({ database, onSaved: observe("committee_decision_recorded") }),
  ),
});

export const createApplicationServices = ({
  database,
  analytics,
  identity,
  invitationOrigin,
  networkAddress,
  sendEmail,
  deferReviewerDelivery,
}: Dependencies) => {
  const observe: Observe = (event) =>
    analytics && ((workspace) => analytics.captureGrantOutcome({ event, ...workspace }));

  const grantWork = createGrantWorkServices(database, observe);
  const reviews = instrumentService("reviews", createReviewService({ database }));

  const navigation = instrumentService("navigation", createNavigationService({ database }));
  const reviewer = instrumentService(
    "reviewer",
    createReviewerService({
      ...reviewerDelivery({ database, invitationOrigin, sendEmail }),
      deferDelivery: deferReviewerDelivery,
      onSubmitted: observe("assessment_submitted"),
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
    ...grantWork,
    reviews,
    reviewer,
    navigation,
    contacts,
    organizations,
  };
};
