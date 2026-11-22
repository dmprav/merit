import { createContext, useContext, type ReactNode } from "react";

type BrowserEvent =
  | [event: "demo_started", properties: { guided: boolean; fresh: boolean }]
  | [event: "demo_reset" | "access_request_submitted"];

export type AnalyticsClient = {
  pageView: (path?: string) => void;
  track: (...event: BrowserEvent) => void;
  reset: () => void;
};

export const noopAnalytics: AnalyticsClient = {
  pageView: () => {},
  track: () => {},
  reset: () => {},
};

/**
 * Route patterns analytics may record. Parameters name what they redact, and any
 * path matching none of them is recorded as `/*other`.
 */
const analyticsRoutes = [
  "/",
  "/privacy",
  "/demo",
  "/demo/workshop-saturdays",
  "/docs",
  "/docs/applications",
  "/docs/contacts",
  "/docs/mcp",
  "/docs/quickstart",
  "/docs/recommendations",
  "/docs/reviews",
  "/docs/rounds",
  "/docs/team",
  "/docs/workspaces",
  "/invitations/:token",
  "/app",
  "/app/sign-in",
  "/app/:workspace",
  "/app/:workspace/activity",
  "/app/:workspace/applications",
  "/app/:workspace/applications/:application",
  "/app/:workspace/contacts",
  "/app/:workspace/rounds",
  "/app/:workspace/rounds/:round",
  "/app/:workspace/settings",
  "/app/:workspace/settings/members",
  "/app/:workspace/work",
  "/app/:workspace/work/:assignment",
  "/admin",
  "/admin/access-requests",
  "/admin/organizations",
  "/admin/organizations/:organization",
].map((route) => ({ route, segments: route.split("/").filter(Boolean) }));

const pathSegments = (value: string) => {
  const [withoutHash = ""] = value.split("#");
  const [pathname = ""] = withoutHash.split("?");
  return pathname.toLowerCase().split("/").filter(Boolean);
};

const matchesRoute = (pattern: string[], segments: string[]) =>
  pattern.length === segments.length &&
  pattern.every((part, index) => part.startsWith(":") || part === segments[index]);

/**
 * Reduces a path to the route pattern it matches, so analytics never receive
 * invitation tokens, tenant slugs, record identifiers, or unrecognized paths.
 */
export const sanitizeAnalyticsPath = (value: string) => {
  const segments = pathSegments(value);
  return (
    analyticsRoutes.find(({ segments: pattern }) => matchesRoute(pattern, segments))?.route ??
    "/*other"
  );
};

const AnalyticsContext = createContext<AnalyticsClient>(noopAnalytics);

export const AnalyticsProvider = ({
  client = noopAnalytics,
  children,
}: {
  client?: AnalyticsClient;
  children: ReactNode;
}) => <AnalyticsContext value={client}>{children}</AnalyticsContext>;

export const useAnalytics = () => useContext(AnalyticsContext);
