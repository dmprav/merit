import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { Identity } from "@merit/auth";

import type { AdminRequestContext } from "../../../../app/context";
import { listOrganizations, readOrganization } from "./organizations.functions";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      validator: () => builder,
      handler: (handler: unknown) => handler,
    };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: vi.fn() }));

// Invoke handlers directly while keeping the production server-function transport out of the test.
const list = listOrganizations as unknown as (request: {
  context: AdminRequestContext;
}) => ReturnType<typeof listOrganizations>;
const read = readOrganization as unknown as (request: {
  context: AdminRequestContext;
  data: { organizationId: string };
}) => ReturnType<typeof readOrganization>;
const actor = { userId: "operator" };

const context = () => ({
  currentIdentity: vi.fn(async (): Promise<Identity> => ({ status: "authenticated", actor })),
  organizations: {
    list: vi.fn(),
    read: vi.fn(),
    workspaces: vi.fn(),
    canAdminister: vi.fn(() => false),
  },
});

afterEach(() => vi.restoreAllMocks());

describe("organization request adapters", () => {
  it("does not call the capability for a signed-out request", async () => {
    const services = context();
    services.currentIdentity.mockResolvedValue({ status: "signed_out" });

    expect(await list({ context: services as unknown as AdminRequestContext })).toEqual({
      status: "signed_out",
    });
    expect(services.organizations.list).not.toHaveBeenCalled();
  });

  it("resolves one actor for both detail and workspace discovery", async () => {
    const services = context();
    services.organizations.read.mockResolvedValue({ status: "ok", value: { id: "alder" } });
    services.organizations.workspaces.mockResolvedValue({ status: "ok", value: [{ id: "alder" }] });

    expect(
      await read({
        context: services as unknown as AdminRequestContext,
        data: { organizationId: "alder" },
      }),
    ).toEqual({
      status: "ok",
      value: { id: "alder", canOpenWorkspace: true },
    });
    expect(services.currentIdentity).toHaveBeenCalledOnce();
    expect(services.organizations.read).toHaveBeenCalledExactlyOnceWith(actor, {
      organizationId: "alder",
    });
    expect(services.organizations.workspaces).toHaveBeenCalledExactlyOnceWith(actor);
  });

  it("keeps organization details available if workspace discovery fails", async () => {
    const services = context();
    services.organizations.read.mockResolvedValue({ status: "ok", value: { id: "alder" } });
    services.organizations.workspaces.mockRejectedValue(new Error("private database information"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(
      await read({
        context: services as unknown as AdminRequestContext,
        data: { organizationId: "alder" },
      }),
    ).toEqual({ status: "ok", value: { id: "alder", canOpenWorkspace: false } });
    expect(services.currentIdentity).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledExactlyOnceWith("Organization workspace discovery failed.");
  });

  it("returns a safe unavailable response when the capability throws", async () => {
    const services = context();
    services.organizations.list.mockRejectedValue(new Error("private database information"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await list({ context: services as unknown as AdminRequestContext })).toEqual({
      status: "unavailable",
    });
    expect(log).toHaveBeenCalledExactlyOnceWith("Authenticated request failed.");
  });
});
