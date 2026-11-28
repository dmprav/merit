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
import type { InvitationMessage } from "@merit/organizations/api";
import type { WorkspaceChangeObserver } from "@merit/organizations/domain";
import { createOrganizationService, type InvitationWork } from "@merit/organizations/server";
import { productLinks } from "@merit/product/links";
import { createRecommendationsService } from "@merit/recommendations/server";
import { applicationRecommendationWork } from "@merit/recommendations/server/integrations";
import type { ReviewerMessage } from "@merit/reviews/api";
import type { AiReviewer } from "@merit/reviews/domain";
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
import { reportError } from "@merit/telemetry/errors";
import type { OutcomeWait } from "@merit/workflows/outcome";

import type { EmailSender } from "./email-delivery.server";
import type { OrganizationIdentity } from "./identity.server";
import { sendInvitationEmail } from "./invitation-email.server";
import { readInvitationKey } from "./runtime-config.server";

type Dependencies = {
  invitationKey?: () => Uint8Array;
  database: <T>(operation: (db: Database) => Promise<T>) => Promise<T>;
  analytics?: ServerAnalytics;
  identity: OrganizationIdentity;
  networkAddress?: string;
  /**
   * Starts a reviewer message's delivery workflow after its record commits. It never rejects
   * and answers whether the work runs or ran.
   */
  startReviewerMessage: (work: ReviewerMessageWork) => Promise<boolean>;
  /** Starts an organization invitation's delivery workflow after it commits; it never rejects. */
  startOrganizationInvitation: (work: InvitationWork) => Promise<boolean>;
  /** How long a request waits for the first delivery outcome. */
  deliveryWait?: OutcomeWait;
  deferReviewerDelivery?: (delivery: ReviewerDelivery) => void;
  /** Absent when no model provider is configured on this server. */
  aiReviewer?: AiReviewer;
};

/** What the delivery activities, which run in the worker, need to send an email. */
type DeliveryDependencies = Pick<Dependencies, "database"> & {
  /** The origin of the links in emails, which only the worker needs. */
  invitationOrigin: string;
  sendEmail: EmailSender;
};

/** What the delivery activities, which run in the worker, need to send a reviewer message. */
export const reviewerMessageDelivery = ({
  database,
  invitationOrigin,
  sendEmail,
}: DeliveryDependencies) => ({
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
const createGrantWorkServices = (
  database: Dependencies["database"],
  observe: Observe,
  aiReviewer: AiReviewer | undefined,
) => ({
  grantmaking: instrumentService(
    "grantmaking",
    createGrantmakingService({ database, aiReviewProvider: aiReviewer }),
  ),
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

/** What the delivery activities, which run in the worker, need to send an organization invitation. */
export const organizationInvitationDelivery = ({
  database,
  invitationOrigin,
  sendEmail,
}: DeliveryDependencies) => ({
  database,
  invitationUrl: (token: string) => new URL(productLinks.invitation(token), invitationOrigin).href,
  sendInvitation: (message: InvitationMessage) => sendInvitationEmail(message, sendEmail),
});

/** Telemetry sees the operation only: the cause of a failed read can carry record details. */
const reportOutcomeError = (operation: string) => () =>
  reportError(new Error("A delivery outcome could not be read."), {
    surface: "server",
    operation,
  });

const reportInvitationOutcomeError = reportOutcomeError("organization-invitation.outcome");
const reportReviewerOutcomeError = reportOutcomeError("reviewer-message.outcome");

/** Manager review commands, AI reviews and reviewer participation share one review capability. */
const createReviewServices = (
  { database, startReviewerMessage, deliveryWait, deferReviewerDelivery, aiReviewer }: Dependencies,
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
      database,
      start: startReviewerMessage,
      wait: deliveryWait,
      deferDelivery: deferReviewerDelivery,
      onOutcomeError: reportReviewerOutcomeError,
      onSubmitted: observe("assessment_submitted"),
    }),
  ),
});

export const createApplicationServices = (dependencies: Dependencies) => {
  const {
    invitationKey = readInvitationKey,
    database,
    analytics,
    identity,
    networkAddress,
    startOrganizationInvitation,
    deliveryWait,
    aiReviewer,
  } = dependencies;

  const observe: Observe = (event) =>
    analytics && ((workspace) => analytics.captureGrantOutcome({ event, ...workspace }));

  const grantWork = createGrantWorkServices(database, observe, aiReviewer);

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
      invitationKey,
      revokeReviewAccess: revokeMembershipReviews,
      database,
      ...identity,
      networkAddress,
      start: startOrganizationInvitation,
      wait: deliveryWait,
      onOutcomeError: reportInvitationOutcomeError,
    }),
  );

  return {
    ...grantWork,
    ...createReviewServices(dependencies, observe),
    navigation,
    contacts,
    organizations,
  };
};
