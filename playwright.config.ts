import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  timeout: 45000,
  expect: { timeout: 8000 },
  retries: 0,
  reporter: 'list',
  outputDir: 'test-results',
});
