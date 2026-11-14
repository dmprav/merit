# `@merit/analytics`

Vendor-neutral browser analytics interface and privacy-safe PostHog adapter for Merit.

## Design choices

- **Isolated vendor SDK:** `posthog-js` is only imported from `@merit/analytics/posthog`,
  enforced by [architecture import rules](../../tooling/verification/architecture/imports.ts).
  Application interfaces and features use `AnalyticsProvider` and `useAnalytics` from
  `@merit/analytics`.
- **No-op by default:** When `VITE_POSTHOG_KEY` is empty or running on the server,
  `createPostHogAnalytics` returns `noopAnalytics` without loading `posthog-js`.
- **Privacy and tenant confidentiality:** The PostHog configuration uses
  `persistence: "memory"` (cookieless), `person_profiles: "never"`, and disables
  autocapture, session recording, surveys, and external script loading.
- **Route sanitization:** `sanitizeAnalyticsPath` and `sanitizePostHogCapture` strip
  query strings, hashes, invitation tokens, assignment IDs, workspace slugs, and
  record identifiers before events leave the browser.
