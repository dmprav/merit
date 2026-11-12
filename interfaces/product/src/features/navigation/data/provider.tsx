import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";

import type { NavigationPinChange } from "@merit/grantmaking/api";
import { available, privateKey } from "@merit/query";

import { grantWorkQueryKey } from "../../../shared/grant-work-query-key";
import { NavigationPinsContext } from "../context";
import { changeNavigationPin, readNavigationPins } from "./server/navigation.functions";

export const NavigationPinsProvider = ({ children }: { children: ReactNode }) => {
  const client = useQueryClient();
  const pathname = useLocation({ select: (location) => location.pathname });
  const workspaceSlug = pathname.startsWith("/app/") ? pathname.split("/")[2] : undefined;
  const enabled =
    Boolean(workspaceSlug && workspaceSlug !== "sign-in") || pathname.startsWith("/reviews");
  const query = useQuery({
    queryKey: [
      ...(workspaceSlug ? grantWorkQueryKey(workspaceSlug) : [...privateKey, "reviewer"]),
      "navigation-pins",
    ],
    queryFn: async ({ signal }) => available(await readNavigationPins({ signal })),
    enabled,
    staleTime: 0,
  });
  const mutation = useMutation({
    mutationFn: (data: NavigationPinChange) => changeNavigationPin({ data }),
    onMutate: () =>
      client.cancelQueries({ predicate: (entry) => entry.queryKey.at(-1) === "navigation-pins" }),
    onSuccess: (result) => {
      if (result.status === "ok") {
        client.setQueriesData(
          { predicate: (entry) => entry.queryKey.at(-1) === "navigation-pins" },
          result,
        );
      }
    },
  });

  return (
    <NavigationPinsContext
      value={{
        pins: query.data?.status === "ok" ? query.data.pins : [],
        loading: query.isPending,
        unavailable: query.isError || Boolean(query.data && query.data.status !== "ok"),
        busy: mutation.isPending,
        retry: () => {
          void query.refetch();
        },
        change: async (input) => {
          try {
            const result = await mutation.mutateAsync(input);
            if (result.status !== "ok") {
              void query.refetch();
            }
            return result.status === "ok";
          } catch {
            return false;
          }
        },
      }}
    >
      {children}
    </NavigationPinsContext>
  );
};
