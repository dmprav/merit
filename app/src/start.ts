import { createCsrfMiddleware, createServerOnlyFn, createStart } from "@tanstack/react-start";

import { webRequestMiddleware } from "./server/middleware";

const appOrigin = createServerOnlyFn(() => process.env.APP_ORIGIN ?? "http://localhost:3000");

export const startInstance = createStart(() => ({
  requestMiddleware: [
    createCsrfMiddleware({ filter: (context) => context.handlerType === "serverFn" }),
    ...webRequestMiddleware(appOrigin),
  ],
}));
