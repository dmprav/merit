import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { expect, it, vi } from "vite-plus/test";

import { aiReviewFixture } from "../../testing/ai-review.fixtures";
import { createAiReviewData } from "./workspace-data";

const grantWorkScope = ["workspace", "alder", "grant-work"];
const grantWorkPage = [...grantWorkScope, "application", "a1"];
const unrelated = ["workspace", "alder", "contacts"];

const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const run = vi.fn().mockResolvedValue({ status: "failed" });
  const reviews = [aiReviewFixture()];
  const data = createAiReviewData(
    client,
    { run, grantWorkScope },
    { reviews, availability: "demo", provider: null },
  );
  return { client, run, reviews, data };
};

it("carries the page's AI reviews with a run that goes to the transport", async () => {
  const { run, reviews, data } = setup();

  expect(data).toMatchObject({ reviews, availability: "demo", provider: null });
  await data.run("run-1");

  expect(run).toHaveBeenCalledWith("run-1");
});

it("refreshes the grant work pages and leaves unrelated queries alone", async () => {
  const { client, data } = setup();
  client.setQueryData(grantWorkPage, "page");
  client.setQueryData(unrelated, "contacts");

  await data.refresh();

  expect(client.getQueryState(grantWorkPage)?.isInvalidated).toBe(true);
  expect(client.getQueryState(unrelated)?.isInvalidated).toBe(false);
});

it("refetches an open page and rejects when that read fails", async () => {
  const { client, data } = setup();
  let offline = false;
  const read = vi.fn(async () => {
    if (offline) {
      throw new Error("Offline");
    }
    return "page";
  });
  const open = new QueryObserver(client, { queryKey: grantWorkPage, queryFn: read });
  const stop = open.subscribe(() => {});
  await vi.waitFor(() => expect(client.getQueryData(grantWorkPage)).toBe("page"));
  client.setQueryData(unrelated, "contacts");
  offline = true;

  await expect(data.refresh()).rejects.toThrow("Offline");

  expect(read).toHaveBeenCalledTimes(2);
  // The page keeps what it last read, and nothing unrelated was touched.
  expect(client.getQueryData(grantWorkPage)).toBe("page");
  expect(client.getQueryState(unrelated)?.isInvalidated).toBe(false);
  stop();
});
