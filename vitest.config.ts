import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/types.ts',           // interfaces only, no executable code
        'src/index.ts',
        'src/cli.ts',
        'src/commands/**',
        'src/ui/**',
        'src/gitlab/client.ts',
        'src/gitlab/queries.ts',
        'src/services/versionChecker.ts', // requires network + filesystem mocking
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
