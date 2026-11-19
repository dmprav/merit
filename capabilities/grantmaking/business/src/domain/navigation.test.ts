import { expect, it } from "vite-plus/test";

import {
  reorderNavigationPins,
  sameNavigationSection,
  sameNavigationTarget,
  type NavigationPin,
} from "./navigation";

const pins: NavigationPin[] = ["first", "second", "third"].map((id) => ({
  target: { kind: "round", id },
  title: id,
  context: null,
  workspaceSlug: "alder",
}));
const first = pins[0]!;
const second = pins[1]!;
const third = pins[2]!;
const otherWorkspace: NavigationPin = {
  ...first,
  workspaceSlug: "birch",
  target: { kind: "round", id: "birch" },
};
const application: NavigationPin = {
  ...first,
  target: { kind: "application", id: "application" },
};
const mixed = [...pins, otherWorkspace, application];

it("moves a pin before the named neighbour within its type and workspace", () => {
  expect(reorderNavigationPins(mixed, third.target, first.target)).toEqual([third, first, second]);
});

it("moves a pin to the end of its section when no neighbour is named", () => {
  expect(reorderNavigationPins(mixed, first.target, null)).toEqual([second, third, first]);
});

it.each([
  ["another workspace", otherWorkspace],
  ["another type", application],
])("rejects a neighbour from %s", (_, neighbour) => {
  expect(reorderNavigationPins(mixed, first.target, neighbour.target)).toBeNull();
});

it("leaves the saved pins unchanged", () => {
  reorderNavigationPins(mixed, third.target, first.target);

  expect(mixed).toEqual([...pins, otherWorkspace, application]);
});

it("gives the same order when a reorder is retried", () => {
  const reordered = reorderNavigationPins(pins, third.target, first.target)!;

  expect(reorderNavigationPins(reordered, third.target, first.target)).toEqual(reordered);
});

it("keeps the order when a pin is moved before itself", () => {
  expect(reorderNavigationPins(pins, first.target, first.target)).toEqual(pins);
});

it("rejects moving a pin that is not saved", () => {
  expect(reorderNavigationPins(pins, { kind: "round", id: "gone" }, null)).toBeNull();
});

it("rejects a neighbour that is not saved", () => {
  expect(reorderNavigationPins(pins, first.target, { kind: "round", id: "gone" })).toBeNull();
});

it("distinguishes targets of different kinds with the same ID", () => {
  expect(sameNavigationTarget(first.target, { ...first.target, kind: "application" })).toBe(false);
});

it("separates workspace pins from pins without a workspace", () => {
  expect(sameNavigationSection(first, { ...first, workspaceSlug: null })).toBe(false);
});
