import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  defaultPayloadConverter,
  type DataConverter,
  type LoadedDataConverter,
  type Payload,
  type PayloadCodec,
} from "@temporalio/common";
import proto from "@temporalio/proto";

import { failureConverter } from "./failure-converter.ts";

// The protobuf module is CommonJS, so Node cannot take its named exports directly.
const { temporal } = proto;

export const encryptedEncoding = "binary/encrypted";
const cipherName = "aes-256-gcm";
const ivBytes = 12;
const tagBytes = 16;
const text = new TextEncoder();
const textDecoder = new TextDecoder();

const metadata = { encoding: text.encode(encryptedEncoding), cipher: text.encode(cipherName) };

/**
 * Encrypt each whole payload, metadata included, with AES-256-GCM. The stored data is
 * `iv || tag || ciphertext`; the server sees only the encrypted encoding and cipher name.
 * Payloads that are not encrypted are rejected so plaintext cannot enter or leave unnoticed.
 */
export const createPayloadCodec = (key: Uint8Array): PayloadCodec => {
  if (key.byteLength !== 32) {
    throw new Error("The payload key must be 32 bytes.");
  }

  const encrypt = (payload: Payload): Payload => {
    const iv = randomBytes(ivBytes);
    const cipher = createCipheriv(cipherName, key, iv);
    const plain = temporal.api.common.v1.Payload.encode(payload).finish();
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    return { metadata, data: Buffer.concat([iv, cipher.getAuthTag(), encrypted]) };
  };

  const decrypt = (payload: Payload): Payload => {
    if (textDecoder.decode(payload.metadata?.encoding ?? new Uint8Array()) !== encryptedEncoding) {
      throw new Error("Refusing a workflow payload that is not encrypted.");
    }
    const data = payload.data ?? new Uint8Array();
    const iv = data.subarray(0, ivBytes);
    const tag = data.subarray(ivBytes, ivBytes + tagBytes);
    const decipher = createDecipheriv(cipherName, key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([
      decipher.update(data.subarray(ivBytes + tagBytes)),
      decipher.final(),
    ]);
    return temporal.api.common.v1.Payload.decode(plain);
  };

  return {
    encode: async (payloads) => payloads.map(encrypt),
    decode: async (payloads) => payloads.map(decrypt),
  };
};

const failureConverterPath = fileURLToPath(new URL("./failure-converter.ts", import.meta.url));

/**
 * The data converter for a worker: default JSON conversion, failure messages and stack
 * traces moved into encoded attributes, then encryption of every payload. The failure
 * converter is a path because workflow code converts failures inside its sandbox.
 */
export const createDataConverter = (key: Uint8Array): DataConverter => ({
  payloadCodecs: [createPayloadCodec(key)],
  failureConverterPath,
});

/**
 * The same conversion for a client, with the failure converter supplied as a loaded
 * instance, so a client never has to load a module by path.
 */
export const createClientDataConverter = (key: Uint8Array): DataConverter => {
  const loaded: LoadedDataConverter = {
    payloadConverter: defaultPayloadConverter,
    failureConverter,
    payloadCodecs: [createPayloadCodec(key)],
  };
  return loaded;
};
