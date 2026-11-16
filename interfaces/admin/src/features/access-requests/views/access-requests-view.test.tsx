import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import { formatTimestamp } from "@merit/i18n/format";

import { AdminMessages } from "../../../app/messages";
import type { AccessRequestsData } from "../contracts";
import { AccessRequestsView } from "./access-requests-view";

const requestedAt = new Date("2026-11-09T10:00:00Z");

const renderRequests = (overrides: Partial<AccessRequestsData> = {}) => {
  const data: AccessRequestsData = {
    reviewing: false,
    error: null,
    refreshFailed: false,
    refreshing: false,
    review: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(
    <AccessRequestsView
      requests={[{ email: "leah@example.test", requestedAt, reviewedAt: null, reviewedBy: null }]}
      data={data}
    />,
    { wrapper: AdminMessages },
  );
  return data;
};

it("opens optional request context with the keyboard and returns focus after dismissal", async () => {
  const user = userEvent.setup();
  renderRequests();
  const trigger = screen.getByRole("button", { name: "About requests" });
  expect(screen.queryByText(/Email addresses are unverified/)).not.toBeInTheDocument();
  await user.tab();
  expect(trigger).toHaveFocus();
  await user.keyboard("{Enter}");
  const help = screen.getByRole("dialog", { name: "About requests" });
  expect(help).toHaveTextContent("Merit prototype");
  expect(help).toHaveTextContent("Email addresses are unverified");
  expect(help).toHaveTextContent("organization invitations");
  expect(help).toHaveTextContent("Marking reviewed sends no email and grants no access");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("shows the requested instant in the viewer's zone without an extra disclosure", () => {
  const resolved = new Intl.DateTimeFormat().resolvedOptions();
  const zone = vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
    ...resolved,
    timeZone: "America/New_York",
  });
  try {
    renderRequests();
    const value = requestedAt.toISOString();
    const time = screen.getByText(
      formatTimestamp(value, "en-GB", { timeZone: "America/New_York" }),
    );
    expect(time).toHaveAttribute("datetime", value);
    expect(time.closest("details")).toBeNull();
  } finally {
    zone.mockRestore();
  }
});

it("keeps a saved review explicit and blocks writes until refresh recovery", async () => {
  const user = userEvent.setup();
  const data = renderRequests({ refreshFailed: true });
  const notice = screen.getByRole("alert");
  expect(notice).toHaveTextContent("Marked reviewed, but the latest list could not load.");
  expect(screen.getByRole("button", { name: "Mark reviewed" })).toBeDisabled();
  await user.click(within(notice).getByRole("button", { name: "Refresh requests" }));
  expect(data.refresh).toHaveBeenCalledOnce();
  expect(data.review).not.toHaveBeenCalled();
});

it("marks the request reviewed directly without a confirmation step", async () => {
  const user = userEvent.setup();
  const data = renderRequests();
  await user.click(screen.getByRole("button", { name: "Mark reviewed" }));
  expect(data.review).toHaveBeenCalledExactlyOnceWith("leah@example.test");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("shows refresh progress and prevents repeated activation while the read is pending", async () => {
  const user = userEvent.setup();
  const data = renderRequests({ refreshFailed: true, refreshing: true });
  const refresh = screen.getByRole("button", { name: "Refresh requests" });
  expect(refresh).toHaveAttribute("aria-disabled", "true");
  await user.click(refresh);
  expect(data.refresh).not.toHaveBeenCalled();
});
