/** @type {import("stylelint").Config} */
export default {
  ignoreFiles: [
    "**/node_modules/**",
    "**/dist/**",
    "**/dist-ssr/**",
    "**/.react-email/**",
    "**/coverage/**",
  ],
  rules: {
    "at-rule-no-unknown": true,
    "block-no-empty": true,
    "color-no-invalid-hex": true,
    "declaration-block-no-duplicate-properties": [
      true,
      { ignore: ["consecutive-duplicates-with-different-values"] },
    ],
    "declaration-block-no-duplicate-custom-properties": true,
    "declaration-block-no-shorthand-property-overrides": true,
    "font-family-no-duplicate-names": true,
    "function-no-unknown": true,
    "keyframe-block-no-duplicate-selectors": true,
    "media-feature-name-no-unknown": true,
    "no-duplicate-selectors": true,
    "property-no-unknown": true,
    "selector-pseudo-class-no-unknown": [true, { ignorePseudoClasses: ["global", "local"] }],
    "selector-pseudo-element-no-unknown": true,
    "unit-no-unknown": true,
    "rule-empty-line-before": ["always", { except: ["first-nested"], ignore: ["after-comment"] }],
    "at-rule-empty-line-before": [
      "always",
      {
        except: ["first-nested"],
        ignore: ["after-comment", "blockless-after-same-name-blockless"],
      },
    ],
  },
};
