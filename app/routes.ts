import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { layout, physical, rootRoute } from "@tanstack/virtual-file-routes";

import { routesDirectory as adminRoutes, layoutFile as adminLayout } from "@merit/admin/routing";
import { layoutFile, routesDirectory as webRoutes } from "@merit/product/routing";
import { routesDirectory as siteRoutes } from "@merit/site/routing";

// Paths are relative to the repository root, configured as routesDirectory.
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

const routePath = (url: URL) => relative(repositoryRoot, fileURLToPath(url)).split(sep).join("/");

// Apps expose route locations through build-time routing exports, keeping path ownership local.
export const routes = rootRoute("app/src/shell/root.tsx", [
  physical(routePath(siteRoutes)),
  layout("administration", routePath(adminLayout), [physical(routePath(adminRoutes))]),
  layout("product", routePath(layoutFile), [physical(routePath(webRoutes))]),
]);
