import { isBuiltin } from "node:module";
import { dirname } from "node:path";

import { ResolverFactory } from "unrs-resolver";

const options = {
  conditionNames: ["types", "import", "node", "default"],
  extensions: [".ts", ".tsx", ".d.ts", ".js", ".mjs", ".json"],
  extensionAlias: { ".js": [".ts", ".tsx", ".js"], ".mjs": [".mts", ".mjs"] },
};
const typescript = new ResolverFactory({ ...options, tsconfig: "auto" });
const packages = new ResolverFactory(options);

export const interfaceVersion = 2;

/**
 * @param {string} source
 * @param {string} file
 */
export const resolve = (source, file) => {
  if (isBuiltin(source)) {
    return { found: true, path: null };
  }

  const specifier = source.replace(/\?.*$/, "");
  const directory = dirname(file);
  const resolved = typescript.resolveFileSync(file, specifier);

  // Aliases may resolve imports, but cannot replace a workspace package's public exports.
  if (
    specifier.startsWith("@merit/") &&
    packages.sync(directory, specifier).path !== resolved.path
  ) {
    return { found: false };
  }

  return resolved.path ? { found: true, path: resolved.path } : { found: false };
};
