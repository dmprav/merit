import type { DraftFormat } from "./types";

export const decodeDraft = <T>(
  payload: { version: number; value?: unknown },
  format: DraftFormat<T>,
): T => {
  if (payload.version !== format.version) {
    throw new Error("Unsupported draft format");
  }
  return format.schema.parse(payload.value);
};
