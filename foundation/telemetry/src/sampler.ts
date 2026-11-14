import { trace, type Context } from "@opentelemetry/api";
import { AlwaysOnSampler, SamplingDecision, type Sampler } from "@opentelemetry/sdk-trace";

export type TraceFilterMode = "checkly" | "all";

export const resolveTraceFilter = (value?: string): TraceFilterMode =>
  value?.trim().toLowerCase() === "all" ? "all" : "checkly";

export const isChecklyTraceContext = (parentContext: Context): boolean =>
  trace.getSpanContext(parentContext)?.traceState?.get("checkly") === "true";

export const createTraceSampler = (filter: TraceFilterMode): Sampler => {
  if (filter === "all") {
    return new AlwaysOnSampler();
  }

  return {
    shouldSample: (parentContext) => ({
      decision: isChecklyTraceContext(parentContext)
        ? SamplingDecision.RECORD_AND_SAMPLED
        : SamplingDecision.NOT_RECORD,
    }),
    toString: () => "ChecklyTraceSampler",
  };
};
