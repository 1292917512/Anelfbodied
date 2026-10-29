import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'vendor/**',
      '.build/**',
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
    files: [
      'src/model/**/*.ts',
      'src/runtime/**/*.ts',
      'src/protocol/**/*.ts',
      'src/behavior/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'electron',
            'react',
            'react-dom/*',
            '**/host/*',
            '**/renderer/*',
            '**/transports/*',
            '**/integrations/*',
            '**/contracts/*',
            '**/components/*',
            '**/behaviors/*',
            '**/composition/*',
            '**/vendor/*',
          ],
        },
      ],
    },
  },
  {
    files: ['src/transports/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['**/integrations/*', '**/host/*', '**/renderer/*', '**/composition/*'] },
      ],
    },
  },
  {
    files: ['src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'electron',
            'react',
            '**/host/*',
            '**/transports/*',
            '**/runtime/*',
            '**/composition/*',
            '**/integrations/*',
            '**/renderer/*',
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
