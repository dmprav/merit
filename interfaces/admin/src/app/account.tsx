import { useClerk, useUser } from "@clerk/tanstack-react-start";
import { useTranslation } from "react-i18next";

import { clearDrafts } from "@merit/drafts";
import { ApplicationAccount } from "@merit/ui/application-shell";

import { LocalAccount } from "./local-account";

const AuthenticatedAccount = () => {
  const { t } = useTranslation("common");
  const { user, isLoaded } = useUser();
  const clerk = useClerk();
  if (isLoaded && !user) {
    return null;
  }

  return (
    <ApplicationAccount
      name={
        user
          ? user.fullName ||
            user.username ||
            user.primaryEmailAddress?.emailAddress ||
            t("accountMenu")
          : null
      }
      loadingLabel={t("loadingAccount")}
      menuLabel={t("accountMenu")}
      signOut={{
        label: t("signOut"),
        pendingLabel: t("signingOut"),
        errorMessage: t("signOutError"),
        run: async () => {
          await clearDrafts();
          await clerk.signOut({ redirectUrl: "/" });
        },
      }}
    />
  );
};

export const AdminAccount = () =>
  import.meta.env.DEV && import.meta.env.MERIT_LOCAL_WORKSPACE ? (
    <LocalAccount />
  ) : import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ? (
    <AuthenticatedAccount />
  ) : null;
