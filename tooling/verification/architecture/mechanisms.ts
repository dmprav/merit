import { execFileSync } from "node:child_process";
import { existsSync, globSync, readFileSync, statSync } from "node:fs";
import { join, matchesGlob, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeRepoPath, parseCliArgs } from "../../cli.ts";
import {
  MAX_INVARIANT_LENGTH,
  MAX_INVARIANTS_PER_MECHANISM,
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
  const normalized = normalizeRepoPath(pattern);
  const matches = globSync(normalized, { cwd: repoRoot });
  if (matches.length === 0) {
    return `pattern matches no files on disk: ${pattern}`;
  }
  return null;
};

const validateInvariants = (mech: Mechanism): string[] => {
  const invariants = mech.invariants ?? [];
  const errors: string[] = [];
  if (invariants.length > MAX_INVARIANTS_PER_MECHANISM) {
    errors.push(
      `${mech.id}: ${invariants.length} invariants (max ${MAX_INVARIANTS_PER_MECHANISM})`,
    );
  }
  for (const invariant of invariants) {
    if (invariant.includes("\n")) {
      errors.push(`${mech.id}: invariant must be a single line`);
    }
    if (invariant.length > MAX_INVARIANT_LENGTH) {
      errors.push(
        `${mech.id}: invariant is ${invariant.length} chars (max ${MAX_INVARIANT_LENGTH})`,
      );
    }
  }
  return errors;
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

    errors.push(...validateInvariants(mech));

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
  const normalized = normalizeRepoPath(inputPath);
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
  const normalizedPaths = paths.map(normalizeRepoPath).filter(Boolean);
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
    if (mechanism.invariants && mechanism.invariants.length > 0) {
      lines.push("    invariants:");
      for (const invariant of mechanism.invariants) {
        lines.push(`      - ${invariant}`);
      }
    }
  }

  return lines.join("\n");
};

const MECHANISMS_USAGE =
  "Usage: mechanisms.ts --check | --paths <paths...> [--json] | --base <ref> [--head <ref>] [--json]";

export type MechanismCommand =
  | { mode: "check" }
  | { mode: "paths"; paths: string[]; json: boolean }
  | { mode: "diff"; base: string; head: string; json: boolean };

/** Requires one explicit mode, so a stray `--head` cannot silently fall back to `--check`. */
export const parseMechanismArgs = (args: readonly string[]): MechanismCommand => {
  const { values, positionals } = parseCliArgs(args, {
    options: {
      check: { type: "boolean" },
      paths: { type: "boolean" },
      base: { type: "string" },
      head: { type: "string" },
      json: { type: "boolean" },
    },
    usage: MECHANISMS_USAGE,
    allowPositionals: true,
  });
  const { check = false, paths = false, base, head, json = false } = values;

  const fail = (message: string) => new Error(`${message}\n${MECHANISMS_USAGE}`);

  if (head !== undefined && base === undefined) {
    throw fail("--head requires --base.");
  }
  if ([check, paths, base !== undefined].filter(Boolean).length !== 1) {
    throw fail("Choose exactly one of --check, --paths, or --base.");
  }
  if (paths) {
    if (positionals.length === 0) {
      throw fail("--paths requires at least one path.");
    }
    return { mode: "paths", paths: positionals, json };
  }
  if (positionals.length > 0) {
    throw fail(`Unexpected argument "${positionals[0]}"; only --paths takes paths.`);
  }
  if (base !== undefined) {
    return { mode: "diff", base, head: head ?? "HEAD", json };
  }
  if (json) {
    throw fail("--json applies to --paths or --base.");
  }
  return { mode: "check" };
};

const runCheck = (repoRoot: string) => {
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
};

const runCli = () => {
  const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
  const command = parseMechanismArgs(process.argv.slice(2));
  if (command.mode === "check") {
    runCheck(repoRoot);
    return;
  }

  const paths =
    command.mode === "paths"
      ? command.paths
      : execFileSync("git", ["diff", "--name-only", `${command.base}...${command.head}`], {
          cwd: repoRoot,
          encoding: "utf8",
        })
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);

  const classification = classifyChangedPaths({ paths, mechanisms: MECHANISMS });

  if (command.json) {
    console.log(JSON.stringify(classification, null, 2));
    return;
  }
  console.log(formatMechanismReport(classification));
};

if (import.meta.main) {
  runCli();
}
