import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RECORD_DIRECTORY = "verifications";

/** Sections every record contains, in this order; the verification guide defines each one. */
export const RECORD_SECTIONS = [
  "Checks run",
  "Could not verify",
  "Did not verify",
  "Dismissed review findings",
] as const;

/** Dependency bots open pull requests without an agent or contributor to verify them. */
export const EXEMPT_AUTHORS = new Set(["renovate[bot]", "dependabot[bot]"]);

const GUIDE = "docs/guides/verification.md#record-verification";

export type ChangedFile = { status: "added" | "modified" | "deleted"; path: string };

export type RecordCheck = { exempt: string } | { exempt: null; errors: string[] };

export const recordPath = (prNumber: number) => `${RECORD_DIRECTORY}/${prNumber}.md`;

const isRecordPath = (path: string) => path.startsWith(`${RECORD_DIRECTORY}/`);

/** Parses `git diff --name-status` output; a rename removes the old path and adds the new one. */
export const parseNameStatus = (raw: string): ChangedFile[] =>
  raw
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line): ChangedFile[] => {
      const [status = "", first = "", second] = line.split("\t");
      if (status.startsWith("R") && second) {
        return [
          { status: "deleted", path: first },
          { status: "added", path: second },
        ];
      }
      if (status.startsWith("D")) {
        return [{ status: "deleted", path: first }];
      }
      if (status.startsWith("A") || (status.startsWith("C") && second)) {
        return [{ status: "added", path: second ?? first }];
      }
      return [{ status: "modified", path: first }];
    });

type Section = { heading: string; hasContent: boolean };

/** Removes HTML comment text from a line, tracking comments that span lines. */
const visibleText = (line: string, inComment: boolean) => {
  let visible = "";
  let rest = line;
  let commented = inComment;
  while (rest) {
    const marker = commented ? "-->" : "<!--";
    const index = rest.indexOf(marker);
    if (!commented) {
      visible += index < 0 ? rest : rest.slice(0, index);
    }
    rest = index < 0 ? "" : rest.slice(index + marker.length);
    commented = index < 0 ? commented : !commented;
  }
  return { visible, inComment: commented };
};

/**
 * Collects level-two sections, treating fenced code as section content rather
 * than headings and ignoring HTML comments.
 */
const recordSections = (content: string): Section[] => {
  const sections: Section[] = [];
  let fence: RegExp | null = null;
  let inComment = false;

  for (const line of content.split(/\r?\n/)) {
    const current = sections.at(-1);
    if (fence) {
      fence = fence.test(line) ? null : fence;
      if (current) {
        current.hasContent = true;
      }
      continue;
    }

    const text = visibleText(line, inComment);
    inComment = text.inComment;
    const opening = /^ {0,3}(`{3,}|~{3,})/.exec(text.visible)?.[1];
    const heading = /^## +(.+?)\s*$/.exec(text.visible)?.[1];
    if (opening) {
      fence = new RegExp(`^ {0,3}${opening[0]}{${opening.length},}\\s*$`);
    }
    if (heading && !opening) {
      sections.push({ heading, hasContent: false });
    } else if (current && text.visible.trim()) {
      current.hasContent = true;
    }
  }
  return sections;
};

/** Returns a problem for each missing, reordered, unexpected, or empty section. */
export const checkRecordContent = (path: string, content: string): string[] => {
  const sections = recordSections(content);
  const headings = sections.map((section) => section.heading);

  if (headings.join("\n") !== RECORD_SECTIONS.join("\n")) {
    return [
      `${path} must contain exactly these sections, in order: ${RECORD_SECTIONS.map((s) => `"## ${s}"`).join(", ")}. Found: ${headings.length > 0 ? headings.map((h) => `"## ${h}"`).join(", ") : "none"}.`,
    ];
  }

  return sections.flatMap(({ heading, hasContent }) =>
    hasContent ? [] : [`${path}: "## ${heading}" is empty; write "None." if nothing applies.`],
  );
};

export const checkVerificationRecord = ({
  prNumber,
  author,
  changedFiles,
  readRecord,
}: {
  prNumber: number;
  author: string;
  changedFiles: ChangedFile[];
  readRecord: (path: string) => string | undefined;
}): RecordCheck => {
  if (EXEMPT_AUTHORS.has(author)) {
    return { exempt: `${author} pull requests do not need a verification record.` };
  }

  if (changedFiles.length === 0) {
    return { exempt: "The pull request changes no files." };
  }

  const records = changedFiles.filter((file) => isRecordPath(file.path));
  if (records.length === changedFiles.length && records.every((f) => f.status === "deleted")) {
    return { exempt: "The pull request only removes verification records." };
  }

  const ownPath = recordPath(prNumber);
  const errors = records
    .filter((file) => file.path !== ownPath && file.status !== "deleted")
    .map(
      (file) =>
        `${file.path}: a pull request may add or change only its own record, ${ownPath}. Move this record there.`,
    );

  const ownRecord = records.find((file) => file.path === ownPath && file.status !== "deleted");
  const content = ownRecord ? readRecord(ownPath) : undefined;
  if (content === undefined) {
    errors.push(`Add ${ownPath} describing how this change was verified. See ${GUIDE}.`);
  } else {
    errors.push(...checkRecordContent(ownPath, content));
  }

  return { exempt: null, errors };
};

const requireEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
};

const runCli = () => {
  const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const prNumber = Number(requireEnv("PR_NUMBER"));
  const diffRange = `${requireEnv("PR_BASE_SHA")}...${requireEnv("PR_HEAD_SHA")}`;
  const raw = execFileSync("git", ["diff", "--name-status", "-M", diffRange], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  const result = checkVerificationRecord({
    prNumber,
    author: requireEnv("PR_AUTHOR"),
    changedFiles: parseNameStatus(raw),
    readRecord: (path) => {
      const file = join(repoRoot, path);
      return existsSync(file) ? readFileSync(file, "utf8") : undefined;
    },
  });

  const summary =
    result.exempt === null
      ? result.errors.length === 0
        ? `Verification record ${recordPath(prNumber)} is complete.`
        : `Verification record problems:\n\n${result.errors.map((e) => `- ${e}`).join("\n")}`
      : `Verification record not required: ${result.exempt}`;
  process.stdout.write(`${summary}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Verification record\n\n${summary}\n`);
  }

  if (result.exempt === null && result.errors.length > 0) {
    for (const error of result.errors) {
      process.stdout.write(`::error::${error}\n`);
    }
    process.exitCode = 1;
  }
};

const entryPath = process.argv[1];
if (entryPath && resolve(entryPath) === fileURLToPath(import.meta.url)) {
  runCli();
}
