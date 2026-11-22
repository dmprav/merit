import { expect, it } from "vite-plus/test";

import { pages } from "./client";

it("stops a paginated control when a continuation repeats", async () => {
  const replies = [
    { after: "A", limit: 20 },
    { after: "B", limit: 20 },
    { limit: 20, after: "A" },
  ];
  let requests = 0;
  await expect(
    pages(
      async () => {
        const nextPage = replies[requests++];
        return { status: "ok", rows: [], nextPage: nextPage ?? null };
      },
      "list_contacts",
      {},
      "rows",
    ),
  ).rejects.toThrow("Repeated page request for list_contacts");
  expect(requests).toBe(3);
});
