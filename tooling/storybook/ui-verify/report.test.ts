import { describe, expect, it } from "vite-plus/test";

import { formatMarkdownReport } from "./report.ts";
import { auditedRoute, erroredRoute, focusFailure } from "./results.fixtures.ts";
import { summarizeResults, type TargetCheckResult } from "./results.ts";

const reportFor = (targets: TargetCheckResult[]) =>
  formatMarkdownReport(
    summarizeResults({
      mode: "app",
      appMode: "workspace",
      updated: false,
      outDir: "/tmp/out",
      generatedAt: "2026-01-01T00:00:00.000Z",
      targets,
    }),
  );

const rowFor = (report: string, name: string) =>
  report.split("\n").find((line) => line.startsWith(`| \`${name}`));

describe("formatMarkdownReport", () => {
  it("escapes pipes in report target names while keeping the original name in results", () => {
    const results = summarizeResults({
      mode: "app",
      appMode: "demo",
      updated: false,
      outDir: "/tmp/out",
      generatedAt: "2026-01-01T00:00:00.000Z",
      targets: [
        auditedRoute("/demo?q=a|b", {
          screenshot: "/tmp/out/screenshots/route-demo-q-a-b-desktop.png",
        }),
      ],
    });

    expect(results.targets[0]?.name).toBe("/demo?q=a|b");
    expect(rowFor(formatMarkdownReport(results), "/demo")).toBe(
      "| `/demo?q=a\\|b` | desktop | PASS | 0 | OK | 0 | OK (1) | `screenshots/route-demo-q-a-b-desktop.png` |",
    );
  });

  it("shows the audited page after a route that redirected on the same origin", () => {
    const report = reportFor([
      auditedRoute("/app/rounds", {
        url: "http://127.0.0.1:1/app/sign-in?redirect=%2Fapp%2Frounds",
      }),
    ]);
    expect(report).toContain(
      "| `/app/rounds` → `/app/sign-in?redirect=%2Fapp%2Frounds` | desktop | PASS |",
    );
  });

  it("shows the full audited URL after a route that redirected to another origin", () => {
    const report = reportFor([
      auditedRoute("/sign-in", {
        url: "https://accounts.example.test/sign-in",
        requestedUrl: "http://127.0.0.1:1/sign-in",
      }),
    ]);
    expect(report).toContain(
      "| `/sign-in` → `https://accounts.example.test/sign-in` | desktop | PASS |",
    );
  });

  it("shows only the route when the audited page is the requested one", () => {
    const report = reportFor([
      auditedRoute("/demo"),
      auditedRoute("/home", { requestedUrl: "http://127.0.0.1:1/home" }),
    ]);
    expect(report).toContain("| `/demo` | desktop | PASS |");
    expect(report).toContain("| `/home` | desktop | PASS |");
  });

  it("reports checks a target never reached as not checked instead of passed or failed", () => {
    const report = reportFor([
      erroredRoute("/missing", 'Route "/missing" returned HTTP 404 at http://127.0.0.1:1/missing.'),
    ]);
    expect(report).toContain(
      "| `/missing` | desktop | FAIL | not checked | not checked | 0 | not checked | — |",
    );
  });

  it("details a target that failed before its checks by its runtime error alone", () => {
    const report = reportFor([erroredRoute("/missing", 'Route "/missing" returned HTTP 404.')]);
    expect(report).toContain('- **Runtime error:** Route "/missing" returned HTTP 404.');
    expect(report).not.toContain("Body visibility");
    expect(report).not.toContain("Dialog visibility");
  });

  it("reports overflow with the page's widths", () => {
    const report = reportFor([
      auditedRoute("/wide", { passed: false, hasHorizontalOverflow: true, scrollWidth: 900 }),
    ]);
    expect(rowFor(report, "/wide")).toContain("| FAIL (900>100) |");
    expect(report).toContain("- **Horizontal overflow:** `scrollWidth=900` > `innerWidth=100`");
  });

  it("reports a traversal that hit the stop cap in its row and failure details", () => {
    const report = reportFor([
      auditedRoute("/long", {
        passed: false,
        focus: { stopsChecked: 3, traversal: { complete: false, reason: "cap" }, failures: [] },
      }),
    ]);
    expect(rowFor(report, "/long")).toContain("| FAIL (Incomplete: >3 stops) |");
    expect(report).toContain(
      "- **Focus traversal incomplete:** Incomplete: >3 stops (keyboard focus traversal hit the 3-stop cap before completing)",
    );
  });

  it("reports why a traversal that stopped short of the cap is incomplete", () => {
    const report = reportFor([
      auditedRoute("/framed", {
        passed: false,
        focus: {
          stopsChecked: 1,
          traversal: { complete: false, reason: "opaqueFrame" },
          failures: [focusFailure(0)],
        },
      }),
    ]);
    expect(rowFor(report, "/framed")).toContain(
      "| FAIL (1/1; Incomplete: focus entered a cross-origin frame whose controls cannot be inspected) |",
    );
    expect(report).toContain(
      "- **Focus traversal incomplete:** Incomplete: focus entered a cross-origin frame whose controls cannot be inspected\n",
    );
    expect(report).toContain(
      '- **Focus stop #0 (button "Action 0"):** no visible focus indicator change compared to unfocused state',
    );
  });

  it("reports only the container delegation for a container run", () => {
    const report = formatMarkdownReport(
      summarizeResults({
        mode: "container",
        updated: true,
        outDir: "/tmp/out",
        generatedAt: "2026-01-01T00:00:00.000Z",
        targets: [],
        containerExitCode: 0,
      }),
    );
    expect(report).toContain(
      "Delegated pixel-exact Linux visual baseline check to `tooling/storybook/run-visual-container.ts` (exit code: `0`).",
    );
    expect(report).not.toContain("## Summary");
    expect(report.endsWith(").\n")).toBe(true);
  });
});
