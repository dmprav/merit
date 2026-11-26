import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vite-plus/test";

import {
  checkRecordContent,
  checkVerificationRecord,
  extractRecordSections,
  isNoneSection,
  parseNameStatus,
  RECORD_DIRECTORY,
  type ChangedFile,
} from "./verification-record.ts";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

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

  test("parses git name-status output, splitting renames", () => {
    expect(
      parseNameStatus(
        "A\tverifications/42.md\nM\tdocs/README.md\nD\told.ts\nR087\tverifications/41.md\tverifications/42.md\n",
      ),
    ).toEqual([
      { status: "added", path: "verifications/42.md" },
      { status: "modified", path: "docs/README.md" },
      { status: "deleted", path: "old.ts" },
      { status: "deleted", path: "verifications/41.md" },
      { status: "added", path: "verifications/42.md" },
    ]);
  });

  test("keeps records out of repository search", () => {
    // Ripgrep-based search reads .ignore, so agents searching for guidance skip
    // records while git, formatting, and secret scanning still include them.
    const ignored = readFileSync(`${repoRoot}/.ignore`, "utf8").split(/\r?\n/);
    expect(ignored).toContain(`${RECORD_DIRECTORY}/`);
  });
});
