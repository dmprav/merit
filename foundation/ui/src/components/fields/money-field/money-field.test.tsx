import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vite-plus/test";

import { MoneyField } from "./money-field";

const Example = ({ initial = "" }: { initial?: string }) => {
  const [value, setValue] = useState(initial);
  return (
    <MoneyField
      label="Amount"
      value={value}
      onChange={setValue}
      precisionMessage="Use up to two decimal places."
      prefix={{ text: "€", label: "Euros" }}
      description="Proposed funding."
    />
  );
};

it("rejects typed excess precision with feedback associated with the field", async () => {
  const user = userEvent.setup();
  render(<Example />);
  const input = screen.getByRole("textbox", { name: "Amount" });
  await user.type(input, "12.345");
  expect(input).toHaveValue("12.34");
  expect(screen.getByRole("status")).toHaveTextContent("Use up to two decimal places.");
  expect(input).toHaveAccessibleDescription(
    "Use up to two decimal places. Euros Proposed funding.",
  );
});

it("normalizes an accepted paste on blur and clears earlier rejection feedback", async () => {
  const user = userEvent.setup();
  render(<Example />);
  const input = screen.getByRole("textbox", { name: "Amount" });
  await user.type(input, "1.234");
  expect(screen.getByRole("status")).toHaveTextContent("Use up to two decimal places.");
  await user.clear(input);
  await user.paste("1,234.5");
  await user.tab();
  expect(input).toHaveValue("1234.50");
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
  expect(input).toHaveAccessibleDescription("Euros Proposed funding.");
});

it("keeps invalid restored text exact until the person replaces it", async () => {
  const user = userEvent.setup();
  render(<Example initial="123.456" />);
  const input = screen.getByRole("textbox", { name: "Amount" });
  await user.click(input);
  await user.tab();
  expect(input).toHaveValue("123.456");
  await user.clear(input);
  await user.type(input, ".5");
  await user.tab();
  expect(input).toHaveValue("0.50");
});

it("allows repeated corrective deletions from restored excess precision", async () => {
  const user = userEvent.setup();
  render(<Example initial="123.4567" />);
  const input = screen.getByRole("textbox", { name: "Amount" });
  await user.click(input);
  await user.keyboard("{End}{Backspace}");
  expect(input).toHaveValue("123.456");
  await user.keyboard("{Backspace}");
  expect(input).toHaveValue("123.45");
  await user.keyboard("6");
  expect(input).toHaveValue("123.45");
  expect(screen.getByRole("status")).toHaveTextContent("Use up to two decimal places.");
});

it("allows deleting a range from invalid text without allowing a shorter invalid replacement", async () => {
  const user = userEvent.setup();
  render(<Example initial="123.4567" />);
  const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Amount" });
  await user.tripleClick(input);
  await user.paste("12.345");
  expect(input).toHaveValue("123.4567");
  await user.keyboard("{Home}{ArrowRight>4/}{Delete}");
  expect(input).toHaveValue("123.567");
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
  input.setSelectionRange(5, 7);
  await user.keyboard("{Backspace}");
  expect(input).toHaveValue("123.5");
  await user.tab();
  expect(input).toHaveValue("123.50");
});

it("does not normalize a read-only value when focus leaves it", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <MoneyField
      label="Amount"
      value="12.5"
      onChange={onChange}
      isReadOnly
      precisionMessage="Use up to two decimal places."
    />,
  );
  await user.tab();
  await user.tab();
  expect(screen.getByRole("textbox", { name: "Amount" })).toHaveValue("12.5");
  expect(onChange).not.toHaveBeenCalled();
});
