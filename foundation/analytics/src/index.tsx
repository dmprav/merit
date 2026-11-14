import { createContext, useContext, type ReactNode } from "react";

export type AnalyticsPropertyValue = string | number | boolean | null | undefined;

export type AnalyticsProperties = Record<string, AnalyticsPropertyValue>;

export type AnalyticsClient = {
  pageView: (path?: string) => void;
  track: (event: string, properties?: AnalyticsProperties) => void;
  reset: () => void;
};

export const noopAnalytics: AnalyticsClient = {
  pageView: () => {},
  track: () => {},
  reset: () => {},
};

const stripSearchAndHash = (value: string) => {
  const [withoutHash = ""] = value.split("#");
  const [pathname = ""] = withoutHash.split("?");
  return pathname || "/";
};

const normalizePath = (value: string) => {
  const pathname = stripSearchAndHash(value);
  if (pathname === "/") {
    return "/";
  }
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
};

const detailParamForSection = (section: string) => {
  if (section === "rounds") {
    return ":round";
  }
  if (section === "applications") {
    return ":application";
  }
  if (section === "contacts") {
    return ":contact";
  }
  return ":id";
};

const sanitizeAppPath = (segments: string[]) => {
  const [, workspace, section, ...rest] = segments;
  if (!workspace || workspace === "sign-in") {
    return workspace ? "/app/sign-in" : "/app";
  }
  if (!section) {
    return "/app/:workspace";
  }
  if (rest.length === 0) {
    return `/app/:workspace/${section}`;
  }
  return `/app/:workspace/${section}/${detailParamForSection(section)}`;
};

/**
 * Redacts invitation tokens, tenant slugs, and record identifiers from route paths
 * so analytics never receive confidential workspace metadata or bearer URLs.
 */
export const sanitizeAnalyticsPath = (value: string) => {
  const normalized = normalizePath(value);
  const segments = normalized.split("/").filter(Boolean);
  const [first, second, third] = segments;

  if (first === "invitations") {
    return segments.length > 1 ? "/invitations/:token" : "/invitations";
  }
  if (first === "reviews") {
    return segments.length > 1 ? "/reviews/:assignment" : "/reviews";
  }
  if (first === "admin" && second === "organizations" && third && third !== "new") {
    return "/admin/organizations/:organization";
  }
  if (first === "app") {
    return sanitizeAppPath(segments);
  }
  return normalized;
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
