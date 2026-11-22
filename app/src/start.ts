import {
  createCsrfMiddleware,
  createMiddleware,
  createServerOnlyFn,
  createStart,
} from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

import { webRequestMiddleware } from "./server/middleware";
import { readAppOrigin } from "./server/runtime-config.server";

const appOrigin = createServerOnlyFn((request?: Request) => readAppOrigin(request));

const privateServerFunction = createMiddleware({ type: "function" }).server(({ next }) => {
  setResponseHeader("Cache-Control", "private, no-store");
  return next();
});

export const startInstance = createStart(() => ({
  functionMiddleware: [privateServerFunction],
  requestMiddleware: [
    createCsrfMiddleware({
      filter: (context) => context.handlerType === "serverFn",
      origin: (candidate, { request }) => candidate === appOrigin(request),
    }),
    ...webRequestMiddleware(appOrigin),
  ],
}));
