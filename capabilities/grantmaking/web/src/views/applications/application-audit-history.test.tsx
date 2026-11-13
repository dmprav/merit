import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vite-plus/test";

import type { IntakeState } from "@merit/applications-web/contracts";
import { materialVersionSchema } from "@merit/applications/domain";
import { encodeApplicationDetail, applicationView, roundView } from "@merit/grantmaking/api";
import { makeApplication, makeRound } from "@merit/grantmaking/testing/fixtures";

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

  await user.click(screen.getByText("Application history"));

  expect(screen.getByText("Recorded by Dana Reed", { exact: true })).toBeVisible();
  expect(screen.getByText("via MCP client grant-assistant")).toBeVisible();
  expect(screen.getByText(/Contact or staff summary updated/)).toBeVisible();

  const timestamp = screen.getByText("20/01/2027, 12:00:00 UTC");

  expect(timestamp).toBeVisible();
  expect(timestamp).toHaveAttribute("datetime", recordedAt);

  const previous = screen.getByText("Previous material (Version 2)");
  const current = screen.getByText("Recorded material (Version 2)");
  await user.click(previous);
  await user.click(current);
  const before = within(previous.closest("details")!);
  const after = within(current.closest("details")!);

  expect(before.getByText("Applicant contact: Alex Lee alex@example.org")).toBeVisible();
  expect(
    before.getByText("Staff summary by Dana Reed: Previous staff interpretation."),
  ).toBeVisible();
  expect(after.getByText("Applicant contact: Maya Thompson maya@example.org")).toBeVisible();
  expect(
    after.getByText("Staff summary by Dana Reed: Updated staff interpretation."),
  ).toBeVisible();
});
