import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vite-plus/test";

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
