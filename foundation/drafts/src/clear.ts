import { sessions } from "./sessions";
import { clearStoredDrafts } from "./storage";

/** Await before navigating after sign-out/account changes or demo reset. */
export const clearDrafts = async (scope?: string): Promise<boolean> => {
  await sessions.invalidate(scope);
  try {
    await clearStoredDrafts(scope);
    return true;
  } catch {
    return false;
  }
};
