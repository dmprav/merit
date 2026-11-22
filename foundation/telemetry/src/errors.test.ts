import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { reportError, setErrorReporter, type ErrorReport } from "./errors";

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
      tags: { provider: "Resend", authorization: "private", omitted: undefined },
      extra: { status: 502, apiKey: "re_123" },
    });

    expect(log).toHaveBeenCalledOnce();
    const [prefix, rawPayload] = log.mock.calls[0] as [unknown, unknown];
    expect(prefix).toBe("[merit:error]");
    expect(String(rawPayload)).not.toContain("Connection failed");
    const parsed: unknown = JSON.parse(String(rawPayload));
    expect(parsed).toEqual({
      surface: "email",
      operation: "email.send",
      errorType: "Error",
      tags: { provider: "Resend" },
      extra: { status: 502 },
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

    expect(received[0]).toEqual({
      errorType: "Error",
      surface: "web",
      operation: "route.load",
    });
  });

  it("selects diagnostic fields without serializing untrusted exception names, URLs or extra values", () => {
    const reporter = vi.fn();
    setErrorReporter(reporter);
    const error = new Error("private exception");
    error.name = "private error name";
    const extra = { amount: 10n, nested: { payload: error } };
    reportError(error, {
      surface: "server",
      operation: "server.fetch",
      tags: { route: "/invitations/private", method: "GET", status: 503, token: "private" },
      extra,
    });
    expect(reporter).toHaveBeenCalledWith({
      surface: "server",
      operation: "server.fetch",
      errorType: "Error",
      tags: { route: "/invitations/:token", method: "GET", status: 503 },
    });
    reportError(new TypeError("private"), {
      surface: "server",
      operation: "server.fetch",
      tags: { method: "private", provider: "private" },
    });
    expect(reporter).toHaveBeenLastCalledWith({
      surface: "server",
      operation: "server.fetch",
      errorType: "TypeError",
    });
  });

  it("routes reports to a custom reporter and resets to default on null", () => {
    const received: ErrorReport[] = [];
    setErrorReporter((report) => {
      received.push(report);
    });

    const original = new Error("Client crash");
    reportError(original, { surface: "web", operation: "root.errorBoundary" });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({
      errorType: "Error",
      surface: "web",
      operation: "root.errorBoundary",
    });
    setErrorReporter(null);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    reportError("fallback", { surface: "server", operation: "server.fetch" });
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
        operation: "server.fetch",
      }),
    ).not.toThrow();
    expect(log).toHaveBeenCalledOnce();
  });
});
