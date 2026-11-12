import { QueryObserver } from "@tanstack/react-query";
import { assert, expect, it, vi } from "vite-plus/test";

import { encodeApplicationDetail } from "@merit/grantmaking/api";
import { roundView } from "@merit/grantmaking/api";
import { makeApplication, makeRound } from "@merit/grantmaking/testing/fixtures";
import { createQueryClient } from "@merit/query";

import { contactsOptions } from "../../../contacts/data/queries";
import { teamOptions } from "../../../team/data/queries";
import { workspaceOptions } from "../../../workspace/data/queries";
import { roundsOptions, roundOptions, applicationOptions } from "../queries";
import { workspaceIntakeData } from "./workspace-data";

vi.mock("../server/funding-round.functions", () => ({}));
vi.mock("../server/intake/intake.functions", () => ({}));
vi.mock("../../../contacts/data/server/contacts.functions", () => ({}));
vi.mock("../../../team/data/server/team.functions", () => ({}));
vi.mock("../../../workspace/data/server/workspace.functions", () => ({}));

it("refreshes intake's related grant work without invalidating access, team, or another workspace", async () => {
  const client = createQueryClient();
  const affected = [
    roundsOptions("alder").queryKey,
    roundOptions("alder", "k7m2p9x4n6rt").queryKey,
    applicationOptions("alder", "b8q3w5j7c2df").queryKey,
    contactsOptions("alder").queryKey,
  ];
  const unaffected = [
    workspaceOptions("alder").queryKey,
    teamOptions("alder").queryKey,
    roundsOptions("birch").queryKey,
    contactsOptions("birch").queryKey,
  ];
  for (const key of [...affected, ...unaffected]) {
    client.setQueryData(key, { status: "not_found" });
  }

  await workspaceIntakeData(client, "alder", "b8q3w5j7c2df", {
    revision: 0,
    workingRevision: null,
    history: [],
  }).refresh();

  for (const key of affected) {
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  }

  for (const key of unaffected) {
    expect(client.getQueryState(key)?.isInvalidated).toBe(false);
  }

  client.clear();
});

it("keeps the cached application after a failed refresh and replaces it when a retry succeeds", async () => {
  const client = createQueryClient();
  const round = roundView(
    makeRound({
      id: "k7m2p9x4n6rt",
      applications: [makeApplication({ id: "b8q3w5j7c2df", title: "Original project" })],
    }),
  );
  const [application] = round.applications;
  assert.isDefined(application);
  const page = {
    status: "ok" as const,
    ...encodeApplicationDetail({ round, application }),
    recommendationVersion: 0,
    intake: { revision: 0, workingRevision: null, history: [] },
    workspaceSlug: "alder",
  };
  const latest = { ...page, application: { ...page.application, title: "Updated project" } };
  const offline = new Error("Offline");
  let online = false;
  const query = new QueryObserver(client, {
    queryKey: applicationOptions("alder", "b8q3w5j7c2df").queryKey,
    queryFn: async () => {
      if (!online) {
        throw offline;
      }
      return latest;
    },
    initialData: page,
    staleTime: Infinity,
    retry: false,
  });
  const unsubscribe = query.subscribe(() => {});
  const data = workspaceIntakeData(client, "alder", "b8q3w5j7c2df", page.intake);

  try {
    await expect(data.refreshCurrent()).rejects.toBe(offline);
    expect(query.getCurrentResult()).toMatchObject({ status: "error", data: page, error: offline });

    online = true;
    await expect(data.refreshCurrent()).resolves.toBeUndefined();
    expect(query.getCurrentResult()).toMatchObject({
      status: "success",
      data: latest,
      error: null,
    });
  } finally {
    unsubscribe();
    client.clear();
  }
});
