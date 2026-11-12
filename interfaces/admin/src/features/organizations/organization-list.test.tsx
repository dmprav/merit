import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { OrganizationList } from "./screens";
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

describe("organization triage", () => {
  it("shows every organization and retains sort order across navigation", async () => {
    const user = userEvent.setup();
    const organizations = [
      {
        ...organization,
        id: "1",
        name: "Waiting",
        invitation: { ...organization.invitation!, organizationId: "1" },
      },
      {
        ...organization,
        id: "2",
        name: "Failed",
        invitation: {
          ...organization.invitation!,
          organizationId: "2",
          delivery: "failed" as const,
        },
      },
      {
        ...organization,
        id: "3",
        name: "Expired",
        invitation: {
          ...organization.invitation!,
          organizationId: "3",
          expiresAt: new Date("2020-01-01"),
        },
      },
      {
        ...organization,
        id: "4",
        name: "Revoked",
        invitation: {
          ...organization.invitation!,
          organizationId: "4",
          revokedAt: new Date(),
          delivery: "failed" as const,
        },
      },
      {
        ...organization,
        id: "5",
        name: "Joined",
        hasOwner: true,
        invitation: {
          ...organization.invitation!,
          organizationId: "5",
          delivery: "failed" as const,
        },
      },
      {
        ...organization,
        id: "6",
        name: "Unconfirmed",
        invitation: {
          ...organization.invitation!,
          organizationId: "6",
          delivery: "pending" as const,
        },
      },
    ];
    const list = <OrganizationList result={{ status: "ok", value: organizations }} />;
    const view = render(list, { wrapper: Wrapper });

    expect(screen.getByRole("link", { name: "Waiting" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Joined" })).toBeVisible();
    expect(screen.getAllByText("Email could not be sent")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Organization" }));
    const rows = within(screen.getByRole("table")).getAllByRole("row");

    expect(rows[1]).toHaveTextContent("Expired");

    view.rerender(<p>Details</p>);
    view.rerender(list);

    expect(within(screen.getByRole("table")).getAllByRole("row")[1]).toHaveTextContent("Expired");
    expect(screen.getByRole("link", { name: "Waiting" })).toBeVisible();
  });
});
