import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MouseEvent } from "react";
import { expect, it, vi } from "vite-plus/test";

import { Button } from "../../components/button/button";
import { ApplicationNavigationList, ApplicationNavigationRow } from "./application-navigation";

it("rejects external and cross-list drops, cancels without mutation, and preserves link clicks", async () => {
  const move = vi.fn();
  const navigate = vi.fn((event: MouseEvent) => event.preventDefault());
  const user = userEvent.setup();
  render(
    <>
      {["first", "second"].map((list) => (
        <ApplicationNavigationList key={list} onMove={move}>
          {["a", "b"].map((id) => (
            <ApplicationNavigationRow
              key={id}
              reorderKey={id}
              action={
                <Button>
                  Unpin {list} {id}
                </Button>
              }
            >
              <a href={`#${list}-${id}`} onClick={navigate}>
                {list} {id}
              </a>
            </ApplicationNavigationRow>
          ))}
        </ApplicationNavigationList>
      ))}
    </>,
  );
  const first = screen.getByRole("link", { name: "first a" });
  const second = screen.getByRole("link", { name: "first b" });
  const other = screen.getByRole("link", { name: "second b" });
  const dataTransfer = { clearData: vi.fn(), setData: vi.fn(), effectAllowed: "", dropEffect: "" };
  fireEvent.drop(first, { dataTransfer });
  fireEvent.dragStart(first, { dataTransfer });
  fireEvent.dragOver(other, { dataTransfer });
  fireEvent.drop(other, { dataTransfer });
  expect(move).not.toHaveBeenCalled();
  fireEvent.dragEnd(first);
  fireEvent.drop(second, { dataTransfer });
  expect(move).not.toHaveBeenCalled();
  fireEvent.dragStart(screen.getByRole("button", { name: "Unpin first a" }), { dataTransfer });
  fireEvent.drop(second, { dataTransfer });
  expect(move).not.toHaveBeenCalled();
  await user.click(first);
  await user.keyboard("{Control>}");
  await user.click(first);
  await user.keyboard("{/Control}");
  expect(navigate).toHaveBeenCalledTimes(2);
});

it("commits the accepted insertion point when the browser drops on the list container", () => {
  const move = vi.fn();
  render(
    <ApplicationNavigationList onMove={move}>
      {["a", "b"].map((id) => (
        <ApplicationNavigationRow key={id} reorderKey={id} action={null}>
          <a href={`#${id}`}>{id}</a>
        </ApplicationNavigationRow>
      ))}
    </ApplicationNavigationList>,
  );
  const dataTransfer = { clearData: vi.fn(), setData: vi.fn(), effectAllowed: "", dropEffect: "" };
  fireEvent.dragStart(screen.getByRole("link", { name: "a" }), { dataTransfer });
  fireEvent.dragOver(screen.getByRole("link", { name: "b" }), { dataTransfer, clientY: 10 });
  fireEvent.drop(screen.getByRole("list"), { dataTransfer, clientY: 10 });
  expect(move).toHaveBeenCalledWith("a", "b", "after");
});
