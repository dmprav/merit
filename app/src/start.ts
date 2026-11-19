import {
  createCsrfMiddleware,
  createMiddleware,
  createServerOnlyFn,
  createStart,
} from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

import { webRequestMiddleware } from "./server/middleware";

const appOrigin = createServerOnlyFn(() => process.env.APP_ORIGIN ?? "http://localhost:3000");

const privateServerFunction = createMiddleware({ type: "function" }).server(({ next }) => {
  setResponseHeader("Cache-Control", "private, no-store");
  return next();
});

export const startInstance = createStart(() => ({
  functionMiddleware: [privateServerFunction],
  requestMiddleware: [
    createCsrfMiddleware({ filter: (context) => context.handlerType === "serverFn" }),
    ...webRequestMiddleware(appOrigin),
  ],
}));
