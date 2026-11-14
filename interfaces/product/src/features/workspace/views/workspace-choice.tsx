import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { ApplicationContextOption } from "@merit/ui/application-shell";
import shellStyles from "@merit/ui/application-shell.module.css";
import { Stack } from "@merit/ui/layout";
import linkStyles from "@merit/ui/link.module.css";
import { PageHeader } from "@merit/ui/page-header";

import { StandalonePage } from "../../../components/standalone-page";
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
      <Stack gap={5} className={styles.content}>
        <ul className={shellStyles.contextLinks}>
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
        </ul>
        {canAdminister && (
          <div className={styles.administration}>
            <Link
              to="/admin/organizations"
              className={`${linkStyles.text} ${linkStyles.standalone}`}
            >
              {t("common:administration")}
            </Link>
          </div>
        )}
      </Stack>
    </StandalonePage>
  );
};
