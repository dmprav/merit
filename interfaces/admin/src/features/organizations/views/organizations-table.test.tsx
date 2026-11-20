import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vite-plus/test";

import { formatTimestamp } from "@merit/i18n/format";
import type { OrganizationSummary } from "@merit/organizations/api";

import { AdminMessages } from "../../../app/messages";
import { invitation } from "./invitation.fixtures";
import { OrganizationsTable } from "./organizations-table";

const expired = new Date("2020-01-01T00:00:00Z");
const ownerStates = [
  "Owner invitation pending",
  "Email could not be sent",
  "Email sending unconfirmed",
  "Invitation expired",
  "Needs an owner",
  "Owner joined",
];

const pending: NonNullable<OrganizationSummary["invitation"]> = {
  ...invitation,
  organizationId: "alder",
};

const showRow = (hasOwner: boolean, ownerInvitation: OrganizationSummary["invitation"]) => {
  render(
    <AdminMessages>
      <OrganizationsTable
        organizations={[
          {
            id: "alder",
            name: "Alder Foundation",
            slug: "alder",
            hasOwner,
            invitation: ownerInvitation,
          },
        ]}
        view={{ sorting: null }}
        onViewChange={() => {}}
        renderLink={(org) => <a href={`/${org.slug}`}>{org.name}</a>}
      />
    </AdminMessages>,
  );

  return screen.getByRole("row", { name: /Alder Foundation/ });
};

it.each([
  ["a pending invitation", false, pending, "Owner invitation pending"],
  [
    "a pending invitation whose email failed",
    false,
    { ...pending, delivery: "failed" },
    "Email could not be sent",
  ],
  [
    "a pending invitation with unconfirmed sending",
    false,
    { ...pending, delivery: "pending" },
    "Email sending unconfirmed",
  ],
  [
    "an expired invitation whose email failed",
    false,
    { ...pending, delivery: "failed", expiresAt: expired },
    "Invitation expired",
  ],
  ["no current invitation", false, null, "Needs an owner"],
  [
    "an existing owner with an old failed invitation",
    true,
    { ...pending, delivery: "failed" },
    "Owner joined",
  ],
] as const)("shows one owner state for %s", (_case, hasOwner, ownerInvitation, state) => {
  const row = showRow(hasOwner, ownerInvitation);

  expect(ownerStates.filter((label) => within(row).queryByText(label))).toEqual([state]);
});

it.each([
  ["pending", pending],
  ["expired", { ...pending, expiresAt: expired }],
] as const)("shows a %s invitation's expiry as a local timestamp", (_state, ownerInvitation) => {
  const row = showRow(false, ownerInvitation);
  const expiresAt = ownerInvitation.expiresAt.toISOString();

  expect(within(row).getByText(formatTimestamp(expiresAt, "en-GB"))).toHaveAttribute(
    "datetime",
    expiresAt,
  );
});

it.each([
  ["a joined owner", true, pending],
  ["no current invitation", false, null],
] as const)("omits expiry for %s", (_case, hasOwner, ownerInvitation) => {
  const row = showRow(hasOwner, ownerInvitation);

  expect(row.querySelector("time")).toBeNull();
});
