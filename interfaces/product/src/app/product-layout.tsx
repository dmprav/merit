import { createFileRoute, Outlet } from "@tanstack/react-router";

import { ApplicationListViews } from "@merit/grantmaking-web/rounds";

import { WorkspaceContacts } from "../features/contacts/contacts-provider";
import { NavigationPinsProvider } from "../features/navigation/data/provider";
import { WorkspaceNavigationProvider } from "../features/workspace/workspace-navigation-provider";
import { WebMessagesProvider } from "./messages";

const ProductLayout = () => (
  <WebMessagesProvider>
    <WorkspaceContacts>
      <ApplicationListViews>
        <WorkspaceNavigationProvider>
          <NavigationPinsProvider>
            <Outlet />
          </NavigationPinsProvider>
        </WorkspaceNavigationProvider>
      </ApplicationListViews>
    </WorkspaceContacts>
  </WebMessagesProvider>
);

export const Route = createFileRoute("/_product")({
  component: ProductLayout,
});
