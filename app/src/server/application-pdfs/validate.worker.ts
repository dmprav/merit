import { parentPort, workerData } from "node:worker_threads";

import { PDFDocument } from "pdf-lib";

if (!parentPort) {
  throw new Error("Run PDF validation in a worker.");
}

try {
  if (!(workerData instanceof Uint8Array)) {
    throw new TypeError("Expected PDF bytes.");
  }
  const pdf = await PDFDocument.load(workerData, {
    updateMetadata: false,
    ignoreEncryption: true,
    throwOnInvalidObject: true,
  });
  const pages = pdf.getPages();
  parentPort.postMessage(
    pages.length > 0 &&
      pages.every((page) => {
        const { width, height } = page.getSize();
        return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
      }),
  );
} catch {
  parentPort.postMessage(false);
}
