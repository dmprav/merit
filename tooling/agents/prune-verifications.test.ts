import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vite-plus/test";

import {
  parsePruneCliArgs,
  RETENTION_DAYS,
  selectPrunableVerifications,
} from "./prune-verifications.ts";
import { readRecordsLastPrNumber } from "./scout/state-marker.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("prune-verifications", () => {
  test("imports only Node built-ins and the import-free state marker module so the monthly workflow runs without pnpm install", () => {
    const prune = (name: string) =>
      readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");

    const specifiersOf = (source: string) =>
      [...source.matchAll(/^\s*import\s+[\s\S]*?from\s+["']([^"']+)["'];/gm)].map(
        (match) => match[1],
      );

    const specifiers = specifiersOf(prune("./prune-verifications.ts"));
    expect(specifiers.length).toBeGreaterThan(0);
    for (const specifier of specifiers) {
      expect(specifier).toMatch(/^(?:node:|\.\/scout\/state-marker\.ts$)/);
    }
    expect(specifiersOf(prune("./scout/state-marker.ts"))).toEqual([]);
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

  test("reads records.lastPrNumber, falling back to the old verification-flakes cursor, and fails closed", () => {
    const marker = (state: unknown) => `<!-- merit-scout-state: ${JSON.stringify(state)} -->`;

    expect(readRecordsLastPrNumber("no marker here")).toBeNull();
    expect(readRecordsLastPrNumber("<!-- merit-scout-state: {broken -->")).toBeNull();
    expect(
      readRecordsLastPrNumber(marker({ docs: { lastRunAt: "2026-11-22T00:00:00Z" } })),
    ).toBeNull();
    for (const lastPrNumber of [0, -5, 215.5, "223"]) {
      expect(readRecordsLastPrNumber(marker({ records: { lastPrNumber } }))).toBeNull();
      expect(
        readRecordsLastPrNumber(marker({ "verification-flakes": { lastPrNumber } })),
      ).toBeNull();
    }
    expect(readRecordsLastPrNumber(marker({ records: { lastPrNumber: 240 } }))).toBe(240);
    expect(readRecordsLastPrNumber(marker({ "verification-flakes": { lastPrNumber: 223 } }))).toBe(
      223,
    );
    expect(
      readRecordsLastPrNumber(
        marker({ records: { lastPrNumber: 240 }, "verification-flakes": { lastPrNumber: 223 } }),
      ),
    ).toBe(240);
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
