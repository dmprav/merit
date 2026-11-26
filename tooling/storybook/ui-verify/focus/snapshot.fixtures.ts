import type { ElementStyleSnapshot, FocusVisualSnapshot } from "./style-diff.ts";

/** An unfocused control: a thin gray border on white, no outline, shadow, or decoration. */
export const baseStyle = (overrides: Partial<ElementStyleSnapshot> = {}): ElementStyleSnapshot => ({
  outlineStyle: "none",
  outlineWidth: "0px",
  outlineColor: "rgb(0, 0, 0)",
  outlineOffset: "0px",
  boxShadow: "none",
  borderTopColor: "rgb(200, 200, 200)",
  borderRightColor: "rgb(200, 200, 200)",
  borderBottomColor: "rgb(200, 200, 200)",
  borderLeftColor: "rgb(200, 200, 200)",
  borderTopWidth: "1px",
  borderRightWidth: "1px",
  borderBottomWidth: "1px",
  borderLeftWidth: "1px",
  backgroundColor: "rgb(255, 255, 255)",
  backgroundImage: "none",
  textDecorationLine: "none",
  textDecorationThickness: "auto",
  ...overrides,
});

/** A pseudo-element that paints nothing: no content, border, or background. */
export const pseudoBaseStyle = (
  overrides: Partial<ElementStyleSnapshot> = {},
): ElementStyleSnapshot =>
  baseStyle({
    borderTopWidth: "0px",
    borderRightWidth: "0px",
    borderBottomWidth: "0px",
    borderLeftWidth: "0px",
    borderTopColor: "rgba(0, 0, 0, 0)",
    borderRightColor: "rgba(0, 0, 0, 0)",
    borderBottomColor: "rgba(0, 0, 0, 0)",
    borderLeftColor: "rgba(0, 0, 0, 0)",
    backgroundColor: "rgba(0, 0, 0, 0)",
    backgroundImage: "none",
    content: "none",
    opacity: "1",
    ...overrides,
  });

export const baseSnapshot = (
  overrides: Partial<FocusVisualSnapshot> = {},
): FocusVisualSnapshot => ({
  self: baseStyle(),
  ancestors: [],
  descendants: [],
  ...overrides,
});

/** A control whose focused state draws a visible blue outline. */
export const outlinedSnapshot = (): FocusVisualSnapshot =>
  baseSnapshot({
    self: baseStyle({
      outlineStyle: "solid",
      outlineWidth: "2px",
      outlineColor: "rgb(15, 98, 254)",
    }),
  });
