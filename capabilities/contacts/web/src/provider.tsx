import type { ReactNode } from "react";

import type { ContactsSource } from "./contracts";
import { ContactsSourceContext } from "./data/source";

export const ContactsProvider = ({
  source,
  children,
}: {
  source: ContactsSource;
  children: ReactNode;
}) => <ContactsSourceContext value={source}>{children}</ContactsSourceContext>;
