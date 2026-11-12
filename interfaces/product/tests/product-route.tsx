import { createRoute, Outlet, type AnyRootRoute } from "@tanstack/react-router";

import { WorkspaceNavigationProvider } from "../src/features/workspace/workspace-navigation-provider";

/** Stands in for the product layout with the person's navigation, without pins or contacts. */
export const productRoute = <TRoot extends AnyRootRoute>(root: TRoot) =>
  createRoute({
    getParentRoute: () => root,
    id: "_product",
    component: () => (
      <WorkspaceNavigationProvider>
        <Outlet />
      </WorkspaceNavigationProvider>
    ),
  });
