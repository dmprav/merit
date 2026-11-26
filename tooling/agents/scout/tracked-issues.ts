import { matchesGlob } from "node:path";

import { normalizeRepoPath } from "../../cli.ts";
import {
  parseProposalMarker,
  TRUSTED_AUTHOR_ASSOCIATIONS,
} from "../../verification/agent-policy.ts";

/** Indexes tracked issue numbers per normalized path from open and wontfix `<!-- merit-proposal -->` markers. */
export const buildTrackedPathsIndex = (
  issues: ReadonlyArray<{ number: number; body?: string }>,
): Map<string, number[]> => {
  const byPath = new Map<string, Set<number>>();
  for (const issue of issues) {
    if (!issue.body) {
      continue;
    }
    const marker = parseProposalMarker(issue.body);
    if (!marker) {
      continue;
    }
    for (const rawPath of marker.paths) {
      const normalized = normalizeRepoPath(rawPath);
      const bucket = byPath.get(normalized) ?? new Set<number>();
      bucket.add(issue.number);
      byPath.set(normalized, bucket);
    }
  }
  const result = new Map<string, number[]>();
  for (const [filePath, numbers] of byPath) {
    result.set(
      filePath,
      [...numbers].sort((a, b) => a - b),
    );
  }
  return result;
};

/** Extracts the latest trusted maintainer comment on a closed `wontfix` issue as a compact single-line reason. */
export const extractLatestTrustedRejectionReason = (
  comments: ReadonlyArray<{ authorAssociation?: string; body?: string }> | undefined,
): string | undefined => {
  if (!comments || comments.length === 0) {
    return undefined;
  }
  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const comment = comments[index];
    if (!comment?.body || !TRUSTED_AUTHOR_ASSOCIATIONS.has(comment.authorAssociation ?? "")) {
      continue;
    }
    const stripped = comment.body
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!stripped) {
      continue;
    }
    return stripped.length > 200 ? `${stripped.slice(0, 197)}...` : stripped;
  }
  return undefined;
};

const matchesTrackedMarkerPath = (filePath: string, markerPath: string): boolean => {
  if (filePath === markerPath) {
    return true;
  }
  if (/[*?{}[\]]/.test(markerPath)) {
    return matchesGlob(filePath, markerPath);
  }
  const dirPrefix = markerPath.endsWith("/") ? markerPath : `${markerPath}/`;
  return filePath.startsWith(dirPrefix);
};

export const trackedByForPaths = (
  paths: readonly string[],
  trackedPathsByIssue: ReadonlyMap<string, number[]>,
): number[] => {
  const issues = new Set<number>();
  for (const rawPath of paths) {
    const normalized = normalizeRepoPath(rawPath);
    for (const issueNumber of trackedPathsByIssue.get(normalized) ?? []) {
      issues.add(issueNumber);
    }
    for (const [markerPath, issueNumbers] of trackedPathsByIssue) {
      if (markerPath === normalized) {
        continue;
      }
      if (matchesTrackedMarkerPath(normalized, markerPath)) {
        for (const issueNumber of issueNumbers) {
          issues.add(issueNumber);
        }
      }
    }
  }
  return [...issues].sort((a, b) => a - b);
};
