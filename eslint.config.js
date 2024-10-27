import globals from "globals";
import js from "@eslint/js";
import typescriptLint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default [
  {
    ignores: ["node_modules/**/*", "**/dist/**/*"],
  },
  js.configs.recommended,
  ...typescriptLint.configs.recommended,
  reactPlugin.configs.flat.recommended,
  reactPlugin.configs.flat["jsx-runtime"],
  // Disable a set of rules that may conflict with prettier
  // You can safely remove this if you don't use prettier
  eslintConfigPrettier,
  {
    files: ["**/*.js", "**/*.mjs", "**/*.ts", "**/*.mts", "**/*.tsx"],

    plugins: {
      "react-hooks": reactHooksPlugin,
    },

    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        parser: "@typescript-eslint/parser",
      },
    },
    rules: {
      "react/react-in-jsx-scope": "off",
      ...reactHooksPlugin.configs.recommended.rules,

      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],

      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-implicit-any": "off",
      "@typescript-eslint/no-explicit-any": "off",
      semi: ["error", "always"],
      "comma-dangle": ["warn", "always-multiline"],

      "no-undef": ["error"],
    },
  },

  {
    files: ["packages/preload/**"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },

  {
    files: ["packages/renderer/**"],
    languageOptions: {
      globals: {
        ...Object.fromEntries(Object.entries(globals.node).map(([key]) => [key, "off"])),
        ...globals.browser,
      },
    },
  },

  {
    files: ["**/tests/**"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },

  {
    files: ["**/vite.config.*"],
    languageOptions: {
      globals: {
        ...Object.fromEntries(Object.entries(globals.browser).map(([key]) => [key, "off"])),
        ...globals.node,
      },
    },
  },
];
