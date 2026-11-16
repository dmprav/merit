import { useHydrated } from "@tanstack/react-router";

import {
  useApplicationList,
  type ApplicationListOptions,
} from "@merit/grantmaking-web/data/applications";

import { applicationListSource } from "./application-list-source";

export const useWorkspaceApplications = (workspaceSlug: string, options: ApplicationListOptions) =>
  useApplicationList(applicationListSource, workspaceSlug, {
    ...options,
    enabled: useHydrated() && (options.enabled ?? true),
  });
