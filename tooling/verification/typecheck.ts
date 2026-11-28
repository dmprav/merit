// The task runner can replay success after a change to an imported workspace type.
// TypeScript tracks its own transitive inputs in each package's incremental state.
export const typecheckTask = {
  command:
    "tsc --noEmit -p tsconfig.json --incremental --tsBuildInfoFile node_modules/.cache/merit-typecheck.tsbuildinfo",
  cache: false,
};
