import type { PdfUpload } from "@merit/applications-web/contracts";
import { applicationPdfSchema } from "@merit/applications/domain";

export const applicationPdfUpload = (
  workspaceSlug: string,
  kind: "demo" | "standard",
  target: { roundId: string } | { applicationId: string },
): PdfUpload => ({
  mode: kind === "demo" ? "samples" : "files",
  stage: async (source, signal) => {
    const query = new URLSearchParams(target);
    if (typeof source === "string") {
      query.set("sample", source);
    } else {
      query.set("filename", source.name);
    }

    const response = await fetch(
      `/api/application-pdfs/${encodeURIComponent(workspaceSlug)}?${query}`,
      {
        method: "POST",
        ...(typeof source === "string"
          ? {}
          : { headers: { "Content-Type": "application/pdf" }, body: source }),
        signal,
      },
    );
    if (response.status === 413) {
      return { status: "oversized" };
    }
    if (response.status === 415) {
      return { status: "invalid" };
    }
    if (!response.ok) {
      return { status: "unavailable" };
    }
    const pdf = applicationPdfSchema.parse(await response.json());
    return { status: "ok", pdf };
  },
});
