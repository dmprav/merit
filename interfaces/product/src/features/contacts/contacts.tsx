import type { ComponentProps } from "react";

import {
  ContactPicker as Picker,
  ContactsDirectory as Directory,
} from "@merit/contacts-web/contacts";

import { RoutedLink } from "../../shared/routed-link";

export const ContactPicker = (props: ComponentProps<typeof Picker>) => <Picker {...props} />;

export const ContactsDirectory = (
  props: Omit<ComponentProps<typeof Directory>, "renderApplicationLink">,
) => (
  <Directory
    {...props}
    renderApplicationLink={(item, children, { variant, tab }) => (
      <RoutedLink
        variant={variant}
        to="/app/$workspaceSlug/applications/$applicationRef"
        params={{ workspaceSlug: props.workspaceSlug, applicationRef: item.publicId }}
        search={{ tab }}
      >
        {children}
      </RoutedLink>
    )}
  />
);
