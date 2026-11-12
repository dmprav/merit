import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { organizationName } from "@merit/organizations/api";
import { privateKey } from "@merit/query";

import type { CreationData, Organization, OrganizationData } from "../contracts";
import { organizationOptions, organizationsOptions } from "./queries";
import {
  createOrganization,
  inviteAdministrator,
  renameOrganization,
  revokeInvitation,
} from "./server/organizations.functions";

export const useCreationData = (): CreationData => {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof createOrganization>[0]) => createOrganization(input),
  });
  return {
    create: async (input) => {
      const result = await mutation.mutateAsync({ data: input });
      if (result.status === "ok") {
        await client.invalidateQueries({
          queryKey: organizationsOptions().queryKey,
          refetchType: "none",
        });
      }
      return result;
    },
  };
};

export const useOrganizationData = (initial: Organization): OrganizationData => {
  const client = useQueryClient();
  const options = organizationOptions(initial.id);
  const query = useQuery({ ...options, initialData: { status: "ok", value: initial } });
  const rename = useMutation({
    mutationFn: (input: Parameters<typeof renameOrganization>[0]) => renameOrganization(input),
  });
  const invite = useMutation({
    mutationFn: (input: Parameters<typeof inviteAdministrator>[0]) => inviteAdministrator(input),
  });
  const revoke = useMutation({
    mutationFn: (input: Parameters<typeof revokeInvitation>[0]) => revokeInvitation(input),
  });

  const invalidate = () => client.invalidateQueries({ queryKey: privateKey, refetchType: "none" });

  const refresh = async () => {
    const result = (await query.refetch({ throwOnError: true })).data;
    if (result?.status !== "ok") {
      throw new Error("Organization refresh unavailable");
    }
  };

  return {
    organization: query.data.status === "ok" ? query.data.value : initial,
    fetching: query.isFetching,
    renaming: rename.isPending,
    sending: invite.isPending,
    revoking: revoke.isPending,
    rename: async (name) => {
      const result = await rename.mutateAsync({ data: { organizationId: initial.id, name } });
      if (result.status !== "ok") {
        return result;
      }
      try {
        await client.cancelQueries({ queryKey: options.queryKey });
        client.setQueryData(options.queryKey, (current) =>
          current?.status === "ok"
            ? { ...current, value: { ...current.value, name: organizationName.parse(name) } }
            : current,
        );
        await invalidate();
        return { status: "ok", refreshFailed: false };
      } catch {
        // A cache failure cannot undo the committed rename.
        return { status: "ok", refreshFailed: true };
      }
    },
    invite: (email) => invite.mutateAsync({ data: { organizationId: initial.id, email } }),
    revoke: () => revoke.mutateAsync({ data: { organizationId: initial.id } }),
    refresh,
    refreshAfterSave: async () => {
      await invalidate();
      await refresh();
    },
  };
};
