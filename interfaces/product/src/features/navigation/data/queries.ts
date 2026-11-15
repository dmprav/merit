import { queryOptions } from "@tanstack/react-query";

import { available, privateKey } from "@merit/query";

import { grantWorkQueryKey } from "../../../shared/grant-work-query-key";
import { readNavigationPins } from "./server/navigation.functions";

export const navigationPinsOptions = (workspaceSlug?: string) =>
  queryOptions({
    queryKey: [
      ...(workspaceSlug ? grantWorkQueryKey(workspaceSlug) : privateKey),
      "navigation-pins",
    ],
    queryFn: async ({ signal }) => available(await readNavigationPins({ signal })),
  });
