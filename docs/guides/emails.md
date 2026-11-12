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

Sending failures leave the saved invitation available for recovery. Application diagnostics
distinguish rendering, sender configuration, network requests, and provider rejection.
They include only fixed messages, provider names, and HTTP status codes, never
recipients, invitation links, message content, credentials, or raw errors. A separate
diagnostic reports failure to record the delivery outcome; the invitation then remains
delivery-unconfirmed. Sender configuration is checked when sending, so missing email
credentials do not prevent unrelated requests from running.

## Verify a change

```sh
vp run @merit/emails#test
vp run @merit/app#build
vp check
```

Renderer tests cover fixtures, independent responsibilities, escaping, links,
catalog use, regional formatting, and plain-text content. The application build checks the Cloudflare Worker integration.
For actual delivery and acceptance, follow the
[local invitation workflow](organizations.md#try-the-complete-flow-locally) and
inspect HTML and text in [Mailpit](http://127.0.0.1:8025).
With PostgreSQL and Mailpit running, `vp run @merit/app#test:workspace` exercises
the renderer inside the Worker through invitation delivery and acceptance.

The preview is a browser rendering, not an inbox compatibility test. Before
publishing substantial design changes, inspect a delivered message in the email
clients you support, including their narrow-screen and dark-mode views.
