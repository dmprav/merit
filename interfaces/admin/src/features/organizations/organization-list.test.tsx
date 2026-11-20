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

const summary = (id: string, name: string) => ({
  ...organization,
  id,
  name,
  slug: id,
  invitation: { ...organization.invitation!, organizationId: id },
});

const list = (
  <OrganizationList
    result={{
      status: "ok",
      value: [summary("birch", "Birch Trust"), summary("alder", "Alder Foundation")],
    }}
  />
);

const firstRow = () => within(screen.getByRole("table")).getAllByRole("row")[1];

describe("organization list", () => {
  it("links every organization to its details", () => {
    render(list, { wrapper: Wrapper });

    expect(screen.getByRole("link", { name: "Birch Trust" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Alder Foundation" })).toBeVisible();
  });

  it("retains the chosen sort order after leaving and returning to the list", async () => {
    const user = userEvent.setup();
    const view = render(list, { wrapper: Wrapper });

    expect(firstRow()).toHaveTextContent("Birch Trust");

    await user.click(screen.getByRole("button", { name: "Organization" }));
    expect(firstRow()).toHaveTextContent("Alder Foundation");

    view.rerender(<p>Details</p>);
    view.rerender(list);

    expect(firstRow()).toHaveTextContent("Alder Foundation");
  });
});
