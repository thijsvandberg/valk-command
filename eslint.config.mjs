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
    ignores: ["deleted/**", ".next-build/**", "tools/jira-extension/**"],
  },
  {
    plugins: {
      typography: { rules: { "no-raw-text-sizes": noRawTextSizesRule } },
    },
    rules: {
      "typography/no-raw-text-sizes": "warn",
    },
  },
  // The app wraps SWR in a custom cache provider (SWRProvider's lruProvider), so
  // the top-level "swr" `mutate` targets the default cache and is a silent no-op
  // for every provider-backed key. Mutate through useSWRConfig().mutate, a hook's
  // own mutate, or scopedMutate (non-hook modules). See BRDG-458 and
  // docs/architecture/optimistic-updates.md.
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "swr",
              importNames: ["mutate"],
              message:
                "Top-level swr mutate is a no-op against the custom cache provider; use useSWRConfig().mutate, a hook's own mutate, or scopedMutate (BRDG-458).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/**/*.test.{ts,tsx}", "src/lib/swr-scoped-mutate.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
];

export default eslintConfig;
