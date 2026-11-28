import { matchesGlob } from "node:path";

import { normalizeRepoPath } from "../../cli.ts";

export type VerificationFileEntry = {
  prNumber: number;
  path: string;
};

const SECURITY_FOUNDATION_SLICES = new Set([
  "foundation/ai",
  "foundation/auth",
  "foundation/db",
  "foundation/storage",
]);

export const listDocAreas = (trackedFiles: readonly string[]): string[] => {
  const areas = new Set<string>();
  for (const filePath of trackedFiles) {
    if (!/\.(?:md|mdx)$/.test(filePath)) {
      continue;
    }
    if (
      filePath.startsWith(".github/") ||
      filePath.startsWith(".agents/") ||
      filePath.startsWith("verifications/")
    ) {
      continue;
    }
    const parts = filePath.split("/");
    areas.add(parts.length <= 2 ? "." : `${parts[0]}/${parts[1]}`);
  }
  return [...areas].sort();
};

export const listPackageSlices = (trackedFiles: readonly string[]): string[] => {
  const slices = new Set<string>();
  for (const filePath of trackedFiles) {
    const parts = filePath.split("/");
    if (
      (parts[0] === "capabilities" || parts[0] === "foundation" || parts[0] === "interfaces") &&
      parts[1]
    ) {
      slices.add(`${parts[0]}/${parts[1]}`);
    } else if (filePath.startsWith("app/src/")) {
      slices.add("app");
    } else if (filePath.startsWith("tooling/testing/")) {
      slices.add("tooling/testing");
    }
  }
  return [...slices].sort();
};

export const listSecuritySlices = (trackedFiles: readonly string[]): string[] => {
  const slices = new Set<string>();
  for (const filePath of trackedFiles) {
    if (filePath.startsWith("app/src/")) {
      slices.add("app");
      continue;
    }
    const parts = filePath.split("/");
    const slice = parts[0] && parts[1] ? `${parts[0]}/${parts[1]}` : null;
    if (!slice) {
      continue;
    }
    if (
      parts[0] === "capabilities" ||
      parts[0] === "interfaces" ||
      (parts[0] === "foundation" &&
        (SECURITY_FOUNDATION_SLICES.has(slice) || filePath.includes("/server/")))
    ) {
      slices.add(slice);
    }
  }
  return [...slices].sort();
};

export const listMcpDbSlices = (trackedFiles: readonly string[]): string[] => {
  const slices = new Set<string>();
  for (const filePath of trackedFiles) {
    const parts = filePath.split("/");
    const slice = parts[0] && parts[1] ? `${parts[0]}/${parts[1]}` : null;
    if (!slice) {
      continue;
    }
    if (
      (parts[0] === "capabilities" && (parts[2] === "ai" || filePath.includes("/src/server/"))) ||
      slice === "foundation/db" ||
      slice === "foundation/ai" ||
      slice === "interfaces/mcp"
    ) {
      slices.add(slice);
    }
  }
  return [...slices].sort();
};

const NON_PRODUCTION_PATH_PATTERN =
  /(?:^|\/)(?:testing|__tests__|fixtures)\/|\.(?:test|spec|integration|stories|story-fixtures)\.tsx?$|(?:^|\/)vite\.config\.ts$/;

export const isProductionSourcePath = (filePath: string): boolean =>
  !NON_PRODUCTION_PATH_PATTERN.test(normalizeRepoPath(filePath));

export const matchesAnyPattern = (filePath: string, patterns: readonly string[]): boolean => {
  const normalized = normalizeRepoPath(filePath);
  return patterns.some((pattern) => matchesGlob(normalized, pattern));
};

export const collectUnreadVerifications = (
  trackedFiles: readonly string[],
  lastPrNumber: number | undefined,
): VerificationFileEntry[] => {
  const minPr = lastPrNumber ?? 0;
  const entries: VerificationFileEntry[] = [];
  for (const filePath of trackedFiles) {
    const match = /^verifications\/(\d+)\.md$/.exec(filePath);
    if (!match?.[1]) {
      continue;
    }
    const prNumber = Number.parseInt(match[1], 10);
    if (prNumber > minPr) {
      entries.push({ prNumber, path: filePath });
    }
  }
  return entries.sort((a, b) => a.prNumber - b.prNumber);
};
