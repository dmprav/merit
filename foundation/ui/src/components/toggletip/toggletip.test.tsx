import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vite-plus/test";

import { Toggletip } from "./toggletip";

const label = "About this request";
const text = "Requested by Dana Reed.";

const Example = () => (
  <>
    <Toggletip label={label}>{text}</Toggletip>
    <button type="button">Elsewhere</button>
  </>
);

const content = () => screen.queryByRole("group", { name: label });

const hover = async (user: ReturnType<typeof userEvent.setup>) => {
  const trigger = screen.getByRole("button", { name: label });
  fireEvent.pointerMove(trigger);
  await user.hover(trigger);
  return trigger;
};

it("previews its text on hover after the shared delay without becoming a tooltip", async () => {
  const user = userEvent.setup();
  render(<Example />);
  expect(content()).not.toBeInTheDocument();
  await hover(user);
  expect(content()).not.toBeInTheDocument();
  expect(await screen.findByRole("group", { name: label })).toHaveTextContent(text);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});

it("describes and controls its open text from the button", async () => {
  const user = userEvent.setup();
  render(<Example />);
  const trigger = screen.getByRole("button", { name: label });
  expect(trigger).not.toHaveAttribute("aria-controls");
  await user.tab();
  const popover = await screen.findByRole("group", { name: label });
  expect(trigger).toHaveAccessibleDescription(text);
  expect(trigger).toHaveAttribute("aria-controls", popover.id);
  expect(screen.getAllByText(text)).toHaveLength(1);
});

it("keeps the text open while the pointer moves onto it and closes it after leaving", async () => {
  const user = userEvent.setup();
  render(<Example />);
  const trigger = await hover(user);
  const popover = await screen.findByRole("group", { name: label });
  await user.unhover(trigger);
  await user.hover(popover);
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(content()).toBeInTheDocument();
  await user.unhover(popover);
  await waitFor(() => expect(content()).not.toBeInTheDocument());
});

it("stays present while the pointer moves from the text back to the button", async () => {
  const user = userEvent.setup();
  render(<Example />);
  const trigger = await hover(user);
  const popover = await screen.findByRole("group", { name: label });
  await user.unhover(trigger);
  await user.hover(popover);
  let absent = false;
  const sample = setInterval(() => {
    absent ||= content() === null;
  }, 20);
  await user.unhover(popover);
  fireEvent.pointerMove(trigger);
  await user.hover(trigger);
  await new Promise((resolve) => setTimeout(resolve, 600));
  clearInterval(sample);
  expect(absent).toBe(false);
  expect(content()).toBeInTheDocument();
});

it("previews at once on keyboard focus and closes with Escape", async () => {
  const user = userEvent.setup();
  render(<Example />);
  await user.tab();
  expect(await screen.findByRole("group", { name: label })).toHaveTextContent(text);
  await user.keyboard("{Escape}");
  await waitFor(() => expect(content()).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: label })).toHaveFocus();
});

it("pins on press so the pointer can leave, and a second press closes it", async () => {
  const user = userEvent.setup();
  render(<Example />);
  const trigger = screen.getByRole("button", { name: label });
  await user.click(trigger);
  expect(await screen.findByRole("group", { name: label })).toBeVisible();
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  await user.unhover(trigger);
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(content()).toBeInTheDocument();
  await user.click(trigger);
  await waitFor(() => expect(content()).not.toBeInTheDocument());
});

it("closes a pinned text with Escape and with a press outside", async () => {
  const user = userEvent.setup();
  render(<Example />);
  const trigger = screen.getByRole("button", { name: label });
  await user.click(trigger);
  await screen.findByRole("group", { name: label });
  await user.keyboard("{Escape}");
  await waitFor(() => expect(content()).not.toBeInTheDocument());
  await user.click(trigger);
  await screen.findByRole("group", { name: label });
  await user.click(screen.getByRole("button", { name: "Elsewhere" }));
  await waitFor(() => expect(content()).not.toBeInTheDocument());
});

it("closes with Escape while the pointer is over the text", async () => {
  const user = userEvent.setup();
  render(<Example />);
  await hover(user);
  const popover = await screen.findByRole("group", { name: label });
  await user.hover(popover);
  await user.keyboard("{Escape}");
  await waitFor(() => expect(content()).not.toBeInTheDocument());
});

it("draws the icon for its tone", () => {
  render(
    <Toggletip label={label} tone="warning">
      {text}
    </Toggletip>,
  );
  expect(screen.getByRole("button", { name: label }).querySelector("svg")).toHaveClass(
    "lucide-triangle-alert",
  );
});

// Last: after a touch press React Aria ignores the emulated hover that follows it.
it("pins with a touch press", async () => {
  const user = userEvent.setup();
  render(<Example />);
  const trigger = screen.getByRole("button", { name: label });
  await user.pointer([
    { keys: "[TouchA>]", target: trigger },
    { keys: "[/TouchA]", target: trigger },
  ]);
  expect(await screen.findByRole("group", { name: label })).toHaveTextContent(text);
});
