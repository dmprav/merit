import { queryOptions } from "@tanstack/react-query";

import { privateKey } from "@merit/query";

import { readAdminContext } from "./admin-context.functions";

export const adminContextOptions = () =>
  queryOptions({
    queryKey: [...privateKey, "administration", "workspaces"],
    queryFn: ({ signal }) => readAdminContext({ signal }),
  });
