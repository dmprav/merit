import stylelint from "stylelint";

const ruleName = "merit/icon-size";
const messages = stylelint.utils.ruleMessages(ruleName, {
  rejected: (/** @type {string} */ property) =>
    `Size an icon with an "--icon-size*" token for "${property}"`,
});

const iconSelector = /(?:^|[\s>+~,(])svg(?![\w-])|\.icon(?![\w-])/;
const dimension = /^(?:width|height|inline-size|block-size)$/;
const iconToken = /^var\(--icon-size[a-z-]*\)$/;

/** An svg or `.icon` is sized by an icon-size token, so glyphs stay one size across controls. */
/** @type {import("stylelint").Rule} */
const rule = (enabled) => (root, result) => {
  if (!enabled) {
    return;
  }
  root.walkDecls((declaration) => {
    const { parent } = declaration;
    if (!dimension.test(declaration.prop) || iconToken.test(declaration.value.trim())) {
      return;
    }
    if (parent?.type !== "rule" || !iconSelector.test(parent.selector)) {
      return;
    }
    stylelint.utils.report({
      result,
      ruleName,
      message: messages.rejected(declaration.prop),
      node: declaration,
      word: declaration.value,
    });
  });
};

rule.ruleName = ruleName;
rule.messages = messages;

export default stylelint.createPlugin(ruleName, rule);
