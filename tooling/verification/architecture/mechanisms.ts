import { execFileSync } from "node:child_process";
import { existsSync, globSync, readFileSync, statSync } from "node:fs";
import { join, matchesGlob, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MAX_SUMMARY_LENGTH,
  MECHANISMS,
  mechanismSchema,
  type Mechanism,
} from "./mechanisms.config";

export type MechanismImpact = "extends" | "composes";

export type MatchedMechanism = {
  mechanism: Mechanism;
  impact: MechanismImpact;
  matchedPaths: string[];
};

export type MechanismClassification = {
  risk: "none" | MechanismImpact;
  paths: string[];
  matched: MatchedMechanism[];
};

const normalizePath = (value: string) => value.replaceAll("\\", "/").replace(/^\.\//, "");

/** Converts a Markdown heading to the GitHub/remark anchor slug used in doc links. */
const slugifyHeading = (heading: string) =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[`*_~()[\]<>.,:;!?'"]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

const collectMarkdownAnchors = (content: string) => {
  const anchors = new Set<string>();
  let inFence = false;
  for (const line of content.split(/\r?\n/)) {
    if (/^\s*(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }
    const match = /^ {0,3}#{1,6}\s+(.+?)\s*#*$/.exec(line);
    if (match?.[1]) {
      anchors.add(slugifyHeading(match[1]));
    }
  }
  return anchors;
};

const isSupersededDecision = (content: string) => {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const statusMatch = /^\*?\*?status:?\*?\*?\s*(.*)$/i.exec(line);
    if (statusMatch?.[1]) {
      return /^superseded\b/i.test(statusMatch[1]);
    }
    return /^superseded\b/i.test(line);
  }
  return false;
};

const checkDocReference = (repoRoot: string, ref: string): string | null => {
  const [rawFilePath, anchor] = ref.split("#");
  const filePath = rawFilePath ?? "";
  if (!filePath) {
    return "empty file reference";
  }

  const target = join(repoRoot, filePath);
  if (!existsSync(target) || !statSync(target).isFile()) {
    return `file does not exist on disk: ${filePath}`;
  }

  if (anchor) {
    const anchors = collectMarkdownAnchors(readFileSync(target, "utf8"));
    if (!anchors.has(anchor)) {
      return `missing heading anchor #${anchor} in ${filePath}`;
    }
  }

  return null;
};

const checkGlobPattern = (repoRoot: string, pattern: string): string | null => {
  const normalized = normalizePath(pattern);
  const matches = globSync(normalized, { cwd: repoRoot });
  if (matches.length === 0) {
    return `pattern matches no files on disk: ${pattern}`;
  }
  return null;
};

export const validateMechanismMap = (
  mechanisms: readonly Mechanism[],
  repoRoot: string,
): string[] => {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (const raw of mechanisms) {
    const parsed = mechanismSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(`invalid mechanism schema (${raw.id}): ${parsed.error.message}`);
      continue;
    }
    const mech = parsed.data;
    if (seenIds.has(mech.id)) {
      errors.push(`duplicate mechanism id: ${mech.id}`);
    }
    seenIds.add(mech.id);

    if (mech.summary.includes("\n")) {
      errors.push(`${mech.id}: summary must be a single line`);
    }
    if (mech.summary.length > MAX_SUMMARY_LENGTH) {
      errors.push(
        `${mech.id}: summary is ${mech.summary.length} chars (max ${MAX_SUMMARY_LENGTH})`,
      );
    }

    for (const pattern of mech.contracts) {
      const issue = checkGlobPattern(repoRoot, pattern);
      if (issue) {
        errors.push(`${mech.id} contract "${pattern}": ${issue}`);
      }
    }

    for (const pattern of mech.adapters) {
      const issue = checkGlobPattern(repoRoot, pattern);
      if (issue) {
        errors.push(`${mech.id} adapter "${pattern}": ${issue}`);
      }
    }

    for (const doc of mech.docs) {
      const issue = checkDocReference(repoRoot, doc);
      if (issue) {
        errors.push(`${mech.id} doc "${doc}": ${issue}`);
      }
    }

    for (const decision of mech.decisions) {
      const issue = checkDocReference(repoRoot, decision);
      if (issue) {
        errors.push(`${mech.id} decision "${decision}": ${issue}`);
        continue;
      }
      const content = readFileSync(join(repoRoot, decision), "utf8");
      if (isSupersededDecision(content)) {
        errors.push(`${mech.id} decision "${decision}" is superseded; link its replacement`);
      }
    }
  }

  return errors;
};

const matchesPathOrDir = (inputPath: string, pattern: string) => {
  const normalized = normalizePath(inputPath);
  if (matchesGlob(normalized, pattern)) {
    return true;
  }
  const dir = normalized.replace(/\/$/, "");
  return matchesGlob(`${dir}/__probe__`, pattern);
};

export const classifyChangedPaths = ({
  paths,
  mechanisms = MECHANISMS,
}: {
  paths: readonly string[];
  mechanisms?: readonly Mechanism[];
}): MechanismClassification => {
  const normalizedPaths = paths.map(normalizePath).filter(Boolean);
  const matched: MatchedMechanism[] = [];

  for (const mechanism of mechanisms) {
    const matchedContracts = normalizedPaths.filter((p) =>
      mechanism.contracts.some((pattern) => matchesPathOrDir(p, pattern)),
    );
    const matchedAdapters = normalizedPaths.filter((p) =>
      mechanism.adapters.some((pattern) => matchesPathOrDir(p, pattern)),
    );

    if (matchedContracts.length === 0 && matchedAdapters.length === 0) {
      continue;
    }

    const impact: MechanismImpact = matchedContracts.length > 0 ? "extends" : "composes";
    matched.push({
      mechanism,
      impact,
      matchedPaths: [...new Set([...matchedContracts, ...matchedAdapters])].sort(),
    });
  }

  const risk = matched.some((entry) => entry.impact === "extends")
    ? "extends"
    : matched.length > 0
      ? "composes"
      : "none";

  return { risk, paths: normalizedPaths, matched };
};

export const formatMechanismReport = (classification: MechanismClassification) => {
  if (classification.matched.length === 0) {
    return `mechanisms: risk=none (${classification.paths.length} path(s), no cross-cutting mechanisms matched)`;
  }

  const lines = [
    `mechanisms: risk=${classification.risk} (${classification.matched.length} mechanism(s) matched across ${classification.paths.length} path(s))`,
  ];

  for (const entry of classification.matched) {
    const { mechanism } = entry;
    lines.push("", `- ${mechanism.id} [${entry.impact}] — ${mechanism.summary}`);
    lines.push(`    paths: ${entry.matchedPaths.join(", ")}`);
    lines.push(`    docs: ${mechanism.docs.join(", ")}`);
    if (mechanism.decisions.length > 0) {
      lines.push(`    decisions: ${mechanism.decisions.join(", ")}`);
    }
  }

  return lines.join("\n");
};

const readFlagValues = (args: readonly string[], flag: string) => {
  const idx = args.indexOf(flag);
  if (idx === -1) {
    return null;
  }
  const values: string[] = [];
  for (const arg of args.slice(idx + 1)) {
    if (arg.startsWith("--")) {
      break;
    }
    values.push(arg);
  }
  return values;
};

const runCli = () => {
  const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
  const args = process.argv.slice(2);
  const baseValues = readFlagValues(args, "--base");
  const headValues = readFlagValues(args, "--head");
  const explicitPaths = readFlagValues(args, "--paths");
  const jsonOut = args.includes("--json");

  if (args.includes("--check") || (!baseValues && !explicitPaths)) {
    const errors = validateMechanismMap(MECHANISMS, repoRoot);
    if (errors.length > 0) {
      console.error(`mechanisms check failed (${errors.length} problem(s)):`);
      for (const error of errors) {
        console.error(`  - ${error}`);
      }
      process.exitCode = 1;
      return;
    }
    console.log(`mechanisms ok (${MECHANISMS.length} cross-cutting mechanisms)`);
    return;
  }

  const paths =
    explicitPaths ??
    execFileSync(
      "git",
      ["diff", "--name-only", `${baseValues?.[0] ?? "origin/main"}...${headValues?.[0] ?? "HEAD"}`],
      { cwd: repoRoot, encoding: "utf8" },
    )
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

  const classification = classifyChangedPaths({ paths, mechanisms: MECHANISMS });

  if (jsonOut) {
    console.log(JSON.stringify(classification, null, 2));
    return;
  }
  console.log(formatMechanismReport(classification));
};

const entryPath = process.argv[1];
if (entryPath && resolve(entryPath) === fileURLToPath(import.meta.url)) {
  runCli();
}
