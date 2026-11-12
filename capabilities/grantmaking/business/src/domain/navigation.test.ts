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

it("moves only within the chosen type and workspace, without mutating saved pins", () => {
  const otherWorkspace = {
    ...first,
    workspaceSlug: "birch",
    target: { kind: "round" as const, id: "birch" },
  };
  const application = { ...first, target: { kind: "application" as const, id: "application" } };
  const mixed = [...pins, otherWorkspace, application];
  expect(reorderNavigationPins(mixed, third.target, first.target)).toEqual([third, first, second]);
  expect(reorderNavigationPins(mixed, first.target, null)).toEqual([second, third, first]);
  expect(reorderNavigationPins(mixed, first.target, otherWorkspace.target)).toBeNull();
  expect(reorderNavigationPins(mixed, first.target, application.target)).toBeNull();
  expect(mixed).toEqual([...pins, otherWorkspace, application]);
});

it("makes reordering idempotent and rejects missing targets", () => {
  const reordered = reorderNavigationPins(pins, third.target, first.target)!;
  expect(reorderNavigationPins(reordered, third.target, first.target)).toEqual(reordered);
  expect(reorderNavigationPins(pins, first.target, first.target)).toEqual(pins);
  expect(reorderNavigationPins(pins, { kind: "round", id: "gone" }, null)).toBeNull();
  expect(reorderNavigationPins(pins, first.target, { kind: "round", id: "gone" })).toBeNull();
  expect(sameNavigationTarget(first.target, { ...first.target, kind: "application" })).toBe(false);
  expect(sameNavigationSection(first, { ...first, workspaceSlug: null })).toBe(false);
});
