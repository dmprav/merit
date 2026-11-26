import type { FocusStopFailure } from "../results.ts";
import { detectFocusVisualChange, type FocusVisualSnapshot } from "./style-diff.ts";

/** A Tab stop as traversal observed it: focused, then after focus moved on, then with none. */
export type CapturedStop = {
  index: number;
  element: string;
  boundingBox: { width: number; height: number };
  /** False when the control or an ancestor has `opacity: 0`, so no focus cue on it can paint. */
  painted: boolean;
  focused: FocusVisualSnapshot;
  /** Captured after Tab moves on, so the next stop may have focus. */
  unfocused?: FocusVisualSnapshot;
  /** Captured once traversal ends and no element has focus. */
  cleanUnfocused?: FocusVisualSnapshot;
};

export const NOT_PAINTED_REASON = "not painted: the control or an ancestor has opacity 0";

export const NO_BASELINE_REASON =
  "no unfocused baseline: the control left the document after losing focus, so its focus indicator could not be compared";

export const NO_INDICATOR_REASON = "no visible focus indicator change compared to unfocused state";

const sizeReasons = ({ boundingBox: { width, height } }: CapturedStop): string[] =>
  width <= 0 || height <= 0 ? [`zero-sized bounding box (${width}x${height})`] : [];

const paintReasons = (stop: CapturedStop): string[] => (stop.painted ? [] : [NOT_PAINTED_REASON]);

/** The focus cue must differ from every unfocused baseline the traversal could capture. */
const indicatorReasons = (stop: CapturedStop): string[] => {
  const baselines = [stop.unfocused, stop.cleanUnfocused].filter(
    (baseline): baseline is FocusVisualSnapshot => baseline !== undefined,
  );
  // Both baselines are skipped only for a control that left the document, and its focused
  // styles alone cannot show that they differ from its unfocused state.
  if (baselines.length === 0) {
    return [NO_BASELINE_REASON];
  }
  const unchanged = baselines.some(
    (baseline) => !detectFocusVisualChange(baseline, stop.focused).changed,
  );
  return unchanged ? [NO_INDICATOR_REASON] : [];
};

/** Judges each captured stop, returning a failure for every stop a keyboard user cannot see. */
export const judgeStops = (stops: readonly CapturedStop[]): FocusStopFailure[] =>
  stops.flatMap((stop) => {
    const reasons = [...sizeReasons(stop), ...paintReasons(stop), ...indicatorReasons(stop)];
    return reasons.length === 0
      ? []
      : [{ stopIndex: stop.index, element: stop.element, reasons, boundingBox: stop.boundingBox }];
  });
