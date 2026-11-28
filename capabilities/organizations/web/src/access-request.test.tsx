import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import { AnalyticsProvider } from "@merit/analytics";
import { MessagesProvider } from "@merit/i18n";
import { Toasts } from "@merit/ui/toast";

import { accessRequest } from "./access-request-messages";
import { AccessRequestDialog } from "./views/access-request";

it("uses the common email translation before submitting an access request", async () => {
  const request = vi.fn().mockResolvedValue({ status: "ok" });
  const analytics = { pageView: vi.fn(), track: vi.fn(), reset: vi.fn() };
  render(
    <AnalyticsProvider client={analytics}>
      <MessagesProvider
        messages={{ accessRequest, common: { validation: { email: "Translated access email" } } }}
      >
        <AccessRequestDialog request={request} hydrated />
        <Toasts />
      </MessagesProvider>
    </AnalyticsProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Request an invitation" }));
  const email = screen.getByRole("textbox", { name: "Email address" });
  await user.type(email, "invalid");
  await user.click(screen.getByRole("button", { name: "Submit request" }));

  expect(email).toHaveAccessibleDescription("Translated access email");
  expect(request).not.toHaveBeenCalled();
  expect(analytics.track).not.toHaveBeenCalled();

  await user.clear(email);
  await user.type(email, "sam@example.test");
  await user.click(screen.getByRole("button", { name: "Submit request" }));

  expect(await screen.findByRole("alertdialog", { name: /^Request saved\./ })).toBeVisible();
  expect(screen.queryByRole("dialog", { name: "Request an invitation" })).not.toBeInTheDocument();
  expect(request).toHaveBeenCalledOnce();
  expect(analytics.track).toHaveBeenCalledExactlyOnceWith("access_request_submitted");
});

it("explains the prototype, retains failed input, and confirms only a saved request", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce({ status: "unavailable" })
    .mockResolvedValueOnce({ status: "ok" });
  render(
    <MessagesProvider messages={{ accessRequest }}>
      <AccessRequestDialog request={request} hydrated />
      <Toasts />
    </MessagesProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Request an invitation" }));
  const dialog = within(screen.getByRole("dialog", { name: "Request an invitation" }));

  expect(dialog.getByText(/portfolio project, not a live grant-management service/)).toBeVisible();
  expect(dialog.queryByRole("button", { name: "Discard draft" })).not.toBeInTheDocument();
  expect(dialog.getByRole("link", { name: "Privacy notice (opens in a new tab)" })).toHaveAttribute(
    "href",
    "/privacy",
  );

  await user.type(dialog.getByRole("textbox", { name: "Email address" }), "Visitor@example.test");

  expect(dialog.getByRole("button", { name: "Discard draft" })).toBeVisible();

  await user.click(dialog.getByRole("button", { name: "Submit request" }));

  expect(await dialog.findByRole("alert")).toHaveTextContent("could not be saved");
  expect(dialog.getByRole("textbox", { name: "Email address" })).toHaveValue(
    "Visitor@example.test",
  );

  await user.click(dialog.getByRole("button", { name: "Submit request" }));

  expect(await screen.findByRole("alertdialog", { name: /^Request saved\./ })).toBeVisible();
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Request an invitation" })).not.toBeInTheDocument(),
  );
  expect(request).toHaveBeenLastCalledWith({ email: "Visitor@example.test" });
});
