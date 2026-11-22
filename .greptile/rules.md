# Review rules

Review each change against the
[change review rubric](../.agents/skills/build-feature/review.md) and the
path-scoped guides in [`.greptile/files.json`](files.json). Answer the rubric
from the code and leave screenshot comparison to the author's review.

Pull requests name **precedents**: the existing screen, controller, operation,
or tests the change should match. Open those files and compare. Prefer concise
comments naming the precedent, guide, or mechanism invariant departed from and
the concrete fix.

Flag especially:

- components, hooks, helpers, fixtures, or test utilities that duplicate
  something that already exists in the repository;
- business rules, authorization predicates, or domain invariants placed outside
  the owning capability's `business` package (or bypassed across web and MCP);
- abstractions with a single use and no stated requirement, or refactors that
  move complexity without simplifying it;
- tests that assert internal calls instead of observable outcomes, weaken
  guarantees or coverage policy, or repeat a scenario at another layer without
  justification;
- SQL migrations that edit already-applied migrations or omit surrogate/public
  IDs, covering FK indexes, or enum `CHECK` constraints.

Do not comment on formatting, imports, unused code, React Compiler rules, or
anything enforced by `oxlint`, `oxfmt`, `stylelint`, `remark`, `fallow`,
`check:react-compiler`, or `vp run architecture`.
