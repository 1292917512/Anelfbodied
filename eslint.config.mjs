import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'release/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      '.local/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/runtime/**/*.ts', 'src/protocol/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'electron',
            'react',
            'react-dom/*',
            '../host/*',
            '../renderer/*',
            '../transports/*',
            '../integrations/*',
            '../contracts/*',
          ],
        },
      ],
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['electron', '**/host/*', '**/runtime/*'] }],
    },
  },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly' } },
  },
);
