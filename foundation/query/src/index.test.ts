import {
  dehydrate,
  focusManager,
  hydrate,
  QueryObserver,
  MutationObserver,
  onlineManager,
} from "@tanstack/react-query";
import { expect, it, vi } from "vite-plus/test";

import { available, createQueryClient, privateKey } from "./index";

it("creates a separate cache for each server request", async () => {
  const server = createQueryClient();
  const otherRequest = createQueryClient();
  const queryKey = [...privateKey, "workspace", "alder"];
  await server.fetchQuery({ queryKey, queryFn: async () => ({ name: "Alder" }) });

  expect(otherRequest.getQueryData(queryKey)).toBeUndefined();

  server.clear();
  otherRequest.clear();
});

it("hydrates loader data without repeating the read when an observer mounts", async () => {
  const server = createQueryClient();
  const queryKey = [...privateKey, "workspace", "alder"];
  const workspace = { name: "Alder", amount: { minorUnits: "120050", currency: "EUR" } };
  const queryFn = vi.fn(async () => workspace);
  await server.fetchQuery({ queryKey, queryFn });

  const browser = createQueryClient();
  hydrate(browser, dehydrate(server));
  const observer = new QueryObserver(browser, { queryKey, queryFn });
  const unsubscribe = observer.subscribe(() => {});

  expect(observer.getCurrentResult().data).toEqual(workspace);
  expect(queryFn).toHaveBeenCalledTimes(1);

  unsubscribe();
  server.clear();
  browser.clear();
});

it("reads again when a loader returns to a cached resource", async () => {
  const client = createQueryClient();
  const queryKey = [...privateKey, "round"];
  await client.fetchQuery({ queryKey, queryFn: async () => ({ status: "ok", value: "open" }) });

  const current = await client.fetchQuery({
    queryKey,
    queryFn: async () => ({ status: "forbidden" }),
  });

  expect(current).toEqual({ status: "forbidden" });

  client.clear();
});

it("does not refresh an active read when the window regains focus", async () => {
  const client = createQueryClient();
  client.mount();
  const queryKey = [...privateKey, "editor"];
  const queryFn = vi.fn(async () => ({ status: "ok", value: "Draft" }));
  const observer = new QueryObserver(client, { queryKey, queryFn });
  const unsubscribe = observer.subscribe(() => {});

  try {
    await vi.waitFor(() => expect(observer.getCurrentResult().status).toBe("success"));
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await Promise.resolve();

    expect(observer.getCurrentResult().fetchStatus).toBe("idle");
    expect(queryFn).toHaveBeenCalledTimes(1);
  } finally {
    unsubscribe();
    client.unmount();
    client.clear();
    focusManager.setFocused(undefined);
  }
});

it("keeps the last data when a refresh is unavailable", async () => {
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

  client.clear();
});

it("replaces the last data when a refresh denies access", async () => {
  const client = createQueryClient();
  const queryKey = [...privateKey, "team"];
  await client.fetchQuery({
    queryKey,
    queryFn: async () => available({ status: "ok", value: "directory" }),
  });

  await client.fetchQuery({ queryKey, queryFn: async () => available({ status: "forbidden" }) });

  expect(client.getQueryData(queryKey)).toEqual({ status: "forbidden" });

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
