import { Link, useLocation } from "@tanstack/react-router";
import {
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type ComponentProps,
} from "react";
import { useTranslation } from "react-i18next";

import {
  ApplicationShell,
  ApplicationPage,
  ApplicationContext,
  ApplicationContextOption,
} from "@merit/ui/application-shell";
import shellStyles from "@merit/ui/application-shell.module.css";
import { Brand } from "@merit/ui/brand";
import { Icon } from "@merit/ui/icon";

import { DemoTools } from "../features/demo/demo-tools";
import { workspaceRoundsLocation } from "../features/grantmaking/page-routing";
import { WorkspaceSearch } from "../features/grantmaking/workspace-search";
import { NavigationSection, NavigationPinsStatus } from "../features/navigation/navigation-section";
import navigationStyles from "../features/navigation/navigation.module.css";
import { SearchButton } from "../features/navigation/search-button";
import { useSearchShortcut } from "../features/navigation/search-shortcut";
import { WorkspaceNavigationContext } from "../features/workspace/workspace-navigation";
import { workspaceHomeLocation } from "../shared/workspace-location";
import { WorkspaceAccount } from "./workspace-account";

export type ShellWorkspace = {
  id: string;
  name: string;
  slug: string;
  kind: "standard" | "demo";
  canWorkOnGrants: boolean;
  canViewTeam: boolean;
  demoExpiresAt?: string | null;
};

/** The search box's open state and its shortcut; `available` says whether this person can search. */
const useSearchBox = (available: boolean) => {
  const [isOpen, setIsOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const open = useCallback(() => {
    setIsOpen(true);
    // An open box keeps its text and takes focus back to the field.
    setFocusRequest((count) => count + 1);
  }, []);
  // Back and forward navigate too: the box never stays over a page it was not opened for.
  const pathname = useLocation({ select: (location) => location.pathname });
  useEffect(() => setIsOpen(false), [pathname]);
  useSearchShortcut(available ? open : undefined);
  return { isOpen, onOpenChange: setIsOpen, focusRequest, open: available ? open : undefined };
};

/** Every grant-work role uses the same workspace context. */
export type ShellContext = { kind: "workspace"; workspace: ShellWorkspace };

export const AppShell = ({ current, children }: { current: ShellContext; children: ReactNode }) => {
  const { t } = useTranslation(["common", "reviewer"]);
  const workspace = current.workspace;
  const name = workspace.name;
  // Search covers grant work, so it follows the same access as the Applications overview.
  const searchSlug = workspace.canWorkOnGrants ? workspace.slug : undefined;
  const search = useSearchBox(searchSlug !== undefined);

  return (
    <>
      <ApplicationShell
        contextLabel={name}
        openNavigationLabel={t("openNavigation")}
        closeNavigationLabel={t("closeNavigation")}
        utility={workspace?.kind === "demo" ? <DemoTools workspace={workspace} /> : undefined}
        skipLabel={t("skipToContent")}
        navigationLabel={t("mainNavigation")}
        brand={
          <Link {...workspaceHomeLocation(workspace)} aria-label={t("home")}>
            <Brand />
          </Link>
        }
        identity={<ContextIdentity name={name} workspace={workspace} />}
        navigation={<AppNavigation workspace={workspace} onSearch={search.open} />}
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
            <WorkspaceAccount />
          </>
        }
      >
        {children}
      </ApplicationShell>
      {searchSlug && (
        <WorkspaceSearch
          workspaceSlug={searchSlug}
          isOpen={search.isOpen}
          onOpenChange={search.onOpenChange}
          focusRequest={search.focusRequest}
        />
      )}
    </>
  );
};

/** Offers the person's workspaces wherever there is somewhere else to go. */
const ContextIdentity = ({ name, workspace }: { name: string; workspace: ShellWorkspace }) => {
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

const AppNavigation = ({
  workspace,
  onSearch,
}: {
  workspace: ShellWorkspace;
  onSearch?: () => void;
}) => {
  const { t } = useTranslation(["web", "common", "reviewer"]);
  const { canAdminister } = useContext(WorkspaceNavigationContext);
  const grantWork = workspace?.canWorkOnGrants ? workspace.slug : undefined;
  const reviews = workspace.kind !== "demo";

  return (
    <>
      {grantWork && (
        <>
          {onSearch && <SearchButton onPress={onSearch} />}
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
          title={t("navigation.myWork")}
          kind="review"
          icon="edit"
          workspaceSlug={workspace.slug}
          location={{ to: "/app/$workspaceSlug/work", params: { workspaceSlug: workspace.slug } }}
        />
      )}
      <NavigationPinsStatus />
      {(grantWork || workspace.canViewTeam || canAdminister) && (
        <div className={navigationStyles.secondary}>
          {(grantWork || workspace.canViewTeam) && (
            <span className={navigationStyles.groupLabel}>{t("navigation.workspace")}</span>
          )}
          {grantWork && (
            <Link to="/app/$workspaceSlug/contacts" params={{ workspaceSlug: grantWork }}>
              <Icon name="contacts" />
              {t("navigation.contacts")}
            </Link>
          )}
          {workspace.canViewTeam && (
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
