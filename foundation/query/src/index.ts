import { QueryClient } from "@tanstack/react-query";

/** Create per SSR request, and retain for the lifetime of the browser router. */
export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0,
        gcTime: 5 * 60 * 1000,
        // Loaders check current access on navigation; mounting their observers must not repeat it.
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        // Offline reads reach recovery instead of waiting indefinitely for connectivity.
        networkMode: "always",
        refetchOnReconnect: true,
        retry: false,
      },
      // A disconnected write fails visibly instead of being replayed after reconnection.
      mutations: { retry: false, networkMode: "always" },
    },
  });

/** Transport/service failures retain the last read; denied access is a renderable result. */
export const available = <T extends { status: string }>(result: T): T => {
  if (result.status === "unavailable") {
    throw new Error("Service unavailable");
  }
  return result;
};

// Private entries belong to one browser account session. Account changes clear the client.
export const privateKey = ["private"] as const;
