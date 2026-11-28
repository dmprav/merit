import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import { Disclosure } from "./disclosure";

it("keeps its own open state until the caller takes control", async () => {
  const user = userEvent.setup();
  render(
    <Disclosure title="Earlier versions">
      <p>Version 1</p>
    </Disclosure>,
  );
  const trigger = screen.getByRole("button", { name: "Earlier versions" });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByText("Version 1")).not.toBeVisible();

  await user.click(trigger);

  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("Version 1")).toBeVisible();
});

it("follows the caller's open state and reports what the person asks for", async () => {
  const user = userEvent.setup();
  const onExpandedChange = vi.fn();
  const { rerender } = render(
    <Disclosure title="Working" isExpanded onExpandedChange={onExpandedChange}>
      <p>Read 2 submissions</p>
    </Disclosure>,
  );
  const trigger = screen.getByRole("button", { name: "Working" });
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("Read 2 submissions")).toBeVisible();

  await user.click(trigger);

  expect(onExpandedChange).toHaveBeenCalledWith(false);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("Read 2 submissions")).toBeVisible();

  rerender(
    <Disclosure title="Working" isExpanded={false} onExpandedChange={onExpandedChange}>
      <p>Read 2 submissions</p>
    </Disclosure>,
  );

  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByText("Read 2 submissions")).not.toBeVisible();
});

it("opens from the keyboard and from a press on the whole row", async () => {
  const user = userEvent.setup();
  render(
    <Disclosure title="Earlier versions" count={2}>
      <p>Version 1</p>
    </Disclosure>,
  );
  const trigger = screen.getByRole("button", { name: /Earlier versions/ });

  await user.tab();
  expect(trigger).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  await user.keyboard(" ");
  expect(trigger).toHaveAttribute("aria-expanded", "false");

  // The title and count are inside the trigger, so pressing either one is pressing the row.
  await user.click(screen.getByText("Earlier versions"));
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  await user.click(screen.getByText("2"));
  expect(trigger).toHaveAttribute("aria-expanded", "false");
});

it("indents the panel to the title unless told not to", () => {
  const { rerender } = render(
    <Disclosure title="Pins" defaultExpanded>
      <p>Item</p>
    </Disclosure>,
  );
  expect(screen.getByText("Item").parentElement).toHaveAttribute("data-indent", "true");

  rerender(
    <Disclosure title="Pins" indent={false} defaultExpanded>
      <p>Item</p>
    </Disclosure>,
  );
  expect(screen.getByText("Item").parentElement).not.toHaveAttribute("data-indent");
});
