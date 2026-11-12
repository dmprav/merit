import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vite-plus/test";
import { z } from "zod";

const root = fileURLToPath(new URL("../../../", import.meta.url));

const compilerFiles = (capability: string, config = join(capability, "tsconfig.json")) => {
  const compiler = join(capability, "node_modules/typescript/bin/tsc");
  const projects = new Set<string>();
  const files = new Set<string>();

  const tsc = (option: string, project: string) => {
    const result = spawnSync(process.execPath, [compiler, option, "-p", project], {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000,
    });
    if (result.error) {
      throw result.error;
    }
    expect(result.status, result.stderr + result.stdout.slice(0, 2000)).toBe(0);
    return result.stdout;
  };

  const collect = (project: string): void => {
    const path = realpathSync(project);
    if (projects.has(path)) {
      return;
    }
    projects.add(path);
    for (const file of tsc("--listFilesOnly", path).trim().split(/\r?\n/)) {
      files.add(realpathSync(file));
    }
    const { references = [] } = z
      .object({ references: z.array(z.object({ path: z.string() })).optional() })
      .parse(JSON.parse(tsc("--showConfig", path)));
    for (const reference of references) {
      const target = resolve(dirname(path), reference.path);
      collect(existsSync(join(target, "tsconfig.json")) ? join(target, "tsconfig.json") : target);
    }
  };

  collect(config);
  return [...files];
};

const interfaceSources = (files: string[]) =>
  files.filter((file) =>
    ["app", "interfaces"].some((directory) =>
      file.startsWith(`${realpathSync(join(root, directory))}${sep}`),
    ),
  );

const webCapabilities = readdirSync(join(root, "capabilities"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(root, "capabilities", entry.name, "web"))
  .filter((directory) => existsSync(join(directory, "tsconfig.json")));

it.each(webCapabilities)(
  "keeps the TypeScript program independent of interfaces: %s",
  (capability) => {
    const files = compilerFiles(capability);

    expect(
      files.some((file) => file.startsWith(`${realpathSync(join(capability, "src"))}${sep}`)),
    ).toBe(true);
    expect(interfaceSources(files)).toEqual([]);
  },
  30_000,
);

it.each(["include", "reference"] as const)(
  "detects an interface source explicitly included through a capability tsconfig %s",
  (kind) => {
    const capability = join(root, "capabilities/grantmaking/web");
    const directory = mkdtempSync(join(tmpdir(), "merit-source-probe-"));
    const config = join(directory, "tsconfig.json");
    const forbidden = realpathSync(join(root, "interfaces/product/src/links.ts"));
    const included = {
      extends: join(capability, "tsconfig.json"),
      include: [forbidden],
      compilerOptions: {
        composite: true,
        noEmit: false,
        emitDeclarationOnly: true,
        declaration: true,
        rootDir: root,
      },
    };

    try {
      symlinkSync(join(capability, "node_modules"), join(directory, "node_modules"), "dir");
      writeFileSync(join(directory, "included.json"), JSON.stringify(included));
      writeFileSync(
        config,
        JSON.stringify(
          kind === "include"
            ? included
            : {
                extends: join(capability, "tsconfig.json"),
                references: [{ path: "./included.json" }],
              },
        ),
      );

      expect(interfaceSources(compilerFiles(capability, config))).toEqual([forbidden]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
  30_000,
);
