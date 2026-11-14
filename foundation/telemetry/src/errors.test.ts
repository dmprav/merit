import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  normalizeError,
  reportError,
  sanitizeExtra,
  setErrorReporter,
  type ErrorReport,
} from "./errors";

describe("normalizeError", () => {
  it("normalizes Error instances with name, message, and stack", () => {
    const err = new TypeError("Invalid payload");
    const normalized = normalizeError(err);

    expect(normalized.name).toBe("TypeError");
    expect(normalized.message).toBe("Invalid payload");
    expect(normalized.stack).toContain("Invalid payload");
  });

  it("normalizes Error instances without name or stack", () => {
    const err = new Error("No stack or name");
    err.name = "";
    delete err.stack;

    expect(normalizeError(err)).toEqual({
      name: "Error",
      message: "No stack or name",
    });
  });

  it("normalizes string and object errors", () => {
    expect(normalizeError("boom")).toEqual({ name: "Error", message: "boom" });
    expect(normalizeError({ name: "CustomError", message: "bad input" })).toEqual({
      name: "CustomError",
      message: "bad input",
    });
    expect(normalizeError({ message: 404 })).toEqual({ name: "Error", message: "404" });
  });

  it("normalizes primitive and nullish values", () => {
    expect(normalizeError(null)).toEqual({ name: "Error", message: "null" });
    expect(normalizeError(undefined)).toEqual({ name: "Error", message: "undefined" });
    expect(normalizeError(42)).toEqual({ name: "Error", message: "42" });
  });
});

describe("sanitizeExtra", () => {
  it("returns undefined when extra is omitted", () => {
    expect(sanitizeExtra(undefined)).toBeUndefined();
  });

  it("redacts sensitive keys recursively and handles circular references", () => {
    const circular: Record<string, unknown> = { provider: "Resend", apiKey: "secret-key" };
    circular.self = circular;

    const sanitized = sanitizeExtra({
      authorization: "Bearer abc",
      nested: {
        userEmail: "person@example.com",
        status: 502,
      },
      items: [{ token: "tok_123", count: 2 }],
      circular,
    });

    expect(sanitized).toEqual({
      authorization: "[Redacted]",
      nested: {
        userEmail: "[Redacted]",
        status: 502,
      },
      items: [{ token: "[Redacted]", count: 2 }],
      circular: {
        provider: "Resend",
        apiKey: "[Redacted]",
        self: "[Circular]",
      },
    });
  });
});

describe("reportError and setErrorReporter", () => {
  afterEach(() => {
    setErrorReporter(null);
    vi.restoreAllMocks();
  });

  it("logs structured JSON via console.error by default", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    reportError(new Error("Connection failed"), {
      surface: "email",
      operation: "email.send",
      tags: { provider: "Resend", omitted: undefined },
      extra: { status: 502, apiKey: "re_123" },
    });

    expect(log).toHaveBeenCalledOnce();
    const [prefix, rawPayload] = log.mock.calls[0] as [unknown, unknown];
    expect(prefix).toBe("[merit:error]");
    const parsed: unknown = JSON.parse(String(rawPayload));
    expect(parsed).toMatchObject({
      surface: "email",
      operation: "email.send",
      error: { name: "Error", message: "Connection failed" },
      tags: { provider: "Resend" },
      extra: { status: 502, apiKey: "[Redacted]" },
    });
  });

  it("omits tags when all tag values are undefined", () => {
    const received: ErrorReport[] = [];
    setErrorReporter((report) => {
      received.push(report);
    });

    reportError("oops", {
      surface: "web",
      operation: "route.load",
      tags: { empty: undefined },
    });

    expect(received[0]!.context).toEqual({
      surface: "web",
      operation: "route.load",
      tags: undefined,
    });
  });

  it("falls back when JSON.stringify throws (e.g. BigInt in extra)", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    reportError(new Error("BigInt failure"), {
      surface: "server",
      operation: "worker.fetch",
      extra: { amount: 10n },
    });

    expect(log).toHaveBeenCalledWith("[merit:error]", "server", "worker.fetch", "BigInt failure");
  });

  it("routes reports to a custom reporter and resets to default on null", () => {
    const received: ErrorReport[] = [];
    setErrorReporter((report) => {
      received.push(report);
    });

    const original = new Error("Client crash");
    reportError(original, { surface: "web", operation: "root.errorBoundary" });

    expect(received).toHaveLength(1);
    expect(received[0]!.rawError).toBe(original);
    expect(received[0]!.context).toEqual({
      surface: "web",
      operation: "root.errorBoundary",
    });

    setErrorReporter(null);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    reportError("fallback", { surface: "server", operation: "worker.fetch" });
    expect(log).toHaveBeenCalledOnce();
  });

  it("falls back to console.error if a custom reporter throws", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    setErrorReporter(() => {
      throw new Error("Reporter crashed");
    });

    expect(() =>
      reportError(new Error("Original failure"), {
        surface: "server",
        operation: "worker.fetch",
      }),
    ).not.toThrow();
    expect(log).toHaveBeenCalledOnce();
  });
});
