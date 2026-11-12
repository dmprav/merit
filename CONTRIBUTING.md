# Contributing to Merit

Bug reports, documentation improvements, and focused fixes are welcome. Merit is
a portfolio and learning project; discuss substantial changes in a GitHub issue
before starting implementation so the work fits the project's direction. Review
and acceptance depend on maintainer capacity, with no guaranteed response time.

Contribute through a fork and submit a pull request. The repository owner reviews
and merges contributions, including bot-authored pull requests; bots do not have
merge access. The [repository rules](docs/guides/development.md#github-repository-rules)
describe the access policy and its setup status.

Start with the [documentation overview](docs/README.md) and
[project foundations](docs/foundations/README.md). Follow the
[development guide](docs/guides/development.md) for setup and the
[verification guide](docs/guides/verification.md) to choose checks.

Keep each pull request focused on one coherent, reviewable outcome. Use the
[change-scope guidance](AGENTS.md#complete-the-change) to decide what belongs
together and when to split larger work. Describe the problem, the resulting
behavior, and the checks you ran. Full verification is required before merging.
The [PR workflow](.github/workflows/verify.yml) runs the complete suite for pull
requests targeting `main`; see the [verification guide](docs/guides/verification.md#verification)
for local checks and the initial CI rollout.

Follow the [commit conventions](docs/guides/development.md#commit-changes)
when recording changes; local hooks validate commit messages.

For suspected vulnerabilities, follow the [security policy](SECURITY.md) instead
of opening a public issue.

Merit's original source and documentation remain
[all rights reserved](README.md#license). Discuss contribution terms with the
maintainer before submitting substantial original work.
