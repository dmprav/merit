import { describe, expect, test } from "vite-plus/test";

import { buildCapabilitySymmetry } from "./telemetry.ts";

describe("capability symmetry", () => {
  test("counts production files per capability layer", () => {
    expect(
      buildCapabilitySymmetry([
        "capabilities/rounds/business/src/domain/round.ts",
        "capabilities/rounds/business/src/domain/round.test.ts",
        "capabilities/rounds/business/src/server/service.ts",
        "capabilities/rounds/ai/src/tools.ts",
        "capabilities/reviews/web/src/views/list.tsx",
        "capabilities/reviews/README.md",
        "foundation/ui/src/button.tsx",
      ]),
    ).toEqual([
      { capability: "reviews", domain: 0, server: 0, web: 1, ai: 0 },
      { capability: "rounds", domain: 1, server: 1, web: 0, ai: 1 },
    ]);
  });

  test("lists a capability whose production files sit outside the counted layers", () => {
    expect(buildCapabilitySymmetry(["capabilities/audit/business/src/index.ts"])).toEqual([
      { capability: "audit", domain: 0, server: 0, web: 0, ai: 0 },
    ]);
  });
});
