import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vite-plus/test";
import { z } from "zod";

const root = fileURLToPath(new URL("../../", import.meta.url));
const documents = {
  "README.md": `# Start

Ordinary Markdown can contain {literal braces}.

[Same page](#start), [component](component.mdx#details-1), and [source](example.ts).

| Guide |
| ----- |
| [Read][guide] |

[guide]: guide%20name.md#guide

![Diagram](diagram.svg)
[External](https://example.invalid/missing)
[Public guide](/docs/applications)

\`[Inline example](missing-inline.md)\`

\`\`\`md
[Fenced example](missing-fenced.md)
\`\`\`
`,
  "guide name.md": "# Guide\n",
  "component.mdx": `import { Canvas } from "@storybook/addon-docs/blocks";
import * as Stories from "./example.stories";

export const example = "[Example](not-a-markdown-link.md)";

# Component

<Canvas of={Stories.Default} />

## Details

[Back](README.md#start)
[Storybook](?path=/story/components-example--default)

<section>

## Details

[Guide](guide%20name.md#guide)

</section>
`,
  "example.ts": "export const example = true;\n",
  "diagram.svg": '<svg xmlns="http://www.w3.org/2000/svg" />\n',
  "dist/README.md": "[Ignored build output](missing-dist.md)\n",
  "node_modules/example/README.md": "[Ignored dependency](missing-dependency.md)\n",
};

const checkDocs = (overrides: Record<string, string> = {}) => {
  const directory = mkdtempSync(join(tmpdir(), "merit-docs-"));

  try {
    for (const [name, source] of Object.entries({ ...documents, ...overrides })) {
      const path = join(directory, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, source);
    }

    const result = spawnSync(
      process.execPath,
      [
        join(root, "node_modules/remark-cli/cli.js"),
        ".",
        "--rc-path",
        join(root, ".remarkrc.mjs"),
        "--ext",
        "md,mdx",
        "--ignore-path",
        join(root, ".gitignore"),
        "--ignore-path-resolve-from",
        "cwd",
        "--frail",
        "--no-stdout",
        "--quiet",
        "--no-color",
      ],
      { cwd: directory, encoding: "utf8", timeout: 10_000 },
    );

    if (result.error) {
      throw result.error;
    }

    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

it("checks Markdown and MDX links while ignoring examples, runtime URLs, and generated files", () => {
  const result = checkDocs();

  expect(result.status, result.output).toBe(0);
  expect(result.output).toBe("");
});

it.each([
  ["broken.md", "[Missing file](missing.md)", "missing-file"],
  [".agents/tasks/broken.md", "[Missing file](missing.md)", "missing-file"],
  ["broken.md", "[Missing MDX anchor](component.mdx#missing)", "missing-heading-in-file"],
  ["broken.mdx", "[Missing Markdown anchor](README.md#missing)", "missing-heading-in-file"],
])("rejects %s containing %s", (file, link, rule) => {
  const result = checkDocs({ [file]: link });

  expect(result.status, result.output).toBe(1);
  expect(result.output).toContain(file);
  expect(result.output).toContain("1:1");
  expect(result.output).toContain(rule);
});

it("keeps AGENTS.md within its concise routing-map budget", () => {
  const contents = readFileSync(join(root, "AGENTS.md"), "utf8");
  const lines = contents.trimEnd().split(/\r?\n/);

  expect(lines.length).toBeLessThanOrEqual(50);
  expect(Buffer.byteLength(contents, "utf8")).toBeLessThanOrEqual(4096);
});

it("keeps review.md within its concise universal rubric budget", () => {
  const contents = readFileSync(join(root, ".agents/skills/build-feature/review.md"), "utf8");
  const lines = contents.trimEnd().split(/\r?\n/);

  expect(lines.length).toBeLessThanOrEqual(95);
  expect(Buffer.byteLength(contents, "utf8")).toBeLessThanOrEqual(4800);
  expect(contents).not.toMatch(/^## Known escapes$/m);
});

const greptileFilesSchema = z.object({
  files: z
    .array(
      z.object({
        path: z.string().min(1),
        description: z.string().min(1),
        scope: z.array(z.string().min(1)).min(1).optional(),
      }),
    )
    .min(1),
});

const unquoteYamlScalar = (raw: string) => {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

const parseCodeRabbitFilePatterns = (yamlText: string) => {
  const lines = yamlText.split(/\r?\n/);
  const startIdx = lines.findIndex((line) => /^\s*filePatterns:\s*$/.test(line));
  if (startIdx === -1) {
    throw new Error("Missing knowledge_base.code_guidelines.filePatterns in .coderabbit.yaml");
  }
  const baseIndent = lines[startIdx]?.search(/\S/) ?? 0;
  const entries: Array<{ files: string; applyTo?: string[] }> = [];
  let current: { files?: string; applyTo?: string[] } | null = null;

  const commitCurrent = () => {
    if (!current) {
      return;
    }
    if (!current.files) {
      throw new Error("Malformed filePatterns entry missing `files` in .coderabbit.yaml");
    }
    entries.push({ files: current.files, applyTo: current.applyTo });
    current = null;
  };

  for (const rawLine of lines.slice(startIdx + 1)) {
    if (/^\s*(?:#.*)?$/.test(rawLine)) {
      continue;
    }
    const indent = rawLine.search(/\S/);
    if (indent <= baseIndent) {
      break;
    }
    const itemMatch = /^\s*-\s+(.*)$/.exec(rawLine);
    if (itemMatch?.[1]) {
      commitCurrent();
      const rest = itemMatch[1].trim();
      const kvMatch = /^(files|applyTo):\s*(.+)$/.exec(rest);
      if (kvMatch?.[1] && kvMatch[2]) {
        const value = unquoteYamlScalar(kvMatch[2]);
        current =
          kvMatch[1] === "files"
            ? { files: value }
            : { applyTo: value.split(",").map((part) => part.trim()) };
      } else {
        current = { files: unquoteYamlScalar(rest) };
      }
      continue;
    }
    const propMatch = /^\s+(files|applyTo):\s*(.+)$/.exec(rawLine);
    if (propMatch?.[1] && propMatch[2] && current) {
      const value = unquoteYamlScalar(propMatch[2]);
      if (propMatch[1] === "files") {
        current.files = value;
      } else {
        current.applyTo = value.split(",").map((part) => part.trim());
      }
      continue;
    }
    throw new Error(`Unexpected line inside filePatterns in .coderabbit.yaml: ${rawLine}`);
  }
  commitCurrent();
  return entries;
};

const parseToneInstructions = (yamlText: string) => {
  const lines = yamlText.split(/\r?\n/);
  const startIdx = lines.findIndex((line) => /^tone_instructions:\s*[>|][-+]?\s*$/.test(line));
  if (startIdx === -1) {
    const inline = lines.find((line) => /^tone_instructions:\s*\S/.test(line));
    return inline ? unquoteYamlScalar(inline.slice("tone_instructions:".length)) : "";
  }
  const blockLines: string[] = [];
  for (const rawLine of lines.slice(startIdx + 1)) {
    if (rawLine.trim() === "") {
      blockLines.push("");
      continue;
    }
    if (!/^\s/.test(rawLine)) {
      break;
    }
    blockLines.push(rawLine.trim());
  }
  while (blockLines.length > 0 && blockLines.at(-1) === "") {
    blockLines.pop();
  }
  return blockLines.reduce((acc, line, index) => {
    if (index === 0) {
      return line;
    }
    if (line === "") {
      return `${acc}\n`;
    }
    return acc.endsWith("\n") ? `${acc}${line}` : `${acc} ${line}`;
  }, "");
};

it("keeps Greptile and CodeRabbit review guide lists valid and aligned", () => {
  const greptileConfig = greptileFilesSchema.parse(
    JSON.parse(readFileSync(join(root, ".greptile/files.json"), "utf8")),
  );
  const greptilePaths = greptileConfig.files.map((entry) => entry.path);
  expect(new Set(greptilePaths).size).toBe(greptilePaths.length);

  const coderabbitYaml = readFileSync(join(root, ".coderabbit.yaml"), "utf8");
  const toneInstructions = parseToneInstructions(coderabbitYaml);
  expect(toneInstructions.length).toBeGreaterThan(0);
  expect(toneInstructions.length).toBeLessThanOrEqual(250);

  const coderabbitEntries = parseCodeRabbitFilePatterns(coderabbitYaml);
  const coderabbitPaths = coderabbitEntries.map((entry) => entry.files);
  expect(new Set(coderabbitPaths).size).toBe(coderabbitPaths.length);

  expect(greptilePaths).toContain(".agents/skills/build-feature/review.md");
  expect([...coderabbitPaths].sort()).toEqual([...greptilePaths].sort());

  const coderabbitByPath = new Map(coderabbitEntries.map((entry) => [entry.files, entry]));
  for (const entry of greptileConfig.files) {
    const fullPath = join(root, entry.path);
    expect(existsSync(fullPath) && statSync(fullPath).isFile(), `missing file: ${entry.path}`).toBe(
      true,
    );
    expect(coderabbitByPath.get(entry.path)?.applyTo, `scope mismatch for ${entry.path}`).toEqual(
      entry.scope,
    );
  }
});
