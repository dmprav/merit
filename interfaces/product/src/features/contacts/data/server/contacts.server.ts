import type { z } from "zod";

import type { Identity } from "@merit/auth";
import { withActor } from "@merit/auth/request";
import type { contactApplicationListInput } from "@merit/grantmaking/api";

import type { WorkspaceServices } from "../../../../shared/request-context";

export const loadContactApplications = (
  input: z.input<typeof contactApplicationListInput>,
  services: Pick<WorkspaceServices, "listContactApplications"> & {
    currentIdentity: () => Promise<Identity>;
  },
) => withActor(services.currentIdentity, (actor) => services.listContactApplications(actor, input));
