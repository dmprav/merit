import { defaultPayloadConverter, type Payload } from "@temporalio/common";
import { describe, expect, it } from "vite-plus/test";

import { createPayloadCodec, encryptedEncoding } from "./payload-codec.ts";

const key = new Uint8Array(32).fill(3);
const text = new TextDecoder();

const payloadFor = (value: unknown) => defaultPayloadConverter.toPayload(value) as Payload;

describe("payload codec", () => {
  it("round-trips payloads through the default converter", async () => {
    const codec = createPayloadCodec(key);
    const original = [
      payloadFor({ messageId: "msg_1" }),
      payloadFor("text"),
      payloadFor(undefined),
    ];

    const decoded = await codec.decode(await codec.encode(original));

    expect(decoded.map((payload) => defaultPayloadConverter.fromPayload(payload))).toEqual([
      { messageId: "msg_1" },
      "text",
      undefined,
    ]);
  });

  it("hides the content and original encoding from the server", async () => {
    const codec = createPayloadCodec(key);

    const [encrypted] = await codec.encode([payloadFor({ messageId: "recipient@example.test" })]);

    expect(text.decode(encrypted!.metadata!.encoding!)).toBe(encryptedEncoding);
    expect(Object.keys(encrypted!.metadata!).sort()).toEqual(["cipher", "encoding"]);
    expect(Buffer.from(encrypted!.data!).includes("recipient@example.test")).toBe(false);
  });

  it("uses a fresh nonce for identical payloads", async () => {
    const codec = createPayloadCodec(key);
    const [first, second] = await codec.encode([payloadFor("same"), payloadFor("same")]);

    expect(Buffer.from(first!.data!).equals(Buffer.from(second!.data!))).toBe(false);
  });

  it("rejects payloads that are not encrypted", async () => {
    await expect(createPayloadCodec(key).decode([payloadFor("plain")])).rejects.toThrow(
      "not encrypted",
    );
  });

  it("rejects payloads with no encoding or no data", async () => {
    const codec = createPayloadCodec(key);
    const encrypted = { metadata: { encoding: new TextEncoder().encode(encryptedEncoding) } };

    await expect(codec.decode([{}])).rejects.toThrow("not encrypted");
    await expect(codec.decode([encrypted])).rejects.toThrow();
  });

  it("rejects tampered data and payloads encrypted with another key", async () => {
    const codec = createPayloadCodec(key);
    const [encrypted] = await codec.encode([payloadFor("secret")]);
    const tampered = { ...encrypted!, data: Buffer.from(encrypted!.data!) };
    tampered.data[tampered.data.length - 1]! ^= 1;

    await expect(codec.decode([tampered])).rejects.toThrow();
    await expect(
      createPayloadCodec(new Uint8Array(32).fill(4)).decode([encrypted!]),
    ).rejects.toThrow();
  });

  it("requires a 32-byte key", () => {
    expect(() => createPayloadCodec(new Uint8Array(16))).toThrow("32 bytes");
  });
});
