import { createClerkClient } from "@clerk/backend";

const readProfile = async (secretKey: string, clerkUserId: string) => {
  const user = await createClerkClient({ secretKey }).users.getUser(clerkUserId);
  return {
    verifiedEmails:
      user.banned || user.locked
        ? []
        : user.emailAddresses
            .filter((email) => email.verification?.status === "verified")
            .map((email) => email.emailAddress.toLowerCase()),
    displayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || null,
  };
};

/** Create once per request: concurrent projections share a profile, never another request's cache. */
export const createClerkProfileReader = (secretKey: string) => {
  const profiles = new Map<string, ReturnType<typeof readProfile>>();
  return (clerkUserId: string) => {
    let profile = profiles.get(clerkUserId);
    if (!profile) {
      profile = readProfile(secretKey, clerkUserId);
      profiles.set(clerkUserId, profile);
    }
    return profile;
  };
};
