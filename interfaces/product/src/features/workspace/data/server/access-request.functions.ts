import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

import { accessRequestInput } from "@merit/organizations/api";

export const requestAccess = createServerFn({ method: "POST" })
  .validator(accessRequestInput)
  .handler(async ({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");

    try {
      return await context.organizations.requestAccess(data);
    } catch {
      console.error("Access request could not be saved.");
      return { status: "unavailable" } as const;
    }
  });
