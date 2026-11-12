import { queryOptions } from "@tanstack/react-query";

import { available, privateKey } from "@merit/query";

import { readAccessRequests } from "./server/access-requests.functions";

export const accessRequestsOptions = () =>
  queryOptions({
    queryKey: [...privateKey, "access-requests"],
    queryFn: async ({ signal }) => available(await readAccessRequests({ signal })),
  });
