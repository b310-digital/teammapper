const { fixupConfigRules, fixupPluginRules } = require("@eslint/compat");
const tseslint = require("typescript-eslint");
const jest = require("eslint-plugin-jest");
const importPlugin = require("eslint-plugin-import");
const globals = require("globals");
const tsParser = require("@typescript-eslint/parser");
const js = require("@eslint/js");
const prettier = require("eslint-plugin-prettier");
const stylisticTs = require("@stylistic/eslint-plugin-ts");

const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

module.exports = [
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
            "@stylistic/ts": stylisticTs
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
            "@stylistic/ts/member-delimiter-style": ["error", {
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