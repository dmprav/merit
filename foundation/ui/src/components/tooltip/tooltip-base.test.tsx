import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { expect, it, vi } from "vite-plus/test";

import { AnchoredTooltipBase } from "./tooltip-base";

const Anchored = ({ isFocused, isHovered }: { isFocused: boolean; isHovered: boolean }) => {
  const anchor = useRef<HTMLSpanElement>(null);
  return (
    <>
      <span ref={anchor}>Reviewer assessments and their recorded…</span>
      <AnchoredTooltipBase
        anchorRef={anchor}
        content="Reviewer assessments and their recorded versions"
        isFocused={isFocused}
        isHovered={isHovered}
      />
    </>
  );
};

it("closes only itself on Escape, leaving a surrounding dialog's Escape handling alone", async () => {
  const dialogEscape = vi.fn();
  document.addEventListener("keydown", dialogEscape);
  render(<Anchored isFocused isHovered={false} />);

  expect(await screen.findByRole("tooltip")).toBeVisible();
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

  await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  expect(dialogEscape).not.toHaveBeenCalled();
  document.removeEventListener("keydown", dialogEscape);
});

it("stays open while the pointer is on it after keyboard focus leaves", async () => {
  const { rerender } = render(<Anchored isFocused isHovered={false} />);
  const tooltip = await screen.findByRole("tooltip");

  fireEvent.pointerEnter(tooltip);
  rerender(<Anchored isFocused={false} isHovered={false} />);

  expect(screen.getByRole("tooltip")).toBeVisible();
});

it("closes when focus enters a dialog that does not hold its anchor, leaving that dialog Escape", async () => {
  const dialogEscape = vi.fn();
  document.addEventListener("keydown", dialogEscape);
  render(
    <>
      <Anchored isFocused={false} isHovered />
      <dialog open aria-label="Filter">
        <button type="button">Status</button>
      </dialog>
    </>,
  );
  const tooltip = await screen.findByRole("tooltip");

  // The pointer stays on the tooltip while keyboard focus moves into an unrelated dialog.
  fireEvent.pointerEnter(tooltip);
  screen.getByRole("button", { name: "Status" }).focus();

  await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  fireEvent.keyDown(screen.getByRole("button", { name: "Status" }), { key: "Escape" });
  expect(dialogEscape).toHaveBeenCalledOnce();
  document.removeEventListener("keydown", dialogEscape);
});
