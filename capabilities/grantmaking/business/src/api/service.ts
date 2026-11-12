import type { z } from "zod";

import type { ApplicationsService } from "@merit/applications/api";
import type { Actor } from "@merit/auth";
import type { RecommendationsService } from "@merit/recommendations/api";
import type { ReviewService } from "@merit/reviews/api";
import type { RoundsService } from "@merit/rounds/api";

import type { ApplicationRequest, PublicRoundRequest } from "./queries";
import type { workspaceActivityInput, WorkspaceActivity } from "./queries/activity";
import type { ApplicationOverview } from "./queries/application-overview";
import type { IntakeState, PreparationState } from "./queries/editing-state";
import type {
  reviewListInput,
  reviewSummarySchema,
  contactApplicationListInput,
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
import type { RoundSummary } from "./queries/round-summary";
import type { ApplicationView, ApplicationRoundContext, RoundView } from "./queries/round-view";

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
    round: RoundView;
    workspaceSlug: string;
    preparation: PreparationState;
  } | null>;
  listRounds: (
    actor: Actor,
    workspaceSlug: string,
  ) => Promise<{ status: "ok"; rounds: RoundSummary[] } | NotFound | { status: "forbidden" }>;
  listWorkspaceApplications: (
    actor: Actor,
    workspaceSlug: string,
  ) => Promise<
    { status: "ok"; applications: ApplicationOverview[] } | NotFound | { status: "forbidden" }
  >;
  listWorkspaceActivity: (
    actor: Actor,
    input: z.input<typeof workspaceActivityInput>,
  ) => Promise<WorkspaceActivity | NotFound | { status: "forbidden" }>;
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
  ) => Promise<ApplicationListResult>;
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
