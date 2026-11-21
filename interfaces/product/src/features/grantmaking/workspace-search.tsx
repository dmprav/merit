import { useQueryClient } from "@tanstack/react-query";
import {
  Link,
  useRouter,
  useNavigate,
  useLocation,
  type LinkOptions,
} from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { CreateAction } from "@merit/grantmaking-web/creation";
import {
  WorkspaceSearchDialog,
  type SearchDestination,
  type SearchLinks,
  type SearchCommand,
} from "@merit/grantmaking-web/search";

import type { ShellWorkspace } from "../../app/app-shell";
import { resourceRef } from "./contracts/resource-url";
import { workspaceCreationData } from "./data/creation/workspace-data";
import { workspaceSearchData } from "./data/workspace-search";

// A result opens its record directly, without a `from` parameter, so the application's
// back link leads to its round, as it does from a pin.
const destinationLocation = (workspaceSlug: string, destination: SearchDestination): LinkOptions =>
  destination.kind === "round"
    ? {
        to: "/app/$workspaceSlug/rounds/$roundRef",
        params: {
          workspaceSlug,
          roundRef: resourceRef(destination.round.title, destination.round.id),
        },
      }
    : {
        to: "/app/$workspaceSlug/applications/$applicationRef",
        params: {
          workspaceSlug,
          applicationRef: resourceRef(destination.application.title, destination.application.id),
        },
      };

/** Search the workspace's funding rounds and applications from anywhere in it. */
export const WorkspaceSearch = ({
  workspace,
  isOpen,
  onOpenChange,
  focusRequest,
}: {
  workspace: ShellWorkspace;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  focusRequest: number;
}) => {
  const { t } = useTranslation("web");
  const workspaceSlug = workspace.slug;
  const router = useRouter();
  const client = useQueryClient();
  const navigate = useNavigate();
  const locationKey = useLocation({ select: (location) => location.href });
  const creation = workspaceCreationData(
    client,
    { kind: "round", workspaceSlug, workspaceName: workspace.name },
    navigate,
  );
  const data = useMemo(() => workspaceSearchData(workspaceSlug), [workspaceSlug]);
  const links = useMemo<SearchLinks>(
    () => ({
      href: (destination) =>
        router.buildLocation(destinationLocation(workspaceSlug, destination)).href,
      // The router computes the same address, so the row's own `href` is not passed on.
      render: (destination, { href: _href, ...props }) => (
        <Link {...destinationLocation(workspaceSlug, destination)} {...props} />
      ),
    }),
    [router, workspaceSlug],
  );

  const pages = useSearchPages(workspace);

  return (
    <CreateAction
      data={creation}
      locationKey={locationKey}
      renderTrigger={(openCreation) => (
        <WorkspaceSearchDialog
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          data={data}
          links={links}
          focusRequest={focusRequest}
          commands={[
            ...pages,
            {
              id: "create-round",
              names: [t("search.createRound")],
              title: t("search.createRound"),
              textValue: t("search.createRound"),
              icon: "add",
              label: t("search.action"),
              onAction: openCreation,
            },
          ]}
        />
      )}
    />
  );
};

const useSearchPages = (workspace: ShellWorkspace) => {
  const { t } = useTranslation("web");
  const router = useRouter();

  const page = (
    id: string,
    name: string,
    title: string,
    icon: SearchCommand["icon"],
    location: LinkOptions,
  ): SearchCommand => ({
    id,
    names: [name, title],
    title,
    textValue: title,
    icon,
    label: t("search.page"),
    href: router.buildLocation(location).href,
    renderLink: ({ href: _href, ...props }) => <Link {...location} {...props} />,
  });

  const params = { workspaceSlug: workspace.slug };
  return [
    page("rounds", t("navigation.rounds"), t("search.rounds"), "layers", {
      to: "/app/$workspaceSlug/rounds",
      params,
    }),
    page("applications", t("navigation.applications"), t("search.applications"), "application", {
      to: "/app/$workspaceSlug/applications",
      params,
    }),
    page("activity", t("navigation.activity"), t("search.activity"), "activity", {
      to: "/app/$workspaceSlug/activity",
      params,
    }),
    ...(workspace.kind !== "demo"
      ? [
          page("work", t("navigation.myWork"), t("search.work"), "edit", {
            to: "/app/$workspaceSlug/work",
            params,
          }),
        ]
      : []),
    page("contacts", t("navigation.contacts"), t("search.contacts"), "contacts", {
      to: "/app/$workspaceSlug/contacts",
      params,
    }),
    ...(workspace.canViewTeam
      ? [
          page("settings", t("navigation.settings"), t("search.settings"), "settings", {
            to: "/app/$workspaceSlug/settings/members",
            params,
          }),
        ]
      : []),
  ];
};
