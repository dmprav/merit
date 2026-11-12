import type { z } from "zod";

import type { createApplicationRequestSchema } from "@merit/applications/api";
import type { createRoundRequestSchema } from "@merit/rounds/api";

type CreationResult =
  | { status: "ok"; publicId: string }
  | {
      status: "invalid";
      error:
        | "invalid_round"
        | "round_deleted"
        | "invalid_application"
        | "application_deleted"
        | "request_total_too_large";
    }
  | { status: "not_found" | "signed_out" | "unavailable" };

export type CreationDraft = {
  requestId: string;
  title: string;
  body: string;
  amount: string;
  meetingDate: string;
  applicant: string;
};

export type CreationTarget =
  | { kind: "round"; workspaceSlug: string; workspaceName: string }
  | { kind: "application"; workspaceSlug: string; roundPublicId: string; roundTitle: string };

export type CreatedRecord = { title: string; publicId: string };

export type CreationData = {
  draftKey: string;
  target: CreationTarget;
  create: (draft: CreationDraft, materialLabel: string) => Promise<CreationResult>;
  refresh: () => Promise<void>;
  open: (record: CreatedRecord) => Promise<void>;
};

export type CreationTransport = {
  createRound: (input: z.infer<typeof createRoundRequestSchema>) => Promise<CreationResult>;
  createApplication: (
    input: z.infer<typeof createApplicationRequestSchema>,
  ) => Promise<CreationResult>;
};
