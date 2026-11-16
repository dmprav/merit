import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vite-plus/test";

import type { IntakeState } from "@merit/applications-web/contracts";
import { materialVersionSchema } from "@merit/applications/domain";
import { encodeApplicationDetail, applicationView, roundView } from "@merit/grantmaking/api";
import { makeApplication, makeRound } from "@merit/grantmaking/testing/fixtures";
import { formatTimestamp } from "@merit/i18n/format";

import { GrantmakingMessagesProvider } from "../../messages";
import { ApplicationAuditHistory } from "./application-audit-history";

it("keeps same-version contact and staff-summary changes inspectable with their recording provenance", async () => {
  const user = userEvent.setup();
  const round = roundView(makeRound());
  const original = applicationView(makeApplication());
  const recordedAt = "2027-01-20T12:00:00Z";

  const snapshot = (contact: string, email: string, summary: string) =>
    encodeApplicationDetail({
      round,
      application: {
        ...original,
        version: materialVersionSchema.parse(2),
        summary,
        summaryAuthor: { name: "Dana Reed", userId: "dana", recordedAt },
        submission: { ...original.submission!, version: 2, contact, contactEmail: email },
      },
    }).application;

  const history: IntakeState["history"] = [
    {
      revision: 7,
      action: "application.summary_changed",
      reason: null,
      actor: "Dana Reed",
      provenance: { interface: "mcp", clientId: "grant-assistant" },
      recordedAt,
      before: snapshot("Alex Lee", "alex@example.org", "Previous staff interpretation."),
      after: snapshot("Maya Thompson", "maya@example.org", "Updated staff interpretation."),
    },
  ];
  render(<ApplicationAuditHistory history={history} />, { wrapper: GrantmakingMessagesProvider });

  expect(screen.getByText("Recorded by Dana Reed", { exact: true })).toBeVisible();
  expect(screen.getByText("via MCP client grant-assistant")).toBeVisible();
  expect(screen.getByText(/Contact or staff summary updated/)).toBeVisible();

  const timestamp = screen.getByText(formatTimestamp(recordedAt, "en-GB"));

  expect(timestamp).toBeVisible();
  expect(timestamp).toHaveAttribute("datetime", recordedAt);

  expect(
    screen.queryByText("Applicant contact: Alex Lee alex@example.org"),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "View recorded change" }));
  expect(screen.queryByRole("region", { name: /^Previous material/ })).not.toBeInTheDocument();
  const contact = within(screen.getByRole("heading", { name: "Contact" }).closest("section")!);
  expect(contact.getByText("Previous material (Version 2)").parentElement).toHaveTextContent(
    "Alex Lee",
  );
  expect(contact.getByText("Recorded material (Version 2)").parentElement).toHaveTextContent(
    "Maya Thompson",
  );
  const summary = within(
    screen.getByRole("heading", { name: "Staff summary" }).closest("section")!,
  );
  expect(summary.getByText("Previous material (Version 2)").parentElement).toHaveTextContent(
    "Previous staff interpretation.",
  );
  expect(summary.getByText("Recorded material (Version 2)").parentElement).toHaveTextContent(
    "Updated staff interpretation.",
  );
  expect(screen.queryByRole("heading", { name: "Application title" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "Full record" }));
  expect(screen.queryByRole("tabpanel", { name: "Changes" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Contact" })).not.toBeInTheDocument();
  expect(screen.getAllByText(/Previous staff interpretation\./)).toHaveLength(1);
  expect(screen.getByText("via MCP client grant-assistant")).toBeVisible();
  const before = within(screen.getByRole("region", { name: /^Previous material/ }));
  const after = within(screen.getByRole("region", { name: /^Recorded material/ }));
  expect(before.getByText("Alex Lee", { exact: true })).toBeVisible();
  expect(before.getByText("alex@example.org", { exact: true })).toBeVisible();
  expect(after.getByText("Maya Thompson", { exact: true })).toBeVisible();
  expect(after.getByText("maya@example.org", { exact: true })).toBeVisible();
  expect(before.getByText("Previous staff interpretation.", { exact: true })).toBeVisible();
  expect(after.getByText("Updated staff interpretation.", { exact: true })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Back to application history" }));
  expect(screen.queryByRole("region", { name: /^Previous material/ })).not.toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "View recorded change" })).toHaveFocus(),
  );
});

it("labels a withdrawal with its date and reason and a reinstatement with its reason", async () => {
  const round = roundView(makeRound());
  const original = applicationView(makeApplication({ intakeStatus: "ready" }));
  const recordedAt = "2027-01-20T12:00:00Z";
  const withdrawal = {
    withdrawnOn: "2027-01-18",
    reason: "The applicant found other funding.",
    recorder: { userId: "dana", name: "Dana Reed", recordedAt },
  };

  const snapshot = (value: typeof original) =>
    encodeApplicationDetail({ round, application: value }).application;

  const base = snapshot(original);
  const withdrawn = snapshot({ ...original, withdrawal });

  const history: IntakeState["history"] = [
    {
      revision: 9,
      action: "application.reinstate",
      reason: "The applicant returned.",
      actor: "Dana Reed",
      provenance: { interface: "web" },
      recordedAt: "2027-01-25T12:00:00Z",
      before: withdrawn,
      after: base,
    },
    {
      revision: 8,
      action: "application.withdraw",
      reason: "The applicant found other funding.",
      actor: "Dana Reed",
      provenance: { interface: "web" },
      recordedAt,
      before: base,
      after: withdrawn,
    },
  ];
  render(<ApplicationAuditHistory history={history} />, { wrapper: GrantmakingMessagesProvider });

  const [reinstated, withdrew] = screen.getAllByRole("listitem");
  expect(within(reinstated!).getByText("Application reinstated")).toBeVisible();
  expect(within(reinstated!).getByText("The applicant returned.")).toBeVisible();
  expect(within(withdrew!).getByText("Application withdrawn")).toBeVisible();
  expect(within(withdrew!).getByText("Withdrawn on 18 January 2027")).toBeVisible();
  expect(within(withdrew!).getByText("The applicant found other funding.")).toBeVisible();
});

it("keeps working-revision events in the timeline without offering a published-material comparison", () => {
  const round = roundView(makeRound());
  const snapshot = encodeApplicationDetail({
    round,
    application: applicationView(makeApplication()),
  }).application;
  render(
    <ApplicationAuditHistory
      history={[
        {
          revision: 4,
          action: "application_working_revision.updated",
          actor: "Dana Reed",
          recordedAt: "2027-01-20T12:00:00Z",
          provenance: { interface: "web" },
          reason: "Added a delivery location to the working revision.",
          before: snapshot,
          after: snapshot,
        },
      ]}
    />,
    { wrapper: GrantmakingMessagesProvider },
  );
  expect(screen.getByText("Added a delivery location to the working revision.")).toBeVisible();
  expect(screen.queryByRole("button", { name: "View recorded change" })).not.toBeInTheDocument();
});

it.each([
  { missing: "previous", beforePresent: false, afterPresent: true },
  { missing: "recorded", beforePresent: true, afterPresent: false },
])(
  "shows only the available snapshot when an event has no $missing record",
  async ({ beforePresent, afterPresent }) => {
    const round = roundView(makeRound());
    const snapshot = encodeApplicationDetail({
      round,
      application: applicationView(makeApplication()),
    }).application;
    render(
      <ApplicationAuditHistory
        history={[
          {
            revision: 1,
            action: "application.created",
            actor: "Dana Reed",
            recordedAt: "2027-01-20T12:00:00Z",
            provenance: { interface: "web" },
            reason: null,
            before: beforePresent ? snapshot : null,
            after: afterPresent ? snapshot : null,
          },
        ]}
      />,
      { wrapper: GrantmakingMessagesProvider },
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "View recorded change" }));
    expect(
      screen.getByText(
        "Only the available recorded material is shown. A comparison is not available for this event.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("region", {
        name: afterPresent ? /^Recorded material/ : /^Previous material/,
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole("region", {
        name: afterPresent ? /^Previous material/ : /^Recorded material/,
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Changes" })).not.toBeInTheDocument();
    expect(screen.queryByText("Added", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("Removed", { exact: true })).not.toBeInTheDocument();
  },
);
