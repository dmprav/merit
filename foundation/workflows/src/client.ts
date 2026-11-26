// The part of @merit/workflows that the web server may load: it reaches Temporal as a client
// and never loads the worker's native module.
export { readPayloadKey, readTemporalConfig, type TemporalConfig } from "./config.ts";
export { createWorkflowClient, type WorkflowClient } from "./connection.ts";
export { defaultOutcomeWait, waitForOutcome, type OutcomeWait } from "./outcome.ts";
export { ensureSchedule, type ScheduleSettings } from "./schedule.ts";
export {
  createWorkflowStarter,
  type StartOutcome,
  type StartRequest,
  type WorkflowStarter,
  type WorkflowStarterOptions,
} from "./start.ts";
