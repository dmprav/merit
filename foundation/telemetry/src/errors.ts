import { describeHttpRoute } from "./route-label.ts";

export type ErrorSurface = "server" | "web" | "mcp" | "auth" | "email" | "demo" | "admin";

type DiagnosticTags = {
  provider?: "Mailpit" | "Resend";
  status?: number;
  route?: string;
  method?: string;
};

export type ErrorReportContext = {
  surface: ErrorSurface;
  operation: string;
  tags?: Record<string, string | number | boolean | undefined>;
  extra?: Record<string, unknown>;
};

export type ErrorReport = {
  surface: ErrorSurface;
  operation: string;
  errorType: string;
  tags?: DiagnosticTags;
  extra?: { status: number };
};

export type ErrorReporter = (report: ErrorReport) => void;

const errorTypes = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "URIError",
  "EvalError",
  "AggregateError",
]);
const httpMethods = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "CONNECT",
  "TRACE",
]);

const pickTags = (tags: NonNullable<ErrorReportContext["tags"]>): DiagnosticTags => {
  const allowed: DiagnosticTags = {};
  if (tags.provider === "Mailpit" || tags.provider === "Resend") {
    allowed.provider = tags.provider;
  }
  if (typeof tags.status === "number") {
    allowed.status = tags.status;
  }
  if (typeof tags.route === "string") {
    allowed.route = describeHttpRoute(tags.route).route;
  }
  if (typeof tags.method === "string" && httpMethods.has(tags.method)) {
    allowed.method = tags.method;
  }
  return allowed;
};

const consoleErrorReporter: ErrorReporter = (report) => {
  console.error("[merit:error]", JSON.stringify(report));
};

let activeReporter: ErrorReporter = consoleErrorReporter;

export const setErrorReporter = (reporter: ErrorReporter | null): void => {
  activeReporter = reporter ?? consoleErrorReporter;
};

export const reportError = (error: unknown, context: ErrorReportContext): void => {
  const tags = context.tags && pickTags(context.tags);
  const report: ErrorReport = {
    surface: context.surface,
    operation: context.operation,
    errorType: error instanceof Error && errorTypes.has(error.name) ? error.name : "Error",
    ...(tags && Object.keys(tags).length ? { tags } : {}),
    ...(typeof context.extra?.status === "number"
      ? { extra: { status: context.extra.status } }
      : {}),
  };
  try {
    activeReporter(report);
  } catch {
    consoleErrorReporter(report);
  }
};
