import type { Actor, Identity } from "@merit/auth";
import type { ContactService } from "@merit/contacts/api";
import type { GrantmakingService } from "@merit/grantmaking/api";
import type { Workspace } from "@merit/organizations/api";

export type { DemoServices } from "../features/demo/contracts";

export type WorkspaceServices = Pick<
  GrantmakingService,
  | "applicationAuditHistory"
  | "roundBudgetHistory"
  | "selectContact"
  | "saveReview"
  | "createApplication"
  | "editApplication"
  | "createRound"
  | "editRound"
  | "deleteRound"
  | "readApplicationPage"
  | "readRoundPage"
  | "saveRecommendation"
  | "listRounds"
  | "listWorkspaceApplications"
  | "listWorkspaceActivity"
  | "searchWorkspace"
> &
  Pick<ContactService, "listContacts" | "changeContact" | "contactHistory"> & {
    currentIdentity: () => Promise<Identity>;
    readWorkspace: (actor: Actor, workspaceSlug?: string) => Promise<Workspace | null>;
  };
