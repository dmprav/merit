import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { webRequestMiddleware } from "./middleware";

const { clerkMiddleware } = vi.hoisted(() => ({
  clerkMiddleware: vi.fn((options: () => { authorizedParties: string[] }) => ({ options })),
}));
vi.mock("@clerk/tanstack-react-start/server", () => ({ clerkMiddleware }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("web authentication configuration", () => {
  it("does not start Clerk in explicit local workspace mode even with keys present", () => {
    vi.stubEnv("MERIT_LOCAL_WORKSPACE", "true");
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example");

    expect(webRequestMiddleware(() => "http://localhost:3000")).toEqual([]);
    expect(clerkMiddleware).not.toHaveBeenCalled();
  });

  it("keeps the public demo independent of server configuration when sign-in is disabled", () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "");
    const appOrigin = vi.fn(() => "https://merit.example");

    expect(webRequestMiddleware(appOrigin)).toEqual([]);
    expect(appOrigin).not.toHaveBeenCalled();
    expect(clerkMiddleware).not.toHaveBeenCalled();
  });

  it("uses the host-provided origin when authenticating a request", () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example");
    const appOrigin = vi.fn(() => "https://merit.example");

    expect(webRequestMiddleware(appOrigin)).toHaveLength(1);
    expect(appOrigin).not.toHaveBeenCalled();

    const options = clerkMiddleware.mock.calls[0]![0];

    expect(options()).toEqual({ authorizedParties: ["https://merit.example"] });
    expect(appOrigin).toHaveBeenCalledOnce();
  });
});
