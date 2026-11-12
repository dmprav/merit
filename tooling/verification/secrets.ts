import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, type Stats } from "node:fs";
import { extname } from "node:path";

import { lintSource } from "@secretlint/core";
import { loadFormatter } from "@secretlint/formatter";
import type { SecretLintCoreResult } from "@secretlint/types";

import { config } from "./secrets.config.ts";

const mode = process.argv[2] ?? "files";

if (process.argv.length > 3 || !["files", "staged", "history"].includes(mode)) {
  throw new Error("Expected secrets.ts [files|staged|history].");
}

type Source = { path: string; label: string; content: Buffer };

type Blob = { sha: string; path: string };

const git = (args: string[], input?: string) =>
  execFileSync("git", args, { input, maxBuffer: 1024 ** 3 });

const isFile = (path: string) => {
  let stats: Stats;
  try {
    stats = lstatSync(path);
  } catch {
    return false;
  }
  // Symlinks and submodule directories are not file content.
  return stats.isFile();
};

// Read blobs in bounded batches so a long history never holds every object in memory at once.
const readBlobs = function* (blobs: Blob[], label: (blob: Blob) => string): Generator<Source> {
  for (let offset = 0; offset < blobs.length; offset += 256) {
    const batch = blobs.slice(offset, offset + 256);
    const output = git(["cat-file", "--batch"], batch.map(({ sha }) => `${sha}\n`).join(""));
    let position = 0;

    for (const blob of batch) {
      const headerEnd = output.indexOf(0x0a, position);
      const [, type, size] = output.subarray(position, headerEnd).toString("utf8").split(" ");
      const start = headerEnd + 1;
      const end = start + Number(size);
      position = end + 1;

      if (type === "blob") {
        yield { path: blob.path, label: label(blob), content: output.subarray(start, end) };
      }
    }
  }
};

// Git selects source, including new files and force-added ignored files, without local secrets or build output.
const workingFiles = function* (): Generator<Source> {
  const paths = git([
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "--deduplicate",
    "-z",
  ])
    .toString("utf8")
    .split("\0")
    .filter((path) => path && isFile(path));

  for (const path of paths) {
    yield { path, label: path, content: readFileSync(path) };
  }
};

// The index snapshot, not the working copy, is what the next commit records.
const stagedFiles = function (): Generator<Source> {
  const fields = git([
    "diff",
    "--cached",
    "--raw",
    "-z",
    "--no-renames",
    "--no-abbrev",
    "--diff-filter=d",
  ])
    .toString("utf8")
    .split("\0");
  const blobs: Blob[] = [];

  for (let index = 0; index + 1 < fields.length; index += 2) {
    const [, mode, , sha] = fields[index]!.split(" ");
    if (sha && (mode === "100644" || mode === "100755")) {
      blobs.push({ sha, path: fields[index + 1]! });
    }
  }
  return readBlobs(blobs, ({ path }) => path);
};

// Every file version reachable from any ref, including content later removed or rewritten.
const historyFiles = function (): Generator<Source> {
  const blobs = git(["rev-list", "--objects", "--all", "--filter=object:type=blob"])
    .toString("utf8")
    .split("\n")
    .flatMap((line): Blob[] => {
      const separator = line.indexOf(" ");
      return separator > 0
        ? [{ sha: line.slice(0, separator), path: line.slice(separator + 1) }]
        : [];
    });

  return readBlobs(blobs, ({ sha, path }) => `${path} (blob ${sha.slice(0, 12)})`);
};

const sources =
  mode === "staged" ? stagedFiles() : mode === "history" ? historyFiles() : workingFiles();
const findings: SecretLintCoreResult[] = [];
let scanned = 0;

for (const source of sources) {
  // Binary content cannot be decoded as text; Git uses the same NUL-byte heuristic.
  if (source.content.subarray(0, 8000).includes(0)) {
    continue;
  }
  scanned += 1;

  const result = await lintSource({
    source: {
      content: source.content.toString("utf8"),
      filePath: source.label,
      ext: extname(source.path),
      contentType: "text",
    },
    options: { config, maskSecrets: true, noPhysicFilePath: mode !== "files" },
  });

  if (result.messages.length > 0) {
    findings.push(result);
  }
}

if (findings.length > 0) {
  const { format } = await loadFormatter({ formatterName: "stylish", color: false });
  console.error(format(findings));

  if (mode === "history") {
    console.error(
      "Find the commits that contain a blob with `git log --all --find-object=<blob>`.",
    );
  }
  process.exitCode = 1;
} else {
  console.log(
    `Secretlint found no secrets in ${scanned} ${mode === "history" ? "file versions" : "files"}.`,
  );
}
