import type { ApplicationPdf } from "@merit/applications/domain";

export const samplePdfKeys = ["proposal", "budget", "revised-budget"] as const;

export type SamplePdf = (typeof samplePdfKeys)[number];

export type PdfUpload = {
  mode: "samples" | "files";
  stage: (
    source: File | SamplePdf,
    signal: AbortSignal,
  ) => Promise<
    { status: "ok"; pdf: ApplicationPdf } | { status: "invalid" | "oversized" | "unavailable" }
  >;
};
