import { queryOptions } from "@tanstack/react-query";

import { available, privateKey } from "@merit/query";

import { listOrganizations, readOrganization } from "./server/organizations.functions";

export const organizationsOptions = () =>
  queryOptions({
    queryKey: [...privateKey, "organizations"],
    queryFn: async ({ signal }) => available(await listOrganizations({ signal })),
  });

export const organizationOptions = (organizationId: string) =>
  queryOptions({
    queryKey: [...privateKey, "organizations", organizationId],
    queryFn: async ({ signal }) =>
      available(await readOrganization({ signal, data: { organizationId } })),
  });
