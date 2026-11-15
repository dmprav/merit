import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { useRef, type ReactNode } from "react";

import type { NavigationPinChange } from "@merit/grantmaking/api";

import { NavigationPinsContext } from "../context";
import { navigationPinsOptions } from "./queries";
import { changeNavigationPin } from "./server/navigation.functions";

export const NavigationPinsProvider = ({ children }: { children: ReactNode }) => {
  const client = useQueryClient();
  const submitting = useRef(false);
  const pathname = useLocation({ select: (location) => location.pathname });
  const workspaceSlug = pathname.startsWith("/app/") ? pathname.split("/")[2] : undefined;
  const enabled = Boolean(workspaceSlug && workspaceSlug !== "sign-in");
  const query = useQuery({
    ...navigationPinsOptions(workspaceSlug),
    enabled,
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
          if (submitting.current) {
            return false;
          }
          submitting.current = true;
          let saved = false;
          try {
            const result = await mutation.mutateAsync(input);
            if (result.status !== "ok") {
              void query.refetch();
            }
            saved = result.status === "ok";
          } catch {
            saved = false;
          }
          submitting.current = false;
          return saved;
        },
      }}
    >
      {children}
    </NavigationPinsContext>
  );
};
