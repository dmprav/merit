import { auth } from "@clerk/tanstack-react-start/server";

/** Only call when account authentication is configured. Failures must not become guest access. */
export const currentAccount = async () => {
  const state = await auth({ acceptsToken: "session_token" });
  if (!state.userId) {
    return { status: "signed_out" } as const;
  }
  return { status: "authenticated", clerkUserId: state.userId } as const;
};
