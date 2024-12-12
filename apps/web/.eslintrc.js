/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: ["@deadlock-mods/eslint-config/next.js"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: true,
  },
};
