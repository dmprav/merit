import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import linkStyles from "@merit/ui/link.module.css";
import { StateMessage } from "@merit/ui/state-message";

import { RouteRetry } from "./route-retry";

const stateKeys = {
  signed_out: "signedOut",
  unavailable: "unavailable",
  not_found: "notFound",
  workspace_not_found: "workspaceNotFound",
  no_workspace: "noWorkspace",
  loading: "loading",
} as const;

export const WorkspaceState = ({
  status,
  resource = "workspace",
}: {
  resource?:
    | "workspace"
    | "rounds"
    | "round"
    | "application"
    | "applications"
    | "team"
    | "contacts";
  status:
    | "signed_out"
    | "unavailable"
    | "not_found"
    | "workspace_not_found"
    | "no_workspace"
    | "loading";
}) => {
  const { t } = useTranslation(["web", "common"]);
  const key =
    status === "loading" || status === "unavailable" || status === "not_found"
      ? (`state.${resource}.${stateKeys[status]}` as const)
      : (`state.${stateKeys[status]}` as const);

  return (
    <StateMessage
      role={status === "loading" ? "status" : undefined}
      title={t(`${key}.title`)}
      description={
        status === "loading"
          ? undefined
          : status === "unavailable" || status === "not_found"
            ? t(`state.${resource}.${stateKeys[status]}.description`)
            : t(`state.${stateKeys[status]}.description`)
      }
      actions={
        status === "signed_out" ? (
          <Link to="/app/sign-in" className={linkStyles.button} data-variant="primary">
            {t("common:signIn")}
          </Link>
        ) : status === "unavailable" ? (
          <RouteRetry>{t("common:tryAgain")}</RouteRetry>
        ) : null
      }
    />
  );
};
