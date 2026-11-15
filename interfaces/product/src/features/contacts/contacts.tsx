import { Link } from "@tanstack/react-router";
import type { ComponentProps } from "react";

import {
  ContactPicker as Picker,
  ContactsDirectory as Directory,
} from "@merit/contacts-web/contacts";

export type { Contact } from "@merit/contacts-web/contracts";

export const ContactPicker = (props: ComponentProps<typeof Picker>) => <Picker {...props} />;

export const ContactsDirectory = (
  props: Omit<ComponentProps<typeof Directory>, "renderApplicationLink">,
) => (
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
);
