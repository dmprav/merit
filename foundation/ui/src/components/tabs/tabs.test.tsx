import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vite-plus/test";

import { Tabs } from "./tabs";

it("shows the requested initial tab and its panel", () => {
  render(
    <Tabs
      label="Application sections"
      scrollBackwardLabel="Scroll to earlier tabs"
      scrollForwardLabel="Scroll to later tabs"
      defaultSelectedKey="reviews"
      items={[
        { id: "evidence", label: "Evidence", content: <p>Application evidence.</p> },
        { id: "reviews", label: "Reviews", content: <p>Reviewer assessments.</p> },
      ]}
    />,
  );

  expect(screen.getByRole("tab", { name: "Reviews" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tab", { name: "Evidence" })).toHaveAttribute("aria-selected", "false");
  expect(screen.getByRole("tabpanel", { name: "Reviews" })).toHaveTextContent(
    "Reviewer assessments.",
  );
  expect(screen.queryByRole("tabpanel", { name: "Evidence" })).not.toBeInTheDocument();
});

it("keeps zero and updated counts in the tab and panel names", () => {
  const view = (count: number) => (
    <Tabs
      label="Team sections"
      scrollBackwardLabel="Scroll to earlier tabs"
      scrollForwardLabel="Scroll to later tabs"
      items={[
        { id: "members", label: "Members", count, content: <p>Team members.</p> },
        { id: "settings", label: "Settings", content: <p>Team settings.</p> },
      ]}
    />
  );

  const { rerender } = render(view(12));

  expect(screen.getByRole("tab", { name: "Members 12" })).toHaveAttribute("aria-selected", "true");

  rerender(view(0));

  expect(screen.getByRole("tab", { name: "Members 0" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tabpanel", { name: "Members 0" })).toHaveTextContent("Team members.");
  expect(screen.getByRole("tab", { name: "Settings" })).toBeVisible();
  expect(screen.queryByRole("tab", { name: "Members 12" })).not.toBeInTheDocument();
});

it("preserves each panel's scroll position across externally controlled tab changes", () => {
  const view = (selectedKey: "evidence" | "reviews") => (
    <Tabs
      label="Application sections"
      scrollBackwardLabel="Scroll to earlier tabs"
      scrollForwardLabel="Scroll to later tabs"
      scrollPanels
      selectedKey={selectedKey}
      items={[
        { id: "evidence", label: "Evidence", content: <p>Application evidence.</p> },
        { id: "reviews", label: "Reviews", content: <p>Reviewer assessments.</p> },
      ]}
    />
  );

  const { rerender } = render(view("evidence"));
  fireEvent.scroll(screen.getByRole("tabpanel", { name: "Evidence" }), {
    target: { scrollTop: 120 },
  });

  rerender(view("reviews"));

  expect(screen.getByRole("tab", { name: "Reviews" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tabpanel", { name: "Reviews" }).scrollTop).toBe(0);

  fireEvent.scroll(screen.getByRole("tabpanel", { name: "Reviews" }), {
    target: { scrollTop: 40 },
  });
  rerender(view("evidence"));

  expect(screen.getByRole("tabpanel", { name: "Evidence" }).scrollTop).toBe(120);

  rerender(view("reviews"));

  expect(screen.getByRole("tabpanel", { name: "Reviews" }).scrollTop).toBe(40);
});
