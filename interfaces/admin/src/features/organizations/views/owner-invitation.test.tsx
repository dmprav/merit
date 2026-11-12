import { render, screen } from "@testing-library/react";
import { expect, it } from "vite-plus/test";

import { AdminMessages } from "../../../app/messages";
import { invitation } from "./invitation.fixtures";
import { InvitationSummary } from "./owner-invitation";

const show = (props: Parameters<typeof InvitationSummary>[0]) =>
  render(
    <AdminMessages>
      <InvitationSummary {...props} />
    </AdminMessages>,
  );

const terms = () => screen.queryAllByRole("term").map((term) => term.textContent);

it("shows the recipient, sending result, and expiry while an owner invitation is pending", () => {
  show({ invitation });

  expect(screen.getByText("Owner invitation pending")).toBeVisible();
  expect(terms()).toEqual(["Recipient", "Invitation email", "Expires"]);
  expect(screen.getAllByRole("definition").map((value) => value.textContent)).toEqual([
    invitation.email,
    "Email accepted by sender",
    "8 Nov 2099, 12:00 UTC",
  ]);
});

it.each([
  [
    "failed",
    "Email could not be sent",
    "Email could not be sent. Resend the invitation to try again.",
  ],
  [
    "pending",
    "Email sending unconfirmed",
    "Email sending is not confirmed. You can resend the invitation.",
  ],
] as const)("explains %s sending and keeps the expiry", (delivery, status, help) => {
  show({ invitation: { ...invitation, delivery } });

  expect(screen.getByText("Owner invitation pending")).toBeVisible();
  expect(screen.getByText(status, { exact: true })).toBeVisible();
  expect(screen.getByText(help)).toBeVisible();
  expect(screen.getByText("8 Nov 2099, 12:00 UTC")).toBeVisible();
});

it("asks for a new invitation after expiry, including when sending also failed", () => {
  const { rerender } = show({
    invitation: { ...invitation, expiresAt: new Date("2020-01-01") },
  });

  expect(screen.getByText("Invitation expired")).toBeVisible();
  expect(screen.getByText("1 Jan 2020, 00:00 UTC")).toBeVisible();
  expect(
    screen.getByText(
      "This invitation can no longer be accepted. Send a new invitation to continue onboarding.",
    ),
  ).toBeVisible();

  rerender(
    <AdminMessages>
      <InvitationSummary
        invitation={{ ...invitation, expiresAt: new Date("2020-01-01"), delivery: "failed" }}
      />
    </AdminMessages>,
  );

  expect(
    screen.getByText("Email could not be sent. Resend the invitation to try again."),
  ).toBeVisible();
});

it("shows when the owner joined", () => {
  show({ invitation: { ...invitation, acceptedAt: new Date("2026-11-02T12:00:00Z") } });

  expect(screen.getByText("Owner joined")).toBeVisible();
  expect(screen.getByText("The initial owner invitation was accepted.")).toBeVisible();
  expect(terms()).toEqual(["Recipient", "Joined"]);
  expect(screen.getAllByRole("definition").map((value) => value.textContent)).toEqual([
    invitation.email,
    "2 Nov 2026, 12:00 UTC",
  ]);
});

it("asks for an owner after revocation or when no invitation exists", () => {
  const { rerender } = show({
    invitation: { ...invitation, revokedAt: new Date("2026-11-02T12:00:00Z") },
  });

  expect(screen.getByText("Needs an owner")).toBeVisible();
  expect(
    screen.getByText("Invite the first owner to establish responsibility for this workspace."),
  ).toBeVisible();
  expect(terms()).toEqual(["Previous recipient"]);
  expect(screen.getByRole("definition")).toHaveTextContent(invitation.email);

  rerender(
    <AdminMessages>
      <InvitationSummary invitation={null} />
    </AdminMessages>,
  );

  expect(screen.queryByRole("term")).not.toBeInTheDocument();
});

it("shows an existing owner without onboarding warnings from an old invitation", () => {
  show({
    hasOwner: true,
    invitation: { ...invitation, expiresAt: new Date("2020-01-01"), delivery: "failed" },
  });

  expect(screen.getByText("Owner joined")).toBeVisible();
  expect(screen.getByText("The initial owner invitation was accepted.")).toBeVisible();
  expect(screen.getByText(invitation.email)).toBeVisible();
  expect(screen.getByText("Email could not be sent", { exact: true })).toBeVisible();
  expect(screen.getByText("1 Jan 2020, 00:00 UTC")).toBeVisible();
  expect(
    screen.queryByText("Email could not be sent. Resend the invitation to try again."),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(
      "This invitation can no longer be accepted. Send a new invitation to continue onboarding.",
    ),
  ).not.toBeInTheDocument();
});

it("omits the status badge without hiding the invitation record", () => {
  show({ showStatus: false, invitation: { ...invitation, delivery: "failed" } });

  expect(screen.queryByText("Owner invitation pending")).not.toBeInTheDocument();
  expect(screen.getByText(invitation.email)).toBeVisible();
  expect(screen.getByText("Email could not be sent", { exact: true })).toBeVisible();
  expect(
    screen.getByText("Email could not be sent. Resend the invitation to try again."),
  ).toBeVisible();
});
