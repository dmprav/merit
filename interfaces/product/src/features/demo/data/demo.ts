import { queryOptions } from "@tanstack/react-query";

import { available } from "@merit/query";

import { grantWorkQueryKey } from "../../../shared/grant-work-query-key";
import type { StartDemo } from "../contracts";
import { readDemo, startDemo } from "./server/demo.functions";

export const startDemoData: StartDemo = (input) => startDemo({ data: input });

export const demoOptions = (workspaceSlug: string) =>
  queryOptions({
    queryKey: [...grantWorkQueryKey(workspaceSlug), "demo"],
    queryFn: async ({ signal }) => available(await readDemo({ signal })),
  });
