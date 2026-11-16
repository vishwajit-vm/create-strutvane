import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import { sharedConfig } from './vitest.shared.ts'

// Repo-specific overrides. Shared defaults (coverage 90/90/85/90, no .only, ...) come from
// strutvane-tooling.
// - The end-to-end files run a real `npm install`, real git and, when Docker is available, real
//   database containers and a real image build: give them room on a slow laptop.
// - One file at a time: the end-to-end files pick free ports and start servers and containers;
//   two files side by side could pick the same port.
// - src/cli.ts only wires main() to the real process; it is run as a child process by the
//   end-to-end tests, which coverage cannot see.
// - test/fixtures holds the stand-in framework the end-to-end apps install; it is not a suite.
export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      exclude: [...configDefaults.exclude, 'test/fixtures/**', '**/*.perf.test.ts'],
      testTimeout: 120_000,
      hookTimeout: 300_000,
      fileParallelism: false,
      coverage: { exclude: ['src/cli.ts'] },
    },
  }),
)
