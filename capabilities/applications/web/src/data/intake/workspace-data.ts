import type { QueryClient, QueryKey } from "@tanstack/react-query";

import type { IntakeData, IntakeState, IntakeTransport } from "../../contracts/intake";

type IntakeSource = IntakeTransport & {
  applicationScope: QueryKey;
  grantWorkScope: QueryKey;
};

export const createIntakeData = (
  client: QueryClient,
  target: { workspaceSlug: string; publicId: string; state: IntakeState },
  source: IntakeSource,
): IntakeData => {
  const { workspaceSlug, publicId, state } = target;
  return {
    draftKey: publicId,
    workspaceSlug,
    publicId,
    state,
    save: (change, revision) =>
      source.editApplication({ workspaceSlug, publicId, change, expectedRevision: revision }),
    selectContact: (contactId, revision) =>
      source.selectContact({ workspaceSlug, publicId, expectedRevision: revision, contactId }),
    refresh: () =>
      client.invalidateQueries({ queryKey: source.grantWorkScope }, { throwOnError: true }),
    refreshCurrent: () =>
      client.invalidateQueries({ queryKey: source.applicationScope }, { throwOnError: true }),
  };
};
