import type { OrganizationService } from "../api/service";
import { createCommands } from "./commands/service";
import type { Dependencies } from "./dependencies";
import { createQueries } from "./queries/service";

export const createOrganizationService = (dependencies: Dependencies): OrganizationService => ({
  ...createCommands(dependencies),
  ...createQueries(dependencies),
});
