import type { LogEntry } from "@temporalio/worker";

/**
 * Metadata that identifies work without describing a failure. Everything else the SDK
 * attaches, such as `error`, `stack`, payload details and task tokens, is dropped.
 */
const safeMetadata = [
  "sdkComponent",
  "namespace",
  "taskQueue",
  "workflowType",
  "workflowId",
  "activityType",
  "attempt",
  "durationMs",
] as const;

const messageLimit = 80;

/**
 * The SDK appends failure text after a colon, for example `Error while processing
 * ActivityTask.start: <message>`; keep only the fixed part.
 */
const safeMessage = (message: string) =>
  message
    .replace(/[:\n][\s\S]*$/u, "")
    .trim()
    .slice(0, messageLimit);

/**
 * Format a worker log entry without failure text or stack traces: the level, a short fixed
 * message, and the identifiers of the workflow or activity involved.
 */
export const formatSafeLogEntry = ({ level, timestampNanos, message, meta }: LogEntry) => {
  const fields = Object.entries(meta ?? {})
    .filter(([name]) => (safeMetadata as readonly string[]).includes(name))
    .map(([name, value]) => `${name}=${typeof value === "string" ? value : JSON.stringify(value)}`);
  const date = new Date(Number(timestampNanos / 1_000_000n)).toISOString();
  return `${date} [${level}] ${safeMessage(message)}${fields.length > 0 ? ` ${fields.join(" ")}` : ""}\n`;
};

/** The log function for the SDK Runtime logger: writes {@link formatSafeLogEntry} to stderr. */
export const writeSafeLogEntry = (entry: LogEntry) => {
  process.stderr.write(formatSafeLogEntry(entry));
};
