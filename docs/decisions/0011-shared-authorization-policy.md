# Evaluate one authorization policy in memory and SQL

Accepted 11 November 2026.

Define authorization policies once as fixed TypeScript data, with evaluators for
individual permission checks and SQL filtering. Capabilities supply current facts,
bind attributes to database expressions, and enforce the results within their
operations.

Ordinary TypeScript permission functions and separately maintained SQL predicates
would give each implementation more flexibility. They would also require keeping
two expressions of each rule consistent. Shared definitions reduce that drift and
let queries apply the policy before counting, sorting, and pagination.

The cost is a restricted policy vocabulary and infrastructure we must maintain:
attribute bindings, two evaluators, and tests proving that both agree. Missing
required facts deny access in either evaluator. Database bindings describe where
facts come from; keeping permission rules in the shared policy preserves the
benefit of this design.

Extend the vocabulary for demonstrated access requirements. Reconsider this
representation if ordinary rules repeatedly need exceptions or become harder to
understand than explicit implementations. The
[access guide](../../capabilities/access/README.md) owns policy authoring, current
fact requirements, database integration, and evaluator agreement checks.
