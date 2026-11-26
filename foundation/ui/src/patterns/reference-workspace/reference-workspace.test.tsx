import { act, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { createPortal } from "react-dom";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import {
  ReferencePane,
  ReferenceWorkspace,
  WorkPane,
  useReferenceViewport,
  useReadingNavigation,
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

it("shows a header bar on every pane, with the label as the work pane's title when none is given", () => {
  render(
    <ReferenceWorkspace>
      <ReferencePane label="Reference" toolbar={<span>Switcher</span>}>
        <p>Reading</p>
      </ReferencePane>
      <WorkPane label="Your assessment" footer={<button>Save</button>}>
        <p>Working</p>
      </WorkPane>
    </ReferenceWorkspace>,
  );
  const work = screen.getByRole("complementary", { name: "Your assessment" });
  const bar = work.querySelector("[data-dialog-header]");

  expect(bar).toContainElement(screen.getByRole("heading", { name: "Your assessment", level: 2 }));
  expect(screen.getByText("Switcher").closest("[data-dialog-header]")).not.toBeNull();
  // The footer is the frame's, below the one scrolling body.
  expect(work.querySelectorAll("[data-frame-body]")).toHaveLength(1);
  expect(
    screen.getByRole("button", { name: "Save" }).closest("[data-frame-footer]"),
  ).not.toBeNull();
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

const ReadingList = () => {
  const trigger = useRef<HTMLButtonElement>(null);
  const { destination: detail, root, heading, open, back } = useReadingNavigation<true>();
  return (
    <section ref={root}>
      {detail ? (
        <>
          <h2 ref={heading} tabIndex={-1}>
            Item details
          </h2>
          <button onClick={back}>Back to list</button>
        </>
      ) : (
        <button
          ref={trigger}
          onClick={() => {
            open(true, () => trigger.current);
          }}
        >
          Inspect item
        </button>
      )}
    </section>
  );
};

const ReadingWorkspace = () => {
  const { destination, root, heading, open, back, reset } = useReadingNavigation<string>();
  const first = useRef<HTMLButtonElement>(null);
  const second = useRef<HTMLButtonElement>(null);
  return (
    <ReferenceWorkspace>
      <ReferencePane label="Reference">
        <section ref={root}>
          {destination ? (
            <>
              <h2 ref={heading} tabIndex={-1}>
                {destination}
              </h2>
              <button onClick={back}>Back</button>
              <button onClick={() => open("Criteria", () => null)}>Inspect criteria</button>
            </>
          ) : (
            <p>All assessments</p>
          )}
        </section>
      </ReferencePane>
      <WorkPane label="Overview">
        <button ref={first} onClick={() => reset("First assessment", () => first.current)}>
          First
        </button>
        <button ref={second} onClick={() => reset("Second assessment", () => second.current)}>
          Second
        </button>
        <button onClick={() => reset()}>Show all</button>
      </WorkPane>
    </ReferenceWorkspace>
  );
};

it("replaces a nested visit from the overview and restores the physical pane when navigation lives above it", () => {
  render(<ReadingWorkspace />);
  const viewport = screen.getByRole("group", { name: "Reference" });
  act(() => screen.getByRole("button", { name: "First" }).click());
  act(() => screen.getByRole("button", { name: "Inspect criteria" }).click());
  viewport.scrollTop = 240;
  act(() => screen.getByRole("button", { name: "Second" }).click());
  expect(screen.getByRole("heading", { name: "Second assessment" })).toHaveFocus();
  viewport.scrollTop = 0;
  act(() => screen.getByRole("button", { name: "Back" }).click());
  expect(screen.getByText("All assessments")).toBeVisible();
  expect(viewport.scrollTop).toBe(240);
  expect(screen.getByRole("button", { name: "Second" })).toHaveFocus();
  act(() => screen.getByRole("button", { name: "First" }).click());
  act(() => screen.getByRole("button", { name: "Show all" }).click());
  expect(screen.getByText("All assessments")).toBeVisible();
});

it("restores the owning pane after an internal detail visit and retains trigger focus", () => {
  render(
    <ReferenceWorkspace>
      <ReferencePane label="Reference">
        <ReadingList />
      </ReferencePane>
    </ReferenceWorkspace>,
  );
  const viewport = screen.getByRole("group", { name: "Reference" });
  viewport.scrollTop = 360;
  act(() => screen.getByRole("button", { name: "Inspect item" }).click());
  viewport.scrollTop = 20;
  act(() => screen.getByRole("button", { name: "Back to list" }).click());
  expect(viewport.scrollTop).toBe(360);
  expect(screen.getByRole("button", { name: "Inspect item" })).toHaveFocus();
});

it("restores document position for stacked panes", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  vi.stubGlobal("scrollY", 640);
  vi.stubGlobal("scrollTo", vi.fn());
  render(
    <ReferenceWorkspace>
      <ReferencePane label="Reference">
        <ReadingList />
      </ReferencePane>
    </ReferenceWorkspace>,
  );
  act(() => screen.getByRole("button", { name: "Inspect item" }).click());
  vi.stubGlobal("scrollY", 20);
  act(() => screen.getByRole("button", { name: "Back to list" }).click());
  expect(window.scrollTo).toHaveBeenCalledWith({ top: 640, left: 0, behavior: "instant" });
});

it("uses a portaled dialog's physical scroll owner instead of its inherited reference pane", () => {
  const dialog = document.createElement("div");
  dialog.style.overflowY = "auto";
  document.body.append(dialog);
  const view = render(
    <ReferenceWorkspace>
      <ReferencePane label="Reference">{createPortal(<ReadingList />, dialog)}</ReferencePane>
    </ReferenceWorkspace>,
  );
  const viewport = screen.getByRole("group", { name: "Reference" });
  viewport.scrollTop = 300;
  dialog.scrollTop = 180;
  act(() => screen.getByRole("button", { name: "Inspect item" }).click());
  dialog.scrollTop = 0;
  act(() => screen.getByRole("button", { name: "Back to list" }).click());
  expect(dialog.scrollTop).toBe(180);
  expect(viewport.scrollTop).toBe(300);
  view.unmount();
  dialog.remove();
});
