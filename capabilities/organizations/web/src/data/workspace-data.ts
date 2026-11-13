import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { privateKey } from "@merit/query";

import type { Team, TeamData, TeamTransport, MutationResult } from "../contracts/team";
import { teamOptions } from "./queries";

export const useWorkspaceTeam = (
  initial: Team,
  transport: TeamTransport,
  revalidateAccess: () => Promise<void>,
): TeamData => {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (operation: () => Promise<MutationResult>) => operation(),
  });
  const query = useQuery({
    ...teamOptions(initial.organization.slug, transport.read),
    initialData: { status: "ok", value: initial },
  });

  const refresh = async () => {
    let available = false;
    try {
      const { data: result } = await query.refetch({ throwOnError: true });
      available = result?.status === "ok";
    } catch {
      // Navigation still needs a current access check when the team read fails.
    }

    await revalidateAccess();
    if (!available) {
      throw new Error("Team unavailable");
    }
  };

  return {
    historySource: transport.history?.(initial.organization.slug),
    team: query.data.status === "ok" ? query.data.value : initial,
    fetching: query.isFetching,
    invite: (input) => mutation.mutateAsync(() => transport.invite(input)),
    changeMember: (input) => mutation.mutateAsync(() => transport.changeMember(input)),
    removeMember: (input) => mutation.mutateAsync(() => transport.removeMember(input)),
    resend: (input) => mutation.mutateAsync(() => transport.resend(input)),
    revoke: (input) => mutation.mutateAsync(() => transport.revoke(input)),
    refresh,
    refreshAfterSave: async () => {
      await client.invalidateQueries({ queryKey: privateKey, refetchType: "none" });
      await refresh();
    },
  };
};
