import { privateKey } from "@merit/query";

// Contact edits update linked applications; intake edits update the contact directory.
export const grantWorkQueryKey = (workspaceSlug: string) =>
  [...privateKey, "workspace", workspaceSlug, "grant-work"] as const;
