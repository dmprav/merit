import { describe, expect, it } from "vite-plus/test";

import { applicationRequestSchema, publicRoundRequestSchema } from "./queries";

const identity = { workspaceSlug: "alder", publicId: "0123456789ab" };

describe("round query identity", () => {
  it("accepts a workspace and public round identifier with kind round", () => {
    const request = { ...identity, kind: "round" };

    expect(publicRoundRequestSchema.parse(request)).toEqual(request);
  });

  it.each([undefined, "application"])("rejects kind %s", (kind) => {
    expect(publicRoundRequestSchema.safeParse({ ...identity, kind }).success).toBe(false);
  });
});

describe("application query identity", () => {
  it("accepts a workspace and public application identifier without a kind field", () => {
    expect(applicationRequestSchema.parse(identity)).toEqual(identity);
  });

  it("rejects a round discriminator on an application request", () => {
    expect(applicationRequestSchema.safeParse({ ...identity, kind: "round" }).success).toBe(false);
  });
});
