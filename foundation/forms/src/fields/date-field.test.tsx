import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import { MessagesProvider } from "@merit/i18n";

import { Form, FormDateField, useForm } from "../index";

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

const Example = ({
  onSubmit,
  onChange,
}: {
  onSubmit: (value: { date: string }) => Promise<string | null> | null;
  onChange?: (value: { date: string }) => void;
}) => {
  const { form, submission } = useForm({
    defaultValues: { date: "2027-01-21" },
    schema: z.object({ date: z.iso.date({ error: "Enter a valid date." }) }),
    onChange,
    onSubmit,
    submitErrorMessage: "Could not save.",
  });
  return (
    <MessagesProvider messages={{}}>
      <Form label="Dates" submission={submission} actions={<button type="submit">Save</button>}>
        <form.Field name="date">
          {(field) => <FormDateField field={field} label="Date" />}
        </form.Field>
      </Form>
    </MessagesProvider>
  );
};

it("retains incomplete drafts, focuses invalid input, and submits the selected date only on Save", async () => {
  const user = userEvent.setup();
  const save = vi.fn(() => null);
  const change = vi.fn();
  render(<Example onSubmit={save} onChange={change} />);
  const input = screen.getByRole("textbox", { name: "Date" });
  await user.clear(input);
  await user.type(input, "2027-02-");
  expect(change).toHaveBeenLastCalledWith({ date: "2027-02-" });

  await user.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(input).toHaveFocus());
  expect(input).toHaveAccessibleDescription("Enter a valid date.");
  expect(save).not.toHaveBeenCalled();

  await user.clear(input);
  await user.type(input, "2027-01-21");
  await user.click(screen.getByRole("button", { name: "Choose date for Date" }));
  await user.click(screen.getByRole("button", { name: "Friday, 22 January 2027" }));

  expect(input).toHaveValue("2027-01-22");
  expect(save).not.toHaveBeenCalled();
  expect(screen.queryByText("Enter a valid date.")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(save).toHaveBeenCalledExactlyOnceWith({ date: "2027-01-22" });
});

it("blocks changes from an open calendar during submission and preserves failed input", async () => {
  const user = userEvent.setup();
  let finish!: (error: string) => void;
  const save = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  render(<Example onSubmit={save} />);
  await user.click(screen.getByRole("button", { name: "Choose date for Date" }));
  fireEvent.submit(screen.getByRole("form"));

  const day = screen.getByRole("button", { name: "Friday, 22 January 2027" });
  await waitFor(() => expect(day).toHaveAttribute("aria-disabled", "true"));
  await user.click(day);
  expect(save).toHaveBeenCalledExactlyOnceWith({ date: "2027-01-21" });

  await act(async () => finish("Could not save. Try again."));

  expect(screen.getByRole("textbox", { name: "Date" })).toHaveValue("2027-01-21");
  expect(screen.getByText("Could not save. Try again.")).toBeVisible();
});
