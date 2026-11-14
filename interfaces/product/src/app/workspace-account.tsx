import { useClerk, useUser } from "@clerk/tanstack-react-start";
import { useContext } from "react";
import { useTranslation } from "react-i18next";

import { clearDrafts } from "@merit/drafts";
import { ApplicationAccount } from "@merit/ui/application-shell";

import { WorkspaceNavigationContext } from "../features/workspace/workspace-navigation";
import { LocalAccount } from "./local-account";

const GuestAccount = () => {
  const { workspaces } = useContext(WorkspaceNavigationContext);
  const { t } = useTranslation("common");

  return workspaces.some((workspace) => workspace.kind === "demo") ? (
    <ApplicationAccount
      name="Dana Reed"
      loadingLabel={t("loadingAccount")}
      menuLabel={t("accountMenu")}
    />
  ) : null;
};

const AuthenticatedAccount = () => {
  const { t } = useTranslation(["web", "common"]);
  const { user, isLoaded } = useUser();
  const clerk = useClerk();
  if (isLoaded && !user) {
    return <GuestAccount />;
  }

  return (
    <ApplicationAccount
      name={
        user
          ? user.fullName ||
            user.username ||
            user.primaryEmailAddress?.emailAddress ||
            t("account.defaultName")
          : null
      }
      loadingLabel={t("common:loadingAccount")}
      menuLabel={t("common:accountMenu")}
      signOut={{
        label: t("common:signOut"),
        pendingLabel: t("common:signingOut"),
        errorMessage: t("common:signOutError"),
        run: async () => {
          await clearDrafts();
          await clerk.signOut({ redirectUrl: "/" });
        },
      }}
    />
  );
};

export const WorkspaceAccount = () =>
  import.meta.env.DEV && import.meta.env.MERIT_LOCAL_WORKSPACE ? (
    <LocalAccount />
  ) : import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ? (
    <AuthenticatedAccount />
  ) : (
    <GuestAccount />
  );
