import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vite-plus/test";

import {
  extractVerificationFlakesLastPr,
  parsePruneCliArgs,
  RETENTION_DAYS,
  SCOUT_STATE_ISSUE_NUMBER as PRUNE_STATE_ISSUE_NUMBER,
  SCOUT_STATE_ISSUE_TITLE as PRUNE_STATE_ISSUE_TITLE,
  selectPrunableVerifications,
} from "./prune-verifications.ts";
import { SCOUT_STATE_ISSUE_NUMBER, SCOUT_STATE_ISSUE_TITLE } from "./scout/state.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("prune-verifications", () => {
  test("uses only Node built-ins so the monthly workflow runs without pnpm install and shares issue #219", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./prune-verifications.ts", import.meta.url)),
      "utf8",
    );
    const specifiers = [...source.matchAll(/^\s*import\s+[\s\S]*?from\s+["']([^"']+)["'];/gm)].map(
      (match) => match[1],
    );

    expect(specifiers.length).toBeGreaterThan(0);
    for (const specifier of specifiers) {
      expect(specifier).toMatch(/^node:/);
    }
    expect(PRUNE_STATE_ISSUE_NUMBER).toBe(SCOUT_STATE_ISSUE_NUMBER);
    expect(PRUNE_STATE_ISSUE_TITLE).toBe(SCOUT_STATE_ISSUE_TITLE);
  });

  test("validates CLI arguments strictly and rejects malformed values or unknown flags", () => {
    expect(parsePruneCliArgs([])).toEqual({
      pathsOnly: false,
      retentionDays: RETENTION_DAYS,
      ref: "HEAD",
    });
    expect(
      parsePruneCliArgs(["--paths", "--retention-days", "45", "--ref", "origin/main"]),
    ).toEqual({
      pathsOnly: true,
      retentionDays: 45,
      ref: "origin/main",
    });

    expect(() => parsePruneCliArgs(["--path"])).toThrow(/Unknown option '--path'/);
    expect(() => parsePruneCliArgs(["--retention-days"])).toThrow(
      /Option '--retention-days <value>' argument missing/,
    );
    expect(() => parsePruneCliArgs(["--retention-days", "0"])).toThrow(/positive integer/);
    expect(() => parsePruneCliArgs(["--retention-days", "30abc"])).toThrow(/positive integer/);
    expect(() => parsePruneCliArgs(["--retention-days", "14.5"])).toThrow(/positive integer/);
    expect(() => parsePruneCliArgs(["--retention-days", "-5"])).toThrow(/argument is ambiguous/);
    expect(() => parsePruneCliArgs(["--ref"])).toThrow(/Option '--ref <value>' argument missing/);
    expect(() => parsePruneCliArgs(["--ref", "--paths"])).toThrow(/argument is ambiguous/);
    expect(() => parsePruneCliArgs(["--ref="])).toThrow(/non-empty git revision/);
    expect(() => parsePruneCliArgs(["--paths", "extra"])).toThrow(/Unexpected argument 'extra'/);
  });

  test("extracts verification-flakes.lastPrNumber and fails closed on missing or invalid markers", () => {
    expect(extractVerificationFlakesLastPr("no marker here")).toBeNull();
    expect(extractVerificationFlakesLastPr("<!-- merit-scout-state: {broken -->")).toBeNull();
    expect(
      extractVerificationFlakesLastPr(
        '<!-- merit-scout-state: {"docs":{"lastRunAt":"2026-11-22T00:00:00Z"}} -->',
      ),
    ).toBeNull();
    expect(
      extractVerificationFlakesLastPr(
        '<!-- merit-scout-state: {"verification-flakes":{"lastPrNumber":0}} -->',
      ),
    ).toBeNull();
    expect(
      extractVerificationFlakesLastPr(
        '<!-- merit-scout-state: {"verification-flakes":{"lastPrNumber":-5}} -->',
      ),
    ).toBeNull();
    expect(
      extractVerificationFlakesLastPr(
        '<!-- merit-scout-state: {"verification-flakes":{"lastPrNumber":215.5}} -->',
      ),
    ).toBeNull();
    expect(
      extractVerificationFlakesLastPr(
        '<!-- merit-scout-state: {"verification-flakes":{"lastPrNumber":223,"lastRunAt":"2026-11-22T00:00:00Z"}} -->',
      ),
    ).toBe(223);
  });

  test("selects only scouted verification files at or past the retention cutoff, sorted numerically", () => {
    const nowMs = Date.UTC(2026, 11, 1, 6, 0, 0);
    const records = [
      {
        path: "verifications/220.md",
        prNumber: 220,
        lastCommitMs: nowMs - (RETENTION_DAYS + 1) * DAY_MS,
      },
      {
        path: "verifications/205.md",
        prNumber: 205,
        lastCommitMs: nowMs - (RETENTION_DAYS + 5) * DAY_MS,
      },
      {
        path: "verifications/99.md",
        prNumber: 99,
        lastCommitMs: nowMs - RETENTION_DAYS * DAY_MS,
      },
      {
        path: "verifications/210.md",
        prNumber: 210,
        lastCommitMs: nowMs - (RETENTION_DAYS - 1) * DAY_MS,
      },
      {
        path: "verifications/225.md",
        prNumber: 225,
        lastCommitMs: nowMs - 45 * DAY_MS,
      },
      {
        path: "verifications/150.md",
        prNumber: 150,
        lastCommitMs: Number.NaN,
      },
      {
        path: "docs/README.md",
        prNumber: 100,
        lastCommitMs: nowMs - 90 * DAY_MS,
      },
      {
        path: "verifications/200.md",
        prNumber: 201,
        lastCommitMs: nowMs - 90 * DAY_MS,
      },
    ];

    expect(selectPrunableVerifications({ records, lastScoutedPr: null, nowMs })).toEqual([]);
    expect(selectPrunableVerifications({ records, lastScoutedPr: 0, nowMs })).toEqual([]);
    expect(selectPrunableVerifications({ records, lastScoutedPr: 220, nowMs: Number.NaN })).toEqual(
      [],
    );
    expect(
      selectPrunableVerifications({
        records,
        lastScoutedPr: 220,
        nowMs,
        retentionDays: Number.NaN,
      }),
    ).toEqual([]);
    expect(
      selectPrunableVerifications({ records, lastScoutedPr: 220, nowMs, retentionDays: 0 }),
    ).toEqual([]);
    expect(
      selectPrunableVerifications({ records, lastScoutedPr: 220, nowMs, retentionDays: -5 }),
    ).toEqual([]);
    expect(selectPrunableVerifications({ records, lastScoutedPr: 220, nowMs })).toEqual([
      "verifications/99.md",
      "verifications/205.md",
      "verifications/220.md",
    ]);
  });
});
