export const accessRequest = {
  resume: "Resume invitation request",
  discard: "Discard draft",
  submitting: "Submitting request…",
  title: "Request an invitation",
  prototype:
    "Merit is a portfolio project, not a live grant-management service. Request an invitation to explore a workspace with sample data.",
  email: "Email address",
  privacyFootnote: "See the <privacy>privacy notice</privacy> for how requests are handled.",
  privacyNewTab: "Privacy notice (opens in a new tab)",
  submit: "Submit request",
  close: "Close",
  saved: "Request saved. The project owner may email you about access.",
  error: "Your request could not be saved. Please try again.",
  limited: "Too many requests from this connection. Please try again in an hour.",
} as const;

declare module "@merit/i18n/core" {
  interface Messages {
    accessRequest: typeof accessRequest;
  }
}
