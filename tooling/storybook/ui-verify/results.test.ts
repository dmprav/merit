import { describe, expect, it } from "vite-plus/test";

import { auditedRoute, erroredRoute, focusFailure } from "./results.fixtures.ts";
import { describeFocus, describeIncompleteTraversal, summarizeResults } from "./results.ts";

const summarize = (targets: Parameters<typeof summarizeResults>[0]["targets"]) =>
  summarizeResults({ mode: "app", appMode: "demo", updated: false, outDir: "/tmp/out", targets });

describe("describeIncompleteTraversal", () => {
  it("describes nothing for a complete traversal", () => {
    expect(
      describeIncompleteTraversal({ stopsChecked: 3, traversal: { complete: true }, failures: [] }),
    ).toBeUndefined();
  });

  it("names the stop cap a traversal reached", () => {
    expect(
      describeIncompleteTraversal({
        stopsChecked: 3,
        traversal: { complete: false, reason: "cap" },
        failures: [],
      }),
    ).toBe("Incomplete: >3 stops");
  });

  it("explains a traversal that entered a cross-origin frame", () => {
    expect(
      describeIncompleteTraversal({
        stopsChecked: 1,
        traversal: { complete: false, reason: "opaqueFrame" },
        failures: [],
      }),
    ).toBe("Incomplete: focus entered a cross-origin frame whose controls cannot be inspected");
  });

  it("explains a traversal whose page replaced its document", () => {
    expect(
      describeIncompleteTraversal({
        stopsChecked: 1,
        traversal: { complete: false, reason: "trackerLost" },
        failures: [],
      }),
    ).toBe("Incomplete: the page navigated to a new document during focus traversal");
  });
});

describe("describeFocus", () => {
  it("passes with the number of stops checked", () => {
    expect(describeFocus({ stopsChecked: 4, traversal: { complete: true }, failures: [] })).toEqual(
      { verdict: "OK", label: "4" },
    );
  });

  it("fails with the failed stops out of those checked", () => {
    expect(
      describeFocus({
        stopsChecked: 4,
        traversal: { complete: true },
        failures: [focusFailure(1)],
      }),
    ).toEqual({ verdict: "FAIL", label: "1/4" });
  });

  it("fails an incomplete traversal with its reason", () => {
    expect(
      describeFocus({
        stopsChecked: 3,
        traversal: { complete: false, reason: "cap" },
        failures: [],
      }),
    ).toEqual({ verdict: "FAIL", label: "Incomplete: >3 stops" });
  });

  it("reports both failed stops and an incomplete traversal", () => {
    expect(
      describeFocus({
        stopsChecked: 3,
        traversal: { complete: false, reason: "cap" },
        failures: [focusFailure(0), focusFailure(2)],
      }),
    ).toEqual({ verdict: "FAIL", label: "2/3; Incomplete: >3 stops" });
  });
});

describe("summarizeResults", () => {
  it("passes a run whose targets all passed", () => {
    const results = summarize([auditedRoute("/demo"), auditedRoute("/docs")]);
    expect(results.passed).toBe(true);
    expect(results.summary).toEqual({
      total: 2,
      passed: 2,
      failed: 0,
      axeViolations: 0,
      overflowFailures: 0,
      browserErrors: 0,
      focusFailures: 0,
    });
  });

  it("fails a run that checked no targets", () => {
    expect(summarize([]).passed).toBe(false);
  });

  it("fails a run with an error even when its targets passed", () => {
    const results = summarizeResults({
      mode: "app",
      updated: false,
      outDir: "/tmp/out",
      targets: [auditedRoute("/demo")],
      error: "App server exited early",
    });
    expect(results.passed).toBe(false);
    expect(results.error).toBe("App server exited early");
  });

  it("counts each failed focus stop and an incomplete traversal as focus failures", () => {
    const results = summarize([
      auditedRoute("/demo", {
        passed: false,
        focus: {
          stopsChecked: 3,
          traversal: { complete: false, reason: "cap" },
          failures: [focusFailure(0), focusFailure(1)],
        },
      }),
    ]);
    expect(results.summary.focusFailures).toBe(3);
  });

  it("counts an errored target as failed without audit findings, keeping its browser errors", () => {
    const errored = {
      ...erroredRoute("/missing", "HTTP 404"),
      browserErrors: [{ type: "console" as const, message: "Failed to load", url: "" }],
    };
    const results = summarize([auditedRoute("/demo"), errored]);
    expect(results.summary).toEqual({
      total: 2,
      passed: 1,
      failed: 1,
      axeViolations: 0,
      overflowFailures: 0,
      browserErrors: 1,
      focusFailures: 0,
    });
    expect(results.targets[1]).toEqual(errored);
  });

  it("passes a container run by the container's exit code", () => {
    const run = (containerExitCode: number) =>
      summarizeResults({
        mode: "container",
        updated: false,
        outDir: "/tmp/out",
        targets: [],
        containerExitCode,
      }).passed;

    expect(run(0)).toBe(true);
    expect(run(1)).toBe(false);
  });
});
