import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";

import { teamFixture } from "../../tests/team.fixtures";
import { OrganizationMessagesProvider } from "../messages";
import { InvitationDirectory } from "./invitation-directory";

it.each([
  { delivery: "sent", expired: false, label: "Awaiting acceptance" },
  { delivery: "pending", expired: false, label: "Sending unconfirmed" },
  { delivery: "failed", expired: false, label: "Email sending failed" },
  { delivery: "sent", expired: true, label: "Expired" },
  { delivery: "pending", expired: true, label: "Expired" },
  { delivery: "failed", expired: true, label: "Expired" },
] as const)(
  "shows one actionable status for $delivery delivery, expired: $expired",
  ({ delivery, expired, label }) => {
    render(
      <InvitationDirectory
        team={{
          ...teamFixture,
          invitations: [
            {
              ...teamFixture.invitations[0]!,
              delivery,
              expiresAt: new Date(expired ? "2020-01-01" : "2099-01-01"),
            },
          ],
        }}
        isDisabled={false}
        onResend={vi.fn()}
        onRevoke={vi.fn()}
      />,
      { wrapper: OrganizationMessagesProvider },
    );
    const row = screen.getAllByRole("row")[1]!;
    const status = within(row).getAllByRole("cell")[3]!;
    expect(within(status).getByText(label, { exact: true })).toBeVisible();
    expect(
      within(status).getAllByText(
        /^(Awaiting acceptance|Sending unconfirmed|Email sending failed|Expired)$/,
      ),
    ).toHaveLength(1);
    expect(within(row).getByRole("button", { name: /Actions for invitation/ })).toBeEnabled();
  },
);
