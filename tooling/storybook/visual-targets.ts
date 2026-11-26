/**
 * A story captured as a Storybook visual baseline. `tests/browser/visual.spec.ts` registers one
 * test per target, titled `testTitle`, whose screenshot is `<name>.png`; `ui:verify` checks the
 * same stories by default and selects these tests in container mode.
 */
export type VisualTarget = {
  id: string;
  name: string;
  globals?: string;
  /** False when the capture is the viewport alone, such as a fixed overlay over a locked page. */
  fullPage: boolean;
  testTitle: string;
};

export const FOCUS_COMPARISON_STORY_ID = "design-language--focus-comparison";

const focusTarget = (theme: "product" | "site"): VisualTarget => ({
  id: FOCUS_COMPARISON_STORY_ID,
  name: `focus-${theme}`,
  globals: `theme:${theme}`,
  fullPage: true,
  testTitle: `control focus appearance in ${theme}`,
});

const appearanceTarget = (id: string, { fullPage = true } = {}): VisualTarget => ({
  id,
  name: id,
  fullPage,
  testTitle: `appearance: ${id}`,
});

export const VISUAL_TARGETS: readonly VisualTarget[] = [
  focusTarget("product"),
  focusTarget("site"),
  appearanceTarget("components-button--overview"),
  appearanceTarget("patterns-form-dialog--with-context", { fullPage: false }),
  appearanceTarget("patterns-confirmation-dialog--failure"),
  appearanceTarget("components-text-field--states"),
  appearanceTarget("components-data-table--default"),
  appearanceTarget("features-applications-recommendation--resume-editing"),
  appearanceTarget("patterns-application-shell--workspace-switcher"),
  appearanceTarget("patterns-application-shell--workspace-switcher-long-name"),
];
