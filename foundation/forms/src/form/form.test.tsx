import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import { Form, FormActions, FormTextField, useForm } from "../index";

const schema = z.object({
  title: z.string().min(1, "Enter a title."),
  notes: z.string().min(1, "Enter notes."),
});

type Values = z.infer<typeof schema>;

const Example = ({
  onSubmit,
  validation = schema,
  defaults = { title: "", notes: "" },
}: {
  onSubmit: (values: Values) => string | null | Promise<string | null>;
  validation?: typeof schema;
  defaults?: Values;
}) => {
  const { form, submission } = useForm({
    defaultValues: defaults,
    schema: validation,
    onSubmit,
    submitErrorMessage: "Could not save. Try again.",
  });

  return (
    <Form
      label="Example"
      submitOnModEnter
      submission={submission}
      actions={
        <FormActions
          submission={submission}
          onCancel={() => {}}
          cancelLabel="Cancel"
          submitLabel="Save"
          submittingLabel="Saving…"
        />
      }
    >
      <form.Field name="title">
        {(field) => <FormTextField field={field} label="Title" />}
      </form.Field>
      <form.Field name="notes">
        {(field) => <FormTextField field={field} label="Notes" multiline />}
      </form.Field>
    </Form>
  );
};

describe("shared forms", () => {
  it("validates on submit, focuses the first invalid field, and revalidates while correcting it", async () => {
    const user = userEvent.setup();
    const save = vi.fn(() => null);
    render(<Example onSubmit={save} />);
    const title = screen.getByLabelText("Title");
    const notes = screen.getByLabelText("Notes");
    await user.click(title);
    await user.tab();

    expect(screen.queryByText("Enter a title.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(title).toHaveFocus());
    expect(title).toHaveAccessibleDescription("Enter a title.");
    expect(notes).toHaveAccessibleDescription("Enter notes.");
    expect(save).not.toHaveBeenCalled();

    await user.type(title, "A grant");

    expect(title).not.toHaveAttribute("aria-invalid", "true");

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(notes).toHaveFocus());

    await user.type(notes, "Ready for review");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(save).toHaveBeenCalledExactlyOnceWith({ title: "A grant", notes: "Ready for review" });
  });

  it("blocks repeat submissions and edits while saving, then preserves values for a retry", async () => {
    const user = userEvent.setup();
    let finish!: (error: string | null) => void;
    const save = vi
      .fn<() => string | null | Promise<string | null>>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockReturnValue(null);
    const defaults = { title: "A grant", notes: "Keep these notes" };
    render(<Example onSubmit={save} defaults={defaults} />);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("form")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByLabelText("Title")).toBeDisabled();

    fireEvent.submit(screen.getByRole("form"));

    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => finish("The save failed. Try again."));

    expect(screen.getByRole("alert")).toHaveTextContent("The save failed. Try again.");
    expect(screen.getByLabelText("Notes")).toHaveValue(defaults.notes);
    expect(screen.getByLabelText("Title")).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(save).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("The save failed. Try again.")).not.toBeInTheDocument();
  });

  it("reports rejected saves without exposing exception details and permits retry", async () => {
    const user = userEvent.setup();
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("private server details"))
      .mockResolvedValue(null);
    render(<Example onSubmit={save} defaults={{ title: "A grant", notes: "Keep this" }} />);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Could not save. Try again.")).toBeVisible();
    expect(screen.queryByText("private server details")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Notes")).toHaveValue("Keep this");

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(save).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Could not save. Try again.")).not.toBeInTheDocument();
  });

  it("shows schema errors that apply to the whole form", async () => {
    const user = userEvent.setup();
    const save = vi.fn(() => null);
    render(
      <Example
        onSubmit={save}
        defaults={{ title: "Same", notes: "Same" }}
        validation={schema.refine(
          (value) => value.title !== value.notes,
          "Title and notes must differ.",
        )}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Title and notes must differ.")).toBeVisible();
    expect(save).not.toHaveBeenCalled();
  });
});

it("restores lost focus after a failed save so the keyboard can retry", async () => {
  const user = userEvent.setup();

  let finish = (_error: string | null) => {};

  const save = vi
    .fn<() => Promise<string | null>>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(null);
  render(<Example onSubmit={save} defaults={{ title: "A grant", notes: "Keep this" }} />);
  const button = screen.getByRole("button", { name: "Save" });
  await user.click(button);
  expect(button).toBeDisabled();
  // Browsers can drop focus when the focused submit control becomes disabled.
  button.blur();

  await act(async () => finish("Try again."));

  await waitFor(() => expect(button).toHaveFocus());
  await user.keyboard("{Control>}{Enter}{/Control}");
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
});

it("keeps a person's new focus when a save fails", async () => {
  const user = userEvent.setup();

  let finish = (_error: string | null) => {};

  const save = () =>
    new Promise<string | null>((resolve) => {
      finish = resolve;
    });

  render(
    <>
      <button>Other work</button>
      <Example onSubmit={save} defaults={{ title: "A grant", notes: "Keep this" }} />
    </>,
  );
  await user.click(screen.getByRole("button", { name: "Save" }));
  const other = screen.getByRole("button", { name: "Other work" });
  await user.click(other);

  await act(async () => finish("Try again."));

  expect(other).toHaveFocus();
});
