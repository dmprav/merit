import { Link, useLocation } from "@tanstack/react-router";
import { useContext, type ReactNode, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";

import {
  ApplicationShell,
  ApplicationPage,
  ApplicationContext,
  ApplicationContextOption,
  ApplicationAccount,
} from "@merit/ui/application-shell";
import shellStyles from "@merit/ui/application-shell.module.css";
import { Brand } from "@merit/ui/brand";
import { Icon } from "@merit/ui/icon";

import { DemoTools } from "../features/demo/demo-tools";
import { workspaceRoundsLocation } from "../features/grantmaking/page-routing";
import { NavigationSection, NavigationPinsStatus } from "../features/navigation/navigation-section";
import navigationStyles from "../features/navigation/navigation.module.css";
import { WorkspaceNavigationContext } from "../features/workspace/workspace-navigation";
import { workspaceHomeLocation } from "../shared/workspace-location";
import { WorkspaceAccount } from "./workspace-account";

export type ShellWorkspace = {
  id: string;
  name: string;
  slug: string;
  kind: "standard" | "demo";
  canWorkOnGrants: boolean;
  demoExpiresAt?: string | null;
};

/** Where the person is working: one workspace, or their own review assignments across workspaces. */
export type ShellContext = { kind: "workspace"; workspace: ShellWorkspace } | { kind: "reviews" };

export const AppShell = ({
  current,
  profileName,
  children,
}: {
  current: ShellContext;
  profileName?: string;
  children: ReactNode;
}) => {
  const { t } = useTranslation(["common", "reviewer"]);
  const workspace = current.kind === "workspace" ? current.workspace : undefined;
  const name = workspace?.name ?? t("reviewer:title");

  return (
    <ApplicationShell
      contextLabel={name}
      openNavigationLabel={t("openNavigation")}
      closeNavigationLabel={t("closeNavigation")}
      utility={workspace?.kind === "demo" ? <DemoTools workspace={workspace} /> : undefined}
      skipLabel={t("skipToContent")}
      navigationLabel={t("mainNavigation")}
      brand={
        <Link
          {...(workspace ? workspaceHomeLocation(workspace) : { to: "/reviews" })}
          aria-label={t("home")}
        >
          <Brand />
        </Link>
      }
      identity={<ContextIdentity name={name} workspace={workspace} />}
      navigation={<AppNavigation workspace={workspace} />}
      footer={
        <>
          <a
            href="/docs"
            target="_blank"
            rel="noopener noreferrer"
            className={shellStyles.documentationLink}
            aria-label={t("docsNewTab")}
          >
            {t("docs")}
          </a>
          {profileName ? (
            <ApplicationAccount
              name={profileName}
              loadingLabel={t("loadingAccount")}
              menuLabel={t("accountMenu")}
            />
          ) : (
            <WorkspaceAccount />
          )}
        </>
      }
    >
      {children}
    </ApplicationShell>
  );
};

/** Offers the person's workspaces wherever there is somewhere else to go. */
const ContextIdentity = ({ name, workspace }: { name: string; workspace?: ShellWorkspace }) => {
  const { t } = useTranslation("common");
  const { workspaces } = useContext(WorkspaceNavigationContext);
  const switchable = workspaces.some((item) => item.slug !== workspace?.slug);

  return (
    <ApplicationContext name={name} label={t("switchContext")}>
      {switchable
        ? workspaces.map((item) => (
            <Link
              key={item.id}
              {...workspaceHomeLocation(item)}
              aria-current={item.slug === workspace?.slug ? "true" : undefined}
            >
              <ApplicationContextOption
                name={item.kind === "demo" ? t("demoWorkspace", { name: item.name }) : item.name}
              />
            </Link>
          ))
        : undefined}
    </ApplicationContext>
  );
};

export const AppPage = (
  props: Omit<ComponentProps<typeof ApplicationPage>, "locationKey" | "breadcrumbLabel">,
) => {
  const { t } = useTranslation("web");
  const pathname = useLocation({ select: (location) => location.pathname });

  return (
    <ApplicationPage
      {...props}
      locationKey={pathname}
      breadcrumbLabel={t("navigation.breadcrumb")}
    />
  );
};

const AppNavigation = ({ workspace }: { workspace?: ShellWorkspace }) => {
  const { t } = useTranslation(["web", "common", "reviewer"]);
  const { canAdminister } = useContext(WorkspaceNavigationContext);
  const grantWork = workspace?.canWorkOnGrants ? workspace.slug : undefined;
  // Personal reviews sit beside real workspaces; demo workspaces stay self-contained.
  const reviews = workspace?.kind !== "demo";

  return (
    <>
      {grantWork && (
        <>
          <NavigationSection
            title={t("navigation.rounds")}
            kind="round"
            icon="layers"
            workspaceSlug={grantWork}
            location={workspaceRoundsLocation(grantWork)}
          />
          <NavigationSection
            title={t("navigation.applications")}
            kind="application"
            icon="application"
            workspaceSlug={grantWork}
            location={{
              to: "/app/$workspaceSlug/applications",
              params: { workspaceSlug: grantWork },
            }}
          />
          <section aria-label={t("navigation.activity")} className={navigationStyles.section}>
            <Link to="/app/$workspaceSlug/activity" params={{ workspaceSlug: grantWork }}>
              <Icon name="activity" />
              {t("navigation.activity")}
            </Link>
          </section>
        </>
      )}
      {reviews && (
        <NavigationSection
          title={t("reviewer:title")}
          kind="review"
          icon="edit"
          location={{ to: "/reviews" }}
        />
      )}
      <NavigationPinsStatus />
      {(workspace || canAdminister) && (
        <div className={navigationStyles.secondary}>
          {workspace && (
            <span className={navigationStyles.groupLabel}>{t("navigation.workspace")}</span>
          )}
          {grantWork && (
            <Link to="/app/$workspaceSlug/contacts" params={{ workspaceSlug: grantWork }}>
              <Icon name="contacts" />
              {t("navigation.contacts")}
            </Link>
          )}
          {workspace && (
            <Link
              to="/app/$workspaceSlug/settings/members"
              params={{ workspaceSlug: workspace.slug }}
            >
              <Icon name="settings" />
              {t("navigation.settings")}
            </Link>
          )}
          {canAdminister && (
            <Link to="/admin/organizations">
              <Icon name="layers" />
              {t("common:administration")}
            </Link>
          )}
        </div>
      )}
    </>
  );
};
