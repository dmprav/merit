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

  await user.click(trigger);

  expect(trigger).toHaveAttribute("aria-expanded", "true");
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

  await user.click(trigger);

  expect(onExpandedChange).toHaveBeenCalledWith(false);
  expect(trigger).toHaveAttribute("aria-expanded", "true");

  rerender(
    <Disclosure title="Working" isExpanded={false} onExpandedChange={onExpandedChange}>
      <p>Read 2 submissions</p>
    </Disclosure>,
  );

  expect(trigger).toHaveAttribute("aria-expanded", "false");
});
