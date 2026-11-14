export type RouteSurface = "site" | "product" | "admin" | "mcp" | "other";

export type RouteDescriptor = {
  route: string;
  surface: RouteSurface;
};

const WORKSPACE_SECTIONS = new Set(["rounds", "applications", "contacts", "activity", "team"]);

const describeAppRoute = (segments: string[]): RouteDescriptor => {
  if (segments.length === 1) {
    return { route: "/app", surface: "product" };
  }
  if (segments[1] === "sign-in") {
    return { route: "/app/sign-in", surface: "product" };
  }
  if (segments.length === 2) {
    return { route: "/app/:workspace", surface: "product" };
  }
  const section = segments[2]!;
  if (WORKSPACE_SECTIONS.has(section)) {
    return {
      route:
        segments.length === 3 ? `/app/:workspace/${section}` : `/app/:workspace/${section}/:id`,
      surface: "product",
    };
  }
  return { route: "/app/:workspace/*", surface: "product" };
};

/** Normalize paths into low-cardinality route templates without tenant slugs, IDs, or tokens. */
export const describeHttpRoute = (pathname: string): RouteDescriptor => {
  if (pathname === "/" || pathname === "/demo" || pathname === "/demo/workshop-saturdays") {
    return { route: pathname, surface: "site" };
  }
  if (pathname === "/docs/mcp") {
    return { route: "/docs/mcp", surface: "site" };
  }
  if (
    pathname === "/mcp" ||
    pathname === "/mcp/workspace" ||
    pathname === "/.well-known/oauth-protected-resource/mcp/workspace"
  ) {
    return { route: pathname, surface: "mcp" };
  }

  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "invitations") {
    return { route: "/invitations/:token", surface: "product" };
  }
  if (segments[0] === "reviews") {
    return { route: "/reviews/:id", surface: "product" };
  }
  if (segments[0] === "app") {
    return describeAppRoute(segments);
  }
  if (segments[0] === "admin") {
    return {
      route: segments[1] === "organizations" ? "/admin/organizations" : "/admin/*",
      surface: "admin",
    };
  }
  if (segments[0] === "_serverFn") {
    return { route: "/_serverFn/:fn", surface: "product" };
  }

  return { route: "/*other", surface: "other" };
};
