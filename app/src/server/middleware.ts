import { clerkMiddleware } from "@clerk/tanstack-react-start/server";

// Request authentication also supports server functions; access is checked by operations.
export const webRequestMiddleware = (appOrigin: () => string) =>
  !import.meta.env.MERIT_LOCAL_WORKSPACE && import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
    ? [clerkMiddleware(() => ({ authorizedParties: [appOrigin()] }))]
    : [];
