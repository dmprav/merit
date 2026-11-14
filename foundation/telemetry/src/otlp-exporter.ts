import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import { JsonTraceSerializer } from "@opentelemetry/otlp-transformer";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace";

export const parseOtlpHeaders = (raw?: string): Record<string, string> => {
  const headers: Record<string, string> = {};
  if (!raw) {
    return headers;
  }

  for (const entry of raw.split(",")) {
    const separator = entry.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = entry.slice(0, separator).trim().toLowerCase();
    const value = entry.slice(separator + 1).trim();
    if (key && value) {
      headers[key] = value;
    }
  }

  return headers;
};

export const resolveTracesUrl = (endpoint?: string): string | null => {
  const trimmed = endpoint?.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = URL.parse(trimmed);
  if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
    return null;
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, "");
  parsed.pathname = normalizedPath.endsWith("/v1/traces")
    ? normalizedPath
    : `${normalizedPath}/v1/traces`;
  return parsed.href;
};

type FetchOtlpTraceExporterOptions = {
  url: string;
  headers?: Record<string, string>;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
};

export class FetchOtlpTraceExporter implements SpanExporter {
  private readonly url: string;
  private readonly headers: Record<string, string>;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private isShutdown = false;

  constructor(options: FetchOtlpTraceExporterOptions) {
    this.url = options.url;
    this.headers = { ...options.headers };
    this.fetchFn = options.fetchFn ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    if (this.isShutdown || spans.length === 0) {
      resultCallback({ code: ExportResultCode.SUCCESS });
      return;
    }

    const payload = JsonTraceSerializer.serializeRequest(spans);
    if (!payload) {
      resultCallback({
        code: ExportResultCode.FAILED,
        error: new Error("OTLP trace serializer returned no payload."),
      });
      return;
    }

    void this.postBatch(new Uint8Array(payload), resultCallback);
  }

  shutdown(): Promise<void> {
    this.isShutdown = true;
    return Promise.resolve();
  }

  private async postBatch(
    body: Uint8Array<ArrayBuffer>,
    resultCallback: (result: ExportResult) => void,
  ): Promise<void> {
    try {
      const response = await this.fetchFn(this.url, {
        method: "POST",
        headers: {
          ...this.headers,
          "content-type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      await response.body?.cancel();
      if (!response.ok) {
        resultCallback({
          code: ExportResultCode.FAILED,
          error: new Error(`OTLP export returned HTTP ${response.status}.`),
        });
        return;
      }
      resultCallback({ code: ExportResultCode.SUCCESS });
    } catch (error) {
      resultCallback({
        code: ExportResultCode.FAILED,
        error: error instanceof Error ? error : new Error("OTLP export request failed."),
      });
    }
  }
}
