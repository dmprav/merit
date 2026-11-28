import type { AssistantToolName } from "../app/tools";
import { receipt, type AssistantDependency, type AssistantPreview } from "./contracts";
import type { AssistantContext } from "./operations";
import { assistantPolicy } from "./policy";
import { PreviewProblem } from "./preview-records";

export const prepareWrite = async (
  context: AssistantContext,
  name: AssistantToolName,
  input: Record<string, unknown>,
  refresh = false,
) => {
  const ctx = { ...context, refresh };
  const preview: AssistantPreview = { name, input: { ...input }, targets: [], effects: [] };
  const policy = assistantPolicy[name];
  const dependencies: AssistantDependency[] = [{ kind: policy.access }];
  if (!policy.preview) {
    return { ...receipt("invalid_input"), dependencies };
  }
  try {
    for (const build of policy.preview) {
      await build(ctx, preview, dependencies);
    }
    if (!preview.targets.length) {
      throw new PreviewProblem("unavailable");
    }
    return { ...receipt("ok"), dependencies, preview };
  } catch (error) {
    if (!(error instanceof PreviewProblem)) {
      throw error;
    }
    return { ...receipt(error.status), dependencies };
  }
};
