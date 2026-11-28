import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { REPO_ROOT } from "../paths.ts";
import {
  checkRecordContent,
  checkVerificationRecord,
  extractRecordSections,
  findCiDeferrals,
  isNoneSection,
  parseNameStatusZ,
  parsePrNumber,
  readChangedFiles,
  RECORD_DIRECTORY,
  type ChangedFile,
} from "./verification-record.ts";

const completeRecord = `# Verification record

## Behavioral decisions

- Retries failed deliveries for 15 minutes before marking them failed.

## Checks run

- \`vp run test:ci\`: passed.

## Could not verify

- Live Clerk sign-in: the agent environment has no Clerk credentials.

## Did not verify

None.

## Dismissed review findings

None.
`;

const check = (changedFiles: ChangedFile[], records: Record<string, string> = {}, author = "dev") =>
  checkVerificationRecord({
    prNumber: 42,
    author,
    changedFiles,
    readRecord: (path) => records[path],
  });

/** Commits `files` in a scratch repository and returns the repository and its diff range. */
const scratchDiff = (files: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), "merit-verification-record-"));
  // A git hook running these tests exports GIT_* variables that would point at the outer repository.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
  );
  const config = [
    ["core.hooksPath", "/dev/null"],
    ["commit.gpgsign", "false"],
    ["core.quotePath", "true"],
    ["user.name", "Test"],
    ["user.email", "test@example.test"],
  ].flatMap(([key, value]) => ["-c", `${key}=${value}`]);

  const git = (...args: string[]) =>
    execFileSync("git", [...config, ...args], { cwd: dir, encoding: "utf8", env });

  git("init", "-q", "-b", "main");
  git("commit", "-q", "--allow-empty", "-m", "init");
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  git("add", ".");
  git("commit", "-q", "-m", "change");
  return { dir, range: "HEAD~1...HEAD" };
};

/**
 * Reads the scratch repository's changes as `git` would on any machine: without the GIT_*
 * variables a hook exports for the outer repository, and with paths quoted, as is git's default.
 */
const readScratchChanges = (dir: string, range: string): ChangedFile[] => {
  for (const name of Object.keys(process.env).filter((key) => key.startsWith("GIT_"))) {
    vi.stubEnv(name, undefined);
  }
  vi.stubEnv("GIT_CONFIG_COUNT", "1");
  vi.stubEnv("GIT_CONFIG_KEY_0", "core.quotePath");
  vi.stubEnv("GIT_CONFIG_VALUE_0", "true");
  return readChangedFiles(dir, range);
};

afterEach(() => {
  vi.unstubAllEnvs();
});

const codeChange: ChangedFile = { status: "modified", path: "foundation/ui/src/index.ts" };

describe("verification record", () => {
  test("accepts a pull request that adds its complete record", () => {
    expect(
      check([codeChange, { status: "added", path: "verifications/42.md" }], {
        "verifications/42.md": completeRecord,
      }),
    ).toEqual({ exempt: null, errors: [] });
  });

  test("requires the record named after the pull request", () => {
    const result = check([codeChange]);
    expect(result).toEqual({
      exempt: null,
      errors: [
        "Add verifications/42.md describing how this change was verified. See docs/guides/verification.md#record-verification.",
      ],
    });
  });

  test("rejects adding or changing another pull request's record", () => {
    const result = check([codeChange, { status: "added", path: "verifications/41.md" }]);
    expect(result.exempt).toBeNull();
    expect(result).toMatchObject({
      errors: [
        expect.stringContaining(
          "verifications/41.md: a pull request may add or change only its own record",
        ),
        expect.stringContaining("Add verifications/42.md"),
      ],
    });
  });

  test("does not count a record that the pull request deletes", () => {
    const result = check([codeChange, { status: "deleted", path: "verifications/42.md" }]);
    expect(result).toMatchObject({ errors: [expect.stringContaining("Add verifications/42.md")] });
  });

  test("exempts dependency bots, record cleanup, and empty diffs", () => {
    expect(check([codeChange], {}, "renovate[bot]").exempt).toContain("renovate[bot]");
    expect(check([codeChange], {}, "dependabot[bot]").exempt).toContain("dependabot[bot]");
    expect(
      check([
        { status: "deleted", path: "verifications/40.md" },
        { status: "deleted", path: "verifications/41.md" },
      ]).exempt,
    ).toBe("The pull request only removes verification records.");
    expect(check([]).exempt).toBe("The pull request changes no files.");
  });

  test("still requires a record when cleanup comes with other changes", () => {
    const result = check([codeChange, { status: "deleted", path: "verifications/40.md" }]);
    expect(result).toMatchObject({ exempt: null, errors: [expect.stringContaining("Add")] });
  });

  test("requires every section, in order, with content", () => {
    expect(checkRecordContent("r.md", completeRecord)).toEqual([]);

    const reordered = completeRecord.replace("## Did not verify", "## Lessons");
    expect(checkRecordContent("r.md", reordered)).toEqual([
      expect.stringContaining(
        'Found: "## Behavioral decisions", "## Checks run", "## Could not verify", "## Lessons"',
      ),
    ]);

    const emptySection = completeRecord.replace(
      "None.\n\n## Dismissed",
      "<!-- todo -->\n\n## Dismissed",
    );
    expect(checkRecordContent("r.md", emptySection)).toEqual([
      'r.md: "## Did not verify" is empty; write "None." if nothing applies.',
    ]);

    expect(checkRecordContent("r.md", "# Verification record\n")).toEqual([
      expect.stringContaining("Found: none."),
    ]);
  });

  test("treats fenced code as content, not as section headings", () => {
    const quoted = completeRecord.replace(
      "## Did not verify\n\nNone.",
      "## Did not verify\n\n````md\n## Quoted heading\n```\n## Still quoted\n```\n````",
    );
    expect(checkRecordContent("r.md", quoted)).toEqual([]);

    const tildes = completeRecord.replace(
      "## Did not verify\n\nNone.",
      "## Did not verify\n\n~~~\n## Quoted heading\n~~~",
    );
    expect(checkRecordContent("r.md", tildes)).toEqual([]);
  });

  test("ignores headings and text inside HTML comments", () => {
    const commented = completeRecord.replace(
      "## Did not verify\n\nNone.",
      "## Did not verify\n\n<!-- placeholder\n## Lessons\nmore -->",
    );
    expect(checkRecordContent("r.md", commented)).toEqual([
      'r.md: "## Did not verify" is empty; write "None." if nothing applies.',
    ]);

    const inline = completeRecord.replace(
      "None.\n\n## Dismissed",
      "<!-- a --> None. <!-- b -->\n\n## Dismissed",
    );
    expect(checkRecordContent("r.md", inline)).toEqual([]);
  });

  test("extracts visible section bodies and identifies None sections", () => {
    const sections = extractRecordSections(completeRecord);
    expect(sections.get("Behavioral decisions")).toBe(
      "- Retries failed deliveries for 15 minutes before marking them failed.",
    );
    expect(sections.get("Did not verify")).toBe("None.");

    expect(isNoneSection(undefined)).toBe(true);
    expect(isNoneSection("")).toBe(true);
    expect(isNoneSection("None.")).toBe(true);
    expect(isNoneSection("- none")).toBe(true);
    expect(isNoneSection("- Retries failed deliveries.")).toBe(false);
  });

  test("warns about gap entries that leave a check to CI", () => {
    const record = completeRecord
      .replace(
        "- Live Clerk sign-in: the agent environment has no Clerk credentials.",
        [
          "- Live Clerk sign-in: the agent environment has no Clerk credentials.",
          "- macOS teardown: CI runs only on Linux, so nothing exercises it.",
        ].join("\n"),
      )
      .replace(
        "## Did not verify\n\nNone.",
        [
          "## Did not verify",
          "",
          "- Firefox, WebKit and mobile Playwright projects: left to PR CI.",
          "- The full application browser matrix and transport database suites were",
          "  left to CI. The local database run covered every capability suite.",
          "- A live model call: no provider key.",
        ].join("\n"),
      );

    const warnings = findCiDeferrals("verifications/7.md", record);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain(
      '"## Did not verify" lists a check left to CI ("Firefox, WebKit and mobile Playwright projects: left to PR CI.")',
    );
    expect(warnings[1]).toContain('("The full application browser matrix');
    expect(warnings[1]).toMatch(/…"\)/u);
    expect(findCiDeferrals("verifications/7.md", completeRecord)).toEqual([]);
  });

  test("parses NUL-delimited git name-status output, splitting renames", () => {
    expect(
      parseNameStatusZ(
        [
          "A",
          "verifications/42.md",
          "M",
          "docs/README.md",
          "D",
          "old.ts",
          "R087",
          "verifications/41.md",
          "verifications/42.md",
          "C075",
          "docs/a.md",
          "docs/a copy.md",
          "T",
          "link",
          "",
        ].join("\0"),
      ),
    ).toEqual([
      { status: "added", path: "verifications/42.md" },
      { status: "modified", path: "docs/README.md" },
      { status: "deleted", path: "old.ts" },
      { status: "deleted", path: "verifications/41.md" },
      { status: "added", path: "verifications/42.md" },
      { status: "added", path: "docs/a copy.md" },
      { status: "modified", path: "link" },
    ]);
  });

  test("accepts only a positive integer pull request number", () => {
    expect(parsePrNumber("42")).toBe(42);
    for (const value of ["", "abc", "0", "-3", "4.2", "042", " 42", "1e3", "99999999999999999"]) {
      expect(() => parsePrNumber(value), value).toThrow(
        `PR_NUMBER must be a positive integer; received "${value}".`,
      );
    }
  });

  test("rejects another record whose path git would quote", () => {
    const { dir, range } = scratchDiff({
      "foundation/ui/src/index.ts": "export {};\n",
      "verifications/42.md": completeRecord,
      "verifications/é.md": completeRecord,
    });
    try {
      const changedFiles = readScratchChanges(dir, range);
      expect(check(changedFiles, { "verifications/42.md": completeRecord })).toEqual({
        exempt: null,
        errors: [
          "verifications/é.md: a pull request may add or change only its own record, verifications/42.md. Move this record there.",
        ],
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("imports only Node built-ins so CI can run it before installing dependencies", () => {
    const source = readFileSync(new URL("./verification-record.ts", import.meta.url), "utf8");
    const specifiers = [...source.matchAll(/^import [^;]*? from "([^"]+)";$/gms)].map(
      ([, specifier]) => specifier,
    );
    expect(specifiers.length).toBeGreaterThan(0);
    expect(specifiers.filter((specifier) => !specifier?.startsWith("node:"))).toEqual([]);
  });

  test("keeps records out of repository search", () => {
    // Ripgrep-based search reads .ignore, so agents searching for guidance skip
    // records while git, formatting, and secret scanning still include them.
    const ignored = readFileSync(`${REPO_ROOT}/.ignore`, "utf8").split(/\r?\n/);
    expect(ignored).toContain(`${RECORD_DIRECTORY}/`);
  });
});
