import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vite-plus/test";

import { createOrganization, inviteAdministrator } from "./data/server/organizations.functions";
import { OrganizationDetails, OrganizationList } from "./screens";
import { Wrapper, organization } from "./tests/setup";

type Values = Record<string, unknown>;

type Snapshot = {
  drafts: Values;
  ready: boolean;
  status: "restoring" | "saved" | "unavailable";
  storageUnavailable: boolean;
};

type Store = {
  snapshot: Snapshot;
  listeners: Set<() => void>;
  update: (change: (values: Values) => Values) => void;
};

const recovery = vi.hoisted(() => ({ stores: new Map<string, Store>() }));

vi.mock("@tanstack/react-router", () => import("./tests/router"));
vi.mock("./data/server/organizations.functions", () => ({
  listOrganizations: vi.fn(),
  createOrganization: vi.fn(),
  inviteAdministrator: vi.fn(),
  readOrganization: vi.fn(),
  renameOrganization: vi.fn(),
  revokeInvitation: vi.fn(),
}));
vi.mock("@merit/drafts", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useDrafts: (_scope: string | undefined, kind: string) => {
      const store = recovery.stores.get(kind)!;
      const snapshot = useSyncExternalStore(
        (listener) => {
          store.listeners.add(listener);
          return () => store.listeners.delete(listener);
        },
        () => store.snapshot,
      );
      return { ...snapshot, update: store.update };
    },
  };
});

const finish = (kind: string, drafts: Values = {}, unavailable = false) => {
  const store = recovery.stores.get(kind)!;
  store.snapshot = {
    drafts,
    ready: true,
    status: unavailable ? "unavailable" : "saved",
    storageUnavailable: unavailable,
  };
  store.listeners.forEach((listener) => listener());
};

beforeEach(() => {
  recovery.stores.clear();
  for (const kind of ["admin-creation", "admin-edits"]) {
    const store: Store = {
      snapshot: { drafts: {}, ready: false, status: "restoring", storageUnavailable: false },
      listeners: new Set(),
      update: vi.fn((change: (values: Values) => Values) => {
        if (!store.snapshot.ready) {
          throw new Error("Wait for draft restoration before editing");
        }
        finish(kind, change(store.snapshot.drafts));
      }),
    };
    recovery.stores.set(kind, store);
  }
});

const list = <OrganizationList result={{ status: "ok", value: [] }} />;
const details = <OrganizationDetails result={{ status: "ok", value: organization }} />;
const creation = {
  requestId: "216abde3-6f9c-4e3c-a2ed-69a885d05ba0",
  name: "Recovered Foundation",
  slug: "recovered",
  email: "owner@example.test",
};

it("renders the list immediately and waits only for creation before restoring its retry identity", async () => {
  const user = userEvent.setup();
  vi.mocked(createOrganization).mockResolvedValue({ status: "unavailable" });
  render(list, { wrapper: Wrapper });
  expect(screen.getByRole("heading", { name: "Organizations" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Create organization" }));
  const dialog = screen.getByRole("dialog", { name: "Create organization" });
  expect(within(dialog).getByText("Preparing editor…")).toBeVisible();
  expect(within(dialog).getByRole("button", { name: "Close" })).toBeEnabled();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(recovery.stores.get("admin-creation")!.update).not.toHaveBeenCalled();

  await act(async () => finish("admin-creation", { new: creation }));
  expect(screen.getByRole("textbox", { name: "Organization name" })).toHaveValue(creation.name);
  expect(recovery.stores.get("admin-edits")!.snapshot.ready).toBe(false);
  await user.click(screen.getByRole("button", { name: "Create organization" }));
  expect(createOrganization).toHaveBeenCalledWith({ data: creation });
});

it("does not reopen creation after closing its wait", async () => {
  const user = userEvent.setup();
  render(list, { wrapper: Wrapper });
  await user.click(screen.getByRole("button", { name: "Create organization" }));
  await user.click(screen.getByRole("button", { name: "Close" }));
  await act(async () => finish("admin-creation", { new: creation }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(recovery.stores.get("admin-creation")!.update).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Resume organization" }));
  expect(screen.getByRole("textbox", { name: "Organization name" })).toHaveValue(creation.name);
});

it.each([
  { action: "Edit name", field: "Organization name", value: "Recovered name" },
  { action: "Change recipient", field: "Owner email", value: "recovered@example.test" },
])(
  "keeps details usable while $action waits and recovers without waiting for creation",
  async ({ action, field, value }) => {
    const user = userEvent.setup();
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(details, { wrapper: Wrapper });
    expect(screen.getByRole("heading", { name: organization.name })).toBeVisible();
    expect(screen.getByRole("button", { name: "Resend invitation" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Revoke invitation" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Copy address" }));
    expect(copy).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: action }));
    expect(screen.getByRole("heading", { name: action })).toBeVisible();
    expect(screen.getByText("Preparing editor…")).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(recovery.stores.get("admin-edits")!.update).not.toHaveBeenCalled();

    await act(async () =>
      finish("admin-edits", {
        "org-1": { name: "Recovered name", email: "recovered@example.test" },
      }),
    );
    expect(screen.getByRole("textbox", { name: field })).toHaveValue(value);
    expect(recovery.stores.get("admin-creation")!.snapshot.ready).toBe(false);
    expect(inviteAdministrator).not.toHaveBeenCalled();
  },
);

it.each(["Edit name", "Change recipient"])(
  "closes %s during recovery without clearing or reopening it",
  async (action) => {
    const user = userEvent.setup();
    render(details, { wrapper: Wrapper });
    await user.click(screen.getByRole("button", { name: action }));
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await user.keyboard("{Escape}");
    await act(async () =>
      finish("admin-edits", {
        "org-1": { name: "Recovered name", email: "recovered@example.test" },
      }),
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Preparing editor…")).not.toBeInTheDocument();
    expect(recovery.stores.get("admin-edits")!.update).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Resume name" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Resume invitation" })).toBeVisible();
  },
);

it("opens memory-only creation with the existing warning after restoration fails", async () => {
  const user = userEvent.setup();
  render(list, { wrapper: Wrapper });
  await user.click(screen.getByRole("button", { name: "Create organization" }));
  await act(async () => finish("admin-creation", {}, true));
  expect(screen.getByText(/Draft recovery is unavailable in this browser/)).toBeInTheDocument();
  await user.type(screen.getByRole("textbox", { name: "Organization name" }), "Memory draft");
  expect(recovery.stores.get("admin-creation")!.snapshot.drafts.new).toMatchObject({
    name: "Memory draft",
  });
});
