import stylelint from "stylelint";

const ruleName = "merit/icon-size";
const messages = stylelint.utils.ruleMessages(ruleName, {
  rejected: (/** @type {string} */ property) =>
    `Size an icon with an "--icon-size*" token for "${property}"`,
});

const iconCompound = /(?:^|[^\w.#-])svg(?![\w-])|\.icon(?![\w-])/;
const dimension = /^(?:(?:min|max)-)?(?:width|height|inline-size|block-size)$/;
// A local icon-size property may only alias a token, so a literal cannot hide behind the name.
const iconSizeProperty = /^--icon-size/;
const iconToken = /^var\(--icon-size[a-z-]*\)$/;
// Their arguments describe other elements, not the element the declaration sizes.
const relationalPseudo = /:(?:has|not)$/;

const closerOf = new Map([
  ["(", ")"],
  ["[", "]"],
  ['"', '"'],
  ["'", "'"],
]);

/**
 * The selector with everything inside parentheses, brackets, and strings replaced by filler, so
 * top-level commas and combinators can be found by position. Indexes match the original's.
 * @param {string} selector
 */
const topLevel = (selector) => {
  /** @type {string[]} */
  const closers = [];
  let masked = "";
  for (const char of selector.split("")) {
    const inside = closers.length > 0;
    const closer = closerOf.get(char);
    if (inside && char === closers.at(-1)) {
      closers.pop();
    } else if (closer && !/["']/.test(closers.at(-1) ?? "")) {
      closers.push(closer);
    }
    masked += inside || closers.length > 0 ? "_" : char;
  }
  return masked;
};

/**
 * The subject compound of each selector in a list: what follows its last top-level combinator.
 * @param {string} selector
 */
const subjects = (selector) => {
  const masked = topLevel(selector);
  const parts = [];
  let from = 0;
  for (const match of masked.matchAll(/,/g)) {
    parts.push([from, match.index]);
    from = match.index + 1;
  }
  parts.push([from, masked.length]);
  return parts
    .map(([start, end]) => {
      const lastCombinator = /[\s>+~]+(?=[^\s>+~]*$)/.exec(masked.slice(start, end).trimEnd());
      const subjectStart = lastCombinator
        ? start + lastCombinator.index + lastCombinator[0].length
        : start;
      return selector.slice(subjectStart, end).trim();
    })
    .filter(Boolean);
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
 * An svg or `.icon` is sized, including its minimum and maximum, by an icon-size token, so glyphs
 * stay one size across controls, and a local `--icon-size*` property only aliases one. Only the
 * selector's subject counts: `.button:has(svg)` sizes the button, not the svg.
 * Limit: a stylesheet cannot tell which class a component hands to an icon, so only these two
 * selectors are checked; a differently named glyph class is caught in review.
 */
/** @type {import("stylelint").Rule} */
const rule = (enabled) => (root, result) => {
  if (!enabled) {
    return;
  }
  root.walkDecls((declaration) => {
    if (iconToken.test(declaration.value.trim())) {
      return;
    }
    const sizesIconHere =
      iconSizeProperty.test(declaration.prop) ||
      (dimension.test(declaration.prop) && sizesIcon(declaration.parent));
    if (!sizesIconHere) {
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
