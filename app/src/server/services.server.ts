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
import { createReviewService } from "@merit/reviews/server";
import {
  createReviewerService,
  type ReviewerDelivery,
  type ReviewerMessageWork,
} from "@merit/reviews/server";
import {
  applicationReviewWork,
  contactReviewWork,
  isCurrentAssessment,
  revokeMembershipReviews,
} from "@merit/reviews/server/integrations";
import { createRoundsService } from "@merit/rounds/server";
import { instrumentService } from "@merit/telemetry";
import type { OutcomeWait } from "@merit/workflows/outcome";

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
  /**
   * Starts a reviewer message's delivery workflow after its record commits. It never rejects
   * and answers whether the work runs or ran.
   */
  startReviewerMessage: (work: ReviewerMessageWork) => Promise<boolean>;
  /** How long a request waits for the first delivery outcome. */
  deliveryWait?: OutcomeWait;
  deferReviewerDelivery?: (delivery: ReviewerDelivery) => void;
};

/** What the delivery activities, which run in the worker, need to send a reviewer message. */
export const reviewerMessageDelivery = ({
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

export const createApplicationServices = ({
  database,
  analytics,
  identity,
  invitationOrigin,
  networkAddress,
  sendEmail,
  startReviewerMessage,
  deliveryWait,
  deferReviewerDelivery,
}: Dependencies) => {
  const observe = (event: GrantOutcome["event"]): WorkspaceChangeObserver | undefined =>
    analytics && ((workspace) => analytics.captureGrantOutcome({ event, ...workspace }));

  const grantmaking = instrumentService("grantmaking", createGrantmakingService({ database }));
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
  const reviews = instrumentService("reviews", createReviewService({ database }));

  const navigation = instrumentService("navigation", createNavigationService({ database }));
  const reviewer = instrumentService(
    "reviewer",
    createReviewerService({
      database,
      start: startReviewerMessage,
      wait: deliveryWait,
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
