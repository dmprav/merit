export type NavigationTarget = { kind: "round" | "application" | "review"; id: string };

export type NavigationPin = {
  target: NavigationTarget;
  title: string;
  context: string | null;
  workspaceSlug: string | null;
};

export const sameNavigationTarget = (a: NavigationTarget, b: NavigationTarget) =>
  a.kind === b.kind && a.id === b.id;

export const sameNavigationSection = (a: NavigationPin, b: NavigationPin) =>
  a.target.kind === b.target.kind && a.workspaceSlug === b.workspaceSlug;

/** Move before a named neighbour (or to the end), so retrying a command keeps its meaning. */
export const reorderNavigationPins = (
  pins: NavigationPin[],
  target: NavigationTarget,
  before: NavigationTarget | null,
) => {
  const current = pins.find((pin) => sameNavigationTarget(pin.target, target));
  if (!current) {
    return null;
  }
  const section = pins.filter((pin) => sameNavigationSection(pin, current));
  if (before && sameNavigationTarget(before, target)) {
    return section;
  }
  const others = section.filter((pin) => !sameNavigationTarget(pin.target, target));
  const index = before
    ? others.findIndex((pin) => sameNavigationTarget(pin.target, before))
    : others.length;
  if (index < 0) {
    return null;
  }
  return [...others.slice(0, index), current, ...others.slice(index)];
};
