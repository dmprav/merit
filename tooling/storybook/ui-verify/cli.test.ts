import { describe, expect, it } from "vite-plus/test";

import { parseUiVerifyArgs } from "./cli.ts";

describe("parseUiVerifyArgs", () => {
  it("applies defaults when invoked with no arguments", () => {
    expect(parseUiVerifyArgs([])).toEqual({
      stories: [],
      routes: [],
      mode: undefined,
      viewport: "both",
      update: false,
      container: false,
      outDir: ".tmp/ui-verify",
      json: false,
      help: false,
    });
  });

  it("parses repeatable, comma-separated, equals-style flags and leading separator", () => {
    expect(
      parseUiVerifyArgs([
        "--",
        "--story",
        "button,dialog",
        "--story=text-field",
        "--route",
        "/demo,/app/alder/rounds",
        "--mode=workspace",
        "--viewport",
        "desktop",
        "--update",
        "--out",
        ".tmp/custom-verify",
        "--json",
      ]),
    ).toEqual({
      stories: ["button", "dialog", "text-field"],
      routes: ["/demo", "/app/alder/rounds"],
      mode: "workspace",
      viewport: "desktop",
      update: true,
      container: false,
      outDir: ".tmp/custom-verify",
      json: true,
      help: false,
    });
  });

  it("splits comma-separated --story patterns", () => {
    expect(parseUiVerifyArgs(["--story", "button, components-*,text-field"]).stories).toEqual([
      "button",
      "components-*",
      "text-field",
    ]);
  });

  it("rejects /regex/ story filters, naming the offending pattern", () => {
    expect(() => parseUiVerifyArgs(["--story", "/Button/i"])).toThrow(
      /\/regex\/ filters are not supported/,
    );
    expect(() => parseUiVerifyArgs(["--story", "dialog,/^components-button/"])).toThrow(
      /Invalid --story "\/\^components-button\/"/,
    );
  });

  it("rejects unknown flags and flags missing their value", () => {
    expect(() => parseUiVerifyArgs(["--unknown"])).toThrow(/Unknown option/);
    expect(() => parseUiVerifyArgs(["--story"])).toThrow(/--story requires a value/);
  });

  it("rejects an unknown --mode", () => {
    expect(() => parseUiVerifyArgs(["--mode", "prod"])).toThrow(/Invalid --mode/);
  });

  it("rejects an unknown --viewport", () => {
    expect(() => parseUiVerifyArgs(["--viewport", "tablet"])).toThrow(/Invalid --viewport/);
  });

  it("rejects routes that do not start with a slash", () => {
    expect(() => parseUiVerifyArgs(["--route", "demo"])).toThrow(/Routes must start with "\/"/);
  });

  it("rejects protocol-relative routes", () => {
    expect(() => parseUiVerifyArgs(["--route", "//evil.test/app"])).toThrow(
      /Protocol-relative routes are not allowed/,
    );
    expect(() => parseUiVerifyArgs(["--route", "/\\evil.test/app"])).toThrow(
      /Protocol-relative routes are not allowed/,
    );
  });

  it("rejects routes containing control characters", () => {
    expect(() => parseUiVerifyArgs(["--route", "/app\nfoo"])).toThrow(/control characters/);
  });

  it("rejects --story values without a pattern", () => {
    expect(() => parseUiVerifyArgs(["--story", ","])).toThrow(/Invalid --story/);
    expect(() => parseUiVerifyArgs(["--story", " , "])).toThrow(/Invalid --story/);
    expect(() => parseUiVerifyArgs(["--story=,"])).toThrow(/Invalid --story/);
    expect(() => parseUiVerifyArgs(["--container", "--update", "--story", " , "])).toThrow(
      /Invalid --story/,
    );
  });

  it("rejects --route values without a route", () => {
    expect(() => parseUiVerifyArgs(["--route", " , "])).toThrow(/Invalid --route/);
  });

  it("rejects --container combined with --route", () => {
    expect(() => parseUiVerifyArgs(["--container", "--route", "/demo"])).toThrow(
      /--container delegates Storybook visual baselines/,
    );
  });
});
