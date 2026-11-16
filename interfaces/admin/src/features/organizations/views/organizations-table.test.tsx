import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vite-plus/test";

import { formatTimestamp } from "@merit/i18n/format";

import { AdminMessages } from "../../../app/messages";
import { invitation } from "./invitation.fixtures";
import { OrganizationsTable } from "./organizations-table";

it("shows one actionable owner state and keeps expiry in its own local-time column", () => {
  render(
    <AdminMessages>
      <OrganizationsTable
        organizations={[
          {
            id: "failed",
            name: "Failed delivery",
            slug: "failed",
            hasOwner: false,
            invitation: { ...invitation, organizationId: "failed", delivery: "failed" },
          },
          {
            id: "expired",
            name: "Expired invitation",
            slug: "expired",
            hasOwner: false,
            invitation: {
              ...invitation,
              organizationId: "expired",
              delivery: "failed",
              expiresAt: new Date("2020-01-01"),
            },
          },
          {
            id: "joined",
            name: "Existing owner",
            slug: "joined",
            hasOwner: true,
            invitation: { ...invitation, organizationId: "joined", delivery: "failed" },
          },
        ]}
        view={{ sorting: null }}
        onViewChange={() => {}}
        renderLink={(org) => <a href={`/${org.slug}`}>{org.name}</a>}
      />
    </AdminMessages>,
  );
  const failed = screen.getByRole("row", { name: /Failed delivery/ });
  expect(within(failed).getByText("Email could not be sent")).toBeVisible();
  expect(within(failed).queryByText("Owner invitation pending")).not.toBeInTheDocument();
  expect(
    within(failed).getByText(formatTimestamp(invitation.expiresAt.toISOString(), "en-GB")),
  ).toHaveAttribute("datetime", invitation.expiresAt.toISOString());
  const expired = screen.getByRole("row", { name: /Expired invitation/ });
  expect(within(expired).getByText("Invitation expired")).toBeVisible();
  expect(within(expired).queryByText("Email could not be sent")).not.toBeInTheDocument();
  const joined = screen.getByRole("row", { name: /Existing owner/ });
  expect(within(joined).getByText("Owner joined")).toBeVisible();
  expect(within(joined).queryByText("Email could not be sent")).not.toBeInTheDocument();
  expect(joined.querySelector("time")).toBeNull();
});
