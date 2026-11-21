import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

it("explains a focused status and opens the same explanation without a duplicate tooltip", async () => {
  const user = userEvent.setup();
  render(<Example />);
  const trigger = screen.getByRole("button", { name: label });
  await user.tab();
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(await screen.findByRole("tooltip")).toHaveTextContent(explanation);
  expect(trigger).toHaveAccessibleDescription(explanation);
  await user.keyboard("{Enter}");
  const dialog = await screen.findByRole("dialog", { name: label });
  expect(within(dialog).getByText(explanation)).toBeVisible();
  expect(within(dialog).queryByRole("heading")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("explains the status on hover", async () => {
  const user = userEvent.setup();
  render(<Example />);
  const trigger = screen.getByRole("button", { name: label });
  fireEvent.pointerMove(trigger);
  await user.hover(trigger);
  expect(await screen.findByRole("tooltip")).toHaveTextContent(explanation);
});

it.each(["outside press", "Escape"])("dismisses a pressed explanation with %s", async (how) => {
  const user = userEvent.setup();
  render(<Example />);
  const trigger = screen.getByRole("button", { name: label });
  await user.click(trigger);
  expect(await screen.findByRole("dialog", { name: label })).toHaveTextContent(explanation);
  if (how === "Escape") {
    await user.keyboard("{Escape}");
  } else {
    await user.click(document.body);
  }
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("opens the explanation with a touch press", async () => {
  const user = userEvent.setup();
  render(<Example />);
  const trigger = screen.getByRole("button", { name: label });
  await user.pointer([
    { keys: "[TouchA>]", target: trigger },
    { keys: "[/TouchA]", target: trigger },
  ]);
  expect(await screen.findByRole("dialog", { name: label })).toHaveTextContent(explanation);
});
