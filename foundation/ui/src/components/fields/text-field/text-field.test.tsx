import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import { TextField } from "./text-field";

it("describes the prefix alongside guidance without including it in edited or submitted values", async () => {
  const user = userEvent.setup();
  render(
    <form aria-label="Budget">
      <p id="budget-context">Draft budget.</p>
      <TextField
        name="amount"
        label="Round budget"
        prefix={{ text: "€", label: "Euros" }}
        aria-describedby="budget-context"
        description="Available for this round."
        inputMode="decimal"
      />
    </form>,
  );
  const input = screen.getByRole("textbox", { name: "Round budget" });

  expect(input).toHaveAccessibleDescription("Draft budget. Euros Available for this round.");

  await user.click(screen.getByText("€"));

  expect(input).toHaveFocus();

  await user.type(input, "1200.50");

  expect(input).toHaveValue("1200.50");
  expect(new FormData(screen.getByRole<HTMLFormElement>("form")).get("amount")).toBe("1200.50");
});

it("associates guidance that appears after the field is mounted", () => {
  const { rerender } = render(<TextField label="Allocation" defaultValue="24000" />);
  const input = screen.getByRole("textbox", { name: "Allocation" });

  expect(input).toHaveAccessibleDescription("");

  rerender(
    <TextField
      label="Allocation"
      defaultValue="24000"
      description="Counts in full toward proposed funding."
    />,
  );

  expect(input).toHaveAccessibleDescription("Counts in full toward proposed funding.");

  rerender(<TextField label="Allocation" defaultValue="24000" />);

  expect(input).toHaveAccessibleDescription("");
  expect(input).toHaveValue("24000");
});

it.each([false, true])(
  "keeps read-only values focusable and selectable without accepting edits (multiline: %s)",
  async (multiline) => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <>
        <TextField
          label="Foundation"
          defaultValue="Alder Foundation"
          isReadOnly
          isRequired
          multiline={multiline}
          onChange={onChange}
        />
        <TextField label="Unavailable" isDisabled />
        <TextField label="Review title" />
      </>,
    );
    const input = screen.getByRole("textbox", { name: "Foundation" });
    await user.tab();

    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("readonly");
    expect(screen.queryByText("Required")).not.toBeInTheDocument();

    await user.keyboard("{Control>}a{/Control}");

    expect(input).toHaveProperty("selectionStart", 0);
    expect(input).toHaveProperty("selectionEnd", "Alder Foundation".length);

    await user.keyboard("Replacement");

    expect(input).toHaveValue("Alder Foundation");
    expect(onChange).not.toHaveBeenCalled();

    await user.tab();

    expect(screen.getByRole("textbox", { name: "Review title" })).toHaveFocus();
  },
);

it("keeps required semantics with an uncluttered accessible label", () => {
  render(<TextField label="Review title" isRequired />);

  expect(screen.getByRole("textbox", { name: "Review title" })).toBeRequired();
  expect(screen.getByText("Required")).toBeVisible();
});
