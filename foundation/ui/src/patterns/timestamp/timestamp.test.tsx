import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vite-plus/test";

import { MessagesProvider } from "@merit/i18n";
import { formatTimestamp } from "@merit/i18n/format";

import { Timestamp } from "./timestamp";

const value = "2027-01-20T00:30:45Z";

it("shows the local timestamp as plain machine-readable text without a tab stop", async () => {
  render(
    <MessagesProvider messages={{}}>
      <Timestamp value={value} />
      <button type="button">Continue</button>
    </MessagesProvider>,
  );
  const time = screen.getByText(formatTimestamp(value, "en-GB"));
  expect(time).toHaveAttribute("datetime", value);
  expect(time.tagName).toBe("TIME");
  const user = userEvent.setup();
  await user.tab();
  expect(screen.getByRole("button", { name: "Continue" })).toHaveFocus();
});

it("hydrates from the same UTC snapshot before adopting the browser's time zone", async () => {
  const resolved = new Intl.DateTimeFormat().resolvedOptions();
  const timeZone = vi
    .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
    .mockReturnValue({ ...resolved, timeZone: "America/New_York" });
  const view = (
    <MessagesProvider messages={{}}>
      <Timestamp value={value} />
    </MessagesProvider>
  );
  const container = document.createElement("div");
  container.innerHTML = renderToString(view);
  expect(container.querySelector("time")).toHaveTextContent(
    formatTimestamp(value, "en-GB", { timeZone: "UTC" }),
  );
  document.body.append(container);
  const onRecoverableError = vi.fn();
  let root: ReturnType<typeof hydrateRoot>;
  await act(async () => {
    root = hydrateRoot(container, view, { onRecoverableError });
  });
  expect(onRecoverableError).not.toHaveBeenCalled();
  expect(container.querySelector("time")).toHaveTextContent(
    formatTimestamp(value, "en-GB", { timeZone: "America/New_York" }),
  );
  act(() => root.unmount());
  container.remove();
  timeZone.mockRestore();
});
