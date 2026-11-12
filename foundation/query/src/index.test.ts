import {
  dehydrate,
  hydrate,
  QueryObserver,
  MutationObserver,
  onlineManager,
} from "@tanstack/react-query";
import { assert, expect, it, vi } from "vite-plus/test";

import { available, createQueryClient, privateKey } from "./index";

it("isolates server requests and hydrates without a duplicate mount read", async () => {
  const server = createQueryClient();
  const otherRequest = createQueryClient();
  const queryKey = [...privateKey, "workspace", "alder"];
  const queryFn = vi.fn(async () => ({
    name: "Alder",
    amount: { minorUnits: "120050", currency: "EUR" },
  }));
  await server.fetchQuery({ queryKey, queryFn });

  expect(otherRequest.getQueryData(queryKey)).toBeUndefined();

  const browser = createQueryClient();
  hydrate(browser, dehydrate(server));
  const observer = new QueryObserver(browser, { queryKey, queryFn });
  const unsubscribe = observer.subscribe(() => {});
  const initialRead = queryFn.mock.results[0];

  assert.isDefined(initialRead);
  expect(observer.getCurrentResult().data).toEqual(await initialRead.value);
  expect(queryFn).toHaveBeenCalledTimes(1);

  unsubscribe();
  server.clear();
  otherRequest.clear();
  browser.clear();
});

it("keeps the last data after an unavailable read but replaces it after access denial", async () => {
  const client = createQueryClient();
  const queryKey = [...privateKey, "team"];
  await client.fetchQuery({
    queryKey,
    queryFn: async () => available({ status: "ok", value: "directory" }),
  });
  const unavailable = vi.fn(async () => available({ status: "unavailable" }));

  await expect(client.fetchQuery({ queryKey, queryFn: unavailable })).rejects.toThrow(
    "Service unavailable",
  );
  expect(unavailable).toHaveBeenCalledTimes(1);
  expect(client.getQueryData(queryKey)).toEqual({ status: "ok", value: "directory" });

  await client.fetchQuery({ queryKey, queryFn: async () => available({ status: "forbidden" }) });

  expect(client.getQueryData(queryKey)).toEqual({ status: "forbidden" });

  client.clear();
});

it("cancels a stale read before publishing a confirmed write", async () => {
  const client = createQueryClient();
  const queryKey = [...privateKey, "recommendation"];
  let resolve!: (value: string) => void;
  let signal!: AbortSignal;
  const pending = client
    .fetchQuery({
      queryKey,
      queryFn: (context) => {
        signal = context.signal;
        return new Promise<string>((done) => {
          resolve = done;
        });
      },
    })
    .catch(() => undefined);
  await client.cancelQueries({ queryKey });
  client.setQueryData(queryKey, "confirmed");
  resolve("old read");
  await pending;

  expect(signal.aborted).toBe(true);
  expect(client.getQueryData(queryKey)).toBe("confirmed");

  client.clear();
});

it("fails a disconnected write without queueing or replaying it", async () => {
  const client = createQueryClient();
  const write = vi.fn(async () => {
    throw new Error("Disconnected");
  });
  const mutation = new MutationObserver(client, { mutationFn: write });
  onlineManager.setOnline(false);

  try {
    await expect(mutation.mutate()).rejects.toThrow("Disconnected");
    expect(mutation.getCurrentResult().isPaused).toBe(false);

    onlineManager.setOnline(true);
    await Promise.resolve();

    expect(write).toHaveBeenCalledTimes(1);
  } finally {
    onlineManager.setOnline(true);
    client.clear();
  }
});

it("fails an offline read and refreshes the active query after reconnection", async () => {
  const client = createQueryClient();
  client.mount();
  const queryKey = [...privateKey, "offline-read"];
  const queryFn = vi.fn(async () => {
    if (!onlineManager.isOnline()) {
      throw new Error("Disconnected");
    }
    return { status: "ok", value: "Current work" };
  });
  onlineManager.setOnline(false);
  const observer = new QueryObserver(client, { queryKey, queryFn });
  const unsubscribe = observer.subscribe(() => {});

  try {
    await expect(client.fetchQuery({ queryKey, queryFn })).rejects.toThrow("Disconnected");
    expect(observer.getCurrentResult()).toMatchObject({ status: "error", fetchStatus: "idle" });
    expect(queryFn).toHaveBeenCalledTimes(1);

    onlineManager.setOnline(true);
    await vi.waitFor(() =>
      expect(observer.getCurrentResult()).toMatchObject({
        status: "success",
        data: { status: "ok", value: "Current work" },
      }),
    );
  } finally {
    unsubscribe();
    client.unmount();
    client.clear();
    onlineManager.setOnline(true);
  }
});
