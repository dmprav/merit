import { Link, useLocation } from "@tanstack/react-router";
import {
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
  type RefObject,
  type ReactNode,
  type ComponentProps,
} from "react";
import { useTranslation } from "react-i18next";

import {
  ApplicationShell,
  ApplicationPage,
  ApplicationContext,
  ApplicationContextOption,
  ApplicationDocumentationLink,
  ApplicationNavigationGroup,
} from "@merit/ui/application-shell";
import { Brand } from "@merit/ui/brand";
import { Icon } from "@merit/ui/icon";

import { DemoTools } from "../features/demo/demo-tools";
import { workspaceRoundsLocation } from "../features/grantmaking/page-routing";
import { WorkspaceSearch } from "../features/grantmaking/workspace-search";
import { MeritAi, useMeritAiShell } from "../features/merit-ai/merit-ai";
import { AskMeritAiButton } from "../features/merit-ai/views/ask-merit-ai-button";
import {
  NavigationPinsStatus,
  NavigationSection,
  PinnedSection,
} from "../features/navigation/navigation-section";
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
  const searchButton = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const open = useCallback(() => {
    // The modal restores its opener. A shortcut from the page body needs a return target.
    if (document.activeElement === document.body) {
      (searchButton.current ?? document.getElementById("main"))?.focus();
    }
    setIsOpen(true);
    // An open box keeps its text and takes focus back to the field.
    setFocusRequest((count) => count + 1);
  }, []);
  // Back and forward navigate too: the box never stays over a page it was not opened for.
  const pathname = useLocation({ select: (location) => location.pathname });
  useEffect(() => setIsOpen(false), [pathname]);
  useSearchShortcut(available ? open : undefined);
  return {
    isOpen,
    onOpenChange: setIsOpen,
    focusRequest,
    searchButton,
    open: available ? open : undefined,
  };
};

/** Every grant-work role uses the same workspace context. */
export type ShellContext = { kind: "workspace"; workspace: ShellWorkspace };

export const AppShell = (props: { current: ShellContext; children: ReactNode }) => {
  const { workspace } = props.current;

  // Merit AI is only offered in demo workspaces, where its answers are recorded examples.
  return workspace.kind === "demo" ? (
    <MeritAi key={workspace.id} workspaceSlug={workspace.slug}>
      <Shell {...props} />
    </MeritAi>
  ) : (
    <Shell {...props} />
  );
};

const Shell = ({ current, children }: { current: ShellContext; children: ReactNode }) => {
  const { t } = useTranslation(["common", "reviewer"]);
  const meritAi = useMeritAiShell();
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
        companion={meritAi?.companion}
        skipLabel={t("skipToContent")}
        navigationLabel={t("mainNavigation")}
        brand={
          <Link {...workspaceHomeLocation(workspace)} aria-label={t("home")}>
            <Brand />
          </Link>
        }
        identity={<ContextIdentity name={name} workspace={workspace} />}
        navigation={
          <AppNavigation
            workspace={workspace}
            onSearch={search.open}
            searchButton={search.searchButton}
            assistant={meritAi && <AskMeritAiButton onPress={meritAi.open} />}
          />
        }
        footer={
          <>
            <ApplicationDocumentationLink
              href="/docs"
              label={t("docs")}
              newTabLabel={t("docsNewTab")}
            />
            <WorkspaceAccount />
          </>
        }
      >
        {children}
      </ApplicationShell>
      {searchSlug && search.focusRequest > 0 && (
        <WorkspaceSearch
          key={searchSlug}
          workspace={workspace}
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
  searchButton,
  assistant,
}: {
  workspace: ShellWorkspace;
  onSearch?: () => void;
  /** The opener for Merit AI, offered after Search where the workspace has it. */
  assistant?: ReactNode;
  searchButton: RefObject<HTMLButtonElement | null>;
}) => {
  const { t } = useTranslation(["web", "common", "reviewer"]);
  const { canAdminister } = useContext(WorkspaceNavigationContext);
  const grantWork = workspace?.canWorkOnGrants ? workspace.slug : undefined;
  const reviews = workspace.kind !== "demo";
  const pinKinds = [
    ...(grantWork ? (["round", "application"] as const) : []),
    ...(reviews ? (["review"] as const) : []),
  ];

  return (
    <>
      {grantWork && onSearch && <SearchButton onPress={onSearch} buttonRef={searchButton} />}
      {assistant}
      <PinnedSection workspaceSlug={workspace.slug} kinds={pinKinds} />
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
          title={t("navigation.myWork")}
          kind="review"
          icon="edit"
          workspaceSlug={workspace.slug}
          location={{ to: "/app/$workspaceSlug/work", params: { workspaceSlug: workspace.slug } }}
        />
      )}
      <NavigationPinsStatus />
      {(grantWork || workspace.canViewTeam || canAdminister) && (
        <ApplicationNavigationGroup
          label={grantWork || workspace.canViewTeam ? t("navigation.workspace") : undefined}
        >
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
        </ApplicationNavigationGroup>
      )}
    </>
  );
};
