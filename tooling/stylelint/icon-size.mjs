import stylelint from "stylelint";

const ruleName = "merit/icon-size";
const messages = stylelint.utils.ruleMessages(ruleName, {
  rejected: (/** @type {string} */ property) =>
    `Size an icon with an "--icon-size*" token for "${property}"`,
});

const iconCompound = /(?:^|[^\w.#-])svg(?![\w-])|\.icon(?![\w-])/;
const dimension = /^(?:width|height|inline-size|block-size)$/;
const iconToken = /^var\(--icon-size[a-z-]*\)$/;
// Their arguments describe other elements, not the element the declaration sizes.
const relationalPseudo = /:(?:has|not)$/;

/**
 * Split a selector list into its selectors, and each selector into its compounds, ignoring commas
 * and combinators inside parentheses, brackets, and strings.
 * @param {string} selector
 */
const subjects = (selector) => {
  /** @type {string[]} */
  const lasts = [];
  let depth = 0;
  let quote = "";
  let compound = "";
  for (const char of selector) {
    if (quote) {
      quote = char === quote ? "" : quote;
      compound += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "(" || char === "[") {
      depth += 1;
    } else if (char === ")" || char === "]") {
      depth -= 1;
    } else if (depth === 0 && char === ",") {
      lasts.push(compound);
      compound = "";
      continue;
    } else if (depth === 0 && /[\s>+~]/.test(char)) {
      compound = compound.trim() ? "" : compound;
      continue;
    }
    compound += char;
  }
  lasts.push(compound);
  return lasts.map((last) => last.trim()).filter(Boolean);
};

/**
 * The compound without the arguments of `:has()` and `:not()`, which name other elements.
 * @param {string} compound
 */
const withoutRelations = (compound) => {
  let result = "";
  let skipping = 0;
  for (const char of compound) {
    if (skipping > 0) {
      skipping += char === "(" ? 1 : char === ")" ? -1 : 0;
      continue;
    }
    if (char === "(" && relationalPseudo.test(result)) {
      skipping = 1;
      continue;
    }
    result += char;
  }
  return result;
};

/** @typedef {{ type: string, selector?: string, parent?: StyleNode }} StyleNode */

/**
 * Whether the element a rule's declarations apply to is an svg or `.icon`, resolving `&` against
 * the enclosing rule so `.icon { &:hover { … } }` counts as an icon.
 * @param {StyleNode | undefined} node
 * @returns {boolean}
 */
const sizesIcon = (node) => {
  if (!node || node.type === "root" || node.type === "document") {
    return false;
  }
  if (node.type !== "rule" || node.selector === undefined) {
    return sizesIcon(node.parent);
  }
  return subjects(node.selector).some((subject) => {
    // Attribute selectors only filter the subject; their values never name it.
    const own = withoutRelations(subject).replaceAll(/\[[^\]]*\]/g, "");
    return iconCompound.test(own) || (own.includes("&") && sizesIcon(node.parent));
  });
};

/**
 * An svg or `.icon` is sized by an icon-size token, so glyphs stay one size across controls. Only
 * the selector's subject counts: `.button:has(svg)` sizes the button, not the svg.
 * Limit: a stylesheet cannot tell which class a component hands to an icon, so only these two
 * selectors are checked; a differently named glyph class is caught in review.
 */
/** @type {import("stylelint").Rule} */
const rule = (enabled) => (root, result) => {
  if (!enabled) {
    return;
  }
  root.walkDecls((declaration) => {
    if (!dimension.test(declaration.prop) || iconToken.test(declaration.value.trim())) {
      return;
    }
    if (!sizesIcon(declaration.parent)) {
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
