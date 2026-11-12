import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import {
  ReferencePane,
  ReferenceWorkspace,
  WorkPane,
  useReferenceViewport,
} from "./reference-workspace";

type Reference = "document" | "guidelines";

const Example = () => {
  const { reference, referenceViewport, moveReference } =
    useReferenceViewport<Reference>("document");
  return (
    <ReferenceWorkspace toWorkLabel="Go to notes" toReferenceLabel="Browse reference">
      <ReferencePane label="Reference" viewportRef={referenceViewport}>
        <p>{reference}</p>
      </ReferencePane>
      <WorkPane as="section" label="Notes" title="Notes" footer={<button>Save</button>}>
        <textarea aria-label="Note" />
        <button onClick={() => moveReference("guidelines")}>Show guidelines</button>
        <button onClick={() => moveReference("document", { focusViewport: false })}>
          Show document
        </button>
      </WorkPane>
    </ReferenceWorkspace>
  );
};

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const nextFrame = () =>
  act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });

it("names both panes and links between them for stacked layouts", () => {
  render(<Example />);

  expect(screen.getByRole("group", { name: "Reference" })).toHaveAttribute("tabindex", "0");
  expect(screen.getByRole("region", { name: "Notes" })).toContainElement(
    screen.getByRole("heading", { name: "Notes", level: 2 }),
  );
  const toWork = screen.getByRole("link", { name: "Go to notes" });
  const toReference = screen.getByRole("link", { name: "Browse reference" });
  expect(document.querySelector(toWork.getAttribute("href")!)).toBe(
    screen.getByRole("region", { name: "Notes" }),
  );
  expect(document.querySelector(toReference.getAttribute("href")!)).toContainElement(
    screen.getByRole("group", { name: "Reference" }),
  );
});

it("restores each reference's scroll position and focuses the viewport only when asked", async () => {
  render(<Example />);
  const viewport = screen.getByRole("group", { name: "Reference" });
  const note = screen.getByRole("textbox", { name: "Note" });

  viewport.scrollTop = 240;
  act(() => screen.getByRole("button", { name: "Show guidelines" }).click());
  await nextFrame();
  expect(screen.getByText("guidelines")).toBeInTheDocument();
  expect(viewport.scrollTop).toBe(0);
  expect(viewport).toHaveFocus();

  note.focus();
  act(() => {
    screen
      .getByRole("button", { name: "Show document" })
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await nextFrame();
  expect(viewport.scrollTop).toBe(240);
  expect(note).toHaveFocus();
});

it("requires panes to be placed inside a workspace", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() =>
    render(
      <WorkPane label="Notes">
        <p>Orphaned</p>
      </WorkPane>,
    ),
  ).toThrow("inside ReferenceWorkspace");
});
