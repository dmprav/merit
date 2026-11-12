import { expect, it } from "vite-plus/test";
import { z } from "zod";

import { decodeDraft } from "./format";

const schema = z.object({ text: z.string(), revision: z.number(), requestId: z.string() });
const draft = { text: "", revision: 3, requestId: "original-retry" };

it("accepts unfinished current input and preserves its editing baseline", () => {
  expect(decodeDraft({ version: 1, value: draft }, { version: 1, schema })).toEqual(draft);
});

it.each([0, 2])("rejects unsupported payload version %s", (version) => {
  expect(() => decodeDraft({ version, value: draft }, { version: 1, schema })).toThrow(
    "Unsupported draft format",
  );
});

it("rejects malformed current payloads", () => {
  expect(() =>
    decodeDraft({ version: 1, value: { ...draft, revision: "3" } }, { version: 1, schema }),
  ).toThrow();
});
