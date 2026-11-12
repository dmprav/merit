import type { z } from "zod";

import type {
  OrganizationDetails,
  OrganizationService,
  Result,
  createOrganizationInput,
} from "@merit/organizations/api";

export type Organization = OrganizationDetails & { canOpenWorkspace: boolean };

type RequestFailure = { status: "signed_out" | "unavailable" };

export type ReadResult = Result<Organization> | RequestFailure;

export type ListResult = Awaited<ReturnType<OrganizationService["list"]>> | RequestFailure;

export type OrganizationFailure = Exclude<Result<null> | RequestFailure, { status: "ok" }>;

export type MutationResult = Result<null> | RequestFailure;

export type CreationInput = z.infer<typeof createOrganizationInput>;

export type CreationData = {
  create: (input: CreationInput) => Promise<Result<{ organizationId: string }> | RequestFailure>;
};

export type OrganizationData = {
  organization: Organization;
  fetching: boolean;
  renaming: boolean;
  sending: boolean;
  revoking: boolean;
  rename: (name: string) => Promise<OrganizationFailure | { status: "ok"; refreshFailed: boolean }>;
  invite: (email: string) => Promise<MutationResult>;
  revoke: () => Promise<MutationResult>;
  refresh: () => Promise<void>;
  refreshAfterSave: () => Promise<void>;
};
