import { expect, it } from "vite-plus/test";

import { evalCases } from "./registry.ts";
import { selectCases } from "./select";

it("selects the whole inventory by default, including held-out cases", () => {
  expect(selectCases({})).toEqual(evalCases);
});

it("includes cases that must avoid a changed tool and intersects filters", () => {
  const selected = selectCases({
    workflow: ["manager-reviews"],
    tool: ["invite_reviewer"],
    case: ["compose-invite", "arrange-review", "all-rounds"],
  });
  expect(selected.map(({ id }) => id)).toEqual(["compose-invite", "arrange-review"]);
});

it("rejects unknown selectors and empty intersections", () => {
  expect(() => selectCases({ tool: ["invite"] })).toThrow("Unknown tool");
  expect(() => selectCases({ case: ["compose-invite"], workflow: ["contacts"] })).toThrow(
    "No scenarios",
  );
});

it("includes the existing demo budget lookup when filtering by the optional resume tool", () => {
  expect(selectCases({ tool: ["start_demo"] }).map((item) => item.id)).toEqual([
    "resume-demo",
    "demo-to-round",
  ]);
});
