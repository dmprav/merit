import { matchesGlob } from "node:path";

import { normalizeRepoPath } from "../../cli.ts";
import {
  parseProposalMarker,
  TRUSTED_AUTHOR_ASSOCIATIONS,
} from "../../verification/agent-policy.ts";
import type { IssueListItem } from "../github.ts";

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

/** Rejection reasons longer than this are cut short with an ellipsis. */
const REJECTION_REASON_MAX_LENGTH = 200;
const ELLIPSIS = "...";

const truncate = (text: string, maxLength: number): string =>
  text.length > maxLength ? `${text.slice(0, maxLength - ELLIPSIS.length)}${ELLIPSIS}` : text;

/** Collapses a comment body to one line without HTML comments such as bot markers. */
const compactCommentBody = (body: string): string =>
  body
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Extracts the latest trusted maintainer comment on a closed `wontfix` issue as a compact single-line reason. */
export const extractLatestTrustedRejectionReason = (
  comments: ReadonlyArray<{ authorAssociation?: string; body?: string }> | undefined,
): string | undefined => {
  for (const comment of [...(comments ?? [])].reverse()) {
    const reason = TRUSTED_AUTHOR_ASSOCIATIONS.has(comment.authorAssociation ?? "")
      ? compactCommentBody(comment.body ?? "")
      : "";
    if (reason) {
      return truncate(reason, REJECTION_REASON_MAX_LENGTH);
    }
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

/** Issues whose proposal markers cover any of `paths`, as exact paths, globs, or parent directories. */
export const trackedByForPaths = (
  paths: readonly string[],
  trackedPathsByIssue: ReadonlyMap<string, number[]>,
): number[] => {
  const issues = new Set<number>();
  for (const filePath of paths.map(normalizeRepoPath)) {
    for (const [markerPath, issueNumbers] of trackedPathsByIssue) {
      if (matchesTrackedMarkerPath(filePath, markerPath)) {
        issueNumbers.forEach((issueNumber) => issues.add(issueNumber));
      }
    }
  }
  return [...issues].sort((a, b) => a - b);
};

export type OpenIssueSummary = { number: number; title: string; labels: string[] };

export type WontfixIssueSummary = { number: number; title: string; reason?: string };

export const summarizeOpenIssue = ({
  number,
  title,
  labels,
}: Pick<IssueListItem, "number" | "title" | "labels">): OpenIssueSummary => ({
  number,
  title,
  labels,
});

/** Keeps a rejected proposal's title with the maintainer's reason so scouts do not propose it again. */
export const summarizeWontfixIssue = ({
  number,
  title,
  comments,
}: Pick<IssueListItem, "number" | "title" | "comments">): WontfixIssueSummary => {
  const reason = extractLatestTrustedRejectionReason(comments);
  return { number, title, ...(reason ? { reason } : {}) };
};
