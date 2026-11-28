import { defaultPostHogHost } from "@merit/analytics/server";

const baseline = (ancestors: "'none'" | "'self'") =>
  `frame-ancestors ${ancestors}; object-src 'none'; base-uri 'none'`;

const httpsSource = (value: string) => {
  const url = URL.parse(value);
  return url?.protocol === "https:" ? url.origin : undefined;
};

export const createDocumentPolicy = (
  issuer: string,
  analytics: { apiKey?: string; host?: string },
) => {
  const clerk = httpsSource(issuer);
  const postHog = analytics.apiKey?.trim()
    ? httpsSource(analytics.host?.trim() || defaultPostHogHost)
    : undefined;
  const challenge = "https://challenges.cloudflare.com";
  const protect = "https://*.protect.clerk.com";
  const scriptSources = clerk ? ` ${clerk} ${challenge} ${protect}` : "";
  const connectSources = ["'self'", clerk, clerk && `${protect}:*`, postHog]
    .filter(Boolean)
    .join(" ");
  return (nonce: string) =>
    [
      baseline("'none'"),
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'${scriptSources}`,
      `connect-src ${connectSources}`,
      clerk ? `frame-src 'self' ${challenge} ${protect}` : "frame-src 'self'",
      clerk ? "img-src 'self' data: https://img.clerk.com" : "img-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "worker-src 'self' blob:",
      "report-to merit-csp",
    ].join("; ");
};

export const applySecurityHeaders = (
  response: Response,
  nonce: string | undefined,
  documentPolicy: (nonce: string) => string,
) => {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  if (!headers.has("Referrer-Policy")) {
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  }
  if (!headers.has("Permissions-Policy")) {
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  }
  const contentType = headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase();
  const inlinePdf =
    contentType === "application/pdf" &&
    headers.get("Content-Disposition")?.split(";")[0]?.trim().toLowerCase() === "inline";
  headers.append("Content-Security-Policy", baseline(inlinePdf ? "'self'" : "'none'"));
  if (nonce) {
    headers.set("Strict-Transport-Security", "max-age=31536000");
    if (contentType === "text/html") {
      headers.set("Cache-Control", "private, no-store");
      headers.append("Content-Security-Policy-Report-Only", documentPolicy(nonce));
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
