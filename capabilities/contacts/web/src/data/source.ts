import { createContext, useContext } from "react";

import type { ContactsSource } from "../contracts";

export const ContactsSourceContext = createContext<ContactsSource | null>(null);

export const useContactsSource = () => {
  const source = useContext(ContactsSourceContext);
  if (!source) {
    throw new Error("ContactsProvider is required");
  }
  return source;
};
