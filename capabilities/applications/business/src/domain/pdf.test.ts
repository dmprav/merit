import { expect, it } from "vite-plus/test";

import { applicationPdfsSchema, pdfLimits } from "./pdf";

const file = {
  id: "10000000-0000-4000-8000-000000000001",
  filename: "Project proposal.PDF",
  byteLength: pdfLimits.pdfBytes,
};

it("accepts up to five distinct PDFs of at most 25 MB each", () => {
  const files = Array.from({ length: 6 }, (_, index) => ({
    ...file,
    id: `10000000-0000-4000-8000-00000000000${index}`,
  }));
  expect(applicationPdfsSchema.safeParse(files.slice(0, 5)).success).toBe(true);
  expect(applicationPdfsSchema.safeParse(files).success).toBe(false);
  for (const invalid of [
    [file, file],
    [{ ...file, byteLength: 0 }],
    [{ ...file, byteLength: pdfLimits.pdfBytes + 1 }],
    [{ ...file, filename: "../proposal.pdf" }],
    [{ ...file, filename: "notes.txt" }],
  ]) {
    expect(applicationPdfsSchema.safeParse(invalid).success).toBe(false);
  }
});
