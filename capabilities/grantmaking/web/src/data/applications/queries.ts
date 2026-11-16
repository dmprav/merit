import { queryOptions } from "@tanstack/react-query";

import {
  workspaceApplicationsInput,
  type WorkspaceApplicationsInput,
} from "@merit/grantmaking/api";
import { available } from "@merit/query";

import type { ApplicationListSource } from "../../contracts/application-list";

export const applicationListOptions = (
  source: ApplicationListSource,
  request: WorkspaceApplicationsInput,
) => {
  const input = workspaceApplicationsInput.parse(request);
  return queryOptions({
    queryKey: [...source.scope(input.workspaceSlug), "applications", input],
    queryFn: async ({ signal }) => available(await source.read(input, signal)),
  });
};
