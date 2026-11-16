import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import type { ActivityFilters } from "@merit/grantmaking-web/contracts/pages";
import { applicationListOptions } from "@merit/grantmaking-web/data/applications";
import type { WorkspaceApplicationsInput } from "@merit/grantmaking/api";
import { workspaceSlugSchema } from "@merit/organizations/api";
import { available } from "@merit/query";

import { grantWorkQueryKey } from "../../../shared/grant-work-query-key";
import { publicIdFromRef } from "../contracts/resource-url";
import { applicationListSource } from "./application-list-source";
import { readWorkspaceActivity } from "./server/activity.functions";
import {
  readFundingRounds,
  readFundingRoundPage,
  readFundingApplicationPage,
} from "./server/funding-round.functions";

export const fundingRoundsQueryKey = (workspaceSlug: string) =>
  [...grantWorkQueryKey(workspaceSlug), "funding-rounds"] as const;

export const roundsOptions = (workspaceSlug: string) =>
  queryOptions({
    queryKey: [...fundingRoundsQueryKey(workspaceSlug), "list"],
    queryFn: async ({ signal }) =>
      available(await readFundingRounds({ signal, data: workspaceSlug })),
  });

export const roundOptions = (workspaceSlug: string, publicId: string) =>
  queryOptions({
    queryKey: [...fundingRoundsQueryKey(workspaceSlug), "round", publicId],
    queryFn: async ({ signal }) =>
      !publicIdFromRef(publicId) || !workspaceSlugSchema.safeParse(workspaceSlug).success
        ? ({ status: "not_found" } as const)
        : available(
            await readFundingRoundPage({
              signal,
              data: { workspaceSlug, publicId, kind: "round" },
            }),
          ),
  });

export const applicationOptions = (workspaceSlug: string, publicId: string) =>
  queryOptions({
    queryKey: [...fundingRoundsQueryKey(workspaceSlug), "application", publicId],
    queryFn: async ({ signal }) =>
      !publicIdFromRef(publicId) || !workspaceSlugSchema.safeParse(workspaceSlug).success
        ? ({ status: "not_found" } as const)
        : available(
            await readFundingApplicationPage({ signal, data: { workspaceSlug, publicId } }),
          ),
  });

export const applicationsOptions = (
  workspaceSlug: string,
  options: Omit<WorkspaceApplicationsInput, "workspaceSlug"> = {},
) => applicationListOptions(applicationListSource, { ...options, workspaceSlug });

export const activityOptions = (workspaceSlug: string, filters: ActivityFilters) =>
  infiniteQueryOptions({
    queryKey: [...grantWorkQueryKey(workspaceSlug), "activity", filters],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ signal, pageParam }) =>
      available(
        await readWorkspaceActivity({
          signal,
          data: {
            workspaceSlug,
            roundId: filters.roundId || undefined,
            personId: filters.personId || undefined,
            after: pageParam,
          },
        }),
      ),
    getNextPageParam: (page) => (page.status === "ok" ? (page.nextCursor ?? undefined) : undefined),
  });
