import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  // TypeScript sources are type-checked by tsc; ESLint lints the compiled
  // browser bundle (public/js) plus the plain-JS scripts and entrypoint.
  {
    ignores: ['dist/**', 'node_modules/**', 'sandbox/**', 'src/**', 'tests/**'],
  },
  {
    files: ['public/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        marked: 'readonly',
        Terminal: 'readonly',
        FitAddon: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'off',
      'no-undef': 'error',
    },
  },
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'off',
    },
  },
  {
    files: ['server.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: globals.node,
    },
  },
];
