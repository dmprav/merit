import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The repository root, found from this file rather than the working directory or each caller's
 * depth. Scripts CI runs before installing dependencies keep their own copy, since they import
 * only Node built-ins.
 */
export const REPO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
