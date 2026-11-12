import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";

import { workspaceSlugSchema } from "@merit/organizations/api";

import { publicIdFromRef, resourceRef } from "./contracts/resource-url";
import { roundOptions, applicationOptions } from "./data/queries";

type Page = {
  workspaceSlug: string;
  round: { title: string; applications: { id: string; title: string }[] };
};

export const workspaceRoundsLocation = (workspaceSlug: string) => ({
  to: "/app/$workspaceSlug/rounds" as const,
  params: { workspaceSlug },
});

export const roundLocation = (page: {
  workspaceSlug: string;
  round: { id: string; title: string };
}) => ({
  to: "/app/$workspaceSlug/rounds/$roundRef" as const,
  params: {
    workspaceSlug: page.workspaceSlug,
    roundRef: resourceRef(page.round.title, page.round.id),
  },
});

export const applicationLocation = (page: Page, applicationId: string) => {
  const application = page.round.applications.find((item) => item.id === applicationId);
  if (!application) {
    return null;
  }

  return {
    to: "/app/$workspaceSlug/applications/$applicationRef" as const,
    params: {
      workspaceSlug: page.workspaceSlug,
      applicationRef: resourceRef(application.title, application.id),
    },
  };
};

/**
 * Resolve a title-and-ID or ID-only reference within a workspace. After access is
 * confirmed, redirect outdated titles to the current URL while retaining supported
 * search state. Denied requests never expose a canonical title.
 */
export const loadPublicPage = async (
  queryClient: QueryClient,
  workspaceSlug: string,
  ref: string,
  search: { tab?: "reviews"; section?: "overview" | "applications" } = {},
) => {
  const publicId = publicIdFromRef(ref);
  if (!publicId || !workspaceSlugSchema.safeParse(workspaceSlug).success) {
    return { status: "not_found" } as const;
  }

  const page = await queryClient.fetchQuery(roundOptions(workspaceSlug, publicId));
  if (page.status !== "ok") {
    return page;
  }

  const location = roundLocation(page);
  if (!location) {
    return { status: "not_found" } as const;
  }

  const canonical = location.params.roundRef;
  if (ref !== canonical) {
    throw redirect({
      ...location,
      search,
      replace: true,
      statusCode: 302,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  return page;
};

export const loadApplicationPage = async (
  queryClient: QueryClient,
  workspaceSlug: string,
  ref: string,
  search: { tab?: "reviews" } = {},
) => {
  const publicId = publicIdFromRef(ref);
  if (!publicId || !workspaceSlugSchema.safeParse(workspaceSlug).success) {
    return { status: "not_found" } as const;
  }

  const page = await queryClient.fetchQuery(applicationOptions(workspaceSlug, publicId));
  if (page.status !== "ok") {
    return page;
  }

  const canonical = resourceRef(page.application.title, page.application.id);
  if (ref !== canonical) {
    throw redirect({
      to: "/app/$workspaceSlug/applications/$applicationRef",
      params: { workspaceSlug, applicationRef: canonical },
      search,
      replace: true,
      statusCode: 302,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  return page;
};
