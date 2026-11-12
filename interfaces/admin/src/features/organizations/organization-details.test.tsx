import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { createQueryClient } from "@merit/query";

import { AdminMessages } from "../../app/messages";
import type { Organization } from "./contracts";
import { AdminDrafts } from "./controllers/drafts";
import {
  inviteAdministrator,
  readOrganization,
  renameOrganization,
  revokeInvitation,
} from "./data/server/organizations.functions";
import { OrganizationDetails } from "./screens";
import { Wrapper, organization } from "./tests/setup";

vi.mock("@tanstack/react-router", () => import("./tests/router"));
vi.mock("./data/server/organizations.functions", () => ({
  listOrganizations: vi.fn(),
  createOrganization: vi.fn(),
  inviteAdministrator: vi.fn(),
  readOrganization: vi.fn(),
  renameOrganization: vi.fn(),
  revokeInvitation: vi.fn(),
}));

const details = <OrganizationDetails result={{ status: "ok", value: organization }} />;
describe("operator invitation work", () => {
  it("copies the permanent workspace address and announces success", async () => {
    const user = userEvent.setup();
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(details, { wrapper: Wrapper });
    await user.click(screen.getByRole("button", { name: "Copy address" }));

    expect(copy).toHaveBeenCalledExactlyOnceWith("http://localhost:3000/app/alder/rounds");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Workspace address copied."),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("recovers from clipboard failure without losing an unfinished name edit", async () => {
    const user = userEvent.setup();
    const copy = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)
      .mockRejectedValueOnce(new Error("Clipboard unavailable"));
    render(details, { wrapper: Wrapper });
    await user.click(screen.getByRole("button", { name: "Edit name" }));
    const name = screen.getByRole("textbox", { name: "Organization name" });
    await user.clear(name);
    await user.type(name, "Unfinished name");
    await user.click(screen.getByRole("button", { name: "Copy address" }));

    expect(screen.getByRole("alert")).toHaveTextContent("The address could not be copied.");
    expect(screen.getByText("/app/alder/rounds")).toBeVisible();
    expect(screen.getByRole("status")).not.toHaveTextContent("Workspace address copied.");
    expect(name).toHaveValue("Unfinished name");

    await user.click(screen.getByRole("button", { name: "Copy address" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Workspace address copied."),
    );
    expect(copy).toHaveBeenCalledTimes(2);
    expect(name).toHaveValue("Unfinished name");
    expect(renameOrganization).not.toHaveBeenCalled();
  });

  it("identifies the current owner without presenting an old invitation as ownership", () => {
    const owned = { ...organization, hasOwner: true, owner: { name: "Dana Reed" } };
    vi.mocked(readOrganization).mockResolvedValue({ status: "ok", value: owned });
    render(<OrganizationDetails result={{ status: "ok", value: owned }} />, { wrapper: Wrapper });

    expect(
      within(screen.getByRole("region", { name: "Owner" })).getByText("Dana Reed"),
    ).toBeVisible();
    expect(screen.getByText("Owner joined")).toBeVisible();
    expect(screen.queryByText("first@example.test")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resend invitation" })).not.toBeInTheDocument();
  });

  it("does not substitute the invitation recipient when the owner name is unavailable", () => {
    const owned = { ...organization, hasOwner: true, owner: { name: null } };
    vi.mocked(readOrganization).mockResolvedValue({ status: "ok", value: owned });
    render(<OrganizationDetails result={{ status: "ok", value: owned }} />, { wrapper: Wrapper });

    expect(screen.getByText("Owner name is not available.")).toBeVisible();
    expect(screen.queryByText("first@example.test")).not.toBeInTheDocument();
  });

  it("confirms a changed recipient before replacing the invitation and retains input after failure", async () => {
    const user = userEvent.setup();
    render(details, { wrapper: Wrapper });
    await user.click(screen.getByRole("button", { name: "Change recipient" }));
    const email = screen.getByRole("textbox", { name: "Owner email" });
    await user.clear(email);
    await user.type(email, "next@example.test");
    await user.click(screen.getByRole("button", { name: "Change recipient" }));
    const dialog = screen.getByRole("dialog", { name: "Change recipient" });

    expect(dialog).toHaveTextContent("next@example.test instead of first@example.test");
    expect(inviteAdministrator).not.toHaveBeenCalled();

    vi.mocked(inviteAdministrator).mockResolvedValueOnce({ status: "unavailable" });
    await user.click(within(dialog).getByRole("button", { name: "Change recipient and send" }));

    expect(within(dialog).getByRole("alert")).toHaveTextContent("unavailable");

    await user.click(within(dialog).getAllByRole("button", { name: "Cancel" }).at(-1)!);

    expect(email).toHaveValue("next@example.test");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Change recipient" })).toHaveFocus(),
    );
  });

  it.each(["Revoke invitation", "Change recipient"])(
    "keeps %s cancellable while a background refresh is pending",
    async (action) => {
      const user = userEvent.setup();
      const client = createQueryClient();
      render(
        <QueryClientProvider client={client}>
          <AdminMessages>
            <AdminDrafts>{details}</AdminDrafts>
          </AdminMessages>
        </QueryClientProvider>,
      );
      if (action === "Change recipient") {
        await user.click(screen.getByRole("button", { name: "Change recipient" }));
        const email = screen.getByRole("textbox", { name: "Owner email" });
        await user.clear(email);
        await user.type(email, "next@example.test");
      }
      await user.click(screen.getByRole("button", { name: action }));
      let finish!: (value: { status: "ok"; value: Organization }) => void;
      vi.mocked(readOrganization).mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      let refresh!: Promise<void>;
      act(() => {
        refresh = client.invalidateQueries();
      });

      await waitFor(() => expect(readOrganization).toHaveBeenCalledTimes(1));

      const dialog = screen.getByRole("dialog", { name: action });

      expect(
        within(dialog).getByRole("button", {
          name: action === "Revoke invitation" ? action : "Change recipient and send",
        }),
      ).not.toHaveAttribute("aria-disabled", "true");
      expect(within(dialog).getAllByRole("button", { name: "Cancel" }).at(-1)).toBeEnabled();

      await user.keyboard("{Escape}");

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(revokeInvitation).not.toHaveBeenCalled();
      expect(inviteAdministrator).not.toHaveBeenCalled();

      await act(async () => {
        finish({ status: "ok", value: organization });
        await refresh;
      });
    },
  );

  it.each([
    { hasOwner: false, focusRole: "button", focusName: "Resend invitation" },
    { hasOwner: true, focusRole: "region", focusName: "Owner" },
  ] as const)(
    "recovers a committed invitation after refresh failure and focuses $focusName",
    async ({ hasOwner, focusRole, focusName }) => {
      const user = userEvent.setup();
      render(details, { wrapper: Wrapper });
      vi.mocked(readOrganization).mockRejectedValueOnce(new Error("connection lost"));
      await user.click(screen.getByRole("button", { name: "Resend invitation" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Your change was saved");
      expect(screen.getByRole("button", { name: "Resend invitation" })).toBeDisabled();
      expect(screen.getByRole("heading", { name: "Alder Foundation" })).toBeVisible();
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Refresh status" })).toHaveFocus(),
      );

      vi.mocked(readOrganization).mockResolvedValue({
        status: "ok",
        value: hasOwner
          ? {
              ...organization,
              hasOwner: true,
              owner: { name: "Dana Reed" },
              invitation: { ...organization.invitation!, acceptedAt: new Date() },
            }
          : organization,
      });
      await user.click(screen.getByRole("button", { name: "Refresh status" }));

      await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
      await waitFor(() => expect(screen.getByRole(focusRole, { name: focusName })).toHaveFocus());
      expect(inviteAdministrator).toHaveBeenCalledTimes(1);
      expect(readOrganization).toHaveBeenCalledTimes(2);
    },
  );

  it("shows sender failure after a successful invitation mutation and leaves recovery available", async () => {
    const user = userEvent.setup();
    render(details, { wrapper: Wrapper });
    vi.mocked(readOrganization).mockResolvedValue({
      status: "ok",
      value: { ...organization, invitation: { ...organization.invitation!, delivery: "failed" } },
    });
    await user.click(screen.getByRole("button", { name: "Resend invitation" }));

    expect(
      await screen.findByText("Email could not be sent. Resend the invitation to try again."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Resend invitation" })).toBeEnabled();
    expect(screen.queryByText("Email accepted by sender")).not.toBeInTheDocument();
  });

  it("preserves focus in a name edit when a background refresh removes the invitation action", async () => {
    const user = userEvent.setup();
    const client = createQueryClient();
    vi.mocked(readOrganization).mockResolvedValueOnce({
      status: "ok",
      value: { ...organization, invitation: { ...organization.invitation!, id: "replacement" } },
    });
    render(
      <QueryClientProvider client={client}>
        <AdminMessages>
          <AdminDrafts>{details}</AdminDrafts>
        </AdminMessages>
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Resend invitation" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Invitation created."),
    );
    await user.click(screen.getByRole("button", { name: "Edit name" }));
    const name = screen.getByRole("textbox", { name: "Organization name" });

    expect(name).toHaveFocus();

    vi.mocked(readOrganization).mockResolvedValue({
      status: "ok",
      value: {
        ...organization,
        hasOwner: true,
        owner: { name: "Dana Reed" },
        invitation: { ...organization.invitation!, acceptedAt: new Date() },
      },
    });
    await act(async () => {
      await client.invalidateQueries();
    });

    expect(await screen.findByRole("region", { name: "Owner" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Resend invitation" })).not.toBeInTheDocument();
    expect(name).toHaveFocus();
    expect(renameOrganization).not.toHaveBeenCalled();
    client.clear();
  });

  it("keeps revocation pending until commit, then focuses the next invitation action", async () => {
    const user = userEvent.setup();
    let complete!: (value: { status: "ok"; value: null }) => void;
    vi.mocked(revokeInvitation).mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    vi.mocked(readOrganization).mockResolvedValue({
      status: "ok",
      value: {
        ...organization,
        invitation: { ...organization.invitation!, revokedAt: new Date() },
      },
    });
    render(details, { wrapper: Wrapper });
    await user.click(screen.getByRole("button", { name: "Revoke invitation" }));

    expect(revokeInvitation).not.toHaveBeenCalled();

    const dialog = screen.getByRole("dialog", { name: "Revoke invitation" });

    expect(dialog).toHaveAccessibleDescription(/first@example.test/);

    await user.click(within(dialog).getByRole("button", { name: "Revoke invitation" }));

    expect(screen.getByRole("button", { name: "Revoking invitation…" })).toHaveAttribute(
      "data-pending",
    );
    expect(screen.getByRole("dialog", { name: "Revoke invitation" })).toBeVisible();

    await act(async () => complete({ status: "ok", value: null }));

    expect(await screen.findByText("Needs an owner")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: "Invite owner" })).toHaveFocus());
    expect(revokeInvitation).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Revoke invitation" })).not.toBeInTheDocument();
  });

  it("keeps a failed revocation open and retries before returning focus to the next action", async () => {
    const user = userEvent.setup();
    render(details, { wrapper: Wrapper });
    await user.click(screen.getByRole("button", { name: "Revoke invitation" }));
    const dialog = screen.getByRole("dialog", { name: "Revoke invitation" });
    vi.mocked(revokeInvitation).mockResolvedValueOnce({ status: "unavailable" });
    await user.click(within(dialog).getByRole("button", { name: "Revoke invitation" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("unavailable");
    expect(dialog).toHaveAccessibleDescription(/first@example.test/);
    expect(within(dialog).getAllByRole("button", { name: "Cancel" }).at(-1)).toBeEnabled();

    vi.mocked(readOrganization).mockResolvedValue({
      status: "ok",
      value: {
        ...organization,
        invitation: { ...organization.invitation!, revokedAt: new Date() },
      },
    });
    await user.click(within(dialog).getByRole("button", { name: "Revoke invitation" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Needs an owner")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: "Invite owner" })).toHaveFocus());
    expect(revokeInvitation).toHaveBeenCalledTimes(2);
  });

  it("preserves independent name and recipient drafts through navigation within admin", async () => {
    const user = userEvent.setup();
    const view = render(details, { wrapper: Wrapper });
    await user.click(screen.getByRole("button", { name: "Edit name" }));
    await user.click(screen.getByRole("button", { name: "Change recipient" }));
    await user.clear(screen.getByRole("textbox", { name: "Organization name" }));
    await user.type(screen.getByRole("textbox", { name: "Organization name" }), "Edited name");
    await user.clear(screen.getByRole("textbox", { name: "Owner email" }));
    await user.type(screen.getByRole("textbox", { name: "Owner email" }), "draft@example.test");
    view.rerender(<p>Organizations list</p>);
    view.rerender(details);
    await user.click(screen.getByRole("button", { name: "Resume name" }));
    await user.click(screen.getByRole("button", { name: "Resume invitation" }));

    expect(screen.getByRole("textbox", { name: "Organization name" })).toHaveValue("Edited name");
    expect(screen.getByRole("textbox", { name: "Owner email" })).toHaveValue("draft@example.test");

    await user.click(screen.getByRole("button", { name: "Save name" }));

    expect(await screen.findByRole("heading", { name: "Edited name" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Owner email" })).toHaveValue("draft@example.test");
  });

  it("shows the new recipient after confirmation and clears the committed draft", async () => {
    const user = userEvent.setup();
    const view = render(details, { wrapper: Wrapper });
    await user.click(screen.getByRole("button", { name: "Change recipient" }));
    const email = screen.getByRole("textbox", { name: "Owner email" });
    await user.clear(email);
    await user.type(email, "next@example.test");
    await user.click(screen.getByRole("button", { name: "Change recipient" }));
    vi.mocked(readOrganization).mockResolvedValue({
      status: "ok",
      value: {
        ...organization,
        invitation: { ...organization.invitation!, email: "next@example.test" },
      },
    });
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Change recipient and send" }),
    );

    expect(await screen.findByText("next@example.test", { exact: true })).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(inviteAdministrator).toHaveBeenCalledTimes(1);

    view.rerender(<p>Organizations list</p>);
    view.rerender(details);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Change recipient" }));

    expect(screen.getByRole("textbox", { name: "Owner email" })).toHaveValue("next@example.test");
  });

  it("opens focused editors, discards canceled edits, and restores focus without mutating", async () => {
    const user = userEvent.setup();
    render(details, { wrapper: Wrapper });

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit name" }));
    const name = screen.getByRole("textbox", { name: "Organization name" });

    expect(name).toHaveFocus();

    await user.clear(name);
    await user.type(name, "Discard this name");
    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "Edit name" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Edit name" }));

    expect(screen.getByRole("textbox", { name: "Organization name" })).toHaveValue(
      organization.name,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Change recipient" }));
    const email = screen.getByRole("textbox", { name: "Owner email" });

    expect(email).toHaveFocus();

    await user.clear(email);
    await user.type(email, "discard@example.test");
    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(screen.getByRole("button", { name: "Resend invitation" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Resend invitation" }));

    expect(inviteAdministrator).toHaveBeenCalledWith({
      data: { organizationId: organization.id, email: "first@example.test" },
    });
    expect(renameOrganization).not.toHaveBeenCalled();
  });

  it("keeps a failed name edit open and returns to the summary after a successful retry", async () => {
    const user = userEvent.setup();
    render(details, { wrapper: Wrapper });
    await user.click(screen.getByRole("button", { name: "Edit name" }));
    const name = screen.getByRole("textbox", { name: "Organization name" });
    await user.clear(name);
    await user.type(name, "New name");
    vi.mocked(renameOrganization).mockResolvedValueOnce({ status: "unavailable" });
    await user.keyboard("{Enter}");

    expect(screen.getByRole("alert")).toHaveTextContent("unavailable");
    expect(name).toHaveValue("New name");

    await user.click(screen.getByRole("button", { name: "Save name" }));

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "New name" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit name" })).toHaveFocus();
  });

  it("clears a committed name draft after cache failure and retries only the read", async () => {
    const user = userEvent.setup();
    const client = createQueryClient();
    render(
      <QueryClientProvider client={client}>
        <AdminMessages>
          <AdminDrafts>{details}</AdminDrafts>
        </AdminMessages>
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Edit name" }));
    const name = screen.getByRole("textbox", { name: "Organization name" });
    await user.clear(name);
    await user.type(name, "Renamed foundation");
    vi.spyOn(client, "cancelQueries").mockRejectedValueOnce(new Error("Cache unavailable"));
    await user.click(screen.getByRole("button", { name: "Save name" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Your change was saved");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit name" })).toBeVisible();
    vi.mocked(readOrganization).mockResolvedValue({
      status: "ok",
      value: { ...organization, name: "Renamed foundation" },
    });
    await user.click(screen.getByRole("button", { name: "Refresh status" }));

    expect(await screen.findByRole("heading", { name: "Renamed foundation" })).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(renameOrganization).toHaveBeenCalledTimes(1);
    client.clear();
  });

  it("gates opening the workspace by membership and removes invitation mutations after joining", () => {
    const view = render(details, { wrapper: Wrapper });

    expect(screen.queryByRole("link", { name: "Open workspace" })).not.toBeInTheDocument();

    view.unmount();
    render(
      <OrganizationDetails
        result={{
          status: "ok",
          value: {
            ...organization,
            canOpenWorkspace: true,
            invitation: { ...organization.invitation!, acceptedAt: new Date() },
          },
        }}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByRole("link", { name: "Open workspace" })).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Owner email" })).not.toBeInTheDocument();
  });
});
