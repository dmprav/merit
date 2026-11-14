import { z } from "zod";

import {
  organizationIdInput,
  createOrganizationInput,
  renameOrganizationInput,
  replaceInvitationInput,
  invitationTokenInput,
  accessRequestInput,
} from "@merit/organizations/api";

import { pageInput, pageItems } from "../../components/pagination";
import type { RegisterTool } from "../../components/register-tool";
import { readAnnotations, writeAnnotations } from "../../components/tool-options";
import type { McpActor } from "../../contracts";
import { teamErrorSchema } from "../team/responses";
import type { OrganizationOperations } from "./operations";
import {
  organizationSchema,
  organizationSummarySchema,
  organizationDetailsSchema,
  invitationSchema,
  accessRequestSchema,
  presentOrganization,
  presentOrganizationSummary,
  presentOrganizationDetails,
  presentAccessRequest,
} from "./responses";

const read = {
  scope: "admin:read" as const,
  annotations: readAnnotations,
  errorSchema: teamErrorSchema,
};
const write = {
  scope: "admin:write" as const,
  annotations: writeAnnotations,
  errorSchema: teamErrorSchema,
};
const emptySaved = z.object({ status: z.literal("ok") });

const registerOrganizationReads = (
  register: RegisterTool,
  actor: McpActor,
  organizations: OrganizationOperations,
) => {
  register(
    "list_organizations",
    {
      ...read,
      inputSchema: pageInput,
      outputSchema: z.object({
        status: z.literal("ok"),
        organizations: z.array(organizationSummarySchema),
        nextCursor: z.string().nullable(),
      }),
      description:
        "For Merit operators: list organizations and initial-owner onboarding status. Follow nextCursor as after. Operator authority does not grant workspace access.",
    },
    async (input) => {
      const result = await organizations.list(actor);
      if (result.status !== "ok") {
        return result;
      }
      const { items, nextCursor } = pageItems(
        result.value.map(presentOrganizationSummary),
        input,
        (item) => item.id,
      );
      return { status: "ok" as const, organizations: items, nextCursor };
    },
  );
  register(
    "get_organization",
    {
      ...read,
      inputSchema: organizationIdInput,
      outputSchema: z.object({ status: z.literal("ok"), organization: organizationDetailsSchema }),
      description:
        "For Merit operators: read organization, owner and invitation delivery/acceptance status.",
    },
    async (input) => {
      const result = await organizations.read(actor, input);
      return result.status === "ok"
        ? { status: "ok" as const, organization: presentOrganizationDetails(result.value) }
        : result;
    },
  );
};

const registerOrganizationWrites = (
  register: RegisterTool,
  actor: McpActor,
  organizations: OrganizationOperations,
) => {
  register(
    "create_organization",
    {
      ...write,
      annotations: { ...writeAnnotations, openWorldHint: true },
      inputSchema: createOrganizationInput,
      outputSchema: z.object({
        status: z.literal("ok"),
        organizationId: z.string(),
      }),
      description:
        "For Merit operators: create an empty organization and email its first owner an invitation with program-manager access. Reuse requestId on retry. Read the organization to check delivery.",
    },
    async (input) => {
      const result = await organizations.create(actor, input);
      return result.status === "ok"
        ? { status: "ok" as const, organizationId: result.value.organizationId }
        : result;
    },
  );
  register(
    "rename_organization",
    {
      ...write,
      inputSchema: renameOrganizationInput,
      outputSchema: emptySaved,
      description:
        "For Merit operators: rename an organization. Its workspace address remains fixed.",
    },
    async (input) => {
      const result = await organizations.rename(actor, input);
      return result.status === "ok" ? { status: "ok" as const } : result;
    },
  );
  register(
    "replace_owner_invitation",
    {
      ...write,
      annotations: { ...writeAnnotations, idempotentHint: false, openWorldHint: true },
      inputSchema: replaceInvitationInput,
      outputSchema: emptySaved,
      description:
        "For Merit operators: replace or resend an unaccepted first-owner invitation. Sends email and invalidates the old link. Read current status before retrying; sending limits apply. Cannot replace an accepted invitation.",
    },
    async (input) => {
      const result = await organizations.invite(actor, input);
      return result.status === "ok" ? { status: "ok" as const } : result;
    },
  );
  register(
    "revoke_owner_invitation",
    {
      ...write,
      inputSchema: organizationIdInput,
      outputSchema: emptySaved,
      description:
        "For Merit operators: revoke an unaccepted first-owner invitation, leaving the organization needing an owner.",
    },
    async (input) => {
      const result = await organizations.revoke(actor, input);
      return result.status === "ok" ? { status: "ok" as const } : result;
    },
  );
};

const registerAccessRequests = (
  register: RegisterTool,
  actor: McpActor,
  organizations: OrganizationOperations,
) => {
  register(
    "list_access_requests",
    {
      ...read,
      inputSchema: pageInput,
      outputSchema: z.object({
        status: z.literal("ok"),
        accessRequests: z.array(accessRequestSchema),
        nextCursor: z.string().nullable(),
      }),
      description:
        "For Merit operators: list requests to explore an invited workspace. Emails remain unverified. Follow nextCursor as after.",
    },
    async (input) => {
      const result = await organizations.accessRequests(actor);
      if (result.status !== "ok") {
        return result;
      }
      const { items, nextCursor } = pageItems(
        result.value.map(presentAccessRequest),
        input,
        (item) => item.email,
      );
      return { status: "ok" as const, accessRequests: items, nextCursor };
    },
  );
  register(
    "review_access_request",
    {
      ...write,
      inputSchema: accessRequestInput,
      outputSchema: z.object({ status: z.literal("ok"), accessRequest: accessRequestSchema }),
      description:
        "For Merit operators: mark an access request reviewed. Does not send email or grant access.",
    },
    async (input) => {
      const result = await organizations.reviewAccessRequest(actor, input);
      return result.status === "ok"
        ? { status: "ok" as const, accessRequest: presentAccessRequest(result.value) }
        : result;
    },
  );
};

export const registerOrganizationTools = (
  register: RegisterTool,
  actor: McpActor,
  organizations: OrganizationOperations,
) => {
  registerOrganizationReads(register, actor, organizations);
  registerOrganizationWrites(register, actor, organizations);
  registerAccessRequests(register, actor, organizations);
};

export const registerOnboardingTools = (
  register: RegisterTool,
  actor: McpActor,
  organizations: OrganizationOperations,
) => {
  register(
    "get_membership_invitation",
    {
      scope: "onboarding:read",
      annotations: readAnnotations,
      errorSchema: teamErrorSchema,
      inputSchema: invitationTokenInput,
      outputSchema: z.object({ status: z.literal("ok"), invitation: invitationSchema }),
      description:
        "Read an invitation's organization and offered responsibilities using the token from its link. Requires the invited email on your authenticated account. Read before accepting.",
    },
    async (input) => {
      const result = await organizations.invitation(actor, input);
      return result.status === "ok"
        ? {
            status: "ok" as const,
            invitation: {
              ...result.value,
              organization: presentOrganization(result.value.organization),
            },
          }
        : result;
    },
  );
  register(
    "accept_membership_invitation",
    {
      scope: "onboarding:write",
      annotations: writeAnnotations,
      errorSchema: teamErrorSchema,
      inputSchema: invitationTokenInput,
      outputSchema: z.object({
        status: z.literal("ok"),
        organization: organizationSchema.extend({
          canWorkOnGrants: z.boolean(),
          canViewTeam: z.boolean(),
        }),
      }),
      description:
        "Accept the offered organization responsibilities for your authenticated account. Verifies the invited email. Safe to retry, but does not restore removed access. No existing membership is required.",
    },
    async (input) => {
      const result = await organizations.accept(actor, input);
      return result.status === "ok"
        ? {
            status: "ok" as const,
            organization: {
              ...presentOrganization(result.value),
              canWorkOnGrants: result.value.canWorkOnGrants,
              canViewTeam: result.value.canViewTeam,
            },
          }
        : result;
    },
  );
  register(
    "request_workspace_access",
    {
      scope: "onboarding:write",
      annotations: writeAnnotations,
      inputSchema: accessRequestInput,
      outputSchema: z.object({ status: z.literal("ok") }),
      errorSchema: z.object({ status: z.enum(["limited", "invalid_input", "unavailable"]) }),
      description:
        "Request an invitation to explore Merit. Saves an access request without sending email, creating membership or granting access. Repeated submissions preserve the original request; rate limits apply.",
    },
    (input) => organizations.requestAccess(input),
  );
};
