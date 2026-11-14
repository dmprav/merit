import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import { Select } from "./select";

it("associates guidance as it appears and clears it without losing selection", () => {
  const props = {
    label: "Recommendation",
    items: [{ id: "fund", label: "Fund" }],
    defaultSelectedKey: "fund",
  };
  const { rerender } = render(<Select {...props} />);
  const trigger = screen.getByRole("button", { name: /Recommendation/ });

  expect(trigger).toHaveAccessibleDescription("");

  rerender(<Select {...props} description="Choose the proposed treatment." />);

  expect(trigger).toHaveAccessibleDescription("Choose the proposed treatment.");

  rerender(<Select {...props} />);

  expect(trigger).toHaveAccessibleDescription("");
  expect(trigger).toHaveTextContent("Fund");
});

it("identifies required selection visually and to assistive technology", () => {
  render(<Select label="Recommendation" isRequired items={[{ id: "fund", label: "Fund" }]} />);

  expect(screen.getByText("Required")).toBeVisible();
  expect(screen.getByRole("combobox", { hidden: true })).toBeRequired();
  expect(screen.getByRole("button", { name: /Recommendation/ })).not.toHaveAccessibleName(
    /Required/,
  );
  expect(screen.getByRole("button", { name: /Recommendation/ })).toHaveAccessibleDescription(
    "Required",
  );
});

it("announces a conditional requirement with form validation and retains other guidance", () => {
  const props = {
    label: "Reviewer",
    items: [{ id: "alex", label: "Alex Morgan" }],
    defaultSelectedKey: "alex",
    validationBehavior: "aria" as const,
    description: "Choose who supplied the assessment.",
  };
  const { rerender } = render(<Select {...props} isRequired />);
  const trigger = screen.getByRole("button", { name: "Alex Morgan Reviewer" });

  expect(trigger).toHaveAccessibleDescription("Required Choose who supplied the assessment.");
  expect(screen.getByText("Required")).toBeVisible();

  rerender(<Select {...props} />);

  expect(trigger).toHaveAccessibleDescription("Choose who supplied the assessment.");
  expect(screen.queryByText("Required")).not.toBeInTheDocument();
  expect(trigger).toHaveTextContent("Alex Morgan");
});

it("commits keyboard selection and preserves it when further navigation is cancelled", async () => {
  const user = userEvent.setup();
  const onSelectionChange = vi.fn();
  render(
    <Select
      label="Recommendation"
      items={[
        { id: "fund", label: "Fund" },
        { id: "defer", label: "Defer" },
      ]}
      defaultSelectedKey="fund"
      onSelectionChange={onSelectionChange}
    />,
  );
  const trigger = screen.getByRole("button", { name: /Recommendation/ });
  await user.tab();

  expect(trigger).toHaveFocus();

  await user.keyboard("{Enter}{End}{Enter}");

  expect(trigger).toHaveTextContent("Defer");
  expect(onSelectionChange).toHaveBeenCalledExactlyOnceWith("defer");
  await waitFor(() => expect(trigger).toHaveFocus());

  await user.keyboard("{Enter}{Home}");

  const fundOption = screen.getByRole("option", { name: "Fund" });
  expect(fundOption).toHaveFocus();
  expect(fundOption.textContent).toBe("Fund");

  await user.keyboard("{Escape}");

  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(trigger).toHaveTextContent("Defer");
  expect(onSelectionChange).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("explains each option while keeping the selected value concise", async () => {
  const user = userEvent.setup();
  render(
    <Select
      label="Grant access"
      defaultSelectedKey="manager"
      items={[
        { id: "manager", label: "Program manager", description: "Can view and edit grant work." },
        { id: "none", label: "No access", description: "Cannot view grant work." },
      ]}
    />,
  );
  const trigger = screen.getByRole("button", { name: "Program manager Grant access" });
  expect(trigger).not.toHaveTextContent("Can view");
  await user.click(trigger);
  expect(screen.getByRole("option", { name: /^Program manager/ })).toHaveAccessibleName(
    "Program manager Can view and edit grant work.",
  );
  expect(screen.getByRole("option", { name: /^No access/ })).toHaveAccessibleName(
    "No access Cannot view grant work.",
  );
  await user.keyboard("{End}{Enter}");
  expect(trigger).toHaveTextContent("No access");
  expect(trigger).not.toHaveTextContent("Cannot view");
  await waitFor(() => expect(trigger).toHaveFocus());
});
