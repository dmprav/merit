import type { Actor, Identity } from "./index";

/** Authenticate at the interface boundary and keep unexpected failures private. */
export const withActor = async <T>(
  currentIdentity: () => Promise<Identity>,
  operation: (actor: Actor) => Promise<T>,
): Promise<T | { status: "signed_out" | "unavailable" }> => {
  try {
    const identity = await currentIdentity();
    if (identity.status !== "authenticated") {
      return { status: identity.status };
    }
    return await operation(identity.actor);
  } catch {
    // Do not log invitation tokens, email content, or provider response bodies.
    console.error("Authenticated request failed.");
    return { status: "unavailable" };
  }
};
