import nextConfig from "eslint-config-next";

const RAW_TEXT_SIZE_PATTERN =
  /\btext-(xs|sm|base|lg|xl|2xl)\b/;

const TOKEN_LIST =
  "text-caption, text-label, text-body-sm, text-body, text-body-lg, text-heading-sm, text-heading, text-heading-lg";

const noRawTextSizesRule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow raw Tailwind text-size classes; prefer typography tokens",
    },
    schema: [],
  },
  create(context) {
    function check(node, value) {
      if (typeof value === "string" && RAW_TEXT_SIZE_PATTERN.test(value)) {
        const match = value.match(RAW_TEXT_SIZE_PATTERN);
        context.report({
          node,
          message: `Use a typography token instead of "{{raw}}". Available: ${TOKEN_LIST}`,
          data: { raw: match[0] },
        });
      }
    }
    return {
      Literal(node) {
        check(node, node.value);
      },
      TemplateLiteral(node) {
        for (const quasi of node.quasis) {
          check(node, quasi.value.raw);
        }
      },
    };
  },
};

const eslintConfig = [
  ...nextConfig,
  {
    ignores: ["deleted/**", ".next-build/**"],
  },
  {
    plugins: {
      typography: { rules: { "no-raw-text-sizes": noRawTextSizesRule } },
    },
    rules: {
      "typography/no-raw-text-sizes": "warn",
    },
  },
];

export default eslintConfig;
