import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MouseEvent } from "react";
import { expect, it, vi } from "vite-plus/test";

import { ActionMenu } from "./action-menu";

const ContextMenuLink = ({
  onAction = vi.fn(),
  onClick,
}: {
  onAction?: () => void;
  onClick?: (event: MouseEvent) => void;
}) => (
  <ActionMenu
    label="Pin actions"
    activation="contextMenu"
    tooltip="Round, Workspace"
    trigger={
      <a href="/round" onClick={onClick}>
        Round
      </a>
    }
    items={[{ id: "up", label: "Move up" }]}
    onAction={onAction}
  />
);

it("keeps a plain click on a context-menu trigger as link navigation", async () => {
  const user = userEvent.setup();
  const navigate = vi.fn((event: MouseEvent) => event.preventDefault());
  render(<ContextMenuLink onClick={navigate} />);

  await user.click(screen.getByRole("link", { name: "Round" }));

  expect(navigate).toHaveBeenCalledOnce();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

it("cancels a context menu with Escape without an action and restores link focus", async () => {
  const user = userEvent.setup();
  const action = vi.fn();
  render(<ContextMenuLink onAction={action} />);
  const link = screen.getByRole("link", { name: "Round" });
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

it("moves focus into a context menu opened after a virtual focus event", async () => {
  const user = userEvent.setup();
  render(<ContextMenuLink />);
  const link = screen.getByRole("link", { name: "Round" });
  link.focus();
  // Simulate native/CDP focus without prior pointer/keyboard modality.
  window.dispatchEvent(new FocusEvent("focus", { bubbles: false }));
  fireEvent.contextMenu(link);

  const menu = await screen.findByRole("menu");
  const container = menu.closest('[role="dialog"]') ?? menu;
  await waitFor(() => expect(container.contains(document.activeElement)).toBe(true));

  await user.keyboard("{Escape}");
  await waitFor(() => expect(link).toHaveFocus());
});
