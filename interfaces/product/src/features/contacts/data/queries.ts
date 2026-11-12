import { contactsOptions as options } from "@merit/contacts-web/data";

import { contactsSource } from "./source";

export const contactsOptions = (workspaceSlug: string) => options(workspaceSlug, contactsSource);
