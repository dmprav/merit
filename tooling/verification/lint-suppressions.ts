import { definePlugin, defineRule } from "vite-plus/lint/plugins";

const SUPPRESSION_COMMENT = /^\s*(?:oxlint|eslint)-disable(?:-next-line|-line)?(?:\s+|$)(.*)$/s;

const hasSuppressionReason = (rest: string) => {
  const separator = rest.indexOf("--");
  if (separator < 0) {
    return false;
  }
  const rules = rest.slice(0, separator).trim();
  const reason = rest.slice(separator + 2).trim();
  return rules.length > 0 && reason.length > 0;
};

const requireSuppressionReason = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Require an inline -- reason on lint suppression comments.",
    },
    messages: {
      missingReason:
        "Explain lint suppressions inline using `oxlint-disable... <rule> -- <reason>`.",
    },
  },
  createOnce(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const match = SUPPRESSION_COMMENT.exec(comment.value);
          if (!match) {
            continue;
          }
          if (!hasSuppressionReason(match[1] ?? "")) {
            context.report({ loc: comment.loc, messageId: "missingReason" });
          }
        }
      },
    };
  },
});

export default definePlugin({
  meta: { name: "merit" },
  rules: { "require-suppression-reason": requireSuppressionReason },
});
