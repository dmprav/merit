import { existsSync, globSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { toId } from "storybook/internal/csf";
import { loadCsf } from "storybook/internal/csf-tools";
import { describe, expect, test } from "vite-plus/test";

import storybookConfig from "./.storybook/main";

const storybookDir = path.join(import.meta.dirname, ".storybook");
const rootDir = path.resolve(import.meta.dirname, "../..");
const cardsDir = path.join(import.meta.dirname, "design-system/content/cards");

const properNouns = new Set(["Merit", "AI"]);

/** `@merit/ui` subpaths intentionally documented inside a parent card rather than their own folder. */
const sharedDesignSystemCards: Record<string, string> = {
  "./application-navigation": "ApplicationShell",
};

const rel = (filePath: string) => path.relative(rootDir, filePath).replaceAll(path.sep, "/");

const discoverStorybookFiles = () => {
  const entries = Array.isArray(storybookConfig.stories) ? storybookConfig.stories : [];
  const patterns = entries.map((entry) =>
    typeof entry === "string" ? entry : `${entry.directory}/${entry.files ?? "**/*.stories.tsx"}`,
  );
  const files = new Set<string>();
  for (const pattern of patterns) {
    const resolved = path.resolve(storybookDir, pattern);
    for (const match of globSync(resolved)) {
      files.add(path.resolve(match));
    }
  }
  const all = [...files].sort();
  return {
    csf: all.filter((file) => file.endsWith(".stories.tsx")),
    mdx: all.filter((file) => file.endsWith(".mdx")),
  };
};

type MdxMeta =
  | { kind: "standalone"; title: string }
  | { kind: "attached"; targetFile: string }
  | { kind: "missing" };

const extractMdxMeta = (filePath: string, source: string): MdxMeta => {
  const titleMatch = /<Meta\b[^>]*\btitle=["']([^"']+)["']/.exec(source);
  if (titleMatch?.[1]) {
    return { kind: "standalone", title: titleMatch[1] };
  }
  const ofMatch = /<Meta\b[^>]*\bof=\{([A-Za-z0-9_]+)\}/.exec(source);
  if (ofMatch?.[1]) {
    const ident = ofMatch[1];
    const importMatch = new RegExp(
      `import\\s+(?:\\*\\s+as\\s+${ident}|${ident})\\s+from\\s+["']([^"']+)["']`,
    ).exec(source);
    if (importMatch?.[1]) {
      const base = path.resolve(path.dirname(filePath), importMatch[1]);
      const targetFile = base.endsWith(".tsx") ? base : `${base}.tsx`;
      return { kind: "attached", targetFile };
    }
  }
  return { kind: "missing" };
};

const stripCodeFromMdx = (source: string): string =>
  source
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\[`([^`\n]+)`\]\(/g, "[$1](")
    .replace(/`[^`\n]+`/g, "");

const checkSentenceCase = (title: string): string | null => {
  for (const segment of title.split("/")) {
    const words = segment.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      return `Empty title segment in "${title}"`;
    }
    const first = words[0]!;
    if (!/^[A-Z]/.test(first)) {
      return `Segment "${segment}" in "${title}" must start with an uppercase letter`;
    }
    for (const word of words.slice(1)) {
      const clean = word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
      if (clean && /[A-Z]/.test(clean) && !properNouns.has(clean)) {
        return `Word "${word}" in "${title}" breaks sentence case (add to properNouns if intentional)`;
      }
    }
  }
  return null;
};

type OrderList = (string | OrderList)[];

const collectSortTree = (order: OrderList) => {
  const topLevel = new Set<string>();
  const nested = new Map<string, OrderList>();
  for (let i = 0; i < order.length; i += 1) {
    const item = order[i];
    if (typeof item === "string") {
      topLevel.add(item);
      const next = order[i + 1];
      if (Array.isArray(next)) {
        nested.set(item, next);
      }
    }
  }
  return { topLevel, nested };
};

const toPascalCase = (subpath: string) =>
  subpath
    .replace(/^\.\//, "")
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

describe("Storybook catalog invariants", () => {
  const { csf, mdx } = discoverStorybookFiles();

  const csfEntries = csf.map((file) => {
    const source = readFileSync(file, "utf8");
    const parsed = loadCsf(source, { fileName: file, makeTitle: (title) => title ?? "" }).parse();
    return {
      file,
      title: parsed.meta.title ?? null,
      storyIds: parsed.stories.map((story) => story.id),
      hasNoAutodocs: (parsed.meta.tags ?? []).includes("!autodocs"),
    };
  });

  const mdxEntries = mdx.map((file) => {
    const source = readFileSync(file, "utf8");
    return {
      file,
      source,
      meta: extractMdxMeta(file, source),
    };
  });

  test("every CSF and standalone MDX title is unique and uses sentence case", () => {
    expect(csf.length).toBeGreaterThan(0);
    expect(mdx.length).toBeGreaterThan(0);

    const missingTitles = csfEntries
      .filter((entry) => !entry.title)
      .map((entry) => rel(entry.file));
    expect(missingTitles, "CSF files missing a static title").toEqual([]);

    const missingMeta = mdxEntries
      .filter((entry) => entry.meta.kind === "missing")
      .map((entry) => rel(entry.file));
    expect(missingMeta, "MDX files missing a resolvable <Meta />").toEqual([]);

    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    const casingIssues: string[] = [];

    const allTitled = [
      ...csfEntries.map((entry) => ({ file: rel(entry.file), title: entry.title! })),
      ...mdxEntries
        .filter(
          (entry): entry is typeof entry & { meta: { kind: "standalone"; title: string } } =>
            entry.meta.kind === "standalone",
        )
        .map((entry) => ({ file: rel(entry.file), title: entry.meta.title })),
    ];

    for (const { file, title } of allTitled) {
      const prior = seen.get(title);
      if (prior) {
        duplicates.push(`Duplicate title "${title}" in ${prior} and ${file}`);
      } else {
        seen.set(title, file);
      }
      const casingError = checkSentenceCase(title);
      if (casingError) {
        casingIssues.push(`${file}: ${casingError}`);
      }
    }

    expect(duplicates).toEqual([]);
    expect(casingIssues).toEqual([]);
  });

  test("storySorts in main.ts covers every top-level section and feature screen without stale entries", () => {
    const sorts = (storybookConfig as { storySorts?: { order?: OrderList }[] }).storySorts;
    const rootOrder = sorts?.[0]?.order;
    expect(rootOrder, "storySorts[0].order must be configured in main.ts").toBeDefined();

    const { topLevel, nested } = collectSortTree(rootOrder!);
    const featuresOrder = nested.get("Features");
    expect(featuresOrder, "storySorts must define an order for Features").toBeDefined();

    const featuresTree = collectSortTree(featuresOrder!);
    const actualTitles = new Set<string>([
      ...csfEntries.map((entry) => entry.title!),
      ...mdxEntries
        .filter(
          (entry): entry is typeof entry & { meta: { kind: "standalone"; title: string } } =>
            entry.meta.kind === "standalone",
        )
        .map((entry) => entry.meta.title),
    ]);

    const missingFromSort: string[] = [];
    for (const title of actualTitles) {
      const segments = title.split("/");
      const root = segments[0]!;
      if (!topLevel.has(root)) {
        missingFromSort.push(
          `Top-level section "${root}" (from "${title}") missing from storySorts`,
        );
        continue;
      }
      if (root === "Features") {
        const area = segments[1];
        if (!area || !featuresTree.topLevel.has(area)) {
          missingFromSort.push(
            `Feature area "${area ?? ""}" (from "${title}") missing from storySorts`,
          );
          continue;
        }
        const screen = segments[2];
        const areaScreens = featuresTree.nested.get(area);
        if (screen && areaScreens && !areaScreens.includes(screen)) {
          missingFromSort.push(`Feature screen "${area}/${screen}" missing from storySorts`);
        }
      }
    }

    const staleInSort: string[] = [];
    for (const area of featuresTree.topLevel) {
      const areaScreens = featuresTree.nested.get(area);
      if (!areaScreens) {
        if (
          ![...actualTitles].some(
            (title) => title === `Features/${area}` || title.startsWith(`Features/${area}/`),
          )
        ) {
          staleInSort.push(`Stale feature area "Features/${area}" in storySorts`);
        }
        continue;
      }
      for (const screen of areaScreens) {
        if (typeof screen === "string" && !actualTitles.has(`Features/${area}/${screen}`)) {
          staleInSort.push(`Stale feature screen "Features/${area}/${screen}" in storySorts`);
        }
      }
    }

    expect(missingFromSort).toEqual([]);
    expect(staleInSort).toEqual([]);
  });

  test("CSF files attached to an MDX page declare !autodocs", () => {
    const byFile = new Map(csfEntries.map((entry) => [entry.file, entry]));
    const issues: string[] = [];

    for (const entry of mdxEntries) {
      if (entry.meta.kind !== "attached") {
        continue;
      }
      const target = byFile.get(entry.meta.targetFile);
      if (!target) {
        issues.push(
          `${rel(entry.file)} attaches to unknown CSF file ${rel(entry.meta.targetFile)}`,
        );
        continue;
      }
      if (!target.hasNoAutodocs) {
        issues.push(
          `${rel(target.file)} is attached by ${rel(entry.file)} and must include tags: ["!autodocs"]`,
        );
      }
    }

    expect(issues).toEqual([]);
  });

  test("Storybook MDX links resolve to real docs/story IDs and avoid relative Markdown links", () => {
    const byFile = new Map(csfEntries.map((entry) => [entry.file, entry]));
    const docsIds = new Set<string>();
    const storyIds = new Set<string>();

    for (const entry of csfEntries) {
      const title = entry.title!;
      if (!entry.hasNoAutodocs) {
        docsIds.add(toId(title, "docs"));
      }
      for (const storyId of entry.storyIds) {
        storyIds.add(storyId);
      }
    }
    for (const entry of mdxEntries) {
      if (entry.meta.kind === "standalone") {
        docsIds.add(toId(entry.meta.title, "docs"));
      } else if (entry.meta.kind === "attached") {
        const target = byFile.get(entry.meta.targetFile);
        if (target?.title) {
          docsIds.add(toId(target.title, "docs"));
        }
      }
    }

    const brokenLinks: string[] = [];
    for (const entry of mdxEntries) {
      const prose = stripCodeFromMdx(entry.source);
      for (const match of prose.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
        const href = match[1]!;
        if (href.startsWith("?path=")) {
          const clean = href.slice("?path=".length).split(/[&#]/, 1)[0]!;
          if (clean.startsWith("/docs/")) {
            const id = clean.slice("/docs/".length);
            if (!docsIds.has(id)) {
              brokenLinks.push(
                `${rel(entry.file)}: broken docs link "${href}" (unknown id "${id}")`,
              );
            }
          } else if (clean.startsWith("/story/")) {
            const id = clean.slice("/story/".length);
            if (!storyIds.has(id)) {
              brokenLinks.push(
                `${rel(entry.file)}: broken story link "${href}" (unknown id "${id}")`,
              );
            }
          } else {
            brokenLinks.push(`${rel(entry.file)}: unexpected Storybook link "${href}"`);
          }
        } else if (!/^(?:https?:|mailto:|#)/.test(href) && /\.mdx?(?:$|[?#])/.test(href)) {
          brokenLinks.push(
            `${rel(entry.file)}: relative Markdown link "${href}" breaks inside Storybook; use ?path=/docs/...`,
          );
        }
      }
    }

    expect(brokenLinks).toEqual([]);
  });

  test("every @merit/ui component export has a valid design-system card", () => {
    const uiPkg = JSON.parse(
      readFileSync(path.join(rootDir, "foundation/ui/package.json"), "utf8"),
    ) as { exports: Record<string, string> };

    const cardNames = readdirSync(cardsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    const cardSet = new Set(cardNames);

    const missingCards: string[] = [];
    for (const [subpath, target] of Object.entries(uiPkg.exports)) {
      if (!target.endsWith(".tsx")) {
        continue;
      }
      const cardName = sharedDesignSystemCards[subpath] ?? toPascalCase(subpath);
      if (!cardSet.has(cardName)) {
        missingCards.push(`@merit/ui export "${subpath}" expects design-system card "${cardName}"`);
      }
    }

    const malformedCards: string[] = [];
    for (const card of cardNames) {
      const previewPath = path.join(cardsDir, card, "preview.html");
      const readmePath = path.join(cardsDir, card, "README.md");
      if (!existsSync(previewPath)) {
        malformedCards.push(`${card}: missing preview.html`);
      } else {
        const firstLine = readFileSync(previewPath, "utf8").split("\n", 1)[0] ?? "";
        if (!/^<!--\s*@dsCard\s+group="[^"]+"\s+height=\d+\s*-->$/.test(firstLine.trim())) {
          malformedCards.push(`${card}/preview.html: line 1 must be an @dsCard header`);
        }
      }
      if (!existsSync(readmePath) || readFileSync(readmePath, "utf8").trim().length === 0) {
        malformedCards.push(`${card}: missing or empty README.md`);
      }
    }

    expect(missingCards).toEqual([]);
    expect(malformedCards).toEqual([]);
  });
});
