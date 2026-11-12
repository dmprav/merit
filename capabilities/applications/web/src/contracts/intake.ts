import type { z } from "zod";

import type {
  editApplicationRequestSchema,
  selectContactRequestSchema,
} from "@merit/applications/api";
import type { IntakeSaveError } from "@merit/applications/api";
import type { IntakeChange } from "@merit/applications/domain";
import type { IntakeState } from "@merit/grantmaking/api";

export type { IntakeState } from "@merit/grantmaking/api";

export type IntakeSaveResult =
  | { status: "ok"; revision: number }
  | { status: "invalid"; error: IntakeSaveError }
  | { status: "conflict" | "not_found" | "signed_out" | "unavailable" };

export type IntakeFailure = Exclude<IntakeSaveResult, { status: "ok" }> | { status: "busy" };

export type IntakeData = {
  draftKey: string;
  workspaceSlug: string;
  publicId: string;
  state: IntakeState;
  save: (change: IntakeChange, revision: number) => Promise<IntakeSaveResult>;
  selectContact?: (contactId: string | null, revision: number) => Promise<IntakeSaveResult>;
  refresh: () => Promise<void>;
  refreshCurrent: () => Promise<void>;
};

export type ApplicationContactData = Pick<
  IntakeData,
  "workspaceSlug" | "refresh" | "refreshCurrent"
> & {
  selectContact: NonNullable<IntakeData["selectContact"]>;
};

export type IntakeTransport = {
  editApplication: (
    input: z.infer<typeof editApplicationRequestSchema>,
  ) => Promise<IntakeSaveResult>;
  selectContact: (input: z.infer<typeof selectContactRequestSchema>) => Promise<IntakeSaveResult>;
};
