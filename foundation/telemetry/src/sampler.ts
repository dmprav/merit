import { trace, TraceFlags } from "@opentelemetry/api";
import { AlwaysOnSampler, SamplingDecision, type Sampler } from "@opentelemetry/sdk-trace";

export type TraceFilterMode = "checkly" | "all";

export const resolveTraceFilter = (value?: string): TraceFilterMode =>
  value?.trim().toLowerCase() === "all" ? "all" : "checkly";

export const createTraceSampler = (filter: TraceFilterMode): Sampler => {
  if (filter === "all") {
    return new AlwaysOnSampler();
  }

  // Keep a rolling minute of admissions across requests handled by this provider.
  let admissions: number[] = [];
  const sampled = { decision: SamplingDecision.RECORD_AND_SAMPLED };
  const dropped = { decision: SamplingDecision.NOT_RECORD };
  return {
    shouldSample(parentContext) {
      const parent = trace.getSpanContext(parentContext);
      if (!parent) {
        return dropped;
      }
      if (!parent.isRemote) {
        return parent.traceFlags & TraceFlags.SAMPLED ? sampled : dropped;
      }
      if (parent.traceState?.get("checkly") !== "true") {
        return dropped;
      }

      const now = performance.now();
      admissions = admissions.filter((started) => now - started < 60_000);
      if (admissions.length >= 10) {
        return dropped;
      }
      admissions.push(now);
      return sampled;
    },
    toString: () => "ChecklyTraceSampler",
  };
};
