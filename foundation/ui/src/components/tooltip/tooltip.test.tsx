import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import { Button } from "../button/button";
import { PopoverDialog } from "../dialog/dialog";
import { Tooltip } from "./tooltip";

it("describes a focused control, dismisses with Escape, and preserves the action", async () => {
  const user = userEvent.setup();
  const onPress = vi.fn();
  render(
    <Tooltip content="Set the position, proposed allocation, and reasoning.">
      <Button size="medium" onPress={onPress}>
        Edit recommendation
      </Button>
    </Tooltip>,
  );
  const button = screen.getByRole("button", { name: "Edit recommendation" });

  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

  await user.tab();

  expect(button).toHaveFocus();
  expect(await screen.findByRole("tooltip")).toBeVisible();
  expect(button).toHaveAccessibleDescription(
    "Set the position, proposed allocation, and reasoning.",
  );

  await user.keyboard("{Escape}");

  await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  expect(button).toHaveFocus();

  await user.keyboard("{Enter}");

  expect(onPress).toHaveBeenCalledOnce();
});

it("dismisses an external tooltip when focus enters a popover dialog so Escape closes the dialog", async () => {
  const matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  vi.stubGlobal("matchMedia", matchMedia);
  try {
    const user = userEvent.setup();
    render(
      <div>
        <Tooltip content="External control hint">
          <Button size="medium">External trigger</Button>
        </Tooltip>
        <PopoverDialog
          title="Overflow items"
          closeLabel="Close"
          trigger={<Button size="medium">Open</Button>}
        >
          <p>Inside dialog</p>
        </PopoverDialog>
      </div>,
    );

    const external = screen.getByRole("button", { name: "External trigger" });
    fireEvent.pointerMove(external);
    await user.hover(external);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("External control hint");

    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "Overflow items" });
    await waitFor(() => expect(dialog).toHaveFocus());
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  } finally {
    vi.unstubAllGlobals();
  }
});
