import { assert, afterEach, expect, it, vi } from "vite-plus/test";

import { createEmailSender } from "../src/server/email-delivery.server";

const message = {
  id: "invitation-id",
  to: "recipient@example.test",
  subject: "A rendered subject",
  text: "Rendered plain text",
  html: "<p>Rendered HTML</p>",
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("sends supplied HTML and plain text to Mailpit over HTTP", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  await createEmailSender({
    from: "invite@merit.local",
    resendKey: "test-only",
    mailpitUrl: "http://127.0.0.1:8025",
  })(message);
  const call = fetch.mock.calls[0];

  assert.isDefined(call);

  const [url, options] = call;

  assert.isDefined(options);

  assert(typeof options.body === "string");
  assert(url instanceof URL);

  expect(url.href).toBe("http://127.0.0.1:8025/api/v1/send");

  const body: unknown = JSON.parse(options.body);

  expect(body).toMatchObject({
    To: [{ Email: message.to }],
    Subject: message.subject,
    Text: message.text,
    HTML: message.html,
  });
});

it.each([undefined, ""])(
  "sends through Resend with authentication and retry identity when the Mailpit URL is %s",
  async (mailpitUrl) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ id: "accepted-message" }));
    vi.stubGlobal("fetch", fetch);
    await createEmailSender({ from: "invite@merit.example", resendKey: "test-only", mailpitUrl })(
      message,
    );

    expect(fetch).toHaveBeenCalledOnce();

    const call = fetch.mock.calls[0];

    assert.isDefined(call);

    const [url, options] = call;

    assert.isDefined(options);

    assert(typeof options.body === "string");

    expect(url).toBe("https://api.resend.com/emails");
    expect(options.method).toBe("POST");
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer test-only");
    expect(new Headers(options.headers).get("Content-Type")).toBe("application/json");
    expect(new Headers(options.headers).get("Idempotency-Key")).toBe(message.id);
    expect(JSON.parse(options.body)).toEqual({
      from: "invite@merit.example",
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  },
);

const senders = [
  {
    name: "Mailpit",
    send: createEmailSender({
      from: "invite@merit.local",
      resendKey: "",
      mailpitUrl: "http://127.0.0.1:8025",
    }),
  },
  {
    name: "Resend",
    send: createEmailSender({ from: "invite@merit.example", resendKey: "test-only" }),
  },
];

it.each(senders)(
  "reports $name rejection without exposing provider details",
  async ({ name, send }) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("private provider detail", { status: 503 })),
    );

    await expect(send(message)).rejects.toThrow("Email was not accepted by the sender.");
    expect(log).toHaveBeenCalledOnce();
    const [prefix, rawPayload] = log.mock.calls[0] as [unknown, unknown];
    expect(prefix).toBe("[merit:error]");
    expect(String(rawPayload)).not.toContain("private provider detail");
    expect(JSON.parse(String(rawPayload))).toEqual({
      surface: "email",
      operation: "email.sendRequest",
      errorType: "Error",
      tags: { provider: name, status: 503 },
    });
  },
);

it.each(senders)(
  "reports $name network failure without exposing the raw error",
  async ({ name, send }) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private URL and credentials")));

    await expect(send(message)).rejects.toThrow("Email delivery request failed.");
    expect(log).toHaveBeenCalledOnce();
    const [prefix, rawPayload] = log.mock.calls[0] as [unknown, unknown];
    expect(prefix).toBe("[merit:error]");
    expect(String(rawPayload)).not.toContain("private URL and credentials");
    expect(JSON.parse(String(rawPayload))).toEqual({
      surface: "email",
      operation: "email.sendRequest",
      errorType: "Error",
      tags: { provider: name },
    });
  },
);

it.each([
  "https://example.com",
  "http://example.com",
  "https://localhost",
  "http://localhost.example.com",
  "invalid-url",
])("refuses the Mailpit target %s before making a request", async (url) => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);

  await expect(
    createEmailSender({ from: "invite@merit.local", resendKey: "test-only", mailpitUrl: url })(
      message,
    ),
  ).rejects.toThrow("Mailpit must use a local HTTP endpoint.");
  expect(fetch).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledOnce();
  const [prefix, rawPayload] = log.mock.calls[0] as [unknown, unknown];
  expect(prefix).toBe("[merit:error]");
  expect(JSON.parse(String(rawPayload))).toEqual({
    surface: "email",
    operation: "email.mailpitConfig",
    errorType: "Error",
  });
});

it.each([
  {
    name: "Mailpit",
    operation: "email.mailpitConfig",
    send: createEmailSender({ from: "", resendKey: "", mailpitUrl: "http://localhost:8025" }),
  },
  {
    name: "Resend",
    operation: "email.resendConfig",
    send: createEmailSender({ from: "invite@merit.example", resendKey: "" }),
  },
  {
    name: "Resend",
    operation: "email.resendConfig",
    send: createEmailSender({ from: "", resendKey: "test-only" }),
  },
])("checks missing $name configuration only when sending", async ({ operation, send }) => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);

  await expect(send(message)).rejects.toThrow("Email delivery is not configured.");
  expect(fetch).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledOnce();
  const [prefix, rawPayload] = log.mock.calls[0] as [unknown, unknown];
  expect(prefix).toBe("[merit:error]");
  expect(JSON.parse(String(rawPayload))).toEqual({
    surface: "email",
    operation,
    errorType: "Error",
  });
});
