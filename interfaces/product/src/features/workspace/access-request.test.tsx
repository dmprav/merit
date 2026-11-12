import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import { MessagesProvider } from "@merit/i18n";

import { webMessages } from "../../app/messages";
import { RequestAccess } from "./access-request";
import { requestAccess } from "./data/server/access-request.functions";
import { AccessRequestDialog } from "./views/access-request";

vi.mock("@tanstack/react-router", () => ({ useHydrated: () => true }));
vi.mock("./data/server/access-request.functions", () => ({ requestAccess: vi.fn() }));

it("uses the common email translation before submitting an access request", async () => {
  const request = vi.fn().mockResolvedValue({ status: "ok" });
  render(
    <MessagesProvider
      messages={{ ...webMessages, common: { validation: { email: "Translated access email" } } }}
    >
      <AccessRequestDialog request={request} hydrated />
    </MessagesProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Request an invitation" }));
  const email = screen.getByRole("textbox", { name: "Email address" });
  await user.type(email, "invalid");
  await user.click(screen.getByRole("button", { name: "Submit request" }));

  expect(email).toHaveAccessibleDescription("Translated access email");
  expect(request).not.toHaveBeenCalled();

  await user.clear(email);
  await user.type(email, "sam@example.test");
  await user.click(screen.getByRole("button", { name: "Submit request" }));

  expect(await screen.findByRole("status")).toHaveTextContent("Request saved.");
  expect(request).toHaveBeenCalledOnce();
});

it("explains the prototype, retains failed input, and confirms only a saved request", async () => {
  vi.mocked(requestAccess)
    .mockResolvedValueOnce({ status: "unavailable" })
    .mockResolvedValueOnce({ status: "ok" });
  render(<RequestAccess />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Request an invitation" }));
  const dialog = within(screen.getByRole("dialog", { name: "Request an invitation" }));

  expect(dialog.getByText(/portfolio project, not a live grant-management service/)).toBeVisible();
  expect(dialog.queryByRole("button", { name: "Discard draft" })).not.toBeInTheDocument();

  await user.type(dialog.getByRole("textbox", { name: "Email address" }), "Visitor@example.test");

  expect(dialog.getByRole("button", { name: "Discard draft" })).toBeVisible();

  await user.click(dialog.getByRole("button", { name: "Submit request" }));

  expect(await dialog.findByRole("alert")).toHaveTextContent("could not be saved");
  expect(dialog.getByRole("textbox", { name: "Email address" })).toHaveValue(
    "Visitor@example.test",
  );

  await user.click(dialog.getByRole("button", { name: "Submit request" }));

  await waitFor(() => expect(dialog.getByRole("status")).toHaveTextContent("Request saved."));
  expect(
    dialog.queryByText(/portfolio project, not a live grant-management service/),
  ).not.toBeInTheDocument();
  expect(requestAccess).toHaveBeenLastCalledWith({ data: { email: "Visitor@example.test" } });
});
