import { describe, expect, test, vi } from "vite-plus/test";

import { findInvitationLink } from "./mailpit.ts";

describe("findInvitationLink", () => {
  test("skips newer emails for another workspace port and returns the link matching the requested port", async () => {
    const otherToken = "a".repeat(64);
    const matchingToken = "b".repeat(64);
    const expectedLink = `http://127.0.0.1:3112/invitations/${matchingToken}`;

    const get = vi.fn(async (url: string) => {
      if (url === "http://127.0.0.1:8025/api/v1/messages") {
        return {
          ok: () => true,
          status: () => 200,
          json: async () => ({
            messages: [
              {
                ID: "msg-other-port",
                To: [{ Address: "recipient@example.test" }],
                Subject: "Invitation to Alder Foundation",
              },
              {
                ID: "msg-unrelated",
                To: [{ Address: "someone-else@example.test" }],
                Subject: "Invitation to Alder Foundation",
              },
              {
                ID: "msg-matching-port",
                To: [{ Address: "recipient@example.test" }],
                Subject: "Invitation to Alder Foundation",
              },
            ],
          }),
        };
      }
      if (url === "http://127.0.0.1:8025/api/v1/message/msg-other-port") {
        return {
          ok: () => true,
          status: () => 200,
          json: async () => ({
            Text: `Accept here: http://127.0.0.1:3102/invitations/${otherToken}`,
          }),
        };
      }
      if (url === "http://127.0.0.1:8025/api/v1/message/msg-matching-port") {
        return {
          ok: () => true,
          status: () => 200,
          json: async () => ({
            Text: `Accept here: ${expectedLink}`,
          }),
        };
      }
      throw new Error(`Unexpected request URL: ${url}`);
    });

    const link = await findInvitationLink(
      { get } as unknown as Parameters<typeof findInvitationLink>[0],
      "recipient@example.test",
      "Alder Foundation",
      3112,
    );

    expect(link).toBe(expectedLink);
    expect(get).toHaveBeenCalledTimes(3);
  });

  test("returns undefined when matching messages only contain links for other workspace ports", async () => {
    const otherToken = "c".repeat(64);
    const get = vi.fn(async (url: string) => {
      if (url === "http://127.0.0.1:8025/api/v1/messages") {
        return {
          ok: () => true,
          status: () => 200,
          json: async () => ({
            messages: [
              {
                ID: "msg-other-port",
                To: [{ Address: "recipient@example.test" }],
                Subject: "Invitation to Alder Foundation",
              },
            ],
          }),
        };
      }
      return {
        ok: () => true,
        status: () => 200,
        json: async () => ({
          Text: `Accept here: http://127.0.0.1:3102/invitations/${otherToken}`,
        }),
      };
    });

    const link = await findInvitationLink(
      { get } as unknown as Parameters<typeof findInvitationLink>[0],
      "recipient@example.test",
      "Alder Foundation",
      3112,
    );

    expect(link).toBeUndefined();
  });
});
