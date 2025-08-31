/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: ['@deadlock-mods/eslint-config/library.js'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: true,
  },
  rules: {
    'no-unused-vars': 'off',
  },
};
