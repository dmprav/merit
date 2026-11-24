import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
    expect(() => parseLogArgs(["--slug", "feat-one", "--bogus", "1"])).toThrow(/Unknown argument/);
    expect(() => parseLogArgs(["--slug", "feat-one", "--json=true"])).toThrow(
      /--json does not accept a value/,
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
    expect(() => parseTailArgs(["--slug", "feat-one", "--limit", "0"])).toThrow(/Invalid --limit/);
    expect(() => parseTailArgs(["--slug", "feat-one", "--limit", "-3"])).toThrow(/Invalid --limit/);
    expect(() => parseTailArgs(["--slug", "feat-one", "--limit", "10abc"])).toThrow(
      /Invalid --limit/,
    );

    expect(parseSummaryArgs(["--slug", "feat-one", "--json"])).toEqual({
      slug: "feat-one",
      file: undefined,
      json: true,
    });
    expect(() => parseSummaryArgs([])).toThrow(/Missing --slug/);
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

    // When a new run_id explicitly logs a `start` row, do NOT insert a duplicate start row.
    const fourth = await appendLedgerEntry({
      slug: "auth-migration",
      runId: "run-3",
      phase: "resume",
      decision: "start",
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

    const all = readLedgerEntries(first.file);
    expect(all.exists).toBe(true);
    expect(all.entries).toHaveLength(5);

    // Every physical line in the file has strictly 7 tab-separated columns.
    const physicalLines = readFileSync(first.file, "utf8").trimEnd().split("\n");
    expect(physicalLines).toHaveLength(6); // 1 header + 5 entries
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

    // Rejects invalid --ts or whitespace-only required fields before touching disk.
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
    expect(summary.decisions[0]).toBe("[build] Decision 1 — Reason 1");
    expect(summary.decisions[5]).toBe("[verify] Decision 6 — Reason 6 (pass) [evidence: check-6]");

    const formattedSummary = formatSummaryOutput(summary);
    expect(formattedSummary).toContain("runs (2): run-a");
    expect(formattedSummary).toContain("phases:  build=3, resume=1, verify=3");
    expect(formattedSummary).toContain("- [verify] Decision 6 — Reason 6");
  });

  test("executes CLI log, tail, summary, and help commands in both text and --json modes", async () => {
    const repo = makeTempDir();

    const helpText = await executeLedgerCli(["--help"], { repoRoot: repo });
    expect(helpText).toContain("Usage: vp run agent:ledger");

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

  test("enforces lock exclusion, preserves live-PID locks, and recovers dead-PID or corrupt locks", async () => {
    const repo = makeTempDir();
    const filePath = ledgerPathForSlug("lock-test", repo);
    const lockPath = ledgerLockPathForFile(filePath);
    mkdirSync(join(repo, ".tmp", "ledgers"), { recursive: true });

    // Deterministic contention barrier between two in-process holders.
    const holderEntered = createDeferred<void>();
    const releaseHolder = createDeferred<void>();
    let waiterEntered = false;

    const holder = withLedgerLock(
      filePath,
      async () => {
        holderEntered.resolve();
        await releaseHolder.promise;
        return "first";
      },
      { initialDelayMs: 5, maxDelayMs: 15, timeoutMs: 3_000 },
    );

    await holderEntered.promise;
    expect(existsSync(lockPath)).toBe(true);

    const waiter = withLedgerLock(
      filePath,
      () => {
        waiterEntered = true;
        return "second";
      },
      { initialDelayMs: 5, maxDelayMs: 15, timeoutMs: 3_000 },
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(waiterEntered).toBe(false);

    releaseHolder.resolve();
    expect(await Promise.all([holder, waiter])).toEqual(["first", "second"]);
    expect(existsSync(lockPath)).toBe(false);

    // Live-PID lock must NOT be cleared solely by age.
    const livePayload = `${JSON.stringify({ pid: process.pid, token: "live", createdAt: 0 })}\n`;
    writeFileSync(lockPath, livePayload, "utf8");
    const expired = new Date(Date.now() - 60_000);
    utimesSync(lockPath, expired, expired);

    await expect(
      withLedgerLock(filePath, () => "nope", {
        staleMs: 5_000,
        timeoutMs: 60,
        initialDelayMs: 10,
        maxDelayMs: 20,
      }),
    ).rejects.toThrow(/Timed out waiting for decision ledger lock/);
    expect(readFileSync(lockPath, "utf8")).toBe(livePayload);

    // Dead-PID lock is recovered immediately.
    const exited = spawnSync(process.execPath, ["-e", ""]);
    expect(exited.pid).toBeGreaterThan(0);
    writeFileSync(
      lockPath,
      `${JSON.stringify({ pid: exited.pid, token: "dead", createdAt: Date.now() })}\n`,
      "utf8",
    );
    expect(await withLedgerLock(filePath, () => "recovered-dead", { timeoutMs: 2_000 })).toBe(
      "recovered-dead",
    );
    expect(existsSync(lockPath)).toBe(false);

    // Corrupt lock is recovered once past the write-grace window.
    writeFileSync(lockPath, "{corrupt", "utf8");
    utimesSync(lockPath, expired, expired);
    expect(
      await withLedgerLock(filePath, () => "recovered-corrupt", {
        staleMs: 5_000,
        timeoutMs: 2_000,
      }),
    ).toBe("recovered-corrupt");
    expect(existsSync(lockPath)).toBe(false);
  });
});
