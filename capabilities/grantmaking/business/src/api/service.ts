import type { z } from "zod";

import type { ApplicationsService, IntakeState } from "@merit/applications/api";
import type { Actor } from "@merit/auth";
import type { RecommendationsService } from "@merit/recommendations/api";
import type { ReviewService } from "@merit/reviews/api";
import type { PreparationState, RoundsService } from "@merit/rounds/api";

import type { ApplicationRequest, PublicRoundRequest } from "./queries";
import type { workspaceActivityInput, WorkspaceActivity } from "./queries/activity";
import type {
  WorkspaceApplicationsPage,
  WorkspaceApplicationsInput,
} from "./queries/application-overview";
import type {
  applicationAuditInput,
  roundBudgetHistoryInput,
  reviewListInput,
  reviewSummarySchema,
  contactApplicationListInput,
  contactApplicationSummarySchema,
  roundReadInput,
  applicationReadInput,
  roundListInput,
  applicationListInput,
  roundContentInput,
  applicationContentInput,
  roundHistoryInput,
  applicationHistoryInput,
  roundSummarySchema,
  applicationSummarySchema,
  roundOverviewSchema,
  applicationContextSchema,
  contentChunkSchema,
  historySummarySchema,
} from "./queries/reading";
import type { RoundPage } from "./queries/round-page";
import type { RoundSummary } from "./queries/round-summary";
import type { ApplicationView, ApplicationRoundContext } from "./queries/round-view";
import type { workspaceSearchInput, WorkspaceSearch } from "./queries/workspace-search";

type NotFound = { status: "not_found" };

type Conflict = { status: "conflict" };

type ContentResult =
  | z.output<typeof contentChunkSchema>
  | NotFound
  | Conflict
  | { status: "invalid_range" };

type HistoryResult =
  | {
      status: "ok";
      entries: z.output<typeof historySummarySchema>[];
      nextRevision: number | null;
    }
  | NotFound;

type ApplicationListResult =
  | {
      status: "ok";
      applications: z.output<typeof applicationSummarySchema>[];
      nextCursor: string | null;
    }
  | NotFound;

/** Authorized business operations shared by transports; each call supplies its current actor. */
export interface GrantmakingQueries {
  applicationAuditHistory: (
    actor: Actor,
    input: z.input<typeof applicationAuditInput>,
  ) => Promise<
    { status: "ok"; entries: IntakeState["history"]; nextCursor: string | null } | NotFound
  >;
  roundBudgetHistory: (
    actor: Actor,
    input: z.input<typeof roundBudgetHistoryInput>,
  ) => Promise<
    | { status: "ok"; entries: PreparationState["budgetHistory"]; nextCursor: string | null }
    | NotFound
  >;
  readApplicationPage: (
    actor: Actor,
    input: ApplicationRequest,
  ) => Promise<{
    intake: IntakeState;
    application: ApplicationView;
    round: ApplicationRoundContext;
    workspaceSlug: string;
    recommendationVersion: number;
  } | null>;
  readRoundPage: (
    actor: Actor,
    input: PublicRoundRequest,
  ) => Promise<{
    round: RoundPage;
    workspaceSlug: string;
    preparation: PreparationState;
  } | null>;
  listRounds: (
    actor: Actor,
    workspaceSlug: string,
  ) => Promise<{ status: "ok"; rounds: RoundSummary[] } | NotFound | { status: "forbidden" }>;
  listWorkspaceApplications: (
    actor: Actor,
    input: WorkspaceApplicationsInput,
  ) => Promise<({ status: "ok" } & WorkspaceApplicationsPage) | NotFound | { status: "forbidden" }>;
  searchWorkspace: (
    actor: Actor,
    input: z.input<typeof workspaceSearchInput>,
  ) => Promise<WorkspaceSearch | NotFound | { status: "forbidden" }>;
  listWorkspaceActivity: (
    actor: Actor,
    input: z.input<typeof workspaceActivityInput>,
  ) => Promise<WorkspaceActivity | NotFound | { status: "forbidden" | "invalid" }>;
  listReviews: (
    actor: Actor,
    input: z.input<typeof reviewListInput>,
  ) => Promise<
    | { status: "ok"; reviews: z.output<typeof reviewSummarySchema>[]; nextCursor: string | null }
    | NotFound
  >;
  listContactApplications: (
    actor: Actor,
    input: z.input<typeof contactApplicationListInput>,
  ) => Promise<
    | {
        status: "ok";
        applications: z.output<typeof contactApplicationSummarySchema>[];
        nextCursor: string | null;
      }
    | NotFound
  >;
  listRoundSummaries: (
    actor: Actor,
    input: z.input<typeof roundListInput>,
  ) => Promise<
    | { status: "ok"; rounds: z.output<typeof roundSummarySchema>[]; nextCursor: string | null }
    | NotFound
    | { status: "forbidden" }
  >;
  readRound: (
    actor: Actor,
    input: z.input<typeof roundReadInput>,
  ) => Promise<{ status: "ok"; round: z.output<typeof roundOverviewSchema> } | NotFound>;
  listApplications: (
    actor: Actor,
    input: z.input<typeof applicationListInput>,
  ) => Promise<ApplicationListResult>;
  readApplication: (
    actor: Actor,
    input: z.input<typeof applicationReadInput>,
  ) => Promise<{ status: "ok"; application: z.output<typeof applicationContextSchema> } | NotFound>;
  roundContent: (actor: Actor, input: z.input<typeof roundContentInput>) => Promise<ContentResult>;
  applicationContent: (
    actor: Actor,
    input: z.input<typeof applicationContentInput>,
  ) => Promise<ContentResult>;
  roundHistory: (actor: Actor, input: z.input<typeof roundHistoryInput>) => Promise<HistoryResult>;
  applicationHistory: (
    actor: Actor,
    input: z.input<typeof applicationHistoryInput>,
  ) => Promise<HistoryResult>;
}

export interface GrantmakingService
  extends
    GrantmakingQueries,
    RoundsService,
    ApplicationsService,
    ReviewService,
    RecommendationsService {}
