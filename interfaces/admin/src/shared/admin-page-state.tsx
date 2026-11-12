import { Link, useHydrated, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import type { Result } from "@merit/organizations/api";
import { Button } from "@merit/ui/button";
import linkStyles from "@merit/ui/link.module.css";
import { StateMessage } from "@merit/ui/state-message";

export const AdminPageState = ({
  status,
  returnTo,
}: {
  status:
    | Exclude<Result<never>, { status: "ok" }>["status"]
    | "signed_out"
    | "unavailable"
    | "loading";
  returnTo: string;
}) => {
  const { t } = useTranslation("administration");
  const router = useRouter();
  const hydrated = useHydrated();

  return (
    <StateMessage
      title={
        status === "forbidden"
          ? t("accessRequired")
          : status === "loading"
            ? t("loading")
            : t(`errors.${status}`)
      }
      description={status === "forbidden" ? t("errors.forbidden") : undefined}
      actions={
        status === "loading" ? undefined : status === "signed_out" ? (
          <Link
            to="/app/sign-in"
            search={{ returnTo }}
            className={linkStyles.button}
            data-variant="primary"
          >
            {t("signIn")}
          </Link>
        ) : status === "unavailable" ? (
          <Button isDisabled={!hydrated} onPress={() => void router.invalidate()}>
            {t("tryAgain")}
          </Button>
        ) : undefined
      }
    />
  );
};
