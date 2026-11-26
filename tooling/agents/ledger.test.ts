import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vite-plus/test";

import {
  appendLedgerEntry,
  DEFAULT_TAIL_LIMIT,
  executeLedgerCli,
  formatLedgerRow,
  formatLogOutput,
  formatSummaryOutput,
  formatTailOutput,
  LEDGER_COLUMNS,
  LEDGER_HEADER,
  LEDGER_SLUG_PATTERN,
  ledgerEntrySchema,
  ledgerLockPathForFile,
  ledgerLogResultSchema,
  ledgerPathForSlug,
  ledgerRunSummarySchema,
  ledgerSummarySchema,
  ledgerTailResultSchema,
  MAX_LEDGER_SLUG_LENGTH,
  parseLedgerTsv,
  parseLogArgs,
  parseSummaryArgs,
  parseTailArgs,
  readLedgerEntries,
  resolveLedgerFilePath,
  sanitizeLedgerCell,
  summarizeLedger,
  SUMMARY_LATEST_LIMIT,
  tailLedger,
  validateLedgerRunId,
  validateLedgerSlug,
  withLedgerLock,
} from "./ledger.ts";

const tempDirs: string[] = [];

const makeTempDir = () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "merit-ledger-test-")));
  tempDirs.push(dir);
  return dir;
};

const createDeferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("ledger helpers", () => {
  test("validates slugs strictly and resolves default or overridden ledger paths", () => {
    const repo = makeTempDir();

    expect(LEDGER_SLUG_PATTERN.test("feat-ledger-1")).toBe(true);
    expect(validateLedgerSlug("a")).toBe("a");
    expect(validateLedgerSlug("feat-ledger-1")).toBe("feat-ledger-1");
    expect(validateLedgerSlug("a".repeat(MAX_LEDGER_SLUG_LENGTH))).toBe(
      "a".repeat(MAX_LEDGER_SLUG_LENGTH),
    );
    expect(ledgerPathForSlug("feat-ledger-1", repo)).toBe(
      join(repo, ".tmp", "ledgers", "feat-ledger-1.tsv"),
    );

    for (const invalid of [
      "",
      "Upper",
      "-leading",
      "trailing-",
      "double--hyphen",
      "has_underscore",
      "../escape",
      "a/b",
      "a".repeat(MAX_LEDGER_SLUG_LENGTH + 1),
    ]) {
      expect(() => validateLedgerSlug(invalid), invalid).toThrow(/Invalid ledger slug/);
    }

    expect(resolveLedgerFilePath({ slug: "alpha", repoRoot: repo })).toBe(
      join(repo, ".tmp", "ledgers", "alpha.tsv"),
    );
    expect(resolveLedgerFilePath({ file: "custom/my.tsv", cwd: repo })).toBe(
      join(repo, "custom", "my.tsv"),
    );
    expect(() =>
      resolveLedgerFilePath({ slug: "Invalid_Slug", file: "custom/my.tsv", cwd: repo }),
    ).toThrow(/Invalid ledger slug/);
    expect(() => resolveLedgerFilePath({ file: "   ", cwd: repo })).toThrow(
      /Invalid ledger file path/,
    );
    expect(() => resolveLedgerFilePath({ repoRoot: repo })).toThrow(/Missing --slug/);
  });

  test("sanitizes tabs, newlines, and control characters into single spaces and neutralizes formula prefixes", () => {
    expect(sanitizeLedgerCell("first\tsecond\nthird\r\nfourth\x00fifth\x1bsixth\x7f")).toBe(
      "first second third fourth fifth sixth",
    );
    expect(sanitizeLedgerCell("  line\u2028break\u2029here  ")).toBe("line break here");
    expect(sanitizeLedgerCell("   \t\r\n   ")).toBe("");

    // Neutralizes all required spreadsheet formula prefixes, including after leading whitespace/control chars.
    expect(sanitizeLedgerCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(sanitizeLedgerCell("+cmd|' /C calc'!A0")).toBe("'+cmd|' /C calc'!A0");
    expect(sanitizeLedgerCell("-10% latency")).toBe("'-10% latency");
    expect(sanitizeLedgerCell("@SUM(1+1)")).toBe("'@SUM(1+1)");
    expect(sanitizeLedgerCell('"quoted"')).toBe('\'"quoted"');
    expect(sanitizeLedgerCell('\t\n  =HYPERLINK("https://example.invalid")')).toBe(
      '\'=HYPERLINK("https://example.invalid")',
    );
    expect(sanitizeLedgerCell("   -2+3\r\n")).toBe("'-2+3");

    // Idempotent when already neutralized.
    expect(sanitizeLedgerCell("'=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");

    const row = formatLedgerRow(
      ledgerEntrySchema.parse({
        ts: "2026-11-24T22:00:00.000Z",
        run_id: "run-1",
        phase: "build",
        decision: sanitizeLedgerCell("=use\tlock"),
        why: sanitizeLedgerCell("avoid\nraces"),
        evidence: sanitizeLedgerCell("-0 errors"),
        result: "ok",
      }),
    );
    expect(row.includes("\n")).toBe(false);
    expect(row.split("\t")).toHaveLength(LEDGER_COLUMNS.length);
    expect(row).toBe(
      "2026-11-24T22:00:00.000Z\trun-1\tbuild\t'=use lock\tavoid races\t'-0 errors\tok",
    );
  });

  test("parses CLI arguments strictly for log, tail, and summary including negative-prefixed values", () => {
    expect(
      parseLogArgs([
        "--",
        "--slug",
        "feat-one",
        "--run-id",
        "run-1",
        "--phase=diagnose",
        "--decision",
        "-remove dead branch",
        "--why",
        "=faster\tstartup",
        "--evidence",
        "bench.ts",
        "--result",
        "green",
        "--ts",
        "2026-11-24T22:00:00.000Z",
        "--json",
      ]),
    ).toEqual({
      slug: "feat-one",
      file: undefined,
      runId: "run-1",
      phase: "diagnose",
      decision: "-remove dead branch",
      why: "=faster\tstartup",
      evidence: "bench.ts",
      result: "green",
      ts: "2026-11-24T22:00:00.000Z",
      json: true,
    });

    expect(() => parseLogArgs(["--slug", "feat-one"])).toThrow(/Missing required option --run-id/);
    expect(() => parseLogArgs(["--slug", "feat-one", "--run-id", "--phase", "build"])).toThrow(
      /--run-id requires a value/,
    );
    expect(() => parseLogArgs(["--slug", "feat-one", "--run-id", "--phase=build"])).toThrow(
      /--run-id requires a value/,
    );
    expect(() =>
      parseLogArgs([
        "--slug",
        "feat-one",
        "--run-id",
        "r1",
        "--phase",
        "build",
        "--decision",
        "x",
        "--why",
        "y",
        "--evidence",
        "--result=ok",
      ]),
    ).toThrow(/--evidence requires a value/);
    expect(() =>
      parseLogArgs([
        "--slug",
        "feat-one",
        "--run-id",
        "r1",
        "--phase",
        "build",
        "--decision",
        "x",
        "--why",
        "y",
        "--evidence",
        "--reslut=ok",
      ]),
    ).toThrow(/--evidence requires a value/);
    expect(() =>
      parseLogArgs([
        "--slug",
        "feat-one",
        "--run-id",
        "r1",
        "--phase",
        "build",
        "--decision",
        "x",
        "--why",
        "y",
        "--evidence",
        "--unknown-flag",
      ]),
    ).toThrow(/--evidence requires a value/);
    expect(
      parseLogArgs([
        "--slug",
        "feat-one",
        "--run-id",
        "r1",
        "--phase",
        "build",
        "--decision",
        "-remove dead branch",
        "--why",
        "y",
        "--evidence=--reslut=ok",
      ]),
    ).toMatchObject({
      decision: "-remove dead branch",
      evidence: "--reslut=ok",
    });
    expect(() => parseLogArgs(["--slug", "feat-one", "--bogus", "1"])).toThrow(
      /Unknown option '--bogus'/,
    );
    expect(() => parseLogArgs(["--slug", "feat-one", "--json=true"])).toThrow(
      /Option '--json' does not take an argument/,
    );

    expect(parseTailArgs(["--slug", "feat-one"])).toEqual({
      slug: "feat-one",
      file: undefined,
      limit: DEFAULT_TAIL_LIMIT,
      json: false,
    });
    expect(parseTailArgs(["--file", "/tmp/a.tsv", "--limit", "5", "--json"])).toEqual({
      slug: undefined,
      file: "/tmp/a.tsv",
      limit: 5,
      json: true,
    });
    expect(() => parseTailArgs(["--slug", "feat-one", "--limit", "0"])).toThrow(
      /--limit must be a whole number of at least 1/,
    );
    expect(() => parseTailArgs(["--slug", "feat-one", "--limit", "-3"])).toThrow(
      /--limit must be a whole number of at least 1/,
    );
    expect(() => parseTailArgs(["--slug", "feat-one", "--limit", "10abc"])).toThrow(
      /--limit must be a whole number of at least 1/,
    );

    expect(parseSummaryArgs(["--slug", "feat-one", "--json"])).toEqual({
      slug: "feat-one",
      file: undefined,
      json: true,
    });
    expect(() => parseSummaryArgs([])).toThrow(/Missing --slug/);
  });

  test("validates run_id strictly as a canonical non-whitespace token", async () => {
    const repo = makeTempDir();

    for (const valid of ["run-1", "run_2", "session:1", "issue-247/r1"]) {
      expect(validateLedgerRunId(valid), valid).toBe(valid);
    }

    for (const invalid of [
      "",
      " run-1",
      "run-1 ",
      "review 2",
      "review  2",
      "review\t2",
      "review\n2",
      "run\x001",
      "-run",
      "=run",
    ]) {
      expect(() => validateLedgerRunId(invalid), JSON.stringify(invalid)).toThrow(
        /Invalid --run-id/,
      );
      expect(
        () =>
          parseLogArgs([
            "--slug",
            "feat-one",
            "--run-id",
            invalid,
            "--phase",
            "build",
            "--decision",
            "d",
            "--why",
            "w",
          ]),
        JSON.stringify(invalid),
      ).toThrow(/Invalid --run-id/);
      await expect(
        appendLedgerEntry({
          slug: "feat-one",
          runId: invalid,
          phase: "build",
          decision: "d",
          why: "w",
          repoRoot: repo,
        }),
      ).rejects.toThrow(/Invalid --run-id/);
    }
    expect(existsSync(join(repo, ".tmp"))).toBe(false);
  });
});

describe("ledger lifecycle, resume markers, and validation", () => {
  test("creates atomic header on first write, avoids duplicate start rows on same run_id, and auto-appends start row on run_id change", async () => {
    const repo = makeTempDir();

    const first = await appendLedgerEntry({
      slug: "auth-migration",
      runId: "run-1",
      phase: "plan",
      decision: "Use atomic rename",
      why: "Prevents partial\theader reads",
      evidence: "tooling/agents/worktree.ts",
      result: "approved",
      ts: "2026-11-24T10:00:00.000Z",
      repoRoot: repo,
    });
    expect(ledgerLogResultSchema.parse(first)).toMatchObject({
      created: true,
      resumed: false,
      previousRunId: null,
    });
    expect(first.appended).toHaveLength(1);
    expect(existsSync(first.file)).toBe(true);

    const rawAfterFirst = readFileSync(first.file, "utf8");
    expect(rawAfterFirst.split("\n")[0]).toBe(LEDGER_HEADER);
    expect(rawAfterFirst.trimEnd().split("\n")).toHaveLength(2);

    // Same run_id must NOT add a resume start row.
    const second = await appendLedgerEntry({
      slug: "auth-migration",
      runId: "run-1",
      phase: "build",
      decision: "=neutralize formula",
      why: "+avoid csv/tsv injection",
      evidence: "@cell\ncheck",
      result: "verified",
      ts: "2026-11-24T10:05:00.000Z",
      repoRoot: repo,
    });
    expect(second.created).toBe(false);
    expect(second.resumed).toBe(false);
    expect(second.previousRunId).toBe("run-1");
    expect(second.appended).toHaveLength(1);
    expect(second.appended[0]?.decision).toBe("'=neutralize formula");
    expect(second.appended[0]?.why).toBe("'+avoid csv/tsv injection");
    expect(second.appended[0]?.evidence).toBe("'@cell check");

    // Different run_id MUST automatically prepend a resume start row before the new entry.
    const third = await appendLedgerEntry({
      slug: "auth-migration",
      runId: "run-2",
      phase: "review",
      decision: "Fix lock timeout test",
      why: "Reviewer flagged missing dead-PID test",
      evidence: "round-1",
      result: "fixed",
      ts: "2026-11-24T11:00:00.000Z",
      repoRoot: repo,
    });
    expect(third.created).toBe(false);
    expect(third.resumed).toBe(true);
    expect(third.previousRunId).toBe("run-1");
    expect(third.appended).toEqual([
      {
        ts: "2026-11-24T11:00:00.000Z",
        run_id: "run-2",
        phase: "resume",
        decision: "start",
        why: "Resumed ledger with new run_id",
        evidence: "run-1",
        result: "started",
      },
      {
        ts: "2026-11-24T11:00:00.000Z",
        run_id: "run-2",
        phase: "review",
        decision: "Fix lock timeout test",
        why: "Reviewer flagged missing dead-PID test",
        evidence: "round-1",
        result: "fixed",
      },
    ]);

    // When a new run_id explicitly logs a `resume`/`start` row (case-insensitive), do NOT insert a duplicate start row.
    const fourth = await appendLedgerEntry({
      slug: "auth-migration",
      runId: "run-3",
      phase: "resume",
      decision: "START",
      why: "Picked up from handoff artifact",
      evidence: ".tmp/handoffs/auth-migration.md",
      result: "started",
      ts: "2026-11-24T12:00:00.000Z",
      repoRoot: repo,
    });
    expect(fourth.resumed).toBe(true);
    expect(fourth.previousRunId).toBe("run-2");
    expect(fourth.appended).toHaveLength(1);
    expect(fourth.appended[0]?.why).toBe("Picked up from handoff artifact");

    // An ordinary decision named "start" in a non-resume phase still prepends the automatic resume/start row.
    const fifth = await appendLedgerEntry({
      slug: "auth-migration",
      runId: "run-4",
      phase: "build",
      decision: "start",
      why: "Start implementation slice",
      evidence: "slice-1",
      result: "in-progress",
      ts: "2026-11-24T13:00:00.000Z",
      repoRoot: repo,
    });
    expect(fifth.resumed).toBe(true);
    expect(fifth.previousRunId).toBe("run-3");
    expect(fifth.appended).toHaveLength(2);
    expect(fifth.appended[0]).toMatchObject({
      run_id: "run-4",
      phase: "resume",
      decision: "start",
      evidence: "run-3",
    });
    expect(fifth.appended[1]).toMatchObject({
      run_id: "run-4",
      phase: "build",
      decision: "start",
    });

    const summary = summarizeLedger({ slug: "auth-migration", repoRoot: repo });
    expect(summary.decisions.some((entry) => entry.why === "Picked up from handoff artifact")).toBe(
      false,
    );
    expect(
      summary.decisions.some((entry) => entry.phase === "build" && entry.decision === "start"),
    ).toBe(true);

    const all = readLedgerEntries(first.file);
    expect(all.exists).toBe(true);
    expect(all.entries).toHaveLength(7);

    // Every physical line in the file has strictly 7 tab-separated columns.
    const physicalLines = readFileSync(first.file, "utf8").trimEnd().split("\n");
    expect(physicalLines).toHaveLength(8); // 1 header + 7 entries
    for (const line of physicalLines) {
      expect(line.split("\t")).toHaveLength(7);
    }
  });

  test("rejects malformed or corrupt existing TSV files without overwriting them", async () => {
    const repo = makeTempDir();
    const emptyFile = join(repo, "empty.tsv");
    writeFileSync(emptyFile, "", "utf8");
    expect(() => parseLedgerTsv("", emptyFile)).toThrow(emptyFile);
    await expect(
      appendLedgerEntry({
        file: emptyFile,
        runId: "run-1",
        phase: "build",
        decision: "test",
        why: "check",
      }),
    ).rejects.toThrow(emptyFile);
    expect(readFileSync(emptyFile, "utf8")).toBe("");

    const badHeaderFile = join(repo, "bad-header.tsv");
    const badHeaderContent = "wrong\theader\n1\t2\n";
    writeFileSync(badHeaderFile, badHeaderContent, "utf8");
    await expect(
      appendLedgerEntry({
        file: badHeaderFile,
        runId: "run-1",
        phase: "build",
        decision: "test",
        why: "check",
      }),
    ).rejects.toThrow(badHeaderFile);
    expect(readFileSync(badHeaderFile, "utf8")).toBe(badHeaderContent);

    const badColsFile = join(repo, "bad-cols.tsv");
    const badColsContent = `${LEDGER_HEADER}\n2026-11-24T10:00:00.000Z\trun-1\tbuild\tonly-four-cols\n`;
    writeFileSync(badColsFile, badColsContent, "utf8");
    expect(() => tailLedger({ file: badColsFile })).toThrow(badColsFile);
    expect(() => summarizeLedger({ file: badColsFile })).toThrow(/line 2/);
    expect(readFileSync(badColsFile, "utf8")).toBe(badColsContent);

    // Rejects invalid --ts (including impossible calendar dates) or whitespace-only required fields before touching disk.
    const untouched = join(repo, "untouched.tsv");
    await expect(
      appendLedgerEntry({
        file: untouched,
        runId: "run-1",
        phase: "build",
        decision: "   \t\n",
        why: "valid",
      }),
    ).rejects.toThrow(/non-empty after sanitization/);
    await expect(
      appendLedgerEntry({
        file: untouched,
        runId: "run-1",
        phase: "build",
        decision: "valid",
        why: "valid",
        ts: "not-a-timestamp",
      }),
    ).rejects.toThrow(/Invalid --ts/);
    await expect(
      appendLedgerEntry({
        file: untouched,
        runId: "run-1",
        phase: "build",
        decision: "valid",
        why: "valid",
        ts: "2026-02-30T10:00:00.000Z",
      }),
    ).rejects.toThrow(/Invalid --ts/);
    expect(existsSync(untouched)).toBe(false);
  });

  test("rejects corrupt 7-column TSV rows with file path, line number, and field name without modifying the file", async () => {
    const repo = makeTempDir();
    const validRow =
      "2026-11-24T10:00:00.000Z\trun-1\tbuild\tvalid decision\tvalid why\tevidence\tok";

    const cases: Array<{ name: string; badRow: string; field: string; messagePattern: RegExp }> = [
      {
        name: "empty-required-decision.tsv",
        badRow: "2026-11-24T10:05:00.000Z\trun-1\tbuild\t\tvalid why\tevidence\tok",
        field: "decision",
        messagePattern: /non-empty/,
      },
      {
        name: "whitespace-required-why.tsv",
        badRow: "2026-11-24T10:05:00.000Z\trun-1\tbuild\tvalid decision\t   \tevidence\tok",
        field: "why",
        messagePattern: /non-empty/,
      },
      {
        name: "whitespace-optional-result.tsv",
        badRow: "2026-11-24T10:05:00.000Z\trun-1\tbuild\tvalid decision\tvalid why\tevidence\t   ",
        field: "result",
        messagePattern: /whitespace-only/,
      },
      {
        name: "invalid-ts.tsv",
        badRow: "not-a-timestamp\trun-1\tbuild\tvalid decision\tvalid why\tevidence\tok",
        field: "ts",
        messagePattern: /ISO-8601 timestamp/,
      },
      {
        name: "impossible-calendar-date-ts.tsv",
        badRow: "2026-02-30T10:00:00.000Z\trun-1\tbuild\tvalid decision\tvalid why\tevidence\tok",
        field: "ts",
        messagePattern: /ISO-8601 timestamp/,
      },
      {
        name: "control-char-null-evidence.tsv",
        badRow:
          "2026-11-24T10:05:00.000Z\trun-1\tbuild\tvalid decision\tvalid why\tbad\x00cell\tok",
        field: "evidence",
        messagePattern: /control characters/,
      },
      {
        name: "control-char-cr-why.tsv",
        badRow: "2026-11-24T10:05:00.000Z\trun-1\tbuild\tvalid decision\tbad\rwhy\tevidence\tok",
        field: "why",
        messagePattern: /control characters/,
      },
      {
        name: "control-char-del-phase.tsv",
        badRow:
          "2026-11-24T10:05:00.000Z\trun-1\tbuild\x7f\tvalid decision\tvalid why\tevidence\tok",
        field: "phase",
        messagePattern: /control characters/,
      },
      {
        name: "whitespace-run-id.tsv",
        badRow:
          "2026-11-24T10:05:00.000Z\treview  2\tbuild\tvalid decision\tvalid why\tevidence\tok",
        field: "run_id",
        messagePattern: /without whitespace/,
      },
    ];

    for (const testCase of cases) {
      const filePath = join(repo, testCase.name);
      const content = `${LEDGER_HEADER}\n${validRow}\n${testCase.badRow}\n`;
      writeFileSync(filePath, content, "utf8");

      const assertMalformedError = (error: unknown) => {
        expect(error, testCase.name).toBeInstanceOf(Error);
        const message = (error as Error).message;
        expect(message, testCase.name).toContain(filePath);
        expect(message, testCase.name).toContain("line 3");
        expect(message, testCase.name).toContain(`(${testCase.field})`);
        expect(message, testCase.name).toMatch(testCase.messagePattern);
      };

      for (const readAttempt of [
        () => parseLedgerTsv(content, filePath),
        () => tailLedger({ file: filePath }),
        () => summarizeLedger({ file: filePath }),
      ]) {
        let caught: unknown;
        try {
          readAttempt();
        } catch (error) {
          caught = error;
        }
        assertMalformedError(caught);
      }

      let appendCaught: unknown;
      try {
        await appendLedgerEntry({
          file: filePath,
          runId: "run-1",
          phase: "build",
          decision: "new decision",
          why: "should fail before write",
          ts: "2026-11-24T10:10:00.000Z",
        });
      } catch (error) {
        appendCaught = error;
      }
      assertMalformedError(appendCaught);
      expect(readFileSync(filePath, "utf8"), testCase.name).toBe(content);
    }
  });

  test("handles missing ledgers cleanly in read-only mode and produces deterministic tail and summary outputs", async () => {
    const repo = makeTempDir();

    const missingTail = ledgerTailResultSchema.parse(
      tailLedger({ slug: "missing-slug", limit: 5, repoRoot: repo }),
    );
    expect(missingTail).toEqual({
      file: ledgerPathForSlug("missing-slug", repo),
      exists: false,
      totalEntries: 0,
      limit: 5,
      entries: [],
    });
    expect(formatTailOutput(missingTail)).toContain("No decision ledger found");

    const missingSummary = ledgerSummarySchema.parse(
      summarizeLedger({ slug: "missing-slug", repoRoot: repo }),
    );
    expect(missingSummary).toEqual({
      file: ledgerPathForSlug("missing-slug", repo),
      exists: false,
      totalEntries: 0,
      runs: [],
      phaseCounts: {},
      resultCounts: {},
      latestEntries: [],
      decisions: [],
    });
    expect(formatSummaryOutput(missingSummary)).toContain("No decision ledger found");
    expect(existsSync(join(repo, ".tmp"))).toBe(false);

    // Populate a multi-run ledger (> SUMMARY_LATEST_LIMIT entries).
    for (let idx = 1; idx <= 6; idx += 1) {
      await appendLedgerEntry({
        slug: "feature-x",
        runId: idx <= 3 ? "run-a" : "run-b",
        phase: idx % 2 === 0 ? "verify" : "build",
        decision: `Decision ${idx}`,
        why: `Reason ${idx}`,
        evidence: idx === 1 ? "" : `check-${idx}`,
        result: idx === 1 ? "" : idx % 2 === 0 ? "pass" : "done",
        ts: `2026-11-24T10:0${idx}:00.000Z`,
        repoRoot: repo,
      });
    }

    const tail = ledgerTailResultSchema.parse(
      tailLedger({ slug: "feature-x", limit: 3, repoRoot: repo }),
    );
    expect(tail.exists).toBe(true);
    expect(tail.totalEntries).toBe(7); // 6 decisions + 1 automatic resume start row
    expect(tail.entries).toHaveLength(3);
    expect(tail.entries.map((entry) => entry.decision)).toEqual([
      "Decision 4",
      "Decision 5",
      "Decision 6",
    ]);

    const summary = ledgerSummarySchema.parse(
      summarizeLedger({ slug: "feature-x", repoRoot: repo }),
    );
    expect(summary.exists).toBe(true);
    expect(summary.totalEntries).toBe(7);
    expect(summary.runs.map((run) => ledgerRunSummarySchema.parse(run))).toEqual([
      {
        run_id: "run-a",
        entryCount: 3,
        firstTs: "2026-11-24T10:01:00.000Z",
        lastTs: "2026-11-24T10:03:00.000Z",
      },
      {
        run_id: "run-b",
        entryCount: 4,
        firstTs: "2026-11-24T10:04:00.000Z",
        lastTs: "2026-11-24T10:06:00.000Z",
      },
    ]);
    expect(summary.phaseCounts).toEqual({ build: 3, resume: 1, verify: 3 });
    expect(summary.resultCounts).toEqual({ done: 2, pass: 3, started: 1 });
    expect(summary.latestEntries).toHaveLength(SUMMARY_LATEST_LIMIT);
    expect(summary.decisions).toHaveLength(6); // Excludes synthetic resume/start marker
    expect(summary.decisions[0]).toMatchObject({ phase: "build", decision: "Decision 1" });
    expect(summary.decisions[5]).toMatchObject({ phase: "verify", decision: "Decision 6" });

    const formattedSummary = formatSummaryOutput(summary);
    expect(formattedSummary).toContain("runs (2): run-a");
    expect(formattedSummary).toContain("phases:  build=3, resume=1, verify=3");
    expect(formattedSummary).toContain("\n    - [build] Decision 1 — Reason 1\n");
    expect(formattedSummary).toContain(
      "\n    - [verify] Decision 6 — Reason 6 (pass) [evidence: check-6]",
    );
    expect(formattedSummary).not.toContain("[resume]");
  });

  test("preserves __proto__ labels as own enumerable properties in summary counts and JSON", async () => {
    const repo = makeTempDir();

    await appendLedgerEntry({
      slug: "proto-test",
      runId: "run-1",
      phase: "__proto__",
      decision: "Handle reserved JS property keys safely",
      why: "Object.fromEntries avoids mutating Object.prototype",
      result: "__proto__",
      ts: "2026-11-24T14:00:00.000Z",
      repoRoot: repo,
    });
    await appendLedgerEntry({
      slug: "proto-test",
      runId: "run-1",
      phase: "verify",
      decision: "Confirm normal keys sort alongside __proto__",
      why: "Keep deterministic output",
      result: "ok",
      ts: "2026-11-24T14:05:00.000Z",
      repoRoot: repo,
    });

    const summary = summarizeLedger({ slug: "proto-test", repoRoot: repo });
    expect(Object.hasOwn(summary.phaseCounts, "__proto__")).toBe(true);
    expect(Object.hasOwn(summary.resultCounts, "__proto__")).toBe(true);
    expect(Object.entries(summary.phaseCounts)).toEqual([
      ["__proto__", 1],
      ["verify", 1],
    ]);
    expect(Object.entries(summary.resultCounts)).toEqual([
      ["__proto__", 1],
      ["ok", 1],
    ]);

    const summaryJson = await executeLedgerCli(["summary", "--slug", "proto-test", "--json"], {
      repoRoot: repo,
    });
    expect(summaryJson).toContain('"__proto__": 1');
    const reparsed = ledgerSummarySchema.parse(JSON.parse(summaryJson));
    expect(Object.hasOwn(reparsed.phaseCounts, "__proto__")).toBe(true);
    expect(Object.hasOwn(reparsed.resultCounts, "__proto__")).toBe(true);

    const formatted = formatSummaryOutput(summary);
    expect(formatted).toContain("phases:  __proto__=1, verify=1");
    expect(formatted).toContain("results: __proto__=1, ok=1");
  });

  test("executes CLI log, tail, summary, and help commands in both text and --json modes", async () => {
    const repo = makeTempDir();

    const helpText = await executeLedgerCli(["--help"], { repoRoot: repo });
    expect(helpText).toContain("Usage: vp run agent:ledger");
    expect(helpText).toMatch(/log\s+\(--slug <slug> \| --file <path>\)/);
    expect(helpText).toMatch(/tail\s+\(--slug <slug> \| --file <path>\)/);
    expect(helpText).toMatch(/summary\s+\(--slug <slug> \| --file <path>\)/);

    const logJson = await executeLedgerCli(
      [
        "log",
        "--slug",
        "cli-smoke",
        "--run-id",
        "run-1",
        "--phase",
        "diagnose",
        "--decision",
        "Rule out cache staleness",
        "--why",
        "Reproduced with --no-cache",
        "--evidence",
        "vp run test:agents",
        "--result",
        "ruled-out",
        "--ts",
        "2026-11-24T15:00:00.000Z",
        "--json",
      ],
      { repoRoot: repo },
    );
    const parsedLog = ledgerLogResultSchema.parse(JSON.parse(logJson));
    expect(parsedLog.created).toBe(true);
    expect(formatLogOutput(parsedLog)).toContain("Created decision ledger");

    const logText = await executeLedgerCli(
      [
        "log",
        "--slug",
        "cli-smoke",
        "--run-id",
        "run-2",
        "--phase",
        "fix",
        "--decision",
        "-fix off-by-one",
        "--why",
        "Boundary check missed last index",
        "--ts",
        "2026-11-24T15:10:00.000Z",
      ],
      { repoRoot: repo },
    );
    expect(logText).toContain("resumed from run_id: run-1");
    expect(logText).toContain("'-fix off-by-one");

    const tailJson = await executeLedgerCli(
      ["tail", "--slug", "cli-smoke", "--limit", "2", "--json"],
      { repoRoot: repo },
    );
    const parsedTail = ledgerTailResultSchema.parse(JSON.parse(tailJson));
    expect(parsedTail.entries).toHaveLength(2);
    expect(parsedTail.entries[0]?.phase).toBe("resume");
    expect(parsedTail.entries[1]?.decision).toBe("'-fix off-by-one");

    const summaryJson = await executeLedgerCli(["summary", "--slug", "cli-smoke", "--json"], {
      repoRoot: repo,
    });
    const parsedSummary = ledgerSummarySchema.parse(JSON.parse(summaryJson));
    expect(parsedSummary.totalEntries).toBe(3);
    expect(parsedSummary.runs.map((run) => run.run_id)).toEqual(["run-1", "run-2"]);

    const summaryText = await executeLedgerCli(["summary", "--slug", "cli-smoke"], {
      repoRoot: repo,
    });
    expect(summaryText).toContain("Decision ledger summary:");

    await expect(executeLedgerCli(["unknown"], { repoRoot: repo })).rejects.toThrow(
      /Unknown ledger command/,
    );
  });
});

describe("ledger concurrency and locking", () => {
  test("serializes concurrent appends without duplicating headers or interleaving lines", async () => {
    const repo = makeTempDir();
    const lockOptions = { initialDelayMs: 5, maxDelayMs: 25, timeoutMs: 5_000 };

    const writes = Array.from({ length: 12 }, (_, idx) =>
      appendLedgerEntry({
        slug: "concurrent-test",
        runId: idx < 6 ? "run-alpha" : "run-beta",
        phase: "build",
        decision: `Concurrent decision ${idx + 1}`,
        why: `Parallel writer ${idx + 1}\twith\ncontrols`,
        evidence: `worker-${idx + 1}`,
        result: "ok",
        ts: `2026-11-24T16:00:${String(idx).padStart(2, "0")}.000Z`,
        repoRoot: repo,
        lockOptions,
      }),
    );

    const results = await Promise.all(writes);
    expect(results.filter((entry) => entry.created)).toHaveLength(1);

    const filePath = ledgerPathForSlug("concurrent-test", repo);
    expect(existsSync(ledgerLockPathForFile(filePath))).toBe(false);

    const raw = readFileSync(filePath, "utf8");
    const lines = raw.trimEnd().split("\n");
    expect(lines[0]).toBe(LEDGER_HEADER);
    // Header line must appear exactly once.
    expect(lines.filter((line) => line === LEDGER_HEADER)).toHaveLength(1);

    const parsed = parseLedgerTsv(raw, filePath);
    const nonResume = parsed.filter(
      (entry) => !(entry.phase === "resume" && entry.decision === "start"),
    );
    expect(nonResume).toHaveLength(12);
    expect(new Set(nonResume.map((entry) => entry.decision)).size).toBe(12);
  });

  test("derives the ledger lock path in a reserved directory and names the decision ledger on timeout", async () => {
    const repo = makeTempDir();
    const filePath = ledgerPathForSlug("lock-test", repo);
    const lockPath = ledgerLockPathForFile(filePath);
    expect(dirname(lockPath)).toBe(join(repo, ".tmp", "ledgers", ".ledger-locks"));
    expect(basename(lockPath)).toMatch(/^lock-test\.tsv-[0-9a-f]{16}\.lock$/);

    const holderEntered = createDeferred<void>();
    const releaseHolder = createDeferred<void>();
    const holder = withLedgerLock(filePath, async () => {
      holderEntered.resolve();
      await releaseHolder.promise;
      return "first";
    });

    let waiterRan = false;
    try {
      await holderEntered.promise;
      expect(existsSync(lockPath)).toBe(true);
      await expect(
        withLedgerLock(
          filePath,
          () => {
            waiterRan = true;
          },
          { timeoutMs: 60, initialDelayMs: 10, maxDelayMs: 20 },
        ),
      ).rejects.toThrow(`Timed out waiting for decision ledger lock at "${lockPath}"`);
    } finally {
      releaseHolder.resolve();
    }
    expect(waiterRan).toBe(false);
    expect(await holder).toBe("first");
    expect(existsSync(lockPath)).toBe(false);
    expect(await withLedgerLock(filePath, () => "second")).toBe("second");
  });

  test("keeps ledger and lock namespaces disjoint so a ledger named like a lock is never reclaimed", async () => {
    const repo = makeTempDir();

    const append = (file: string, decision: string) =>
      appendLedgerEntry({
        file,
        cwd: repo,
        runId: "run-1",
        phase: "build",
        decision,
        why: "Namespace check",
        ts: "2026-11-24T18:00:00.000Z",
      });

    const lockNamed = await append("notes.tsv.lock", "Ledger that looks like a lock");
    const lockNamedContent = readFileSync(lockNamed.file, "utf8");
    // Age the first ledger past the corrupt-lock grace window; it must still never be treated as a lock.
    const expired = new Date(Date.now() - 60_000);
    utimesSync(lockNamed.file, expired, expired);

    const plain = await append("notes.tsv", "Plain ledger");
    expect(readFileSync(lockNamed.file, "utf8")).toBe(lockNamedContent);
    expect(ledgerLockPathForFile(plain.file)).not.toBe(lockNamed.file);
    expect(readdirSync(repo).sort()).toEqual([".ledger-locks", "notes.tsv", "notes.tsv.lock"]);

    for (const reserved of [".ledger-locks/notes.tsv.lock", ".ledger-locks/other.tsv"]) {
      expect(() => resolveLedgerFilePath({ file: reserved, cwd: repo })).toThrow(
        /"\.ledger-locks" directories are reserved/,
      );
      await expect(append(reserved, "Write into the lock namespace")).rejects.toThrow(
        /"\.ledger-locks" directories are reserved/,
      );
    }
    expect(readdirSync(join(repo, ".ledger-locks"))).toEqual([]);
  });

  test("locks and stages a ledger whose filename is near the 255-byte filesystem limit", async () => {
    const repo = makeTempDir();
    const longName = `${"a".repeat(236)}.tsv`;
    const result = await appendLedgerEntry({
      file: longName,
      cwd: repo,
      runId: "run-1",
      phase: "build",
      decision: "Long ledger name",
      why: "Lock and staging names stay bounded",
      ts: "2026-11-24T18:00:00.000Z",
    });
    expect(basename(result.file)).toBe(longName);
    expect(basename(ledgerLockPathForFile(result.file)).length).toBeLessThan(80);
    expect(readFileSync(result.file, "utf8")).toContain("Long ledger name");
    expect(readdirSync(repo).sort()).toEqual([".ledger-locks", longName]);
  });

  test("rejects invalid UTF-8 ledgers without rewriting them and keeps literal U+FFFD", async () => {
    const repo = makeTempDir();
    const header = Buffer.from(`${LEDGER_HEADER}\n`, "utf8");
    const rowPrefix = Buffer.from(
      "2026-11-24T10:00:00.000Z\trun-1\tbuild\tdecision\twhy\tbad",
      "utf8",
    );
    const invalidFile = join(repo, "invalid-utf8.tsv");
    const invalidBytes = Buffer.concat([
      header,
      rowPrefix,
      Buffer.from([0xff]),
      Buffer.from("\tok\n"),
    ]);
    writeFileSync(invalidFile, invalidBytes);

    await expect(
      appendLedgerEntry({
        file: invalidFile,
        runId: "run-1",
        phase: "build",
        decision: "Append after corrupt row",
        why: "Must not rewrite history",
      }),
    ).rejects.toThrow(`Malformed decision ledger at "${invalidFile}": file is not valid UTF-8.`);
    expect(readFileSync(invalidFile).equals(invalidBytes)).toBe(true);
    expect(() => tailLedger({ file: invalidFile })).toThrow(/not valid UTF-8/);
    expect(() => summarizeLedger({ file: invalidFile })).toThrow(/not valid UTF-8/);

    const replacementFile = join(repo, "replacement-char.tsv");
    const replacementContent = `${LEDGER_HEADER}\n2026-11-24T10:00:00.000Z\trun-1\tbuild\tdecision\twhy\tliteral �\tok\n`;
    writeFileSync(replacementFile, replacementContent, "utf8");
    await appendLedgerEntry({
      file: replacementFile,
      runId: "run-1",
      phase: "build",
      decision: "Append after literal replacement character",
      why: "Correctly encoded U+FFFD is valid",
    });
    const tail = tailLedger({ file: replacementFile });
    expect(tail.entries[0]?.evidence).toBe("literal �");
    expect(tail.totalEntries).toBe(2);
  });

  test.skipIf(process.platform === "win32")(
    "publishes created and appended ledgers with owner-only permissions",
    async () => {
      const repo = makeTempDir();
      const input = {
        slug: "private-ledger",
        runId: "run-1",
        phase: "build",
        decision: "Keep history private",
        why: "Ledgers can hold local-only evidence",
        repoRoot: repo,
      };
      const created = await appendLedgerEntry(input);
      expect(statSync(created.file).mode & 0o777).toBe(0o600);
      await appendLedgerEntry({ ...input, decision: "Append keeps the mode" });
      expect(statSync(created.file).mode & 0o777).toBe(0o600);
    },
  );

  test("canonicalizes symlinked --file targets so lock and resume state are shared with --slug", async () => {
    const repo = makeTempDir();
    const canonicalPath = ledgerPathForSlug("symlink-shared", repo);
    const aliasPath = join(repo, "alias.tsv");
    symlinkSync(canonicalPath, aliasPath);

    // Even before the target file exists, dangling symlink resolves to the same canonical ledger path.
    expect(resolveLedgerFilePath({ file: aliasPath, cwd: repo })).toBe(canonicalPath);
    expect(resolveLedgerFilePath({ slug: "symlink-shared", repoRoot: repo })).toBe(canonicalPath);

    const first = await appendLedgerEntry({
      slug: "symlink-shared",
      runId: "run-1",
      phase: "plan",
      decision: "Start via slug",
      why: "Create canonical ledger",
      ts: "2026-11-24T17:00:00.000Z",
      repoRoot: repo,
    });
    expect(first.file).toBe(canonicalPath);
    const contentBeforeAlias = readFileSync(canonicalPath, "utf8");

    const appendViaAlias = (timeoutMs: number) =>
      appendLedgerEntry({
        file: aliasPath,
        runId: "run-2",
        phase: "build",
        decision: "Resume via symlink alias",
        why: "Share lock and run_id history",
        ts: "2026-11-24T17:05:00.000Z",
        lockOptions: { initialDelayMs: 10, maxDelayMs: 20, timeoutMs },
      });

    // Holding the lock on --slug blocks an append via the symlinked --file alias.
    const holderEntered = createDeferred<void>();
    const releaseHolder = createDeferred<void>();
    const holder = withLedgerLock(canonicalPath, async () => {
      holderEntered.resolve();
      await releaseHolder.promise;
    });
    try {
      await holderEntered.promise;
      await expect(appendViaAlias(60)).rejects.toThrow(
        /Timed out waiting for decision ledger lock/,
      );
      expect(readFileSync(canonicalPath, "utf8")).toBe(contentBeforeAlias);
    } finally {
      releaseHolder.resolve();
    }
    await holder;

    const second = await appendViaAlias(3_000);
    expect(second.file).toBe(canonicalPath);
    expect(second.created).toBe(false);
    expect(second.resumed).toBe(true);
    expect(second.previousRunId).toBe("run-1");
    expect(second.appended).toHaveLength(2);
    expect(second.appended[0]).toMatchObject({
      run_id: "run-2",
      phase: "resume",
      decision: "start",
      evidence: "run-1",
    });
    expect(readLedgerEntries(canonicalPath).entries.map((entry) => entry.decision)).toEqual([
      "Start via slug",
      "start",
      "Resume via symlink alias",
    ]);

    // Atomic append leaves no stray temp or lock files alongside the canonical ledger.
    const ledgerDir = join(repo, ".tmp", "ledgers");
    expect(readdirSync(ledgerDir).sort()).toEqual([".ledger-locks", "symlink-shared.tsv"]);
    expect(readdirSync(join(ledgerDir, ".ledger-locks"))).toEqual([]);
  });

  test("canonicalizes --file paths beneath dangling or looping directory symlinks", () => {
    const repo = makeTempDir();
    symlinkSync(join(repo, "ledgers", "later"), join(repo, "alias"));
    symlinkSync("alias", join(repo, "relative-alias"));
    symlinkSync(join(repo, "loop-b"), join(repo, "loop-a"));
    symlinkSync(join(repo, "loop-a"), join(repo, "loop-b"));

    // The missing segments below a dangling directory symlink are kept under its target.
    expect(resolveLedgerFilePath({ file: "alias/task/run.tsv", cwd: repo })).toBe(
      join(repo, "ledgers", "later", "task", "run.tsv"),
    );
    expect(resolveLedgerFilePath({ file: "relative-alias/run.tsv", cwd: repo })).toBe(
      join(repo, "ledgers", "later", "run.tsv"),
    );
    // A symlink cycle stops after the hop limit and keeps the path as given.
    expect(resolveLedgerFilePath({ file: "loop-a/run.tsv", cwd: repo })).toBe(
      join(repo, "loop-a", "run.tsv"),
    );
  });
});
