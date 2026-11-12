import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { createQueryClient } from "@merit/query";

import { WebMessagesProvider } from "../src/app/messages";
import { WorkspaceContacts } from "../src/features/contacts/contacts-provider";

const StoryContentContext = createContext<ReactNode>(null);

const StoryContent = () => useContext(StoryContentContext);

/** A fresh router and cache per mounted story; navigation stays inside the preview. */
export const StoryEnvironment = ({
  children,
  path = "/",
  routePath,
  loaderData,
  prepare,
}: {
  children: ReactNode;
  path?: string;
  routePath?: string;
  loaderData?: { applicationId: string };
  prepare?: (client: QueryClient) => void;
}) => {
  const [environment] = useState(() => {
    const client = createQueryClient();
    prepare?.(client);
    const root = createRootRoute();
    const product = createRoute({ getParentRoute: () => root, id: "_product" });
    const page = createRoute({
      getParentRoute: () => product,
      path: routePath ?? path.split("?")[0]!,
      loader: () => loaderData,
      component: StoryContent,
    });
    const fallback = createRoute({
      getParentRoute: () => root,
      path: "/$",
      component: () => <p>Destination reached. Remount the story to start again.</p>,
    });
    const router = createRouter({
      routeTree: root.addChildren([product.addChildren([page]), fallback]),
      history: createMemoryHistory({ initialEntries: [path] }),
    });

    return { client, router };
  });

  useEffect(() => () => environment.client.clear(), [environment]);

  return (
    <QueryClientProvider client={environment.client}>
      <WebMessagesProvider>
        <WorkspaceContacts>
          <StoryContentContext value={children}>
            <RouterProvider router={environment.router} />
          </StoryContentContext>
        </WorkspaceContacts>
      </WebMessagesProvider>
    </QueryClientProvider>
  );
};
