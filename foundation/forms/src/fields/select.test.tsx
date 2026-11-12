import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import { Form, FormActions, FormSelect, useForm } from "../index";

const Example = ({
  onSubmit,
}: {
  onSubmit: (value: { position: string }) => string | null | Promise<string | null>;
}) => {
  const { form, submission } = useForm({
    defaultValues: { position: "fund" },
    schema: z.object({ position: z.literal("defer", { error: "Choose Defer for this example." }) }),
    onSubmit,
    submitErrorMessage: "Could not save.",
  });

  return (
    <Form
      label="Recommendation"
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
      <form.Field name="position">
        {(field) => (
          <FormSelect
            field={field}
            label="Position"
            items={[
              { id: "fund", label: "Fund" },
              { id: "defer", label: "Defer" },
            ]}
          />
        )}
      </form.Field>
    </Form>
  );
};

it("focuses an invalid select, announces the error, and revalidates keyboard selection", async () => {
  const user = userEvent.setup();
  const save = vi.fn(() => null);
  render(<Example onSubmit={save} />);
  const trigger = screen.getByRole("button", { name: /Position/ });
  await user.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(trigger).toHaveFocus());
  expect(trigger).toHaveAccessibleDescription("Choose Defer for this example.");
  expect(save).not.toHaveBeenCalled();

  await user.keyboard("{Enter}{End}{Enter}");

  expect(trigger).toHaveTextContent("Defer");
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(screen.queryByText("Choose Defer for this example.")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(save).toHaveBeenCalledExactlyOnceWith({ position: "defer" });
});

it("blocks selection in an open popup while saving and preserves the value after failure", async () => {
  const user = userEvent.setup();
  let finish!: (error: string) => void;
  const save = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  render(<Example onSubmit={save} />);
  const trigger = screen.getByRole("button", { name: /Position/ });
  const form = screen.getByRole("form");
  await user.click(trigger);
  await user.click(screen.getByRole("option", { name: "Defer" }));
  await user.click(trigger);
  fireEvent.submit(form);

  await waitFor(() => expect(trigger).toBeDisabled());

  const fund = screen.queryByRole("option", { name: "Fund" });

  if (fund) {
    expect(fund).toHaveAttribute("aria-disabled", "true");

    await user.click(fund);
  }
  expect(trigger).toHaveTextContent("Defer");
  expect(save).toHaveBeenCalledExactlyOnceWith({ position: "defer" });

  await act(async () => finish("Could not save. Try again."));

  expect(screen.getByText("Could not save. Try again.")).toBeVisible();
  expect(trigger).toBeEnabled();
  expect(trigger).toHaveTextContent("Defer");
});
