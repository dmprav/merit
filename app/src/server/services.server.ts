import type { GrantOutcome, ServerAnalytics } from "@merit/analytics/server";
import { createApplicationsService } from "@merit/applications/server";
import {
  contactApplicationWork,
  roundHasApplications,
} from "@merit/applications/server/integrations";
import { createContactService } from "@merit/contacts/server";
import type { Database } from "@merit/db";
import { renderReviewerEmail } from "@merit/emails/reviewer";
import { createGrantmakingService, createNavigationService } from "@merit/grantmaking/server";
import type { WorkspaceChangeObserver } from "@merit/organizations/domain";
import { createOrganizationService } from "@merit/organizations/server";
import { productLinks } from "@merit/product/links";
import { createRecommendationsService } from "@merit/recommendations/server";
import { applicationRecommendationWork } from "@merit/recommendations/server/integrations";
import type { ReviewerMessage } from "@merit/reviews/api";
import type { AiReviewer } from "@merit/reviews/domain";
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
  /** Absent when no model provider is configured on this server. */
  aiReviewer?: AiReviewer;
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

/** Manager review commands, AI reviews and reviewer participation share one review capability. */
const createReviewServices = (
  { database, invitationOrigin, sendEmail, deferReviewerDelivery, aiReviewer }: Dependencies,
  observe: Observe,
) => ({
  reviews: instrumentService(
    "reviews",
    createReviewService({
      database,
      reviewer: aiReviewer,
      onAiReviewSaved: observe("ai_review_saved"),
    }),
  ),
  reviewer: instrumentService(
    "reviewer",
    createReviewerService({
      ...reviewerDelivery({ database, invitationOrigin, sendEmail }),
      deferDelivery: deferReviewerDelivery,
      onSubmitted: observe("assessment_submitted"),
    }),
  ),
});

export const createApplicationServices = (dependencies: Dependencies) => {
  const { database, analytics, identity, invitationOrigin, networkAddress, sendEmail } =
    dependencies;

  const observe: Observe = (event) =>
    analytics && ((workspace) => analytics.captureGrantOutcome({ event, ...workspace }));

  const grantmaking = instrumentService(
    "grantmaking",
    createGrantmakingService({ database, aiReviewProvider: dependencies.aiReviewer }),
  );
  const rounds = instrumentService(
    "rounds",
    createRoundsService({ database, roundHasApplications, onCreated: observe("round_created") }),
  );
  const applications = instrumentService(
    "applications",
    createApplicationsService({
      database,
      onCreated: observe("application_recorded"),
      work: { reviews: applicationReviewWork, recommendations: applicationRecommendationWork },
    }),
  );
  const recommendations = instrumentService(
    "recommendations",
    createRecommendationsService({
      database,
      isCurrentAssessment,
      onSaved: observe("funding_recommendation_saved"),
    }),
  );
  const navigation = instrumentService("navigation", createNavigationService({ database }));
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
    ...createReviewServices(dependencies, observe),
    navigation,
    contacts,
    organizations,
  };
};
