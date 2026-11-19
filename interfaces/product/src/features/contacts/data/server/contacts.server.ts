import type { z } from "zod";

import type { Identity } from "@merit/auth";
import { withActor } from "@merit/auth/request";
import type { contactApplicationListInput, GrantmakingQueries } from "@merit/grantmaking/api";

export const loadContactApplications = (
  input: z.input<typeof contactApplicationListInput>,
  services: Pick<GrantmakingQueries, "listContactApplications"> & {
    currentIdentity: () => Promise<Identity>;
  },
) => withActor(services.currentIdentity, (actor) => services.listContactApplications(actor, input));
