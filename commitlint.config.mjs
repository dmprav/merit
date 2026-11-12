export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-case": [2, "always", "lower-case"],
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "docs", "refactor", "test", "perf", "build", "ci", "chore"],
    ],
    // Names and acronyms should retain their spelling; prose need not wrap like source code.
    "subject-case": [0],
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
  },
};
