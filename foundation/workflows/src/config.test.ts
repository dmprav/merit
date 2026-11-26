import { describe, expect, it } from "vite-plus/test";

import { readTemporalConfig, readPayloadKey } from "./config.ts";

const productionKey = Buffer.alloc(32, 7).toString("base64");
const deployed = { TEMPORAL_ADDRESS: "temporal.example:7233", TEMPORAL_PAYLOAD_KEY: productionKey };

describe("local defaults", () => {
  it("connects to the Compose service in the default namespace without TLS", () => {
    const config = readTemporalConfig({}, { local: true });

    expect(config).toMatchObject({
      address: "127.0.0.1:7233",
      namespace: "default",
      apiKey: undefined,
      tls: false,
    });
    expect(config.payloadKey.byteLength).toBe(32);
  });

  it("treats blank settings, as left in an environment file, as unset", () => {
    const config = readTemporalConfig(
      {
        TEMPORAL_ADDRESS: "",
        TEMPORAL_NAMESPACE: " ",
        TEMPORAL_API_KEY: "",
        TEMPORAL_PAYLOAD_KEY: "",
      },
      { local: true },
    );

    expect(config).toMatchObject({ address: "127.0.0.1:7233", namespace: "default", tls: false });
  });

  it("lets settings override the defaults", () => {
    const config = readTemporalConfig(
      { ...deployed, TEMPORAL_NAMESPACE: "merit.abc12" },
      { local: true },
    );

    expect(config).toMatchObject({ address: "temporal.example:7233", namespace: "merit.abc12" });
    expect(Buffer.from(config.payloadKey).toString("base64")).toBe(productionKey);
  });
});

describe("deployed configuration", () => {
  it("accepts an explicit address and payload key", () => {
    expect(readTemporalConfig(deployed, { local: false })).toMatchObject({
      address: "temporal.example:7233",
      namespace: "default",
      tls: false,
    });
  });

  it("requires an address", () => {
    expect(() =>
      readTemporalConfig({ TEMPORAL_PAYLOAD_KEY: productionKey }, { local: false }),
    ).toThrow("TEMPORAL_ADDRESS is required.");
  });

  it("requires a payload key so the published development key is never used", () => {
    expect(() =>
      readTemporalConfig({ TEMPORAL_ADDRESS: "temporal.example:7233" }, { local: false }),
    ).toThrow("TEMPORAL_PAYLOAD_KEY is required.");
  });

  it("implies TLS when an API key is set", () => {
    const config = readTemporalConfig(
      { ...deployed, TEMPORAL_API_KEY: "secret-token" },
      { local: false },
    );

    expect(config).toMatchObject({ apiKey: "secret-token", tls: true });
  });
});

describe("validation", () => {
  it.each([
    ["an address without a port", { TEMPORAL_ADDRESS: "temporal.example" }, "TEMPORAL_ADDRESS"],
    [
      "an address with a scheme",
      { TEMPORAL_ADDRESS: "https://temporal.example:7233" },
      "TEMPORAL_ADDRESS",
    ],
    ["a namespace with spaces", { TEMPORAL_NAMESPACE: "my space" }, "TEMPORAL_NAMESPACE"],
    ["a key that is not base64", { TEMPORAL_PAYLOAD_KEY: "not base64!" }, "TEMPORAL_PAYLOAD_KEY"],
  ])("rejects %s", (_name, settings, name) => {
    expect(() => readTemporalConfig({ ...deployed, ...settings }, { local: false })).toThrow(name);
  });

  it("rejects a payload key of the wrong length", () => {
    expect(() =>
      readTemporalConfig(
        { ...deployed, TEMPORAL_PAYLOAD_KEY: Buffer.alloc(16).toString("base64") },
        { local: false },
      ),
    ).toThrow("32 bytes");
  });

  it("names invalid settings without echoing their values", () => {
    expect(() =>
      readTemporalConfig(
        { ...deployed, TEMPORAL_ADDRESS: "bad address secret-token" },
        { local: false },
      ),
    ).toThrow(/^Invalid Temporal configuration: TEMPORAL_ADDRESS\.$/u);
  });
});

it("requires a valid key for sealing work independently of Temporal connection settings", () => {
  expect(readPayloadKey(productionKey, { local: false })).toEqual(
    new Uint8Array(Buffer.from(productionKey, "base64")),
  );
  expect(() => readPayloadKey(productionKey + " ", { local: false })).toThrow(
    "TEMPORAL_PAYLOAD_KEY",
  );
  expect(() => readPayloadKey("bad!", { local: false })).toThrow("Invalid TEMPORAL_PAYLOAD_KEY");
});
