# Provision organizations and test invitations

Use the operator app at `/admin/organizations` to create an organization and invite
its first owner. The [workflow](../workflows/provision-organizations.md)
explains access, acceptance, and recovery behavior.

For design work without sending messages, use the
[React Email preview workflow](emails.md). It shows the same invitation template
used by the application with fictional examples of each responsibility combination.

## Create a workspace and invite its owner

Review public interest in **Administration → Access requests** at
`/admin/access-requests`. The homepage form saves real requests to explore this
portfolio prototype. Email addresses are unverified; review them before choosing
whether to send an invitation. **Mark reviewed** records your review without
sending email or granting access. To offer access, use the existing organization
or team invitation workflow.

In **Administration**, choose **Create organization**, enter the organization’s
name and permanent workspace address, and supply its first owner’s email.
Creating the workspace does not give the operator access to its grant data.
The first owner receives authority to manage members and appoint administrators,
plus program-manager access to grant work, when they accept the invitation.

The workspace and invitation remain available if sending fails. Open the
organization to resend the invitation rather than creating another workspace.
Until the owner joins, you can change the recipient or revoke the invitation;
review the consequences shown before confirming. After acceptance, manage
membership through **Team**.

## Try the complete flow locally

Start the database and Mailpit, apply migrations, and seed the local grant example:

```sh
docker compose up -d --wait
vp run @merit/db#db:migrate
vp run @merit/app#db:seed
vp run dev:workspace
```

1. Open `http://127.0.0.1:3000/app/sign-in`. Open TanStack DevTools as described in
   [local workspace development](development.md#work-locally-without-clerk),
   choose the **Merit** tab, select **Merit operator**, then
   follow **Organization administration**.
2. Create an organization. Use `recipient@example.test` as its owner email.
3. Open [Mailpit](http://127.0.0.1:8025), inspect the invitation, and follow its link.
4. Select **Invitation recipient** in **DevTools → Merit**. This fictional
   account has `recipient@example.test` as its verified email. Accept the invitation.
5. Confirm the empty workspace opens. Provision and accept a second organization
   to exercise the workspace chooser.

These identity controls are available only in loopback-only local workspace mode;
production builds exclude the fixture adapter. No external emails are sent by
Mailpit. Its UI and HTTP API are bound to `127.0.0.1:8025`, with forwarding disabled.
Compose uses a pinned Mailpit image. Its disposable inbox does not persist when
the container is recreated. The application calls its HTTP send API, not SMTP.

Revoke and resend before acceptance to check obsolete links. Wait one minute before
sending to the same recipient again; the [sending limits](../workflows/manage-team.md#invite-and-join)
also apply locally and after failed delivery. To test sender failure,
stop Mailpit with `docker compose stop mailpit`, create an organization, and check
that its details show the sending failure. Start Mailpit again with
`docker compose up -d mailpit`, then send another invitation from those details.
Creation and sending have independent outcomes, so recovery does not create a
second organization.

## Try team management

After accepting the initial invitation, open **Team**. The recipient is the owner
and has program-manager access. Invite `dana@example.test`, then switch DevTools
to Dana Reed and accept the link from Mailpit. Switch back to the owner to edit
Dana’s access or remove membership. The accepted invitation is separate from the
operator’s original provisioning invitation.

To check administration without grant access, invite Dana as an administrator
with **No grant-work access**. Acceptance should open Team and omit grant navigation.
An administrator can explicitly grant themselves program-manager access through
**Edit access**. Removing membership preserves work and displays the current
handover limitation; see [Manage a team](../workflows/manage-team.md).

## Check real Clerk authentication locally

Follow [real sign-in setup](development.md#configure-real-sign-in). Run ordinary
`vp run dev`; fixture identity controls are absent in this mode. Configure a real
Clerk development operator ID in `app/.dev.vars` as described below, keeping
Mailpit as the invitation sender. Invite an email verified on a Clerk development
recipient account and follow the captured invitation through real sign-in.

Merit invitations go to Mailpit. Clerk authentication and email-verification
messages are handled by Clerk separately. Local fixture tests do not verify the
Clerk account lifecycle or external inbox deliverability.

## Configure a deployed operator and sender

Apply the migrations and [runtime database privileges](deployment.md#check-runtime-privileges).
Use the same Clerk application as the deployed site, then configure:

| Setting                   | Purpose                                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| `MERIT_OPERATOR_USER_IDS` | Comma-separated stable Clerk user IDs authorized to use the operator app. Empty means no operators. |
| `APP_ORIGIN`              | Canonical HTTPS origin used in production invitation links.                                         |
| `EMAIL_FROM`              | Bare sender email address on your verified Resend domain.                                           |
| `RESEND_API_KEY`          | Resend sending credential, supplied as a Worker secret.                                             |
| `MAILPIT_URL`             | Local HTTP inbox URL; only used by the development server. Ignored in production builds.            |

Create/sign in to the intended Clerk account first and copy its ID from Clerk.
Operator designation is deployment configuration, independent of organization
membership. Removing its ID removes operator authority on subsequent requests.
Do not put operator settings or email secrets in `VITE_` variables.

Resend receives the same plain-text and HTML invitation content as Mailpit, with
an idempotency key for each invitation. The app stores a token hash; it does not
store or log the plaintext invitation link. Invitation URLs and emails are
sensitive, so configure infrastructure logs and email access accordingly.

Publish using the [deployment guide](deployment.md). Verify an operator can create
an organization but cannot read its grant workspace without membership. Use a
recipient to verify real email receipt, sign-in, explicit acceptance, and workspace
entry. Keep this verification separate from fixture-based checks.

## Automated verification

With Compose running, build the application before checking transactional access and
invitation lifecycle behavior:

```sh
vp run @merit/app#build
vp run @merit/app#test:integration
```

Follow the [browser setup and project selection](verification.md#browser-compatibility)
before running `vp run @merit/app#test:workspace`. This runs
desktop Chromium against an isolated database, captures
invitations in Mailpit, and follows their links through acceptance and recovery.
Use `vp run @merit/app#test:workspace:all` for the full browser matrix.
The suite also retains the existing grant-work browser checks. The inbox may retain
fictional test messages; tests identify their own messages by unique organization
names. `vp run ready` includes integration tests and the full browser matrix.
