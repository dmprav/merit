import type { CreatedRecord, CreationTarget } from "@merit/grantmaking-web/contracts/creation";

import { resourceRef } from "./resource-url";

export const creationLocation = (target: CreationTarget, record: CreatedRecord) =>
  target.kind === "round"
    ? {
        to: "/app/$workspaceSlug/rounds/$roundRef" as const,
        params: {
          workspaceSlug: target.workspaceSlug,
          roundRef: resourceRef(record.title, record.publicId),
        },
      }
    : {
        to: "/app/$workspaceSlug/applications/$applicationRef" as const,
        params: {
          workspaceSlug: target.workspaceSlug,
          applicationRef: resourceRef(record.title, record.publicId),
        },
      };
