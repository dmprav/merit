import { decryptBytes, encryptBytes } from "@merit/workflows/encryption";

export const hashToken = async (token: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");

export const sealInvitationToken = (key: Uint8Array, id: string, token: string) =>
  encryptBytes(key, Buffer.from(token), `organization-invitation:${id}`).toString("base64");

export const openInvitationToken = (key: Uint8Array, id: string, ciphertext: string) =>
  decryptBytes(key, Buffer.from(ciphertext, "base64"), `organization-invitation:${id}`).toString();
