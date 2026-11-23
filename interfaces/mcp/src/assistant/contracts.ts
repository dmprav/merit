import { z } from "zod";

export const assistantDependencySchema = z.union([
  z.strictObject({ kind: z.enum(["membership", "grants", "team", "reviewer"]) }),
  z.strictObject({
    kind: z.literal("assignment"),
    assignmentId: z.uuid(),
    evidence: z.boolean(),
    active: z.literal(true).optional(),
  }),
]);
export const assistantCitationSchema = z.strictObject({
  kind: z.string(),
  recordId: z.string(),
  version: z.string(),
  label: z.string(),
});
const targetSchema = z.strictObject({
  kind: z.string(),
  id: z.string(),
  label: z.string(),
  version: z.string(),
});
export const assistantPreviewSchema = z.strictObject({
  name: z.string(),
  input: z.record(z.string(), z.unknown()),
  targets: z.array(targetSchema),
  effects: z.array(z.string()),
  changes: z.record(z.string(), z.unknown()).optional(),
});

export type AssistantDependency = z.infer<typeof assistantDependencySchema>;

export type AssistantCitation = z.infer<typeof assistantCitationSchema>;

export type AssistantPreview = z.infer<typeof assistantPreviewSchema>;

export type AssistantReceipt = {
  result: Record<string, unknown> & { status: string };
  dependencies: AssistantDependency[];
  citations: AssistantCitation[];
};

export type AssistantCatalog = {
  list(): Promise<
    { name: string; description: string; inputSchema: Record<string, unknown>; write: boolean }[]
  >;
  permits(dependencies: AssistantDependency[]): Promise<boolean>;
  read(name: string, input: Record<string, unknown>): Promise<AssistantReceipt>;
  preview(
    name: string,
    input: Record<string, unknown>,
  ): Promise<AssistantReceipt & { preview?: AssistantPreview }>;
  execute(preview: AssistantPreview): Promise<AssistantReceipt & { retry?: AssistantPreview }>;
};

export const receipt = (status: string): AssistantReceipt => ({
  result: { status },
  dependencies: [],
  citations: [],
});
