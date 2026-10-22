import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'public/**', 'output/**', '.agents/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    linterOptions: { reportUnusedDisableDirectives: 'error' }
  },
  {
    files: ['app.js', 'src/**/*.{js,mjs}'],
    languageOptions: { globals: globals.browser }
  },
  {
    files: ['eslint.config.mjs', 'scripts/**/*.mjs', 'tests/**/*.mjs', 'assets/card-studio/_processing/*.mjs'],
    languageOptions: { globals: globals.node }
  },
  {
    // Playwright evaluate callbacks execute in the page, not in Node.js.
    files: ['scripts/test-*-browser.mjs', 'scripts/test-browser.mjs'],
    languageOptions: { globals: globals.browser }
  }
];
