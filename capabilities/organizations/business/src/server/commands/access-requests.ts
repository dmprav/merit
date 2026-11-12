import type { Database } from "@merit/db";

import { accessRequestInput } from "../../api/commands";
import { recordAccessRequest } from "../persistence/commands/access-requests";

export const requestWorkspaceAccess = async (
  db: Database,
  input: { email: string },
  networkAddress: string,
) => {
  const parsed = accessRequestInput.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid_input" } as const;
  }

  const source = `${Math.floor(Date.now() / 3600000)}:${networkAddress}`;
  const bucket = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source))),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");

  return db.transaction((tx) => recordAccessRequest(tx, parsed.data.email, bucket));
};
