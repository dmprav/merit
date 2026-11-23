import type { AssistantPreview } from "./contracts";
import type { AssistantContext } from "./operations";

export type PreviewContext = AssistantContext & { refresh: boolean };

type Target = AssistantPreview["targets"][number];

type ApplicationSection = "review_request" | "working_revision" | "assessment";

export class PreviewProblem extends Error {
  readonly status: string;
  constructor(status: string) {
    super(status);
    this.status = status;
  }
}

// Rebase only a fresh approval. Evidence-version constraints describe the user's intent.
export const bindRevision = (
  ctx: PreviewContext,
  input: Record<string, unknown>,
  key: string,
  actual: number,
) => {
  if (!ctx.refresh && input[key] !== undefined && input[key] !== actual) {
    throw new PreviewProblem("conflict");
  }
  input[key] = actual;
};

export const target = (
  kind: string,
  id: string,
  label: string,
  version: string | number,
): Target => ({
  kind,
  id,
  label,
  version: String(version),
});

export const applicationContent = async (
  { actor, ops, workspaceSlug }: AssistantContext,
  applicationId: string,
  section: ApplicationSection,
  entryId?: string,
) => {
  let content = "";
  let offset = 0;
  let fingerprint: string | undefined;
  for (;;) {
    const page = await ops.grantmaking.applicationContent(actor, {
      workspaceSlug,
      applicationId,
      section,
      entryId,
      offset,
      fingerprint,
    });
    if (page.status !== "ok") {
      throw new PreviewProblem(page.status);
    }
    content += page.content;
    if (page.nextOffset === null) {
      return { value: JSON.parse(content) as unknown, version: page.fingerprint };
    }
    if (page.nextOffset <= offset) {
      throw new PreviewProblem("unavailable");
    }
    offset = page.nextOffset;
    fingerprint = page.fingerprint;
  }
};

export const readContact = async (
  { actor, ops, workspaceSlug }: AssistantContext,
  contactId: string,
) => {
  const result = await ops.contacts.getContact(actor, { workspaceSlug, contactId });
  if (result.status !== "ok") {
    throw new PreviewProblem(result.status);
  }
  return result.contact;
};
