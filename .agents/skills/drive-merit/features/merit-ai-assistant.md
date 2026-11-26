# Merit AI assistant

Reference guide: [Connect a client to the Merit AI backend](../../../../docs/guides/merit-ai.md)
and [Merit AI assistant decision](../../../../docs/decisions/0015-merit-ai-assistant.md).

## Sub-features

- Demo workspace companion panel (`Merit AI`) alongside grantmaking screens, persisted across
  page navigation and resizable on wide screens
- Recorded suggested questions for the guided example application (`Workshop Saturdays`),
  page-context attachment chip, streaming activity steps, and approval proposal cards
- Storybook stories for conversation states under `Features/Merit AI/Conversation`
- Live workspace backend HTTP/SSE endpoint (`POST /api/assistant/$workspaceSlug`) supporting
  workspace opt-in consent, private conversations, citations (`evidence`), and action approvals

## How to reach it (user POV)

- **Demo workspace companion panel:** visit `/demo` and click **Browse the workspace**, or
  visit `/demo/workshop-saturdays` and click **Explore the example**, then click
  **Ask Merit AI** in the shell or press `Cmd/Ctrl+J`.
- **Storybook stories:** run `vp run ui:verify --story features-merit-ai-conversation` to check
  the companion panel states in isolation across desktop and mobile viewports.
- **Live workspace backend API:** send authenticated `POST /api/assistant/<workspaceSlug>` JSON
  requests from the application origin (requires `OPENAI_API_KEY`, `MERIT_AI_MODEL`, and
  workspace administrator/owner consent via `set_consent`).

## Driving handles / selectors

- **Companion panel shell & controls (demo workspace & Storybook):**
  - Open / close / resize: `button[name="Ask Merit AI"]`, `button[name="Close Merit AI"]`,
    `button[name="Resize Merit AI"]`
  - Thread & composer:
    - Conversation region: `Conversation with Merit AI`
    - Composer input: `textbox[name="Message to Merit AI"]` (placeholder `Ask about this page`)
    - Send / stop / retry: `button[name="Send message"]`, `button[name="Stop"]`,
      `button[name="Try again"]`
    - Context chip removal: `button[name="Remove <title> from the question"]`
  - Recorded demo suggestions (shown when `Workshop Saturdays` context is attached):
    - `What changed in version 2, and do the reviews cover it?`
    - `Draft a question to the applicant about the venue`
  - Approval proposal card:
    - Decision actions: `button[name="Approve"]`, `button[name="Decline"]`
    - Status text: `Needs approval`, `Approved`, `Declined. Nothing was changed.`,
      `Demo preview: nothing was sent.`
- **Backend API (`POST /api/assistant/$workspaceSlug`):**
  - JSON body `action`: `settings`, `set_consent` (`enabled`), `create`, `list`, `start`
    (`id`, `message`, optional `page`), `open`, `watch` (`text/event-stream`), `evidence`
    (`id`, `key`), `approve` / `decline` (`id`, `previewId`), `retry`
    (`id`, `previewId`, `actionId`), `stop`, `delete`.

## Gotchas

- The interactive Merit AI companion panel uses recorded example scripts in demo workspaces
  (nothing is sent externally; free-form questions return the demo fallback message).
- The shell remounts companion panel content when viewport width crosses `1400px` (switching
  between side-by-side companion layout at desktop `1440x1000` and overlay at mobile
  `390x844`), while preserving conversation state above the panel.
- Live backend `POST /api/assistant/$workspaceSlug` requests require an authenticated web
  session, a matching `Origin` header, and `Content-Type: application/json`.
