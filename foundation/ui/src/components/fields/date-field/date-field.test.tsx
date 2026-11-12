import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps } from "react";
import { beforeEach, expect, it, vi } from "vite-plus/test";

import { MessagesProvider } from "@merit/i18n";

import { DateField } from "./date-field";

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

const Example = (props: Partial<ComponentProps<typeof DateField>>) => {
  const [value, setValue] = useState("2027-01-21");
  return (
    <MessagesProvider messages={{}}>
      <DateField label="Date" value={value} onChange={setValue} {...props} />
    </MessagesProvider>
  );
};

it("preserves unfinished text and updates the field from a keyboard calendar selection", async () => {
  const user = userEvent.setup();
  render(<Example />);
  const input = screen.getByRole("textbox", { name: "Date" });
  await user.clear(input);
  await user.type(input, "2027-02-");

  expect(input).toHaveValue("2027-02-");

  await user.type(input, "31");
  const trigger = screen.getByRole("button", { name: "Choose date for Date" });
  await user.click(trigger);

  expect(screen.getByRole("dialog")).toBeVisible();

  await user.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(input).toHaveValue("2027-02-31");

  await user.clear(input);
  await user.type(input, "2027-01-21");
  await user.click(trigger);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Thursday, 21 January 2027 selected" }),
    ).toHaveFocus(),
  );
  await user.keyboard("{ArrowRight}");

  expect(input).toHaveValue("2027-01-21");

  await user.keyboard("{Enter}");

  expect(input).toHaveValue("2027-01-22");
  await waitFor(() => expect(trigger).toHaveFocus());

  await user.clear(input);

  expect(input).toHaveValue("");
});

it("disables an already open calendar and restores the draft when enabled again", async () => {
  const user = userEvent.setup();
  const change = vi.fn();
  const view = render(<Example onChange={change} />);
  await user.click(screen.getByRole("button", { name: "Choose date for Date" }));
  view.rerender(<Example onChange={change} isDisabled />);
  const day = screen.getByRole("button", { name: "Friday, 22 January 2027" });

  expect(day).toHaveAttribute("aria-disabled", "true");
  await user.click(day);
  expect(change).not.toHaveBeenCalled();

  view.rerender(<Example onChange={change} />);
  await user.click(day);

  expect(change).toHaveBeenCalledExactlyOnceWith("2027-01-22");
});

it("keeps read-only dates focusable and prevents opening their calendar", async () => {
  const user = userEvent.setup();
  render(<Example isReadOnly isRequired />);
  const input = screen.getByRole("textbox", { name: "Date" });
  await user.tab();

  expect(input).toHaveFocus();
  expect(input).toHaveAttribute("readonly");
  expect(screen.getByRole("button", { name: "Choose date for Date" })).toBeDisabled();
  expect(screen.queryByText("Required")).not.toBeInTheDocument();
});
