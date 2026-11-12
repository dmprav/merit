# Merit

Merit is a grant-management prototype that helps program managers keep applications,
evidence, reviewer judgments, and funding recommendations connected. It is a
portfolio and learning project, with a fictional demo for exploring the product.

## Try it locally

Install Docker with Compose and start the Docker daemon. Install the
[Vite+ global CLI](https://viteplus.dev/guide/global-cli) (`vp`),
enable its environment management, and open a new shell. Vite+ provisions the
workspace's pinned Node.js and pnpm versions. Run these commands from the repository root:

```sh
vp install
docker compose up -d --wait
vp run @merit/db#db:migrate
vp run dev
```

Open [the local demo](http://localhost:3000/demo). No Clerk account or API keys are
needed. It runs in Cloudflare's local Worker runtime, using PostgreSQL for each
visitor's isolated workspace.

## Available today

- **Browser demo:** explore fictional grant work in an isolated workspace. Try
  `/demo/workshop-saturdays` for guidance through changed evidence and a funding
  recommendation. See [demo behavior](docs/workflows/public-demo-and-access.md)
  for saved progress and limits.
- **Grant work:** program managers prepare rounds, record and revise applications,
  maintain contacts, track review requests, record assessments received elsewhere,
  and save funding recommendations. Changes preserve history and attribution.
  [Grantmaking workflows](docs/workflows/review-and-decide.md) explain each task.
- **Reviewer participation:** invite a reviewer to one application, with private
  autosaved drafts, attributable submissions, and amendments. See the
  [reviewer workflow](docs/workflows/participate-in-review.md).
- **Team management:** workspace owners and administrators invite colleagues,
  change grant access, and remove membership. See
  [team responsibilities](docs/workflows/manage-team.md) for roles and permissions.
- **Operator administration:** create organizations, invite their first owners,
  and review requests to explore the prototype. See
  [provisioning](docs/guides/organizations.md) for setup and procedures.
- **MCP:** authenticated clients discover workspaces and carry out the same grant,
  contact, and team work, participate as reviewers, manage personal shortcuts,
  join invitations, and start or reset account demos. Merit operators can also
  provision organizations and triage access requests. The [connection guide](docs/guides/mcp.md) explains
  authorization, scopes, and attribution.

Demo submissions, evidence, and AI examples are hand-authored fiction.
Applicant-facing submission, attachments, live AI processing, reviewer discussions,
committee briefs, publication, and funding decision recording are not implemented.
[Future committee design](docs/workflows/committee-decisions.md) records the intended
behavior; GitHub issues and milestones track delivery.

## Documentation

The website’s `/docs` page is the starting point for user guides and examples.
For contributions, read [Contributing to Merit](CONTRIBUTING.md), then use the
[documentation overview](docs/README.md) to find the relevant guidance.
For supported security scope and private reporting, see the
[security policy](SECURITY.md).

## Code organization

`app/` assembles one Cloudflare deployment. `interfaces/` owns product, site, admin,
MCP, and email integration. Substantial capabilities in `capabilities/` own their
business operations and reusable web workflows; `foundation/` holds technical
libraries and UI primitives, and `tooling/` holds development infrastructure.
The [architecture guide](docs/foundations/architecture.md) explains these boundaries;
the [web feature guide](docs/guides/web-features.md) maps changes to their owner.

## Development

To develop in a protected workspace, use a
[seeded identity without Clerk](docs/guides/development.md#protected-workspace).

Run `vp run ready` with PostgreSQL and Mailpit running for the full build, formatting, lint,
type, migration, security, and test checks.
Follow [local development](docs/guides/development.md)
for setup and [verification](docs/guides/verification.md) for targeted checks.

## License

Copyright © 2026 Dmitrii Pravotorov.

All rights reserved. No general reuse license is granted for Merit's original
source code or documentation. Third-party components remain subject to their
respective licenses. Rights granted by applicable law or the repository host's
terms are unaffected.
