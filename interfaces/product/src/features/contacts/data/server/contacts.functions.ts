import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

import { withActor } from "@merit/auth/request";
import { contactsRequestSchema, contactCommandSchema } from "@merit/contacts/api";

export const readContacts = createServerFn({ method: "GET" })
  .validator(contactsRequestSchema)
  .handler(({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return withActor(context.currentIdentity, (actor) =>
      context.workspace.listContacts(actor, data),
    );
  });
export const saveContact = createServerFn({ method: "POST" })
  .validator(contactCommandSchema)
  .handler(({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return withActor(context.currentIdentity, (actor) =>
      context.workspace.changeContact(actor, data),
    );
  });
