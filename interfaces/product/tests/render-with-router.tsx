import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { WebMessagesProvider } from "../src/app/messages";

export const renderWithRouter = async (ui: ReactNode, path = "/", routePath = "$") => {
  const root = createRootRoute({ component: () => ui });
  const route = createRoute({ getParentRoute: () => root, path: routePath });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultPendingMinMs: 0,
  });
  await router.load();

  return {
    ...render(<RouterProvider router={router} />, { wrapper: WebMessagesProvider }),
    router,
    user: userEvent.setup(),
  };
};
