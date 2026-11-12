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
  decodeRoundView,
} from "@merit/grantmaking/api";

import { WorkspaceNavigationContext } from "../../workspace/workspace-navigation";
import { workspaceCreationData } from "./creation/workspace-data";
import { workspaceIntakeData } from "./intake/workspace-data";
import { workspacePreparationData } from "./preparation/workspace-data";
import { applicationOptions, roundOptions, roundsOptions } from "./queries";
import { workspaceRecommendationData } from "./recommendations/workspace-data";
import { workspaceReviewData } from "./reviews/workspace-data";
import { saveRecommendation } from "./server/recommendations/recommendations.functions";

export const useWorkspaceRoundData = (workspaceSlug: string, publicId: string) => {
  const client = useQueryClient();
  const navigate = useNavigate();
  const { data: current } = useSuspenseQuery(roundOptions(workspaceSlug, publicId));

  return useMemo(() => {
    if (current.status !== "ok") {
      return current;
    }

    const data: RoundData = {
      round: decodeRoundView(current.round),
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
      ),
    };

    return { status: "ok" as const, data, workspaceSlug: current.workspaceSlug };
  }, [current, client, workspaceSlug, publicId, navigate]);
};

export const useWorkspaceApplicationData = (workspaceSlug: string, publicId: string) => {
  const { workspaces } = useContext(WorkspaceNavigationContext);
  const inviteReviewers = workspaces.some(
    (workspace) => workspace.slug === workspaceSlug && workspace.kind === "standard",
  );
  const client = useQueryClient();
  const { mutateAsync: save } = useMutation({
    mutationFn: (input: Parameters<typeof saveRecommendation>[0]) => saveRecommendation(input),
  });
  const { data: current } = useSuspenseQuery(applicationOptions(workspaceSlug, publicId));

  return useMemo(() => {
    if (current.status !== "ok") {
      return current;
    }

    const data: ApplicationData = {
      ...decodeApplicationDetail(current),
      key: current.application.id,
      intake: workspaceIntakeData(client, workspaceSlug, publicId, current.intake),
      reviews: workspaceReviewData(client, workspaceSlug, publicId, inviteReviewers),
      recommendation: workspaceRecommendationData(
        client,
        workspaceSlug,
        publicId,
        current.recommendationVersion,
        save,
      ),
    };

    return { status: "ok" as const, data, workspaceSlug: current.workspaceSlug };
  }, [current, client, workspaceSlug, publicId, save, inviteReviewers]);
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
