import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { ApplicationContextLinks, ApplicationContextOption } from "@merit/ui/application-shell";
import { Divider } from "@merit/ui/divider";
import { Stack } from "@merit/ui/layout";
import { PageHeader } from "@merit/ui/page-header";

import { StandalonePage } from "../../../components/standalone-page";
import { RoutedLink } from "../../../shared/routed-link";
import { workspaceHomeLocation } from "../../../shared/workspace-location";
import styles from "./workspace-choice.module.css";

export const WorkspaceChoice = ({
  workspaces,
  canAdminister = false,
}: {
  canAdminister?: boolean;
  workspaces: {
    id: string;
    name: string;
    slug: string;
    canWorkOnGrants: boolean;
    canViewTeam: boolean;
    kind?: "standard" | "demo";
  }[];
}) => {
  const { t } = useTranslation(["onboarding", "common"]);

  return (
    <StandalonePage>
      <PageHeader title={t("choose")} />
      <div className={styles.content}>
        <Stack gap={5}>
          <ApplicationContextLinks>
            {workspaces.map((workspace) => (
              <li key={workspace.id}>
                <Link {...workspaceHomeLocation(workspace)}>
                  <ApplicationContextOption
                    name={
                      workspace.kind === "demo"
                        ? t("common:demoWorkspace", { name: workspace.name })
                        : workspace.name
                    }
                  />
                </Link>
              </li>
            ))}
          </ApplicationContextLinks>
          {canAdminister && (
            <Stack gap={4}>
              <Divider spacing={4} />
              <div>
                <RoutedLink variant="standalone" to="/admin/organizations">
                  {t("common:administration")}
                </RoutedLink>
              </div>
            </Stack>
          )}
        </Stack>
      </div>
    </StandalonePage>
  );
};
