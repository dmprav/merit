import type { QueryClient } from "@tanstack/react-query";

import type { IntakeState } from "@merit/applications-web/contracts";
import { createIntakeData } from "@merit/applications-web/data";

import { grantWorkQueryKey } from "../../../../shared/grant-work-query-key";
import { applicationOptions } from "../queries";
import { selectContact } from "../server/applications/application-contact.functions";
import { editApplication } from "../server/intake/intake.functions";

export const workspaceIntakeData = (
  client: QueryClient,
  workspaceSlug: string,
  publicId: string,
  state: IntakeState,
) =>
  createIntakeData(
    client,
    { workspaceSlug, publicId, state },
    {
      applicationScope: applicationOptions(workspaceSlug, publicId).queryKey,
      grantWorkScope: grantWorkQueryKey(workspaceSlug),
      editApplication: (data) => editApplication({ data }),
      selectContact: (data) => selectContact({ data }),
    },
  );
