import { normalizeRepoPath } from "../../cli.ts";

export type VerificationFileEntry = {
  prNumber: number;
  path: string;
};

const NON_PRODUCTION_PATH_PATTERN =
  /(?:^|\/)(?:testing|__tests__|fixtures)\/|\.(?:test|spec|integration|stories|story-fixtures)\.tsx?$|(?:^|\/)vite\.config\.ts$/;

export const isProductionSourcePath = (filePath: string): boolean =>
  !NON_PRODUCTION_PATH_PATTERN.test(normalizeRepoPath(filePath));

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
