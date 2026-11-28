import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const cipherName = "aes-256-gcm";
const ivBytes = 12;
const tagBytes = 16;

/** The optional associated data binds a stored envelope to its purpose and record. */
export const encryptBytes = (key: Uint8Array, plain: Uint8Array, context?: string) => {
  const iv = randomBytes(ivBytes);
  const cipher = createCipheriv(cipherName, key, iv);
  if (context !== undefined) {
    cipher.setAAD(Buffer.from(context));
  }
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
};

export const decryptBytes = (key: Uint8Array, data: Uint8Array, context?: string) => {
  const decipher = createDecipheriv(cipherName, key, data.subarray(0, ivBytes));
  if (context !== undefined) {
    decipher.setAAD(Buffer.from(context));
  }
  decipher.setAuthTag(data.subarray(ivBytes, ivBytes + tagBytes));
  return Buffer.concat([decipher.update(data.subarray(ivBytes + tagBytes)), decipher.final()]);
};
