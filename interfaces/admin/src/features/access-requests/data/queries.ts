import { infiniteQueryOptions, type QueryFunctionContext } from "@tanstack/react-query";

import type { AccessRequestCursor } from "@merit/organizations/api";
import { available, privateKey } from "@merit/query";

import { readAccessRequests } from "./server/access-requests.functions";

export const accessRequestsOptions = () =>
  infiniteQueryOptions({
    queryKey: [...privateKey, "access-requests"],
    initialPageParam: null,
    queryFn: async ({
      signal,
      pageParam,
    }: QueryFunctionContext<readonly string[], AccessRequestCursor | null>) =>
      available(await readAccessRequests({ signal, data: { after: pageParam ?? undefined } })),
    getNextPageParam: (page) => (page.status === "ok" ? page.value.nextCursor : null),
  });
