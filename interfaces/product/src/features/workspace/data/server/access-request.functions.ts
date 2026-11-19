import { createServerFn } from "@tanstack/react-start";

import { accessRequestInput } from "@merit/organizations/api";

export const requestAccess = createServerFn({ method: "POST" })
  .validator(accessRequestInput)
  .handler(async ({ context, data }) => {
    try {
      return await context.organizations.requestAccess(data);
    } catch {
      console.error("Access request could not be saved.");
      return { status: "unavailable" } as const;
    }
  });
