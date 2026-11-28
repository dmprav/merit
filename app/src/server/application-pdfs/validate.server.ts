import { Worker } from "node:worker_threads";

// Parse uploaded documents off the request thread and bound the work for a malformed file.
export const hasPdfPages = (bytes: Uint8Array) =>
  new Promise<boolean>((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.resolve("#validate-application-pdf")), {
      workerData: bytes,
      resourceLimits: { maxOldGenerationSizeMb: 128 },
    });
    const timeout = setTimeout(() => {
      resolve(false);
      void worker.terminate();
    }, 10_000);
    worker.once("message", (result: unknown) => resolve(result === true));
    worker.once("error", reject);
    worker.once("exit", () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
