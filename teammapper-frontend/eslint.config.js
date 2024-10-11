const prettier = require("eslint-plugin-prettier");
const globals = require("globals");
const js = require("@eslint/js");
const tseslint = require("typescript-eslint");
// Allows us to bring in the recommended rules for Angular projects from angular-eslint
const angular = require('angular-eslint');

const {
    FlatCompat,
} = require("@eslint/eslintrc");

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

module.exports = [{
    ignores: ["projects/**/*"],
},
js.configs.recommended,
...tseslint.configs.recommended,
{
    plugins: {
        prettier,
    },
    languageOptions: {
        globals: {
            ...globals.jasmine,
            ...globals.browser,
        },
    },
}, ...compat.extends(
    "eslint:recommended",
    "plugin:prettier/recommended",
).map(config => ({
    ...config,
    files: ["**/*.ts"],
})), {
    files: ["**/*.ts"],

    languageOptions: {
        ecmaVersion: 5,
        sourceType: "script",

        parserOptions: {
            project: ["tsconfig.json", "e2e/tsconfig.json"],
            createDefaultProgram: true,
        },
    },

    rules: {
        "prettier/prettier": "error",
        "no-unused-vars": "off",
        "@typescript-eslint/no-explicit-any": "warn",

        "@typescript-eslint/no-unused-vars": ["error", {
            args: "all",
            argsIgnorePattern: "^_",
            caughtErrors: "all",
            caughtErrorsIgnorePattern: "^_",
        }],
    },
}, ...compat.extends(
"plugin:@angular-eslint/template/recommended", 
"plugin:@angular-eslint/recommended",
"plugin:@angular-eslint/template/process-inline-templates"
).map(config => ({
    ...config,
    files: ["**/*.component.html"],
})), {
    files: ["**/*.component.html"],
    rules: {
        "@angular-eslint/component-selector": ["error", {
            prefix: "teammapper",
            style: "kebab-case",
            type: "element",
        }],

        "@angular-eslint/directive-selector": ["error", {
            prefix: "teammapper",
            style: "camelCase",
            type: "attribute",
        }],
    }
}];