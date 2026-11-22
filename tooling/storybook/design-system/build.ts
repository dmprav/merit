import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { buildIcons, buildMark } from "./assets";
import { buildDeclarations, buildLibrary } from "./bundle";
import { buildTokens, cssOnlyProperties, parseTokenMeta } from "./tokens";

const here = import.meta.dirname;
const root = path.resolve(here, "../../..");
const foundations = path.join(root, "foundation/ui/src/foundations");
const output = path.resolve(process.argv[2] ?? path.join(here, "dist"));
const project = path.join(output, "project");
const components = path.join(project, "components");
const cards = path.join(here, "content/cards");

const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

/** Card folders in catalog order: components, then patterns, each alphabetical. */
const cardNames = async () => {
  const names = (await readdir(cards, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const groups = await Promise.all(
    names.map(async (name) => {
      const marker =
        (await readFile(path.join(cards, name, "preview.html"), "utf8")).split("\n", 1)[0] ?? "";
      const group = /group="([^"]+)"/.exec(marker)?.[1];
      if (group === undefined) {
        throw new Error(`${name}/preview.html must start with an @dsCard marker naming its group.`);
      }
      return { name, group };
    }),
  );
  return groups
    .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name))
    .map(({ name }) => name);
};

const themeSelectors = (css: string, themes: { id: string; selector: string }[]) =>
  themes
    .slice(1)
    .reduce((text, theme) => text.replaceAll(theme.selector, `[data-theme="${theme.id}"]`), css);

const main = async () => {
  await rm(output, { recursive: true, force: true });
  await mkdir(components, { recursive: true });

  const tokensCss = await readFile(path.join(foundations, "tokens.css"), "utf8");
  const meta = parseTokenMeta(
    JSON.parse(await readFile(path.join(here, "tokens.meta.json"), "utf8")),
  );
  const tokens = buildTokens(tokensCss, meta, {
    source: "github",
    repo: "dmprav/merit",
    ref: `${git("rev-parse", "--abbrev-ref", "HEAD")}@${git("rev-parse", "--short", "HEAD")}`,
    packages: ["foundation/ui", "foundation/forms", "foundation/tables"],
    producer: "tooling/storybook/design-system",
    synced: new Date().toISOString().slice(0, 10),
  });
  await writeFile(path.join(project, "tokens.json"), `${JSON.stringify(tokens, null, 2)}\n`);

  await cp(path.join(here, "content/README.md"), path.join(project, "README.md"));
  await cp(path.join(here, "content/assets"), path.join(project, "assets"), { recursive: true });
  await cp(cards, components, { recursive: true });
  await cp(path.join(here, "content/cover"), path.join(components, "Cover"), { recursive: true });

  const names = await cardNames();
  await buildLibrary(components, names);
  const library = await readFile(path.join(components, "bundle.css"), "utf8");
  const documentDefaults = await Promise.all(
    ["reset.css", "base.css"].map((file) => readFile(path.join(foundations, file), "utf8")),
  );
  await writeFile(
    path.join(components, "bundle.css"),
    [
      "/* Merit — values tokens.json cannot hold, document defaults and every component's CSS Module. Colors, spacing, radii, shadows and sizes come from tokens.css. */",
      cssOnlyProperties(tokensCss, meta),
      ...documentDefaults.map((css) => themeSelectors(css, meta.themes)),
      library,
    ].join("\n"),
  );
  await buildDeclarations(
    path.join(components, "index.d.ts"),
    await mkdtemp(path.join(tmpdir(), "merit-ds-")),
  );

  const colors = new Map(tokens.color.tokens.map((token) => [token.name, token.value]));

  const ink = (name: string) => {
    const value = colors.get(name);
    if (typeof value !== "string") {
      throw new Error(`Assets need one ${name} color across themes.`);
    }
    return value;
  };

  await mkdir(path.join(project, "assets/Icons"), { recursive: true });
  for (const { file, svg } of await buildIcons(ink("foreground"))) {
    await writeFile(path.join(project, "assets/Icons", file), svg);
  }
  await writeFile(
    path.join(project, "assets/Logos/merit-mark.svg"),
    await buildMark(ink("action")),
  );

  console.log(`Design system written to ${project} (${names.length} cards).`);
};

await main();
