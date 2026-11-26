# Design and preview invitation emails

Run the React Email preview from the repository root after `vp install`:

```sh
vp run emails
```

Open [localhost:3003](http://localhost:3003). Select an invitation in the sidebar.
Use the monitor and phone controls for desktop and mobile sizes. Switch to the
code view (`</>`) and choose **Plain Text** to inspect the text alternative.
Saving a template updates the preview. This workflow uses fictional fixtures and needs no database, Clerk,
Mailpit, or sending credentials. Preview links are examples and cannot be accepted.

## Change an invitation

Edit the [invitation catalog](../../interfaces/emails/src/features/organizations/messages.en.ts)
for the subject and wording, and the
[invitation template](../../interfaces/emails/src/features/organizations/invitation.tsx)
for responsibilities and expiry presentation. Edit the
[email layout](../../interfaces/emails/src/app/layout.tsx) for shared typography, spacing,
and colors. These components use React Email with inline styles; browser UI
components and styles from `foundation/ui` are not email-compatible.

[Fixtures](../../interfaces/emails/src/features/organizations/invitation.fixtures.ts) cover the
initial owner, administrator without grant access, program manager without
administration, combined responsibilities, and long content. Small default exports
in `previews/` make each fixture selectable in React Email. Add a fixture and a
preview file when a new meaningful content variant needs review. Keep all fixture
addresses and invitation links fictional.

Administration and grant access are independent. Keep both visible, along with
the invited email address, explicit acceptance action, expiry in UTC, and fallback
link. Preview and production use the same template; plain text is generated from
the rendered HTML. The renderer receives explicit language and regional formatting
settings; expiry remains in UTC. The application currently supplies the shared
English defaults. Previews use those same defaults through their message provider.

Email code imports translation setup from `@merit/i18n/server`. This entry shares
the typed catalog registry and locale settings with the browser API, without
importing browser controls. The catalog extends the `Messages` registry in
`@merit/i18n/core`, the shared entry for instance creation and locale types.
The renderer calls `createMessages` once per email
and passes that instance and the explicit locale to `ServerMessagesProvider`.
Subject and body use the same instance; concurrent renders keep their catalogs
and formatting settings independent. Use `useLocaleSettings` from this entry
inside templates. The preview provider creates an instance using the same catalog
and defaults.

## Ownership and delivery

- `capabilities/organizations/business` owns recipients, responsibilities, tokens, expiry,
  invitation lifecycle, and delivery outcome. Its browser-safe `InvitationMessage`
  contract contains the facts to present.
- `interfaces/emails` owns subject, HTML, plain text, fixtures, and preview tooling.
  Its `@merit/emails/server` renderer accepts those facts and locale settings without fetching data.
- `interfaces/product` owns destination paths through the pure
  `@merit/product/links` entry. Its `productLinks.invitation(token)` encodes the token
  without importing a router, screen, or request state.
- `app/` combines that path with its configured public origin, supplies the absolute
  invitation URL to organizations, and composes the renderer with the selected sender. Mailpit and Resend have separate adapters and configuration;
  production sends through Resend with the invitation's idempotency key.

Reviewer invitations and submission notices are sent by the [worker](../../app/src/worker/main.ts),
not inside the request. After the message commits, the web server starts the
`reviewer-message:<messageId>` workflow, which Reviews owns, and the request waits about five seconds
for the first outcome. Each attempt rereads the assignment and the message and sends with a
10-second timeout and the message ID as the provider's idempotency key. A failed attempt is retried with
backoff for about fifteen minutes while the message stays pending, then recorded as failed. If a
manager retries a failed submission notice (which resets it to pending) while that run is still
open, the run delivers it again before it closes. Reconciliation restarts any pending message whose
run has closed, listing only messages whose acting member is still active with a membership in an
active workspace; each run rereads the message, so one already sent is never sent twice. Merit AI
starts the same workflow for an approved invitation and then only reads the message's status; it
never starts one for a message already recorded as sent or failed. A workflow sends only a message
that is still pending, so the only way to deliver a failed message again is to reset it to pending
first, as the manager's notice retry and the assistant's own retry action do.
The worker reads the same sender settings as the web server (`EMAIL_FROM`, `RESEND_API_KEY`, and
Mailpit locally) and `APP_ORIGIN` for links. Only identifiers reach Temporal; the rendered email is built from
Postgres inside the activity.

Organization invitation emails follow the same path. After the invitation commits, the web server
starts the `organization-invitation:<invitationId>` workflow, which Organizations owns, and the
request waits about five seconds for the first outcome. Its activity rereads the invitation before
every attempt and stops once it is revoked, accepted, or expired. The raw invitation token is the one
sensitive field in the workflow input, which the payload codec encrypts.
Postgres commits the token hash and a separately encrypted token together. Worker startup and the
periodic reconciliation schedule use the latter to recover a lost handoff. Temporal's confirmation
clears the encrypted token from the invitation. Resend creates a new invitation with its own workflow. The workflow
reads and records under the invitation's token-hash scope, as invitation delivery always has, so
the inviter's own access can change while it runs; a late failure never overwrites a recorded send.
Temporal keeps workflow history, including that encrypted token, for the namespace's retention period.

Sending failures leave the saved invitation available for recovery. Application diagnostics
distinguish rendering, sender configuration, network requests, and provider rejection.
They include only fixed messages, provider names, and HTTP status codes, never
recipients, invitation links, message content, credentials, or raw errors. If the outcome
cannot be recorded even after the recording activity's retries, the workflow fails in Temporal;
the invitation then remains delivery-unconfirmed. Sender configuration is checked when sending, so missing email
credentials do not prevent unrelated requests from running.

## Verify a change

```sh
vp run @merit/emails#test
vp run @merit/app#build
vp check
```

Renderer tests cover fixtures, independent responsibilities, escaping, links,
catalog use, regional formatting, and plain-text content. The application build checks the Node.js server integration.
For actual delivery and acceptance, follow the
[local invitation workflow](organizations.md#try-the-complete-flow-locally) and
inspect HTML and text in [Mailpit](http://127.0.0.1:8025).
With PostgreSQL and Mailpit running, `vp run @merit/app#test:workspace` exercises
the renderer in Node.js through invitation delivery and acceptance.

The preview is a browser rendering, not an inbox compatibility test. Before
publishing substantial design changes, inspect a delivered message in the email
clients you support, including their narrow-screen and dark-mode views.
