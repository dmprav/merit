import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useContext, useMemo } from "react";

import type {
  ApplicationData,
  RoundData,
  RoundsData,
} from "@merit/grantmaking-web/contracts/pages";
import {
  decodeApplicationDetail,
  decodeRoundSummary,
  decodeRoundPage,
} from "@merit/grantmaking/api";

import { WorkspaceNavigationContext } from "../../workspace/workspace-navigation";
import { workspaceCreationData } from "./creation/workspace-data";
import { workspaceDecisionData } from "./decisions/workspace-data";
import { workspaceIntakeData } from "./intake/workspace-data";
import { workspacePreparationData } from "./preparation/workspace-data";
import { applicationOptions, roundOptions, roundsOptions } from "./queries";
import { workspaceRecommendationData } from "./recommendations/workspace-data";
import { workspaceReviewData } from "./reviews/workspace-data";
import { recordDecision } from "./server/decisions/decisions.functions";
import { saveRecommendation } from "./server/recommendations/recommendations.functions";
import { useWorkspaceApplications } from "./workspace-applications";

export const useWorkspaceRoundData = (workspaceSlug: string, publicId: string) => {
  const client = useQueryClient();
  const navigate = useNavigate();
  const { workspaces } = useContext(WorkspaceNavigationContext);
  const kind = workspaces.find((workspace) => workspace.slug === workspaceSlug)?.kind;
  const { data: current } = useSuspenseQuery(roundOptions(workspaceSlug, publicId));
  const applicationList = useWorkspaceApplications(workspaceSlug, {
    viewId: publicId,
    roundId: publicId || undefined,
    enabled: current.status === "ok",
  });

  return useMemo(() => {
    if (current.status !== "ok") {
      return current;
    }

    if (applicationList.status !== "ok") {
      return { status: applicationList.status };
    }
    const data: RoundData = {
      applicationList,
      round: decodeRoundPage(current.round),
      preparation: workspacePreparationData(client, workspaceSlug, publicId, current.preparation),
      createApplication: workspaceCreationData(
        client,
        {
          kind: "application",
          workspaceSlug,
          roundPublicId: publicId,
          roundTitle: current.round.title,
        },
        navigate,
        kind,
      ),
    };

    return { status: "ok" as const, data, workspaceSlug: current.workspaceSlug };
  }, [current, client, workspaceSlug, publicId, navigate, applicationList, kind]);
};

export const useWorkspaceApplicationData = (workspaceSlug: string, publicId: string) => {
  const { workspaces } = useContext(WorkspaceNavigationContext);
  const kind = workspaces.find((workspace) => workspace.slug === workspaceSlug)?.kind;
  const inviteReviewers = kind === "standard";
  const client = useQueryClient();
  const { mutateAsync: save } = useMutation({
    mutationFn: (input: Parameters<typeof saveRecommendation>[0]) => saveRecommendation(input),
  });
  const { mutateAsync: saveDecision } = useMutation({
    mutationFn: (input: Parameters<typeof recordDecision>[0]) => recordDecision(input),
  });
  const { data: current } = useSuspenseQuery(applicationOptions(workspaceSlug, publicId));

  return useMemo(() => {
    if (current.status !== "ok") {
      return current;
    }

    const data: ApplicationData = {
      ...decodeApplicationDetail(current),
      key: current.application.id,
      intake: workspaceIntakeData(client, workspaceSlug, publicId, current.intake, kind),
      reviews: workspaceReviewData(client, workspaceSlug, publicId, inviteReviewers),
      recommendation: workspaceRecommendationData(
        client,
        workspaceSlug,
        publicId,
        current.recommendationVersion,
        save,
      ),
      decision: workspaceDecisionData(
        client,
        workspaceSlug,
        publicId,
        current.decision,
        saveDecision,
      ),
    };

    return { status: "ok" as const, data, workspaceSlug: current.workspaceSlug };
  }, [current, client, workspaceSlug, publicId, save, saveDecision, inviteReviewers, kind]);
};

export const useWorkspaceRoundsData = (workspaceSlug: string, workspaceName: string) => {
  const client = useQueryClient();
  const navigate = useNavigate();
  const { data: result } = useSuspenseQuery(roundsOptions(workspaceSlug));
  if (result.status !== "ok") {
    return result;
  }

  const data: RoundsData = {
    rounds: result.rounds.map(decodeRoundSummary),
    createRound: workspaceCreationData(
      client,
      {
        kind: "round",
        workspaceSlug,
        workspaceName,
      },
      navigate,
    ),
  };

  return { status: "ok" as const, data };
};
