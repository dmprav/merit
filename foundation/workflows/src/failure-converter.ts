import { DefaultFailureConverter } from "@temporalio/common";

/**
 * Moves failure messages and stack traces into encoded attributes, so the payload codec
 * encrypts them. Without this, an error message such as one that names a record would
 * be stored in plaintext. Workflow code runs this module inside Temporal's sandbox, so it
 * imports nothing but the SDK's common package and is loaded by path (`failureConverterPath`).
 */
export const failureConverter = new DefaultFailureConverter({ encodeCommonAttributes: true });
