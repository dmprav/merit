import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MouseEvent } from "react";
import { expect, it, vi } from "vite-plus/test";

import { ActionMenu } from "./action-menu";

it("preserves real link activation and cancels a context menu without an action", async () => {
  const user = userEvent.setup();
  const action = vi.fn();
  const navigate = vi.fn((event: MouseEvent) => event.preventDefault());
  render(
    <ActionMenu
      label="Pin actions"
      activation="contextMenu"
      tooltip="Round · Workspace"
      trigger={
        <a href="/round" onClick={navigate}>
          Round
        </a>
      }
      items={[{ id: "up", label: "Move up" }]}
      onAction={action}
    />,
  );
  const link = screen.getByRole("link", { name: "Round" });
  await user.click(link);
  expect(navigate).toHaveBeenCalledOnce();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  link.focus();
  fireEvent.contextMenu(link);
  expect(screen.getByRole("menuitem", { name: "Move up" })).toBeVisible();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(link).toHaveFocus());
  expect(action).not.toHaveBeenCalled();
});

it("prevents macOS context-menu Enter from activating the link before the menu opens", async () => {
  const platform = vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
  try {
    render(
      <ActionMenu
        label="Pin actions"
        activation="contextMenu"
        trigger={<a href="/round">Round</a>}
        items={[{ id: "up", label: "Move up" }]}
        onAction={vi.fn()}
      />,
    );
    const link = screen.getByRole("link", { name: "Round" });
    link.focus();
    expect(fireEvent.keyDown(link, { key: "Enter", ctrlKey: true })).toBe(false);
    expect(await screen.findByRole("menuitem", { name: "Move up" })).toBeVisible();
  } finally {
    platform.mockRestore();
  }
});
