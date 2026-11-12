import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type { AccessRequestsData, ReviewResult } from "../contracts";
import { accessRequestsOptions } from "./queries";
import { reviewAccessRequest } from "./server/access-requests.functions";

export const useAccessRequestsData = (): AccessRequestsData => {
  const client = useQueryClient();
  const [refreshFailed, setRefreshFailed] = useState(false);

  const refresh = async () => {
    try {
      await client.invalidateQueries(
        { queryKey: accessRequestsOptions().queryKey },
        { throwOnError: true },
      );
      setRefreshFailed(false);
    } catch {
      setRefreshFailed(true);
    }
  };

  const mutation = useMutation({
    mutationFn: async (email: string): Promise<ReviewResult> => {
      let result: ReviewResult;
      try {
        result = await reviewAccessRequest({ data: { email } });
      } catch {
        return { status: "unavailable" };
      }
      if (result.status !== "ok") {
        return result;
      }

      try {
        client.setQueryData(accessRequestsOptions().queryKey, (previous) =>
          previous?.status === "ok"
            ? {
                ...previous,
                value: previous.value.map((request) =>
                  request.email === email ? result.value : request,
                ),
              }
            : previous,
        );
        await refresh();
      } catch {
        // A cache failure cannot undo the committed review.
        setRefreshFailed(true);
      }
      return result;
    },
  });

  return {
    reviewing: mutation.isPending,
    error:
      !mutation.isPending && mutation.data && mutation.data.status !== "ok" ? mutation.data : null,
    refreshFailed,
    review: async (email) => {
      await mutation.mutateAsync(email);
    },
    refresh,
  };
};
