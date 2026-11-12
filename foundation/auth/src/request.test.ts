import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { Identity } from "./index";
import { withActor } from "./request";

afterEach(() => vi.restoreAllMocks());

describe("authenticated request boundary", () => {
  it.each(["signed_out", "unavailable"] as const)(
    "does not call operations when identity is %s",
    async (status) => {
      const operation = vi.fn();

      expect(await withActor(async () => ({ status }), operation)).toEqual({ status });
      expect(operation).not.toHaveBeenCalled();
    },
  );

  it("resolves the actor once and preserves expected business outcomes", async () => {
    const actor = { userId: "recipient" };
    const identity = vi.fn(async (): Promise<Identity> => ({ status: "authenticated", actor }));
    const outcome = { status: "wrong_account" } as const;
    const operation = vi.fn(async () => outcome);

    expect(await withActor(identity, operation)).toBe(outcome);
    expect(identity).toHaveBeenCalledOnce();
    expect(operation).toHaveBeenCalledExactlyOnceWith(actor);
  });

  it.each(["identity", "operation"] as const)(
    "sanitizes unexpected %s failures",
    async (source) => {
      const error = new Error("private invitation token and provider response");
      const log = vi.spyOn(console, "error").mockImplementation(() => {});

      const identity = async (): Promise<Identity> => {
        if (source === "identity") {
          throw error;
        }

        return { status: "authenticated", actor: { userId: "recipient" } };
      };

      expect(
        await withActor(identity, async () => {
          throw error;
        }),
      ).toEqual({ status: "unavailable" });
      expect(log).toHaveBeenCalledExactlyOnceWith("Authenticated request failed.");
    },
  );
});
