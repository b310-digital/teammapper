import tseslint from "typescript-eslint";
import jest from "eslint-plugin-jest";
import importPlugin from "eslint-plugin-import";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import js from "@eslint/js";
import prettier from "eslint-plugin-prettier";
import stylistic from "@stylistic/eslint-plugin";

export default [
    {
        ignores: ["src/migrations/**/*", "dist/**/*", "src/jobs/**/*"],
    },
    js.configs.recommended,
    importPlugin.flatConfigs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["**/*.ts"],
        plugins: {
            jest: jest,
            prettier: prettier,
            "@stylistic": stylistic
        },
        languageOptions: {
            globals: {
                ...jest.environments.globals.globals,
                ...globals.node,
            },
            parser: tsParser,
            parserOptions: {
                project: ["tsconfig.json"],
                ecmaVersion: 12,
                sourceType: "module",
            },
        },
        settings: {
            "import/resolver": {
                typescript: {},
                node: {
                    extensions: [".js", ".ts"],
                    moduleDirectory: ["node_modules", "src/"],
                },
            },
        },
        rules: {
            "@typescript-eslint/no-explicit-any": "warn",
            "prettier/prettier": "error",
            "no-unused-vars": "off",
            "@stylistic/member-delimiter-style": ["error", {
                "multiline": {
                    "delimiter": "none",
                    "requireLast": true
                },
                "singleline": {
                    "delimiter": "semi",
                    "requireLast": false
                },
                "multilineDetection": "brackets"
            }],
            "@typescript-eslint/no-unused-vars": ["error", {
                argsIgnorePattern: "^_",
            }],
            "import/extensions": ["error", "ignorePackages", {
                js: "never",
                ts: "never",
            }],
        },
    },
];