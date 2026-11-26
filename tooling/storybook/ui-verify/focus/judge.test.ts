import { describe, expect, it } from "vite-plus/test";

import {
  judgeStops,
  NO_BASELINE_REASON,
  NO_INDICATOR_REASON,
  NOT_PAINTED_REASON,
  type CapturedStop,
} from "./judge.ts";
import { baseSnapshot, baseStyle, outlinedSnapshot } from "./snapshot.fixtures.ts";

/** A visible stop whose outline appears on focus, against both baselines. */
const visibleStop = (overrides: Partial<CapturedStop> = {}): CapturedStop => ({
  index: 0,
  element: 'button "Save"',
  boundingBox: { width: 80, height: 32 },
  painted: true,
  focused: outlinedSnapshot(),
  unfocused: baseSnapshot(),
  cleanUnfocused: baseSnapshot(),
  ...overrides,
});

describe("judgeStops", () => {
  it("passes a painted, sized stop whose indicator differs from both baselines", () => {
    expect(judgeStops([visibleStop()])).toEqual([]);
  });

  it("passes a stop with only one baseline when its indicator differs from it", () => {
    expect(judgeStops([visibleStop({ cleanUnfocused: undefined })])).toEqual([]);
    expect(judgeStops([visibleStop({ unfocused: undefined })])).toEqual([]);
  });

  it("fails a zero-sized stop, reporting its size and bounding box", () => {
    expect(judgeStops([visibleStop({ boundingBox: { width: 0, height: 0 } })])).toEqual([
      {
        stopIndex: 0,
        element: 'button "Save"',
        reasons: ["zero-sized bounding box (0x0)"],
        boundingBox: { width: 0, height: 0 },
      },
    ]);
  });

  it("fails a stop that cannot paint", () => {
    expect(judgeStops([visibleStop({ painted: false })])[0]?.reasons).toEqual([NOT_PAINTED_REASON]);
  });

  it("fails a stop without any baseline instead of trusting its focused styles", () => {
    const stop = visibleStop({ unfocused: undefined, cleanUnfocused: undefined });
    expect(judgeStops([stop])[0]?.reasons).toEqual([NO_BASELINE_REASON]);
  });

  it("fails a stop whose focused styles match its baseline after Tab", () => {
    expect(judgeStops([visibleStop({ unfocused: outlinedSnapshot() })])[0]?.reasons).toEqual([
      NO_INDICATOR_REASON,
    ]);
  });

  it("fails a stop whose indicator matches its baseline with nothing focused, as a neighbor's focus rule can", () => {
    expect(judgeStops([visibleStop({ cleanUnfocused: outlinedSnapshot() })])[0]?.reasons).toEqual([
      NO_INDICATOR_REASON,
    ]);
  });

  it("reports every reason a stop fails, in order", () => {
    const stop = visibleStop({
      boundingBox: { width: 0, height: 12 },
      painted: false,
      focused: baseSnapshot({ self: baseStyle() }),
    });
    expect(judgeStops([stop])[0]?.reasons).toEqual([
      "zero-sized bounding box (0x12)",
      NOT_PAINTED_REASON,
      NO_INDICATOR_REASON,
    ]);
  });

  it("reports only the failing stops, by their traversal index", () => {
    const failures = judgeStops([
      visibleStop({ index: 0 }),
      visibleStop({ index: 1, element: 'a "Help"', painted: false }),
      visibleStop({ index: 2 }),
    ]);
    expect(failures.map((failure) => [failure.stopIndex, failure.element])).toEqual([
      [1, 'a "Help"'],
    ]);
  });
});
