import { creator as pattern } from "@secretlint/secretlint-rule-pattern";
import { creator as recommended } from "@secretlint/secretlint-rule-preset-recommend";
import type { SecretLintCoreConfig } from "@secretlint/types";

// Escape a literal value and anchor it so only that exact value is allowed. Connection-string
// matches extend to the next whitespace, so allow the closing quote or punctuation that follows.
const exact = (value: string) =>
  `/^${value.replaceAll(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(?:["'\`;,)]*)$/`;

// Masking hides every message value, so a distinct rule ID is what names the provider in findings.
// The boundaries keep a prefix from matching inside a longer identifier.
const provider = (id: string, expression: RegExp): SecretLintCoreConfig["rules"][number] => ({
  id,
  rule: { ...pattern, meta: { ...pattern.meta, id } },
  options: { patterns: [{ name: id, patterns: [String(expression)] }] },
});

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
    // Rules for providers Merit uses that the recommended preset does not cover explicitly.
    provider(
      "merit/resend-api-key",
      // `re_`, eight characters, `_`, then twenty-four characters.
      /(?<![A-Za-z0-9_])re_[A-Za-z0-9]{8}_[A-Za-z0-9]{24}(?![A-Za-z0-9_])/g,
    ),
    provider(
      "merit/clerk-secret-key",
      // Clerk shares Stripe's prefixes; this keeps detection independent of the Stripe rule.
      /(?<![A-Za-z0-9_])sk_(?:live|test)_[A-Za-z0-9]{24,}(?![A-Za-z0-9_])/g,
    ),
  ],
};
