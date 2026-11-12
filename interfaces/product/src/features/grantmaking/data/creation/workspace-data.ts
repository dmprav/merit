import type { QueryClient } from "@tanstack/react-query";

import type { CreationTarget } from "@merit/grantmaking-web/contracts/creation";
import { createCreationData } from "@merit/grantmaking-web/data/creation";

import { grantWorkQueryKey } from "../../../../shared/grant-work-query-key";
import { creationLocation } from "../../contracts/creation-location";
import { createApplication, createRound } from "../server/creation/creation.functions";

export const workspaceCreationData = (
  client: QueryClient,
  target: CreationTarget,
  navigate: (location: ReturnType<typeof creationLocation>) => Promise<void>,
) =>
  createCreationData(client, target, {
    grantWorkScope: grantWorkQueryKey(target.workspaceSlug),
    createRound: (data) => createRound({ data }),
    createApplication: (data) => createApplication({ data }),
    open: (record) => navigate(creationLocation(target, record)),
  });
