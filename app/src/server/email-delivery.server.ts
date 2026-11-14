import { SpanKind, SpanStatusCode, withSpan } from "@merit/telemetry";

type OutgoingEmail = { id: string; to: string; subject: string; html: string; text: string };

export type EmailSender = (message: OutgoingEmail) => Promise<void>;

const sendRequest = (provider: "Mailpit" | "Resend", url: string | URL, options: RequestInit) =>
  withSpan(
    "email.send",
    async (span) => {
      let response: Response;
      try {
        response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
      } catch {
        span.setStatus({ code: SpanStatusCode.ERROR, message: "EmailDeliveryNetworkError" });
        console.error("Email delivery request failed.", { provider });
        throw new Error("Email delivery request failed.");
      }

      span.setAttribute("http.response.status_code", response.status);
      if (!response.ok) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${response.status}` });
        console.error("Email was not accepted by the sender.", {
          provider,
          status: response.status,
        });
        throw new Error("Email was not accepted by the sender.");
      }
    },
    {
      kind: SpanKind.CLIENT,
      attributes: { "email.provider": provider },
    },
  );

const createMailpitSender =
  (config: { url: string; from: string }): EmailSender =>
  async (message) => {
    const url = URL.parse(config.url);
    if (
      !url ||
      url.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    ) {
      console.error("Mailpit must use a local HTTP endpoint.");
      throw new Error("Mailpit must use a local HTTP endpoint.");
    }
    if (!config.from) {
      console.error("Mailpit email configuration is missing.");
      throw new Error("Email delivery is not configured.");
    }

    await sendRequest("Mailpit", new URL("/api/v1/send", url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        From: { Email: config.from },
        To: [{ Email: message.to }],
        Subject: message.subject,
        Text: message.text,
        HTML: message.html,
      }),
    });
  };

const createResendSender =
  (config: { key: string; from: string }): EmailSender =>
  async (message) => {
    if (!config.key || !config.from) {
      console.error("Resend email configuration is missing.");
      throw new Error("Email delivery is not configured.");
    }

    await sendRequest("Resend", "https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.key}`,
        "Idempotency-Key": message.id,
      },
      body: JSON.stringify({
        from: config.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });
  };

export const createEmailSender = ({
  from,
  resendKey,
  mailpitUrl,
}: {
  from: string;
  resendKey: string;
  mailpitUrl?: string;
}): EmailSender =>
  mailpitUrl
    ? createMailpitSender({ from, url: mailpitUrl })
    : createResendSender({ from, key: resendKey });
