import { describe, expect, test } from "vite-plus/test";

import {
  buildTrackedPathsIndex,
  extractLatestTrustedRejectionReason,
  trackedByForPaths,
} from "./tracked-issues.ts";

const proposalBody = (paths: readonly string[]) =>
  `<!-- merit-proposal: ${JSON.stringify({ kind: "design", lens: "architecture", paths })} -->`;

const trackedPaths = buildTrackedPathsIndex([
  {
    number: 240,
    body: proposalBody([
      "capabilities/reviews/web/src/views/reviews/editable-review-work.tsx",
      "./app/src/router.tsx",
    ]),
  },
  { number: 242, body: proposalBody(["capabilities/*/web/src/views/**"]) },
  { number: 243, body: proposalBody(["app/src"]) },
  { number: 244, body: "No proposal marker." },
  { number: 245 },
]);

describe("tracked proposal paths", () => {
  test("indexes normalized marker paths by issue and skips issues without a marker", () => {
    expect(trackedPaths).toEqual(
      new Map([
        ["capabilities/reviews/web/src/views/reviews/editable-review-work.tsx", [240]],
        ["app/src/router.tsx", [240]],
        ["capabilities/*/web/src/views/**", [242]],
        ["app/src", [243]],
      ]),
    );
  });

  test("matches exact paths and glob markers", () => {
    expect(
      trackedByForPaths(
        ["capabilities/reviews/web/src/views/reviews/editable-review-work.tsx"],
        trackedPaths,
      ),
    ).toEqual([240, 242]);
  });

  test("matches files under a directory marker", () => {
    expect(trackedByForPaths(["app/src/router.tsx"], trackedPaths)).toEqual([240, 243]);
    expect(trackedByForPaths(["app/srcx/router.tsx"], trackedPaths)).toEqual([]);
  });
});

describe("wontfix rejection reasons", () => {
  test("uses the latest trusted maintainer comment", () => {
    expect(
      extractLatestTrustedRejectionReason([
        { authorAssociation: "OWNER", body: "Keep cents only, block >2 decimals on input." },
        { authorAssociation: "NONE", body: "Untrusted follow-up ignored." },
      ]),
    ).toBe("Keep cents only, block >2 decimals on input.");
  });

  test("strips HTML comments and collapses whitespace", () => {
    expect(
      extractLatestTrustedRejectionReason([
        { authorAssociation: "MEMBER", body: "Out of scope.\n\n<!-- bot -->  Revisit later." },
        { authorAssociation: "OWNER", body: "<!-- only a marker -->" },
      ]),
    ).toBe("Out of scope. Revisit later.");
  });

  test("truncates long reasons to 200 characters", () => {
    const reason = extractLatestTrustedRejectionReason([
      { authorAssociation: "OWNER", body: "x".repeat(250) },
    ]);
    expect(reason).toBe(`${"x".repeat(197)}...`);
  });

  test("returns nothing without a trusted comment", () => {
    expect(extractLatestTrustedRejectionReason(undefined)).toBeUndefined();
    expect(
      extractLatestTrustedRejectionReason([{ authorAssociation: "NONE", body: "Drive-by." }]),
    ).toBeUndefined();
  });
});
