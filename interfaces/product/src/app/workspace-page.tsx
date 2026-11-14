import { Link, useLocation, useParams } from "@tanstack/react-router";
import { useContext, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";

import { ApplicationRecovery } from "@merit/ui/application-shell";
import { Icon } from "@merit/ui/icon";

import { WorkspaceState } from "../components/workspace-state";
import { WorkspaceNavigationContext } from "../features/workspace/workspace-navigation";
import { workspaceHomeLocation } from "../shared/workspace-location";
import { AppPage } from "./app-shell";
import { WorkspaceAccount } from "./workspace-account";

const workspaceRecoveryLocation = (
  workspaces: { slug: string; canWorkOnGrants: boolean; canViewTeam: boolean }[],
  canAdminister: boolean,
) => {
  if (workspaces.length > 1) {
    return { to: "/app" as const };
  }

  const [workspace] = workspaces;
  if (workspace) {
    return workspaceHomeLocation(workspace);
  }

  return { to: canAdminister ? ("/admin/organizations" as const) : ("/" as const) };
};

/** Frames a state without the shell when no workspace can be entered. */
export const WorkspaceRecovery = (props: ComponentProps<typeof WorkspaceState>) => {
  const { t } = useTranslation("common");
  const { workspaceSlug } = useParams({ strict: false });
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigation = useContext(WorkspaceNavigationContext);
  const signedOut = props.status === "signed_out";
  const workspaces = signedOut
    ? []
    : navigation.workspaces.filter(
        (item) => props.status !== "workspace_not_found" || item.slug !== workspaceSlug,
      );
  const returnLocation = workspaceRecoveryLocation(
    workspaces,
    !signedOut && navigation.canAdminister,
  );

  return (
    <ApplicationRecovery
      locationKey={pathname}
      brand="merit"
      account={<WorkspaceAccount />}
      returnLink={
        <Link {...returnLocation}>
          <Icon name="left" />
          {t("backToMerit")}
        </Link>
      }
    >
      <WorkspaceState {...props} />
    </ApplicationRecovery>
  );
};

/** Shows a page's loading, denied, or failed read inside the workspace shell. */
export const WorkspaceStatusPage = (props: ComponentProps<typeof WorkspaceState>) => (
  <AppPage centered breadcrumb={null}>
    <WorkspaceState {...props} />
  </AppPage>
);
