// Flat ESLint config (ESLint v9+). Single root config; every package's
// `eslint .`/`eslint src` script discovers it via upward search.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/*.config.{js,cjs,mjs,ts}",
      "**/next-env.d.ts",
      "packages/db/supabase/types.ts", // generated
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // TypeScript already checks for undefined identifiers.
      "no-undef": "off",
      // Allow intentional throwaways via leading underscore; warn otherwise.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // Pragmatic relaxations for an integration-heavy codebase.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/ban-ts-comment": "warn",
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },

  // Plain Node scripts (e.g. apps/web/scripts/*.mjs).
  {
    files: ["**/scripts/**/*.{js,mjs,cjs}"],
    languageOptions: { globals: globals.node },
  },
);
