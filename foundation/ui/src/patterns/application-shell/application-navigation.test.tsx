import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MouseEvent } from "react";
import { expect, it, vi } from "vite-plus/test";

import { Button } from "../../components/button/button";
import { ApplicationNavigationList, ApplicationNavigationRow } from "./application-navigation";

const dataTransfer = () => ({
  clearData: vi.fn(),
  setData: vi.fn(),
  effectAllowed: "",
  dropEffect: "",
});

const renderLists = (onClick?: (event: MouseEvent) => void) => {
  const move = vi.fn();
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
              <a href={`#${list}-${id}`} onClick={onClick}>
                {list} {id}
              </a>
            </ApplicationNavigationRow>
          ))}
        </ApplicationNavigationList>
      ))}
    </>,
  );
  return { move };
};

it("ignores a drop that did not start from a row in this list", () => {
  const { move } = renderLists();
  const transfer = dataTransfer();

  fireEvent.drop(screen.getByRole("link", { name: "first a" }), { dataTransfer: transfer });
  fireEvent.dragStart(screen.getByRole("link", { name: "first a" }), { dataTransfer: transfer });
  fireEvent.dragOver(screen.getByRole("link", { name: "second b" }), { dataTransfer: transfer });
  fireEvent.drop(screen.getByRole("link", { name: "second b" }), { dataTransfer: transfer });

  expect(move).not.toHaveBeenCalled();
});

it("does not move a row after its drag is cancelled", () => {
  const { move } = renderLists();
  const transfer = dataTransfer();
  const first = screen.getByRole("link", { name: "first a" });
  const second = screen.getByRole("link", { name: "first b" });

  fireEvent.dragStart(first, { dataTransfer: transfer });
  fireEvent.dragOver(second, { dataTransfer: transfer });
  fireEvent.dragEnd(first);
  fireEvent.drop(second, { dataTransfer: transfer });

  expect(move).not.toHaveBeenCalled();
});

it("does not start reordering from a row's action", () => {
  const { move } = renderLists();
  const transfer = dataTransfer();
  const second = screen.getByRole("link", { name: "first b" });

  fireEvent.dragStart(screen.getByRole("button", { name: "Unpin first a" }), {
    dataTransfer: transfer,
  });
  fireEvent.dragOver(second, { dataTransfer: transfer });
  fireEvent.drop(second, { dataTransfer: transfer });

  expect(move).not.toHaveBeenCalled();
});

it("keeps plain and modified link clicks as navigation", async () => {
  const navigate = vi.fn((event: MouseEvent) => event.preventDefault());
  const user = userEvent.setup();
  renderLists(navigate);
  const first = screen.getByRole("link", { name: "first a" });

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
  const transfer = dataTransfer();
  fireEvent.dragStart(screen.getByRole("link", { name: "a" }), { dataTransfer: transfer });
  fireEvent.dragOver(screen.getByRole("link", { name: "b" }), {
    dataTransfer: transfer,
    clientY: 10,
  });
  fireEvent.drop(screen.getByRole("list"), { dataTransfer: transfer, clientY: 10 });
  expect(move).toHaveBeenCalledWith("a", "b", "after");
});
