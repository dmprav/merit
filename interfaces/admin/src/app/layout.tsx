import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, useParams, useRouterState } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import type { Workspace } from "@merit/organizations/api";
import {
  ApplicationPage,
  ApplicationShell,
  ApplicationContext,
  ApplicationContextOption,
  ApplicationRecovery,
} from "@merit/ui/application-shell";
import shellStyles from "@merit/ui/application-shell.module.css";
import { Brand } from "@merit/ui/brand";
import { Icon } from "@merit/ui/icon";
import { StateMessage } from "@merit/ui/state-message";

import { AdminDrafts } from "../features/organizations/controllers/drafts";
import { organizationOptions } from "../features/organizations/data/queries";
import { AdminAccount } from "./account";
import { adminContextOptions } from "./data/queries";
import { AdminMessages } from "./messages";

const Layout = () => {
  const { t } = useTranslation(["administration", "common"]);
  // Move focus after the previous route's dialog has released its focus scope.
  const pathname = useRouterState({
    select: (state) => (state.resolvedLocation ?? state.location).pathname,
  });
  const { organizationId } = useParams({ strict: false });

  const organization = useQuery({
    ...organizationOptions(organizationId ?? ""),
    enabled: Boolean(organizationId),
  }).data;
  const admin = useQuery(adminContextOptions()).data;
  const workspaces = admin?.status === "ok" ? admin.workspaces : [];
  const signedOut = admin?.status === "signed_out" || organization?.status === "signed_out";
  const canAdminister =
    admin?.status === "ok" &&
    admin.canAdminister &&
    organization?.status !== "forbidden" &&
    organization?.status !== "signed_out";

  const workspaceLinks = workspaces.map((workspace) => (
    <Link
      key={workspace.id}
      to={
        workspace.canWorkOnGrants
          ? "/app/$workspaceSlug/rounds"
          : "/app/$workspaceSlug/settings/members"
      }
      params={{ workspaceSlug: workspace.slug }}
    >
      <ApplicationContextOption name={workspace.name} />
    </Link>
  ));

  const pagePath = pathname.replace(/\/$/, "");
  const isRequests = pagePath === "/admin/access-requests";

  if (!canAdminister) {
    return (
      <ApplicationRecovery
        locationKey={pathname}
        brand="merit"
        account={<AdminAccount />}
        returnLink={
          <Link {...adminRecoveryLocation(signedOut, workspaces)}>
            <Icon name="left" />
            {t("common:backToMerit")}
          </Link>
        }
      >
        <Outlet />
      </ApplicationRecovery>
    );
  }

  return (
    <ApplicationShell
      brand={
        <Link to="/admin/organizations" aria-label={t("common:home")}>
          <Brand />
        </Link>
      }
      contextLabel={t("administration")}
      openNavigationLabel={t("common:openNavigation")}
      closeNavigationLabel={t("common:closeNavigation")}
      identity={
        <ApplicationContext name={t("administration")} label={t("common:switchContext")}>
          {workspaces.length > 1 ? workspaceLinks : undefined}
        </ApplicationContext>
      }
      navigationLabel={t("title")}
      skipLabel={t("common:skipToContent")}
      navigation={
        <>
          <Link to="/admin/organizations" aria-current={!isRequests ? "page" : undefined}>
            <Icon name="layers" />
            {t("organizations")}
          </Link>
          <Link to="/admin/access-requests" aria-current={isRequests ? "page" : undefined}>
            <Icon name="team" />
            {t("requests.title")}
          </Link>
          {workspaces.length === 1 && workspaceLinks}
        </>
      }
      footer={<AdminFooter />}
    >
      <ApplicationPage
        locationKey={pathname}
        breadcrumbLabel={t("breadcrumb")}
        breadcrumb={adminBreadcrumb(
          pagePath,
          organization?.status === "ok" ? organization.value.name : undefined,
          t,
        )}
      >
        <Outlet />
      </ApplicationPage>
    </ApplicationShell>
  );
};

const adminRecoveryLocation = (signedOut: boolean, workspaces: Workspace[]) => {
  if (signedOut) {
    return { to: "/" as const };
  }

  const [workspace] = workspaces;
  if (workspaces.length === 1 && workspace) {
    return {
      to: workspace.canWorkOnGrants
        ? ("/app/$workspaceSlug/rounds" as const)
        : ("/app/$workspaceSlug/settings/members" as const),
      params: { workspaceSlug: workspace.slug },
    };
  }

  return { to: workspaces.length > 1 ? ("/app" as const) : ("/" as const) };
};

const adminBreadcrumb = (
  pagePath: string,
  organizationName: string | undefined,
  t: TFunction<"administration">,
) => {
  if (pagePath === "/admin/access-requests") {
    return [t("requests.title")];
  }
  if (pagePath === "/admin/organizations") {
    return [t("organizations")];
  }

  return [
    <Link key="organizations" to="/admin/organizations">
      {t("organizations")}
    </Link>,
    organizationName ?? t("details"),
  ];
};

const DraftLayout = () => {
  const { t } = useTranslation("administration");
  const { data, isPending } = useQuery(adminContextOptions());
  if (isPending) {
    return <StateMessage title={t("loadingDrafts")} role="status" />;
  }

  const scope = data?.status === "ok" && data.canAdminister ? data.draftScope : undefined;

  return (
    <AdminDrafts key={scope} scope={scope}>
      <Layout />
    </AdminDrafts>
  );
};

export const Route = createFileRoute("/_administration")({
  component: () => (
    <AdminMessages>
      <DraftLayout />
    </AdminMessages>
  ),
});

const AdminFooter = () => {
  const { t } = useTranslation(["administration", "common"]);
  return (
    <>
      <a
        href="/docs"
        target="_blank"
        rel="noopener noreferrer"
        className={shellStyles.documentationLink}
        aria-label={t("common:docsNewTab")}
      >
        {t("common:docs")}
      </a>
      <AdminAccount />
    </>
  );
};
