import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vite-plus/test";

import { StatusIndicator } from "./status-indicator";

const label = "Earlier recommendation";
const explanation = "This recommendation was prepared for an earlier application version.";

beforeEach(() => {
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

const Example = () => <StatusIndicator label={label} explanation={explanation} />;

it("explains a focused status once, as the same text a press pins open", async () => {
  const user = userEvent.setup();
  render(<Example />);
  const trigger = screen.getByRole("button", { name: label });
  await user.tab();
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(await screen.findByRole("group", { name: label })).toHaveTextContent(explanation);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  expect(screen.getAllByText(explanation)).toHaveLength(1);
  expect(trigger).toHaveAccessibleDescription(explanation);
  await user.keyboard("{Enter}");
  expect(screen.getByRole("group", { name: label })).toBeVisible();
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("group")).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
});

it("explains the status on hover", async () => {
  const user = userEvent.setup();
  render(<Example />);
  const trigger = screen.getByRole("button", { name: label });
  fireEvent.pointerMove(trigger);
  await user.hover(trigger);
  expect(await screen.findByRole("group", { name: label })).toHaveTextContent(explanation);
});

it.each(["outside press", "Escape"])("dismisses a pressed explanation with %s", async (how) => {
  const user = userEvent.setup();
  render(<Example />);
  const trigger = screen.getByRole("button", { name: label });
  await user.click(trigger);
  expect(await screen.findByRole("group", { name: label })).toHaveTextContent(explanation);
  if (how === "Escape") {
    await user.keyboard("{Escape}");
  } else {
    await user.click(document.body);
  }
  await waitFor(() => expect(screen.queryByRole("group")).not.toBeInTheDocument());
});

it("opens the explanation with a touch press", async () => {
  const user = userEvent.setup();
  render(<Example />);
  const trigger = screen.getByRole("button", { name: label });
  await user.pointer([
    { keys: "[TouchA>]", target: trigger },
    { keys: "[/TouchA]", target: trigger },
  ]);
  expect(await screen.findByRole("group", { name: label })).toHaveTextContent(explanation);
});
