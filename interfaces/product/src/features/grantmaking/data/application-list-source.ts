import type { ApplicationListSource } from "@merit/grantmaking-web/data/applications";

import { grantWorkQueryKey } from "../../../shared/grant-work-query-key";
import { readWorkspaceApplications } from "./server/funding-round.functions";

export const applicationListSource: ApplicationListSource = {
  scope: (workspaceSlug) => [...grantWorkQueryKey(workspaceSlug), "funding-rounds"],
  read: (data, signal) => readWorkspaceApplications({ data, signal }),
};
