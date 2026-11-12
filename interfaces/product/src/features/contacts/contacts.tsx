import { Link } from "@tanstack/react-router";
import type { ComponentProps } from "react";

import {
  ContactPicker as Picker,
  ContactsDirectory as Directory,
} from "@merit/contacts-web/contacts";

import { WorkspaceContacts } from "./contacts-provider";

export type { Contact } from "@merit/contacts-web/contracts";

export const ContactPicker = (props: ComponentProps<typeof Picker>) => (
  <WorkspaceContacts>
    <Picker {...props} />
  </WorkspaceContacts>
);

export const ContactsDirectory = (
  props: Omit<ComponentProps<typeof Directory>, "renderApplicationLink">,
) => (
  <WorkspaceContacts>
    <Directory
      {...props}
      renderApplicationLink={(item) => (
        <Link
          to="/app/$workspaceSlug/applications/$applicationRef"
          params={{ workspaceSlug: props.workspaceSlug, applicationRef: item.publicId }}
          search={{ tab: "reviews" }}
        >
          {item.title}
        </Link>
      )}
    />
  </WorkspaceContacts>
);
