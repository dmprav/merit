import { queryOptions } from "@tanstack/react-query";

import { available, privateKey } from "@merit/query";

import type { TeamTransport } from "../contracts/team";

export const teamOptions = (workspaceSlug: string, read: TeamTransport["read"]) =>
  queryOptions({
    queryKey: [...privateKey, "workspace", workspaceSlug, "team"],
    queryFn: async ({ signal }) => available(await read(workspaceSlug, signal)),
  });
