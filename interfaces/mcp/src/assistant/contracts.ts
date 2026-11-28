import { z } from "zod";

export const recordSchema = z.record(z.string(), z.unknown());

export const fields = (value: unknown) => recordSchema.safeParse(value).data ?? {};

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
  input: recordSchema,
  targets: z.array(
    z.union([
      targetSchema,
      z.strictObject({
        kind: z.enum(["application", "round"]),
        requestId: z.uuid(),
        label: z.string(),
        version: z.literal("proposed"),
      }),
    ]),
  ),
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
  /**
   * `stored` marks input taken from an approved action (a retry or a stale refresh), whose run
   * identity is kept. Input a model supplied never is.
   */
  preview(
    name: string,
    input: Record<string, unknown>,
    stored?: boolean,
  ): Promise<AssistantReceipt & { preview?: AssistantPreview }>;
  execute(preview: AssistantPreview): Promise<AssistantReceipt & { retry?: AssistantPreview }>;
};

export const receipt = (status: string): AssistantReceipt => ({
  result: { status },
  dependencies: [],
  citations: [],
});
