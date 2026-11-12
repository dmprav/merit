import { useClerk, useUser } from "@clerk/tanstack-react-start";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { clearDrafts } from "@merit/drafts";
import { ApplicationAccount } from "@merit/ui/application-shell";

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

const LocalAccount = () => {
  const { t } = useTranslation("common");
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    const person = document.cookie
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith("merit-local-person="))
      ?.split("=")[1];
    setName(
      person === "operator"
        ? "Merit operator"
        : person === "recipient"
          ? "Invitation recipient"
          : "Dana Reed",
    );
  }, []);

  return (
    <ApplicationAccount
      name={name}
      loadingLabel={t("loadingAccount")}
      menuLabel={t("accountMenu")}
    />
  );
};

export const AdminAccount = () => {
  const account = import.meta.env.MERIT_LOCAL_WORKSPACE ? (
    <LocalAccount />
  ) : import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ? (
    <AuthenticatedAccount />
  ) : null;
  return account;
};
