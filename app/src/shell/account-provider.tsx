import { ClerkProvider, useAuth } from "@clerk/tanstack-react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

import { useAnalytics } from "@merit/analytics";
import { clearDrafts } from "@merit/drafts";
import { productLinks } from "@merit/product/links";

const AccountSession = ({ children }: { children: ReactNode }) => {
  const { userId, isLoaded } = useAuth();
  const [initialAccount, setInitialAccount] = useState<{ id: string | null } | null>(
    isLoaded ? { id: userId ?? null } : null,
  );
  const client = useQueryClient();
  const analytics = useAnalytics();
  const changed = isLoaded && initialAccount !== null && initialAccount.id !== (userId ?? null);

  useEffect(() => {
    if (isLoaded && initialAccount === null) {
      setInitialAccount({ id: userId ?? null });
    }
    if (!changed) {
      return;
    }

    analytics.reset();
    // Reload also discards route data and unfinished drafts, including the admin interface.
    void Promise.all([clearDrafts(), client.cancelQueries()]).then(() => {
      client.clear();
      globalThis.location.reload();
    });
  }, [analytics, changed, client, isLoaded, userId, initialAccount]);

  return changed ? null : children;
};

export const AccountProvider = ({ children }: { children: ReactNode }) => {
  const publishableKey: unknown =
    !import.meta.env.MERIT_LOCAL_WORKSPACE && import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

  return typeof publishableKey === "string" && publishableKey ? (
    <ClerkProvider
      publishableKey={publishableKey}
      signInUrl={productLinks.signIn}
      afterSignOutUrl="/"
    >
      <AccountSession>{children}</AccountSession>
    </ClerkProvider>
  ) : (
    children
  );
};
