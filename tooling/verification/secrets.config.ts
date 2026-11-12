import { creator as recommended } from "@secretlint/secretlint-rule-preset-recommend";
import type { SecretLintCoreConfig } from "@secretlint/types";

// Escape a literal value and anchor it so only that exact value is allowed. Connection-string
// matches extend to the next whitespace, so allow the closing quote or punctuation that follows.
const exact = (value: string) =>
  `/^${value.replaceAll(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(?:["'\`;,)]*)$/`;

export const config: SecretLintCoreConfig = {
  rules: [
    {
      id: "@secretlint/secretlint-rule-preset-recommend",
      rule: recommended,
      rules: [
        {
          id: "@secretlint/secretlint-rule-database-connection-string",
          options: {
            allows: [
              // Public credentials for the loopback-only Compose database.
              exact("postgres://merit:merit@127.0.0.1:55432/merit"),
              // Remote-target fixture for the reset-db guard tests; the host cannot resolve.
              exact("postgres://example:example@remote.invalid/production"),
            ],
          },
        },
      ],
    },
  ],
};
