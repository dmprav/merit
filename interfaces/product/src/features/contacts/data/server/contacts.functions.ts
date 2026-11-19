import { createServerFn } from "@tanstack/react-start";

import { withActor } from "@merit/auth/request";
import { contactHistoryInput } from "@merit/contacts/api";
import { contactsRequestSchema, contactCommandSchema } from "@merit/contacts/api";
import { contactApplicationListInput } from "@merit/grantmaking/api";

import { loadContactApplications } from "./contacts.server";

export const readContacts = createServerFn({ method: "GET" })
  .validator(contactsRequestSchema)
  .handler(({ data, context }) =>
    withActor(context.currentIdentity, (actor) => context.contacts.listContacts(actor, data)),
  );
export const saveContact = createServerFn({ method: "POST" })
  .validator(contactCommandSchema)
  .handler(({ data, context }) =>
    withActor(context.currentIdentity, (actor) => context.contacts.changeContact(actor, data)),
  );

export const readContactHistory = createServerFn({ method: "GET" })
  .validator(contactHistoryInput)
  .handler(({ context, data }) =>
    withActor(context.currentIdentity, (actor) => context.contacts.contactHistory(actor, data)),
  );

export const readContactApplications = createServerFn({ method: "GET" })
  .validator(contactApplicationListInput)
  .handler(({ context, data }) => {
    return loadContactApplications(data, {
      listContactApplications: context.grantmaking.listContactApplications,
      currentIdentity: context.currentIdentity,
    });
  });
