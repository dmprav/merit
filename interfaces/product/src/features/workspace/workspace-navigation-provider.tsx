import { useQuery, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { workspacesOptions } from "./data/queries";
import { WorkspaceNavigationContext } from "./workspace-navigation";

/** Layouts that show navigation reload discovery on entry; resource loaders still check their own access. */
export const loadWorkspaceNavigation = (queryClient: QueryClient) =>
  queryClient.fetchQuery(workspacesOptions()).then(
    () => undefined,
    () => undefined,
  );

/**
 * Supplies the person's reachable workspaces and operator access to every product shell.
 * Discovery failures leave current work usable; only switching and administration disappear.
 */
export const WorkspaceNavigationProvider = ({ children }: { children: ReactNode }) => {
  // Shell layouts own the read, so public product pages never request discovery.
  const query = useQuery({ ...workspacesOptions(), enabled: false });
  const result = !query.isError && query.data?.status === "ok" ? query.data : undefined;

  return (
    <WorkspaceNavigationContext
      value={{ workspaces: result?.value ?? [], canAdminister: result?.canAdminister ?? false }}
    >
      {children}
    </WorkspaceNavigationContext>
  );
};
