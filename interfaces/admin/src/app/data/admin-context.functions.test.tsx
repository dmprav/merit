import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { Identity } from "@merit/auth";

import type { AdminRequestContext } from "../context";
import { readAdminContext } from "./admin-context.functions";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ handler: (handler: unknown) => handler }),
}));
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: vi.fn() }));

const read = readAdminContext as unknown as (request: {
  context: AdminRequestContext;
}) => ReturnType<typeof readAdminContext>;
const actor = { userId: "operator" };

const context = () => ({
  currentIdentity: vi.fn(async (): Promise<Identity> => ({ status: "authenticated", actor })),
  organizations: {
    workspaces: vi.fn(),
    canAdminister: vi.fn(() => false),
  },
});

afterEach(() => vi.restoreAllMocks());

describe("administration context", () => {
  it.each([false, true])(
    "discovers workspaces and operator navigation (%s) for the signed-in person",
    async (canAdminister) => {
      const services = context();
      services.organizations.canAdminister.mockReturnValue(canAdminister);
      services.organizations.workspaces.mockResolvedValue({ status: "ok", value: [] });

      expect(await read({ context: services as unknown as AdminRequestContext })).toEqual({
        status: "ok",
        workspaces: [],
        canAdminister,
        draftScope: "operator",
      });
      expect(services.organizations.workspaces).toHaveBeenCalledExactlyOnceWith(actor);

      services.currentIdentity.mockResolvedValue({ status: "signed_out" });

      expect(await read({ context: services as unknown as AdminRequestContext })).toEqual({
        status: "signed_out",
      });
      expect(services.organizations.workspaces).toHaveBeenCalledOnce();
      expect(services.organizations.canAdminister).toHaveBeenCalledExactlyOnceWith(actor);
    },
  );

  it.each([false, true])(
    "retains verified operator status when workspace discovery fails (%s)",
    async (canAdminister) => {
      const services = context();
      services.organizations.canAdminister.mockReturnValue(canAdminister);
      services.organizations.workspaces.mockRejectedValue(
        new Error("private database information"),
      );
      const log = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(await read({ context: services as unknown as AdminRequestContext })).toEqual({
        status: "ok",
        workspaces: [],
        canAdminister,
        draftScope: "operator",
      });
      expect(log).toHaveBeenCalledExactlyOnceWith("Administration workspace discovery failed.");
    },
  );

  it("does not infer operator access when identity resolution fails", async () => {
    const services = context();
    services.currentIdentity.mockRejectedValue(new Error("private identity information"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await read({ context: services as unknown as AdminRequestContext })).toEqual({
      status: "unavailable",
    });
    expect(services.organizations.canAdminister).not.toHaveBeenCalled();
    expect(services.organizations.workspaces).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledExactlyOnceWith("Authenticated request failed.");
  });
});
