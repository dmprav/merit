import { ClerkProvider, useAuth } from "@clerk/tanstack-react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

import { useAnalytics } from "@merit/analytics";
import { clearDrafts } from "@merit/drafts";
import { productLinks } from "@merit/product/links";

/** The account this page session started with, or null until authentication first loads. */
type KnownAccount = { id: string | null } | null;

const AccountSession = ({
  known,
  onKnown,
  children,
}: {
  known: KnownAccount;
  onKnown: (account: KnownAccount) => void;
  children: ReactNode;
}) => {
  const { userId, isLoaded } = useAuth();
  const client = useQueryClient();
  const analytics = useAnalytics();
  const id = userId ?? null;
  const changed = isLoaded && known !== null && known.id !== id;

  useEffect(() => {
    if (isLoaded && known === null) {
      onKnown({ id });
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
  }, [analytics, changed, client, id, isLoaded, known, onKnown]);

  return changed ? null : children;
};

/**
 * Provides the signed-in account to application pages. Public site pages render without it, so
 * their HTML carries no account state; the known account outlives them to catch switches made
 * while one was open.
 */
export const AccountProvider = ({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) => {
  const [known, setKnown] = useState<KnownAccount>(null);
  const publishableKey: unknown =
    !import.meta.env.MERIT_LOCAL_WORKSPACE && import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

  return enabled && typeof publishableKey === "string" && publishableKey ? (
    <ClerkProvider
      publishableKey={publishableKey}
      signInUrl={productLinks.signIn}
      afterSignOutUrl="/"
    >
      <AccountSession known={known} onKnown={setKnown}>
        {children}
      </AccountSession>
    </ClerkProvider>
  ) : (
    children
  );
};
