"use strict";

const js = require("@eslint/js");
const globals = require("globals");
const prettier = require("eslint-config-prettier");

module.exports = [
    { ignores: ["node_modules/", "coverage/", "docs/screenshots/"] },
    js.configs.recommended,
    {
        files: ["server/**/*.js", "tests/**/*.js", "*.js"],
        languageOptions: { sourceType: "commonjs", globals: { ...globals.node, ...globals.jest } },
    },
    {
        files: ["public/js/**/*.js"],
        languageOptions: { sourceType: "module", globals: { ...globals.browser } },
    },
    {
        rules: {
            "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
            eqeqeq: "error",
            "no-var": "error",
            "prefer-const": "error",
        },
    },
    prettier,
];
