import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useContext, useState } from "react";

import { ContactDrafts } from "@merit/contacts-web/drafts";
import { GrantmakingDrafts } from "@merit/grantmaking-web/drafts";

import { AppShell } from "../app/app-shell";
import { WorkspaceRecovery } from "../app/workspace-page";
import { DemoGuidance } from "../features/demo/demo-tools";
import { workspaceOptions, workspacesOptions } from "../features/workspace/data/queries";
import { WorkspaceNavigationContext } from "../features/workspace/workspace-navigation";
import { loadWorkspaceNavigation } from "../features/workspace/workspace-navigation-provider";

const WorkspaceLayout = () => {
  const navigation = useContext(WorkspaceNavigationContext);
  const { workspaceSlug } = Route.useParams();
  const access = useQuery(workspaceOptions(workspaceSlug));
  const draftScope = useWorkspaceDraftScope(workspaceSlug);

  // A failed background refresh keeps the established workspace frame.
  if (access.data?.status !== "ok") {
    return (
      <WorkspaceRecovery
        status={access.data?.status ?? (access.isPending ? "loading" : "unavailable")}
      />
    );
  }

  return (
    <WorkspaceNavigationContext value={{ ...navigation, draftScope }}>
      <GrantmakingDrafts storageScope={draftScope}>
        <ContactDrafts scope={draftScope}>
          <DemoGuidance>
            <AppShell current={{ kind: "workspace", workspace: access.data.workspace }}>
              <Outlet />
            </AppShell>
          </DemoGuidance>
        </ContactDrafts>
      </GrantmakingDrafts>
    </WorkspaceNavigationContext>
  );
};

const useWorkspaceDraftScope = (workspaceSlug: string) => {
  const query = useQuery(workspacesOptions());
  const result = query.isError ? undefined : query.data;
  const currentScope =
    result?.status === "ok"
      ? result.value.find((workspace) => workspace.slug === workspaceSlug)?.kind === "demo"
        ? `${result.draftScope}:demo:${workspaceSlug}`
        : result.draftScope
      : undefined;
  const [session, setSession] = useState({ workspaceSlug, scope: currentScope });
  // Discovery can fail independently of the authorized resource and its open editors.
  const draftScope =
    (!result || result.status === "unavailable") && session.workspaceSlug === workspaceSlug
      ? session.scope
      : currentScope;
  if (session.workspaceSlug !== workspaceSlug || session.scope !== draftScope) {
    setSession({ workspaceSlug, scope: draftScope });
  }

  return draftScope;
};

export const Route = createFileRoute("/_product/app/$workspaceSlug")({
  loader: async ({ params, context }) => {
    // Pages check their own resources; these reads supply the frame and draft scope around them.
    await Promise.all([
      loadWorkspaceNavigation(context.queryClient),
      context.queryClient.fetchQuery(workspaceOptions(params.workspaceSlug)).catch(() => undefined),
    ]);
  },
  staleTime: 0,
  gcTime: 0,
  headers: () => ({ "Cache-Control": "private, no-store" }),
  errorComponent: () => <WorkspaceRecovery status="unavailable" />,
  component: WorkspaceLayout,
});
