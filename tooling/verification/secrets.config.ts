import { creator as pattern } from "@secretlint/secretlint-rule-pattern";
import { rules as recommendedRules } from "@secretlint/secretlint-rule-preset-recommend";
import type { SecretLintCoreConfig } from "@secretlint/types";

// Escape a literal value and anchor it so only that exact value is allowed. Connection-string
// matches extend to the next whitespace, so allow the closing quote or punctuation that follows.
const exact = (value: string) =>
  `/^${value.replaceAll(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(?:["'\`;,)]*)$/`;

// Masking hides every message value, so a distinct rule ID is what names the provider in findings.
// The boundaries keep a prefix from matching inside a longer identifier.
const provider = (
  id: string,
  expression: RegExp,
  allows: string[] = [],
): SecretLintCoreConfig["rules"][number] => ({
  id,
  rule: { ...pattern, meta: { ...pattern.meta, id } },
  options: { allows, patterns: [{ name: id, patterns: [String(expression)] }] },
});

export const config: SecretLintCoreConfig = {
  rules: [
    // Core honors disabled on top-level rules. The preset registers its nested rules itself.
    ...recommendedRules.map((rule) => ({
      id: rule.meta.id,
      rule,
      disabled: rule.meta.id === "@secretlint/secretlint-rule-filter-comments",
      options:
        rule.meta.id === "@secretlint/secretlint-rule-database-connection-string"
          ? {
              allows: [
                // Public credentials for the loopback-only Compose database.
                exact("postgres://merit:merit@127.0.0.1:55432/merit"),
                exact("postgres://merit_runtime:merit@127.0.0.1:55432/merit"),
                // Remote-target fixture for the reset-db guard tests; the host cannot resolve.
                exact("postgres://example:example@remote.invalid/production"),
              ],
            }
          : {},
    })),
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
    provider(
      "merit/checkly-api-key",
      /(?:(?<![A-Za-z0-9_])(?:cu|sv)_|(?<=\bCHECKLY_API_KEY["']?[ \t]*[:=][ \t]*["']?))[A-Za-z0-9_-]{24,}(?![A-Za-z0-9_-])/g,
    ),
    provider(
      "merit/webhook-signing-secret",
      /(?<![A-Za-z0-9_])whsec_[A-Za-z0-9+/=_-]{24,}(?![A-Za-z0-9_])/g,
    ),
    provider(
      "merit/posthog-personal-api-key",
      /(?<![A-Za-z0-9_])phx_[A-Za-z0-9_-]{24,}(?![A-Za-z0-9_])/g,
    ),
    provider(
      "merit/file-storage-secret",
      /(?<=\bFILE_STORAGE_SECRET_ACCESS_KEY["']?[ \t]*[:=][ \t]*["']?)[A-Za-z0-9+/_=-]{16,}(?=["'\s,;}]|$)/g,
      // Public credential shared by the local Compose service and its integration test.
      [exact("merit-local-storage")],
    ),
  ],
};
