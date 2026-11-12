import { useHydrated, useRouter, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Button } from "@merit/ui/button";

/** Rerun route reads while retaining the document and its draft providers. */
export const RouteRetry = ({ children }: { children: ReactNode }) => {
  const router = useRouter();
  const hydrated = useHydrated();
  const pending = useRouterState({ select: (state) => state.isLoading });

  return (
    <Button
      isDisabled={!hydrated}
      isPending={pending}
      onPress={() => {
        if (!router.state.isLoading) {
          void router.invalidate();
        }
      }}
    >
      {children}
    </Button>
  );
};
