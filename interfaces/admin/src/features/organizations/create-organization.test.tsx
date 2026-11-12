import { render, screen, within, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { assert, describe, expect, it, vi } from "vite-plus/test";

import { createOrganization } from "./data/server/organizations.functions";
import { OrganizationList } from "./screens";
import { navigate } from "./tests/router";
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

const organizationList = (
  <OrganizationList
    result={{
      status: "ok",
      value: [
        {
          ...organization,
          invitation: { ...organization.invitation!, organizationId: organization.id },
        },
      ],
    }}
  />
);

describe("organization creation", () => {
  it("closes without losing the draft or list sort, restores focus, and discards explicitly", async () => {
    const user = userEvent.setup();
    render(organizationList, { wrapper: Wrapper });
    await user.click(screen.getByRole("button", { name: "Organization" }));
    await user.click(screen.getByRole("button", { name: "Create organization" }));

    expect(screen.getByRole("textbox", { name: "Organization name" })).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Create organization" })).toHaveFocus(),
    );
    await user.click(screen.getByRole("button", { name: "Create organization" }));
    await user.type(screen.getByRole("textbox", { name: "Organization name" }), "Alder");
    await user.tab();
    await user.clear(screen.getByRole("textbox", { name: "Workspace address" }));
    await user.type(screen.getByRole("textbox", { name: "Workspace address" }), "chosen-address");
    await user.click(within(screen.getByRole("form")).getByRole("button", { name: "Close" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Resume organization" })).toHaveFocus(),
    );
    expect(screen.getByRole("columnheader", { name: /Organization/ })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    expect(navigate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Resume organization" }));
    await user.type(screen.getByRole("textbox", { name: "Organization name" }), " Foundation");
    await user.tab();
    expect(screen.getByRole("textbox", { name: "Workspace address" })).toHaveValue(
      "chosen-address",
    );
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Create organization" })).toHaveFocus(),
    );
    await user.click(screen.getByRole("button", { name: "Create organization" }));
    expect(screen.getByRole("textbox", { name: "Organization name" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Workspace address" })).toHaveValue("");
  });

  it("prevents dismissal and duplicate submission while creating, then permits retry after failure", async () => {
    const user = userEvent.setup();
    let complete!: (value: Awaited<ReturnType<typeof createOrganization>>) => void;
    vi.mocked(createOrganization).mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    render(organizationList, { wrapper: Wrapper });
    await user.click(screen.getByRole("button", { name: "Create organization" }));
    await user.type(screen.getByRole("textbox", { name: "Organization name" }), "Alder");
    await user.type(screen.getByRole("textbox", { name: "Owner email" }), "first@example.test");
    await user.click(screen.getByRole("button", { name: "Create organization" }));

    const dialog = screen.getByRole("dialog", { name: "Create organization" });
    expect(within(dialog).getByRole("button", { name: "Creating…" })).toBeDisabled();
    for (const close of within(dialog).getAllByRole("button", { name: "Close" })) {
      expect(close).toBeDisabled();
    }
    await user.keyboard("{Escape}{Control>}{Enter}{/Control}");
    expect(dialog).toBeVisible();
    expect(createOrganization).toHaveBeenCalledOnce();

    await act(async () => complete({ status: "unavailable" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("unavailable");
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Resume organization" })).toHaveFocus(),
    );
  });

  it.each([false, true])(
    "clears committed drafts and offers continuation if navigation fails (%s)",
    async (navigationFails) => {
      const user = userEvent.setup();
      vi.mocked(createOrganization).mockResolvedValue({
        status: "ok",
        value: { organizationId: "org-new" },
      });
      if (navigationFails) {
        navigate.mockRejectedValueOnce(new Error("Navigation failed"));
      }
      render(organizationList, { wrapper: Wrapper });
      await user.click(screen.getByRole("button", { name: "Create organization" }));
      await user.type(screen.getByRole("textbox", { name: "Organization name" }), "Alder");
      await user.type(screen.getByRole("textbox", { name: "Owner email" }), "first@example.test");
      await user.click(screen.getByRole("button", { name: "Create organization" }));

      await waitFor(() =>
        expect(navigate).toHaveBeenCalledWith({
          to: "/admin/organizations/$organizationId",
          params: { organizationId: "org-new" },
        }),
      );
      expect(screen.queryByRole("form")).not.toBeInTheDocument();
      if (navigationFails) {
        const continuation = await screen.findByRole("link", { name: "Continue to organization" });
        await user.keyboard("{Control>}");
        await user.click(continuation);
        await user.keyboard("{/Control}");
        expect(screen.getByRole("dialog")).toBeVisible();
        await user.click(continuation);
      }
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Create organization" })).toHaveFocus(),
      );
      await user.click(screen.getByRole("button", { name: "Create organization" }));
      expect(screen.getByRole("textbox", { name: "Organization name" })).toHaveValue("");
      expect(createOrganization).toHaveBeenCalledOnce();
    },
  );

  it("validates before submission, keeps the same request identity when retrying, and preserves the draft", async () => {
    const user = userEvent.setup();
    const view = render(organizationList, { wrapper: Wrapper });
    await user.click(screen.getByRole("button", { name: "Create organization" }));
    await user.click(screen.getByRole("button", { name: "Create organization" }));

    expect(createOrganization).not.toHaveBeenCalled();

    await user.type(screen.getByRole("textbox", { name: "Organization name" }), "Alder");
    await user.tab();

    expect(screen.getByRole("textbox", { name: "Workspace address" })).toHaveValue("alder");

    await user.type(screen.getByRole("textbox", { name: "Owner email" }), "first@example.test");
    vi.mocked(createOrganization).mockResolvedValue({ status: "unavailable" });
    await user.click(screen.getByRole("button", { name: "Create organization" }));
    view.rerender(<p>Organizations list</p>);
    view.rerender(organizationList);
    await user.click(screen.getByRole("button", { name: /^(Create|Resume) organization$/ }));

    expect(screen.getByRole("textbox", { name: "Organization name" })).toHaveValue("Alder");

    await user.type(screen.getByRole("textbox", { name: "Organization name" }), " Foundation");
    await user.tab();

    expect(screen.getByRole("textbox", { name: "Workspace address" })).toHaveValue(
      "alder-foundation",
    );

    await user.click(screen.getByRole("button", { name: "Create organization" }));

    expect(
      (
        vi.mocked(createOrganization).mock.calls[1] ??
        assert.fail("Expected vi.mocked(createOrganization).mock.calls[1]")
      )[0].data.requestId,
    ).toBe(
      (
        vi.mocked(createOrganization).mock.calls[0] ??
        assert.fail("Expected vi.mocked(createOrganization).mock.calls[0]")
      )[0].data.requestId,
    );

    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    view.rerender(<p>Organizations list</p>);
    view.rerender(organizationList);
    await user.click(screen.getByRole("button", { name: /^(Create|Resume) organization$/ }));

    expect(screen.getByRole("textbox", { name: "Organization name" })).toHaveValue("");
  });
});

it("restores a closed organization draft after reload and removes it only on discard", async () => {
  sessionStorage.clear();
  const user = userEvent.setup();

  const show = () => render(<Wrapper scope="operator-recovery">{organizationList}</Wrapper>);

  const first = show();
  await user.click(await screen.findByRole("button", { name: "Create organization" }));
  await user.type(
    await screen.findByRole("textbox", { name: "Organization name" }),
    "Draft foundation",
  );
  await user.type(screen.getByRole("textbox", { name: "Owner email" }), "unfinished@");
  await user.click(within(screen.getByRole("form")).getByRole("button", { name: "Close" }));

  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Resume organization" })).toHaveFocus(),
  );
  expect(navigate).not.toHaveBeenCalled();

  first.unmount();
  const restored = show();
  await user.click(await screen.findByRole("button", { name: "Resume organization" }));

  expect(await screen.findByRole("textbox", { name: "Organization name" })).toHaveValue(
    "Draft foundation",
  );
  expect(screen.getByRole("textbox", { name: "Owner email" })).toHaveValue("unfinished@");

  await user.click(screen.getByRole("button", { name: "Discard changes" }));
  restored.unmount();
  show();
  await user.click(await screen.findByRole("button", { name: "Create organization" }));

  expect(await screen.findByRole("textbox", { name: "Organization name" })).toHaveValue("");
  expect(createOrganization).not.toHaveBeenCalled();

  sessionStorage.clear();
});
