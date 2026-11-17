import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

import {
  attachApplicationDocumentInputSchema,
  citeApplicationDocumentInputSchema,
  readApplicationDocumentFileInputSchema,
} from "@merit/applications/api";
import { withActor } from "@merit/auth/request";

const privateResponse = () => {
  setResponseHeader("Cache-Control", "private, no-store");
};

export const attachApplicationDocument = createServerFn({ method: "POST" })
  .validator(attachApplicationDocumentInputSchema)
  .handler(async ({ data, context }) => {
    privateResponse();
    return withActor(context.currentIdentity, (actor) =>
      context.workspace.attachApplicationDocument(actor, data),
    );
  });

export const citeApplicationDocumentPage = createServerFn({ method: "POST" })
  .validator(citeApplicationDocumentInputSchema)
  .handler(async ({ data, context }) => {
    privateResponse();
    return withActor(context.currentIdentity, (actor) =>
      context.workspace.citeApplicationDocumentPage(actor, data),
    );
  });

export const readApplicationDocumentFile = createServerFn({ method: "POST" })
  .validator(readApplicationDocumentFileInputSchema)
  .handler(async ({ data, context }) => {
    privateResponse();
    return withActor(context.currentIdentity, (actor) =>
      context.workspace.readApplicationDocumentFile(actor, data),
    );
  });
