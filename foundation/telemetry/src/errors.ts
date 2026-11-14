export type ErrorSurface = "server" | "web" | "mcp" | "auth" | "email" | "demo" | "admin";

export type ErrorTagValue = string | number | boolean;

export type ErrorReportContext = {
  surface: ErrorSurface;
  operation: string;
  tags?: Record<string, ErrorTagValue | undefined>;
  extra?: Record<string, unknown>;
};

export type NormalizedError = {
  name: string;
  message: string;
  stack?: string;
};

export type ErrorReport = {
  error: NormalizedError;
  rawError: unknown;
  context: {
    surface: ErrorSurface;
    operation: string;
    tags?: Record<string, ErrorTagValue>;
    extra?: Record<string, unknown>;
  };
};

export type ErrorReporter = (report: ErrorReport) => void;

const SENSITIVE_KEYS = [
  "authorization",
  "cookie",
  "set-cookie",
  "token",
  "secret",
  "password",
  "apikey",
  "api_key",
  "email",
  "body",
  "html",
  "text",
  "payload",
];

const isSensitiveKey = (key: string) => {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.some((sensitive) => lower.includes(sensitive));
};

const sanitizeValue = (value: unknown, seen: WeakSet<object>): unknown => {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, seen));
  }
  return sanitizeRecord(value as Record<string, unknown>, seen);
};

const sanitizeRecord = (
  record: Record<string, unknown>,
  seen: WeakSet<object>,
): Record<string, unknown> => {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    sanitized[key] = isSensitiveKey(key) ? "[Redacted]" : sanitizeValue(value, seen);
  }
  return sanitized;
};

export const sanitizeExtra = (
  extra: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined => {
  if (!extra) {
    return undefined;
  }
  return sanitizeRecord(extra, new WeakSet());
};

const compactTags = (
  tags: Record<string, ErrorTagValue | undefined>,
): Record<string, ErrorTagValue> | undefined => {
  const result: Record<string, ErrorTagValue> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
};

export const normalizeError = (error: unknown): NormalizedError => {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }
  if (typeof error === "string") {
    return { name: "Error", message: error };
  }
  if (error && typeof error === "object" && "message" in error) {
    const record = error as { name?: unknown; message?: unknown };
    return {
      name: typeof record.name === "string" && record.name ? record.name : "Error",
      message: String(record.message),
    };
  }
  return { name: "Error", message: String(error) };
};

const consoleErrorReporter: ErrorReporter = (report) => {
  const payload = {
    surface: report.context.surface,
    operation: report.context.operation,
    error: report.error,
    ...(report.context.tags ? { tags: report.context.tags } : {}),
    ...(report.context.extra ? { extra: report.context.extra } : {}),
  };
  try {
    console.error("[merit:error]", JSON.stringify(payload));
  } catch {
    console.error(
      "[merit:error]",
      report.context.surface,
      report.context.operation,
      report.error.message,
    );
  }
};

let activeReporter: ErrorReporter = consoleErrorReporter;

export const setErrorReporter = (reporter: ErrorReporter | null): void => {
  activeReporter = reporter ?? consoleErrorReporter;
};

export const reportError = (error: unknown, context: ErrorReportContext): void => {
  const report: ErrorReport = {
    error: normalizeError(error),
    rawError: error,
    context: {
      surface: context.surface,
      operation: context.operation,
      ...(context.tags ? { tags: compactTags(context.tags) } : {}),
      ...(context.extra ? { extra: sanitizeExtra(context.extra) } : {}),
    },
  };

  try {
    activeReporter(report);
  } catch {
    consoleErrorReporter(report);
  }
};
