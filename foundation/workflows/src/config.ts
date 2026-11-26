import { z } from "zod";

/**
 * Fixed key for local development and preview only. It is public in the repository, so it
 * protects nothing; every other environment must supply its own `TEMPORAL_PAYLOAD_KEY`.
 */
const developmentPayloadKey = "bWVyaXQtbG9jYWwtZGV2ZWxvcG1lbnQta2V5ISEhISE=";
const localAddress = "127.0.0.1:7233";
const keyBytes = 32;

/** Treat blank settings, as left in an environment example, as unset. */
const setting = (schema: z.ZodType<string>) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    schema.optional(),
  );

const environment = z.object({
  TEMPORAL_ADDRESS: setting(z.string().regex(/^[^\s/:]+:\d{1,5}$|^\[[0-9a-f:]+\]:\d{1,5}$/iu)),
  TEMPORAL_NAMESPACE: setting(z.string().regex(/^[A-Za-z0-9._-]{1,255}$/u)),
  TEMPORAL_API_KEY: setting(z.string()),
  TEMPORAL_PAYLOAD_KEY: setting(z.base64()),
});

export type TemporalConfig = {
  /** `host:port` of the Temporal frontend (gRPC). */
  address: string;
  namespace: string;
  /** Present for a hosted service; its presence implies TLS. */
  apiKey: string | undefined;
  tls: boolean;
  /** AES-256 key for every workflow payload. */
  payloadKey: Uint8Array;
};

/**
 * Read Temporal settings from the server environment.
 *
 * `local` selects the loopback address and the development payload key when settings are
 * absent. Outside local development the address and payload key are required, so a
 * deployment cannot silently talk to localhost or use the published key.
 */
export const readTemporalConfig = (
  env: Readonly<Record<string, string | undefined>>,
  { local }: { local: boolean },
): TemporalConfig => {
  const parsed = environment.safeParse(env);
  if (!parsed.success) {
    // Name the settings, never their values: they can include credentials.
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Invalid Temporal configuration: ${names.join(", ")}.`);
  }
  const { TEMPORAL_ADDRESS, TEMPORAL_NAMESPACE, TEMPORAL_API_KEY, TEMPORAL_PAYLOAD_KEY } =
    parsed.data;
  const address = TEMPORAL_ADDRESS ?? (local ? localAddress : undefined);
  if (!address) {
    throw new Error("TEMPORAL_ADDRESS is required.");
  }
  return {
    address,
    namespace: TEMPORAL_NAMESPACE ?? "default",
    apiKey: TEMPORAL_API_KEY,
    tls: TEMPORAL_API_KEY !== undefined,
    payloadKey: readPayloadKey(TEMPORAL_PAYLOAD_KEY, { local }),
  };
};

/** Invitation issuance needs the encryption key even while the Temporal service is unavailable. */
export const readPayloadKey = (setting: string | undefined, { local }: { local: boolean }) => {
  const value = setting?.trim() ? setting : undefined;
  const encodedKey = value ?? (local ? developmentPayloadKey : undefined);
  if (!encodedKey) {
    throw new Error("TEMPORAL_PAYLOAD_KEY is required.");
  }
  if (!z.base64().safeParse(encodedKey).success) {
    throw new Error("Invalid TEMPORAL_PAYLOAD_KEY.");
  }
  const payloadKey = new Uint8Array(Buffer.from(encodedKey, "base64"));
  if (payloadKey.byteLength !== keyBytes) {
    throw new Error("TEMPORAL_PAYLOAD_KEY must be 32 bytes, base64 encoded.");
  }
  return payloadKey;
};
