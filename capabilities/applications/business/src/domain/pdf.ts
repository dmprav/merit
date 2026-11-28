import { z } from "zod";

export const pdfLimits = { pdfsCount: 5, pdfBytes: 25_000_000 } as const;

export const applicationPdfSchema = z.strictObject({
  id: z.uuid(),
  filename: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/^[^/\\\p{Cc}]+\.pdf$/iu),
  byteLength: z.int().positive().max(pdfLimits.pdfBytes),
});

export type ApplicationPdf = z.infer<typeof applicationPdfSchema>;

export const applicationPdfsSchema = z
  .array(applicationPdfSchema)
  .max(pdfLimits.pdfsCount)
  .refine(
    (files) => new Set(files.map((file) => file.id)).size === files.length,
    "PDFs must be unique.",
  );
