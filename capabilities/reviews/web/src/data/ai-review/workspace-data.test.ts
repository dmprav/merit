import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vite-plus/test";

import { aiReviewFixture } from "../../testing/ai-review.fixtures";
import { createAiReviewData } from "./workspace-data";

it("carries the page's AI reviews with a run and a refresh of the grant work", async () => {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
  const run = vi.fn().mockResolvedValue({ status: "failed" });
  const reviews = [aiReviewFixture()];

  const data = createAiReviewData(
    client,
    { run, grantWorkScope: ["workspace", "alder", "grant-work"] },
    { reviews, availability: "demo", provider: null },
  );

  expect(data).toMatchObject({ reviews, availability: "demo", provider: null });
  await data.run("run-1");
  expect(run).toHaveBeenCalledWith("run-1");
  await data.refresh();
  expect(invalidate).toHaveBeenCalledWith(
    { queryKey: ["workspace", "alder", "grant-work"] },
    { throwOnError: true },
  );
});
