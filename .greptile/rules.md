# Review rules

Review each product change against the
[feature review rubric](../.agents/skills/build-feature/review.md). Answer its
questions from the code; leave the screenshot comparison to the author's
review.

Feature pull requests include a feature brief that names **precedents**: the
existing screen, controller, and tests the change should match. Open those
files and compare. Prefer comments that name the precedent or shared piece the
change departs from or rebuilds, with a concrete fix.

Flag especially:

- components, hooks, helpers, fixtures, or test utilities that duplicate
  something that already exists in the repository;
- business rules placed in views, controllers, routes, or adapters instead of
  the capability's `business` package;
- abstractions with a single use and no stated requirement;
- tests that assert internal calls instead of outcomes, or repeat a scenario at
  another layer without a reason.

Do not comment on formatting or anything the linters already enforce.
